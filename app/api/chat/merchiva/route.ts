import { NextRequest, NextResponse } from "next/server";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { getServiceConn, getOrgStoreContext } from "@/lib/spacetimedb/service-client";
import {
  buildSystemPrompt,
  getOpenRouterModel,
  getOpenRouterFastModel,
  type UserPermissions,
} from "@/app/api/store-ai/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A non-mentioned message runs a relevance gate then a full reply; give it room.
export const maxDuration = 120;

// ── Mr. Merchiva in group chats ──────────────────────────────────────────────
//
// Triggered by the sender's client after a message lands in a conversation that
// has Merchiva enabled. When the message @mentions him he MUST reply; otherwise
// a cheap relevance gate decides whether he should chime in at all.
//
// Either way the reply is generated with the SAME Mr. Merchiva prompt and model
// the dedicated DM assistant uses (buildSystemPrompt in "group" mode) over the
// SAME LIVE STORE DATA (built server-side from the service connection) — so he
// is just as smart and data-aware here as in a private chat. He ADVISES only in
// group mode (no action blocks); writes are pointed to the dedicated assistant.
// The reply is posted back via the sendMerchivaMessage reducer, run under the
// caller's token since there's no per-message server identity for it yet.

interface HistoryItem {
  role: "user" | "assistant";
  name?: string;
  content: string;
}

interface Body {
  token: string;
  organizationId: string;
  conversationId: string;
  message: string;
  senderName?: string;
  /** True when the message explicitly @mentioned Mr. Merchiva. */
  mentioned?: boolean;
  history?: HistoryItem[];
  lang?: string;
  orgName?: string;
  permissions?: UserPermissions;
}

function languageNameFor(lang: string): string {
  return lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";
}

// Conservative relevance gate used only when Merchiva is NOT directly @mentioned.
function buildRelevancePrompt(lang: string): string {
  return `You are Mr. Merchiva, an AI operations assistant sitting quietly in a team group chat. Decide whether you should respond to the LATEST message.

Set respond=true ONLY when the latest message is clearly a question or request you can help with — inventory, sales, staffing, scheduling, products, suppliers, store operations, business numbers, or something directly about you. Set respond=false for ordinary human-to-human chatter between coworkers, greetings, small talk, logistics between people, or anything not aimed at you. When unsure, respond=false. Be conservative — staying silent is better than interrupting. (Language for any later reply: ${languageNameFor(lang)}.)`;
}

function toModelMessages(history: HistoryItem[]) {
  return history.map((m) => ({
    role: m.role,
    content: m.role === "assistant" ? m.content : `${m.name ?? "Someone"}: ${m.content}`,
  }));
}

// Safety net: in group mode the prompt already forbids action blocks, but strip
// any that slip through so machine syntax never lands in the chat.
function stripActionBlocks(text: string): string {
  return text
    .replace(/```action\s*\n?[\s\S]*?```/g, "")
    .replace(/```action\s*\n?[\s\S]*$/, "")
    .replace(/^\s*\{\s*"action"\s*:[\s\S]*?\}\s*$/gm, "")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { token, organizationId, conversationId, message } = body;

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
    if (!organizationId || !conversationId || !message?.trim()) {
      return NextResponse.json({ error: "Missing organizationId, conversationId, or message" }, { status: 400 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const lang = body.lang ?? "en";
    const history = (body.history ?? []).slice(-10);
    const senderName = body.senderName ?? "Someone";
    const latest = { role: "user" as const, content: `${senderName}: ${message.trim()}` };

    // Relevance gate — skipped when directly @mentioned (he MUST reply then).
    if (!body.mentioned) {
      try {
        const gate = await generateObject({
          model: getOpenRouterFastModel(),
          schema: z.object({ respond: z.boolean() }),
          system: buildRelevancePrompt(lang),
          messages: [...toModelMessages(history), latest],
          maxOutputTokens: 200,
          temperature: 0,
        });
        if (!gate.object.respond) {
          return NextResponse.json({ skipped: true, reason: "not_relevant" });
        }
      } catch (e) {
        // If the gate fails, stay silent rather than risk a spurious reply.
        console.warn("[chat/merchiva] relevance gate failed; staying silent:", e);
        return NextResponse.json({ skipped: true, reason: "gate_error" });
      }
    }

    // Build the SAME live store context the DM assistant sees. If the service
    // connection isn't available (e.g. SPACETIMEDB_SERVICE_TOKEN not set), fall
    // back to an empty context — Mr. Merchiva still replies in-persona, just
    // without live numbers.
    let context: Record<string, unknown> = {};
    try {
      const conn = await getServiceConn();
      context = (await getOrgStoreContext(conn, organizationId, lang)) as unknown as Record<string, unknown>;
    } catch (e) {
      console.warn("[chat/merchiva] live store context unavailable; replying without it:", e instanceof Error ? e.message : e);
    }

    // Same prompt + model as the dedicated assistant, in group mode.
    const systemPrompt = buildSystemPrompt(context, lang, {}, body.permissions, "group");
    const { text } = await generateText({
      model: getOpenRouterModel(),
      system: systemPrompt,
      messages: [...toModelMessages(history), latest],
      maxOutputTokens: 700,
      temperature: 0.3,
    });

    const reply = stripActionBlocks(text ?? "");
    if (!reply) return NextResponse.json({ skipped: true, reason: "empty" });

    await callReducer({
      token,
      // The HTTP /call/{reducer} endpoint addresses reducers by their registered
      // wire name, which SpacetimeDB derives as snake_case from the export — NOT
      // the camelCase SDK alias used over the WebSocket. Must be snake_case here.
      name: "send_merchiva_message",
      args: [conversationId, reply],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[chat/merchiva] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
