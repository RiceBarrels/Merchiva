// Inbound supplier email webhook (Phase 2 — true two-way comms).
//
// Point your inbound email provider (Resend Inbound, Cloudflare Email Routing,
// Postmark, Mailgun Routes, SendGrid Inbound Parse — anything that POSTs the
// parsed message) at:
//     POST /api/suppliers/inbound?key=<INBOUND_WEBHOOK_SECRET>
// configured as a catch-all on INBOUND_EMAIL_DOMAIN. The recipient local part
// is the store's fixed supplier inbox prefix: <prefix>-inbound.
//
// Flow: verify secret → parse → resolve store prefix + supplier email → ask Mr.
// Merchiva to draft a reply + decide whether to escalate → email the supplier
// back → log inbound + outbound messages (escalating problems to managers).

import { NextRequest, NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { inboundAddressFromPrefix, prefixFromRecipient } from "@/lib/suppliers/thread-token";
import {
  getServiceConn,
  getSupplierThreadContextForInbound,
  serviceLogSupplierMessage,
  type SupplierThreadContext,
} from "@/lib/spacetimedb/service-client";
import { sendSupplierReplyEmail } from "@/lib/email/resend";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { tierModel, tierModelId } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Drafting a supplier reply and judging whether to escalate is written prose
// plus a judgment call: L2.
const SUPPLIER_AGENT_TIER = 2;

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

type SupplierDecision = z.infer<typeof decisionSchema>;

function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;
  let s = text.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?/i);
  if (fenceMatch) s = s.slice(fenceMatch[0].length);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function recoverDecisionFromJsonText(text: string | undefined): SupplierDecision | null {
  if (!text) return null;
  const candidate = extractFirstJsonObject(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    const result = decisionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function cleanPlainReply(text: string | undefined): string {
  if (!text) return "";
  const trimmed = text
    .trim()
    .replace(/^```(?:text|markdown)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  if (!trimmed || trimmed.startsWith("{")) return "";
  return trimmed.slice(0, 4000);
}

function supplierLanguage(ctx: SupplierThreadContext): string {
  return String(ctx.supplier.language || "en").trim().toLowerCase().split(/[-_]/)[0];
}

function holdingReply(ctx: SupplierThreadContext): string {
  switch (supplierLanguage(ctx)) {
    case "zh":
      return "谢谢你的更新。我需要和经理/店主再次确认一下，然后尽快回复你。";
    case "es":
      return "Gracias por la actualización. Voy a confirmarlo con el gerente o propietario y te responderé pronto.";
    case "fr":
      return "Merci pour la mise à jour. Je vais vérifier avec le responsable ou le propriétaire et je vous répondrai rapidement.";
    case "ar":
      return "شكرًا على التحديث. سأتحقق من ذلك مع المدير أو المالك وأعود إليك قريبًا.";
    case "hi":
      return "अपडेट के लिए धन्यवाद। मैं इसे मैनेजर/ओनर से दोबारा कन्फर्म करके जल्द जवाब दूंगा।";
    default:
      return "Thank you for the update. I need to double-check this with the manager/owner and will get back to you shortly.";
  }
}

function escalationReasonFromSupplierMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  const checks: Array<[RegExp, string]> = [
    [/(\$\s?\d|\d+\s?(usd|dollars?|cad|eur|gbp)|price|cost|charge|quote|total|invoice|payment|rate|increase|涨价|价格|费用|报价|发票|付款)/i, "Supplier mentioned price, payment, invoice, or cost changes."],
    [/(out of stock|unavailable|substitut|replace|alternative|back.?order|short|shortage|缺货|替代|替换|没有库存)/i, "Supplier mentioned stock issues or a substitution."],
    [/(minimum order|moq|case only|full case|quantity|qty|more than|less than|increase order|reduce order|最低订量|数量|箱起订|加订|减少)/i, "Supplier mentioned a quantity or MOQ change."],
    [/(delay|late|problem|issue|cannot|can't|won't|cancel|reschedule|postpone|tomorrow instead|next week instead|延迟|问题|取消|改期|不能)/i, "Supplier mentioned a delivery problem or schedule change."],
    [/(terms|net\s?\d+|credit|refund|dispute|contract|条款|账期|退款|争议)/i, "Supplier mentioned terms, credit, refund, or dispute details."],
  ];
  for (const [pattern, reason] of checks) {
    if (pattern.test(normalized)) return reason;
  }
  return null;
}

function recoverDecisionFromPlainText(
  rawText: string | undefined,
  supplierMsg: string,
  ctx: SupplierThreadContext,
): SupplierDecision | null {
  const jsonDecision = recoverDecisionFromJsonText(rawText);
  if (jsonDecision) return jsonDecision;

  const escalationReason = escalationReasonFromSupplierMessage(supplierMsg);
  if (escalationReason) {
    return {
      reply: holdingReply(ctx),
      escalate: true,
      problemSummary: escalationReason,
    };
  }

  const reply = cleanPlainReply(rawText);
  if (!reply) return null;
  return { reply, escalate: false };
}

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

function addressField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const obj = value as { email?: unknown; address?: unknown };
    if (typeof obj.email === "string" && obj.email.trim()) return obj.email;
    if (typeof obj.address === "string" && obj.address.trim()) return obj.address;
  }
  return undefined;
}

// Normalize the inbound payload to { to, from, subject, text } across providers.
// Resend's `email.received` webhook carries METADATA ONLY, so we fetch the body
// from the Received Emails API. Other providers (Cloudflare/Postmark/Mailgun/
// SendGrid) post the body inline, so we read it directly.
async function extractInboundEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
): Promise<{ to?: string; from?: string; subject: string | null; text: string; bodyFetchError?: string }> {
  if (payload?.type === "email.received" && payload?.data?.email_id && process.env.RESEND_API_KEY) {
    const emailId = String(payload.data.email_id);
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
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
        return { to: toArr.join(","), from: addressField(full.from) ?? addressField(payload.data?.from), subject: full.subject ?? null, text };
      }
      const errorBody = await res.text().catch(() => "");
      const detail = `Resend received-email fetch failed for ${emailId}: ${res.status}${errorBody ? ` ${errorBody.slice(0, 500)}` : ""}`;
      console.error("[suppliers/inbound]", detail);
      const toArr = Array.isArray(payload.data?.to) ? payload.data.to : [];
      return {
        to: toArr.join(","),
        from: addressField(payload.data?.from),
        subject: payload.data?.subject ?? null,
        text: "",
        bodyFetchError: detail,
      };
    } catch (err) {
      const detail = `Resend received-email fetch error for ${emailId}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[suppliers/inbound]", detail);
      const toArr = Array.isArray(payload.data?.to) ? payload.data.to : [];
      return {
        to: toArr.join(","),
        from: addressField(payload.data?.from),
        subject: payload.data?.subject ?? null,
        text: "",
        bodyFetchError: detail,
      };
    }
  }

  if (payload?.type === "email.received" && payload?.data?.email_id && !process.env.RESEND_API_KEY) {
    const toArr = Array.isArray(payload.data?.to) ? payload.data.to : [];
    return {
      to: toArr.join(","),
      from: addressField(payload.data?.from),
      subject: payload.data?.subject ?? null,
      text: "",
      bodyFetchError: "RESEND_API_KEY is not configured; cannot retrieve received email body.",
    };
  }

  // Generic provider — body posted inline.
  const toRaw =
    payload.to ?? payload.recipient ?? payload.To ?? payload.envelope_to ?? payload.Destination;
  const to = Array.isArray(toRaw) ? toRaw.join(",") : typeof toRaw === "string" ? toRaw : undefined;
  const fromRaw = payload.from ?? payload.sender ?? payload.From ?? payload.envelope_from ?? payload.ReturnPath;
  const from = Array.isArray(fromRaw) ? fromRaw.join(",") : addressField(fromRaw);
  const subject = pick(payload, ["subject", "Subject"]) ?? null;
  const text =
    pick(payload, ["text", "body-plain", "stripped-text", "TextBody", "plain"]) ||
    pick(payload, ["html", "HtmlBody", "body-html"]) ||
    "";
  return { to, from, subject, text };
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

  const { to, from, subject, text, bodyFetchError } = await extractInboundEmail(payload);

  // 3) Resolve the store inbox prefix from the recipient address. A bad/absent
  //    prefix is answered 200 so the provider doesn't retry unroutable mail.
  const inboundPrefix = prefixFromRecipient(to);
  if (!inboundPrefix) {
    return NextResponse.json({ ok: true, ignored: "no_valid_store_inbox" });
  }

  const supplierMsg = (text ?? "").trim();
  if (!supplierMsg && !bodyFetchError) {
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

  let routed: Awaited<ReturnType<typeof getSupplierThreadContextForInbound>>;
  try {
    routed = await getSupplierThreadContextForInbound(conn, inboundPrefix, from);
  } catch (err) {
    console.error("[suppliers/inbound] context load failed:", err);
    return NextResponse.json({ error: "context load failed" }, { status: 500 });
  }
  if (!routed) {
    return NextResponse.json({ ok: true, ignored: "supplier_not_found" });
  }
  const ctx: SupplierThreadContext = routed;
  const organizationId = routed.organizationId;
  const supplierId = routed.supplierId;

  if (!supplierMsg && bodyFetchError) {
    await serviceLogSupplierMessage(conn, {
      organizationId,
      supplierId,
      supplierName: ctx.supplier.name,
      direction: "inbound",
      channel: "email",
      subject: subject ?? null,
      body: `Supplier replied, but Merchiva could not retrieve the email body from Resend.\n\n${bodyFetchError}`,
      status: "needs_review",
      escalate: true,
    });
    return NextResponse.json({ ok: true, escalated: true, bodyFetchError: true });
  }

  // 5) Ask Mr. Merchiva for a reply + escalation decision. Some OpenRouter
  //    models ignore structured output and return a plain email body; recover
  //    that as a routine reply unless the supplier's actual message is risky.
  let decision: SupplierDecision;
  try {
    const res = await generateObject({
      model: tierModel(SUPPLIER_AGENT_TIER),
      schema: decisionSchema,
      system: buildSystemPrompt(ctx),
      prompt: `The supplier just sent this message:\n\n"""\n${supplierMsg}\n"""\n\nWrite your reply and decide whether to escalate. Return ONLY the JSON object requested by the schema, with no prose outside JSON.`,
      maxOutputTokens: 800,
      temperature: 0.3,
      providerOptions: {
        openai: { reasoningEffort: "minimal", reasoning_effort: "minimal" },
        openrouter: { reasoning: { effort: "minimal", exclude: true } },
      },
    });
    decision = res.object;
    await recordAiUsage({
      organizationId,
      feature: "supplier_agent",
      model: tierModelId(SUPPLIER_AGENT_TIER),
      description: `Replied to ${ctx.supplier.name}: ${supplierMsg}`,
      ...normalizeUsage(res.usage),
    });
  } catch (err) {
    const rawText = NoObjectGeneratedError.isInstance(err)
      ? ((err as { text?: string }).text ?? "")
      : "";
    const recovered = recoverDecisionFromPlainText(rawText, supplierMsg, ctx);
    if (recovered) {
      console.warn(
        "[suppliers/inbound] AI returned non-JSON; recovered supplier decision",
        { escalated: recovered.escalate, rawTextLength: rawText.length },
      );
      decision = recovered;
    } else {
      console.error("[suppliers/inbound] AI failed; escalating:", err);
      await serviceLogSupplierMessage(conn, {
        organizationId,
        supplierId,
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
  }

  // 6) Log the inbound message (escalating to managers if it's a problem).
  await serviceLogSupplierMessage(conn, {
    organizationId,
    supplierId,
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

  // 7) Email the AI's reply back to the supplier. Replies continue through the
  //    same fixed store inbox.
  let replied = false;
  const replyTo = inboundAddressFromPrefix(inboundPrefix);
  if (ctx.supplier.email && decision.reply.trim()) {
    try {
      await sendSupplierReplyEmail({
        to: ctx.supplier.email,
        orgName: ctx.orgName,
        body: decision.reply,
        subject: subject ? `Re: ${subject}` : null,
        replyTo,
      });
      replied = true;
      await serviceLogSupplierMessage(conn, {
        organizationId,
        supplierId,
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
