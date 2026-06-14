// Inbound supplier email webhook (Phase 2 — true two-way comms).
//
// Point your inbound email provider (Resend Inbound, Cloudflare Email Routing,
// Postmark, Mailgun Routes, SendGrid Inbound Parse — anything that POSTs the
// parsed message) at:
//     POST /api/suppliers/inbound?key=<INBOUND_WEBHOOK_SECRET>
// configured as a catch-all on INBOUND_EMAIL_DOMAIN. The recipient local part
// is a signed thread token that decodes to (orgId, supplierId).
//
// Flow: verify secret → parse → decode token → load thread context → ask Mr.
// Merchiva to draft a reply + decide whether to escalate → email the supplier
// back → log inbound + outbound messages (escalating problems to managers).

import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { decodeThreadToken, tokenFromRecipient, inboundDomain } from "@/lib/suppliers/thread-token";
import {
  getServiceConn,
  getSupplierThreadContext,
  serviceLogSupplierMessage,
  type SupplierThreadContext,
} from "@/lib/spacetimedb/service-client";
import { sendSupplierReplyEmail } from "@/lib/email/resend";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: { "HTTP-Referer": "https://merchiva.com", "X-Title": "Merchiva Supplier Agent" },
  });
}
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";

const decisionSchema = z.object({
  reply: z
    .string()
    .describe(
      "The plain-text email reply to send back to the supplier. Use the supplier's preferred language when set; otherwise use the same language the supplier wrote in. No markdown. If escalate=true, keep it a brief holding message that says you will double-check with a manager/owner and get back to them. Do NOT agree to anything.",
    ),
  escalate: z
    .boolean()
    .describe(
      "True when this needs a human decision: price increases, out-of-stock / substitutions, quantity or MOQ changes, payment-term changes, delivery problems, disputes, anything that increases cost or deviates from the existing order, or anything you're unsure about. False only for routine confirmations/acknowledgements consistent with the existing PO.",
    ),
  problemSummary: z
    .string()
    .optional()
    .describe("If escalate=true, one sentence describing the problem for the manager."),
});

// Pull the first present key from a loosely-typed inbound payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: Record<string, any>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize the inbound payload to { to, subject, text } across providers.
// Resend's `email.received` webhook carries METADATA ONLY, so we fetch the body
// from the Received Emails API. Other providers (Cloudflare/Postmark/Mailgun/
// SendGrid) post the body inline, so we read it directly.
async function extractInboundEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): Promise<{ to?: string; subject: string | null; text: string }> {
  if (payload?.type === "email.received" && payload?.data?.email_id && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${payload.data.email_id}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (res.ok) {
        const full = await res.json();
        const toArr = Array.isArray(full.to) ? full.to : full.to ? [full.to] : [];
        const text =
          typeof full.text === "string" && full.text.trim()
            ? full.text
            : typeof full.html === "string"
              ? stripHtml(full.html)
              : "";
        return { to: toArr.join(","), subject: full.subject ?? null, text };
      }
      console.error("[suppliers/inbound] Resend received-email fetch failed:", res.status);
    } catch (err) {
      console.error("[suppliers/inbound] Resend received-email fetch error:", err);
    }
    // Fall back to metadata so we can at least route + escalate to a human.
    const toArr = Array.isArray(payload.data?.to) ? payload.data.to : [];
    return { to: toArr.join(","), subject: payload.data?.subject ?? null, text: "" };
  }

  // Generic provider — body posted inline.
  const toRaw =
    payload.to ?? payload.recipient ?? payload.To ?? payload.envelope_to ?? payload.Destination;
  const to = Array.isArray(toRaw) ? toRaw.join(",") : typeof toRaw === "string" ? toRaw : undefined;
  const subject = pick(payload, ["subject", "Subject"]) ?? null;
  const text =
    pick(payload, ["text", "body-plain", "stripped-text", "TextBody", "plain"]) ||
    pick(payload, ["html", "HtmlBody", "body-html"]) ||
    "";
  return { to, subject, text };
}

function buildSystemPrompt(ctx: SupplierThreadContext): string {
  const pos = ctx.purchaseOrders.length
    ? ctx.purchaseOrders
        .map((p, i) => {
          let items = p.items;
          try {
            const arr = JSON.parse(p.items) as Array<{ name?: string; quantity?: number }>;
            items = arr.map((it) => `${it.name ?? "?"}×${it.quantity ?? "?"}`).join(", ");
          } catch {
            /* leave raw */
          }
          return `  ${i + 1}. [${p.status}] ${items} (total ~${p.total})`;
        })
        .join("\n")
    : "  (none on file)";
  const thread = ctx.messages.length
    ? ctx.messages
        .map((m) => `  ${m.direction === "inbound" ? "SUPPLIER" : "US"}: ${m.body}`)
        .join("\n")
    : "  (this is the first message in the thread)";

  return `You are Mr. Merchiva, the procurement agent for "${ctx.orgName}", replying to a message from the supplier "${ctx.supplier.name}"${ctx.supplier.contactName ? ` (contact: ${ctx.supplier.contactName})` : ""}.

SUPPLIER PREFERRED LANGUAGE: ${ctx.supplier.language ? ctx.supplier.language : "not set"}

PURCHASE ORDERS WITH THIS SUPPLIER:
${pos}

CONVERSATION SO FAR (oldest first):
${thread}

YOUR JOB: write a short, professional reply to the supplier's latest message AND decide whether a human needs to step in.

RULES:
- Use the supplier preferred language when set; otherwise reply in the SAME language the supplier used. Be concise and courteous. Plain text only.
- You MAY handle routine things yourself: acknowledging confirmations, confirming a delivery date the supplier proposed that matches the order, answering simple questions about the order you already have.
- You MUST escalate (escalate=true) and send only a non-committal holding reply for anything needing a human decision: price changes, out-of-stock or substitutions, quantity/MOQ changes, payment-term changes, delivery delays or problems, disputes, or anything that increases cost or deviates from the existing PO. When unsure, escalate and say you are double-checking with a manager/owner.
- NEVER agree to a new price, a substitution, a larger order, or any new commitment beyond the existing PO. Those are always escalate=true.`;
}

export async function POST(req: NextRequest) {
  // 1) Auth — require the configured shared secret in ?key= (or Bearer).
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Parse the inbound payload (JSON or form-encoded, provider-dependent).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: Record<string, any> = {};
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else if (ct.includes("form")) {
      const fd = await req.formData();
      fd.forEach((v, k) => {
        if (typeof v === "string") payload[k] = v;
      });
    } else {
      payload = await req.json().catch(() => ({}));
    }
  } catch {
    payload = {};
  }

  const { to, subject, text } = await extractInboundEmail(payload);

  // 3) Resolve the thread token from the recipient address. A bad/absent token
  //    is answered 200 so the provider doesn't retry an unroutable message.
  const token = tokenFromRecipient(to);
  const decoded = token ? decodeThreadToken(token) : null;
  if (!decoded) {
    return NextResponse.json({ ok: true, ignored: "no_valid_thread_token" });
  }

  const supplierMsg = (text ?? "").trim();
  if (!supplierMsg) {
    return NextResponse.json({ ok: true, ignored: "empty_body" });
  }

  // 4) Load thread context via the service connection.
  let conn;
  try {
    conn = await getServiceConn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[suppliers/inbound] service connection failed:", msg);
    return NextResponse.json({ error: `service connection: ${msg}` }, { status: 500 });
  }

  let ctx: SupplierThreadContext | null;
  try {
    ctx = await getSupplierThreadContext(conn, decoded.orgId, decoded.supplierId);
  } catch (err) {
    console.error("[suppliers/inbound] context load failed:", err);
    return NextResponse.json({ error: "context load failed" }, { status: 500 });
  }
  if (!ctx) {
    return NextResponse.json({ ok: true, ignored: "supplier_not_found" });
  }

  // 5) Ask Mr. Merchiva for a reply + escalation decision. If the model fails,
  //    fall back to logging the inbound message and escalating to a human.
  let decision: { reply: string; escalate: boolean; problemSummary?: string };
  try {
    const res = await generateObject({
      model: getOpenRouter().chat(MODEL),
      schema: decisionSchema,
      system: buildSystemPrompt(ctx),
      prompt: `The supplier just sent this message:\n\n"""\n${supplierMsg}\n"""\n\nWrite your reply and decide whether to escalate.`,
      maxOutputTokens: 800,
      temperature: 0.3,
    });
    decision = res.object;
    await recordAiUsage({
      organizationId: decoded.orgId,
      feature: "supplier_agent",
      model: MODEL,
      description: `Replied to ${ctx.supplier.name}: ${supplierMsg}`,
      ...normalizeUsage(res.usage),
    });
  } catch (err) {
    console.error("[suppliers/inbound] AI failed; escalating:", err);
    await serviceLogSupplierMessage(conn, {
      organizationId: decoded.orgId,
      supplierId: decoded.supplierId,
      supplierName: ctx.supplier.name,
      direction: "inbound",
      channel: "email",
      subject: subject ?? null,
      body: supplierMsg,
      status: "needs_review",
      escalate: true,
    });
    return NextResponse.json({ ok: true, escalated: true, aiError: true });
  }

  // 6) Log the inbound message (escalating to managers if it's a problem).
  await serviceLogSupplierMessage(conn, {
    organizationId: decoded.orgId,
    supplierId: decoded.supplierId,
    supplierName: ctx.supplier.name,
    direction: "inbound",
    channel: "email",
    subject: subject ?? null,
    body: decision.escalate && decision.problemSummary
      ? `${supplierMsg}\n\n[Flagged: ${decision.problemSummary}]`
      : supplierMsg,
    status: decision.escalate ? "needs_review" : "received",
    escalate: decision.escalate,
  });

  // 7) Email the AI's reply back to the supplier (thread continues via the same
  //    tokenized reply-to), and log it.
  let replied = false;
  const domain = inboundDomain();
  if (ctx.supplier.email && decision.reply.trim()) {
    try {
      await sendSupplierReplyEmail({
        to: ctx.supplier.email,
        orgName: ctx.orgName,
        body: decision.reply,
        subject: subject ? `Re: ${subject}` : null,
        replyTo: domain && token ? `${token}@${domain}` : null,
      });
      replied = true;
      await serviceLogSupplierMessage(conn, {
        organizationId: decoded.orgId,
        supplierId: decoded.supplierId,
        supplierName: ctx.supplier.name,
        direction: "outbound",
        channel: "email",
        subject: subject ? `Re: ${subject}` : null,
        body: decision.reply,
        status: "sent",
        escalate: false,
      });
    } catch (err) {
      console.error("[suppliers/inbound] reply send failed:", err);
    }
  }

  return NextResponse.json({ ok: true, escalated: decision.escalate, replied });
}
