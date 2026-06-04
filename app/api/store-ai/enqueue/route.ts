import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { getAllPromptSegments } from "@/lib/merchiva/skills/registry";
import {
  buildMerchivaTools,
  buildSlimContext,
  merchivaToolsEnabled,
  TOOLS_PROMPT_BLOCK,
} from "@/lib/merchiva/tools";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import {
  getServiceConn,
  getAiReplyTarget,
  serviceCreateNotification,
} from "@/lib/spacetimedb/service-client";
import { sendWebPush } from "@/lib/push/send";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";

// ── OpenRouter setup (mirrors /api/store-ai) ─────────────────────────────────

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Mr. Merchiva (background)",
    },
  });
}

// Default to the OSS model (gpt-oss-120b); override with OPENROUTER_MODEL.
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
const FAST_MODEL = process.env.OPENROUTER_FAST_MODEL || "openai/gpt-oss-120b";
// Reserved for requests flagged as needing deep reasoning.
const THINKING_MODEL = process.env.OPENROUTER_THINKING_MODEL || "x-ai/grok-4.3";

const triageSchema = z.object({
  needsThinking: z.boolean(),
  needsDeepThinking: z.boolean().optional(),
  message: z.string(),
});

// ── Request schema ───────────────────────────────────────────────────────────

interface EnqueueBody {
  // SpacetimeDB user token, forwarded so the reducer runs as the user
  token: string;
  organizationId: string;
  sessionId: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
  context?: Record<string, unknown>;
  lang?: string;
  memory?: { summary?: string; storeOverview?: string; userPreferences?: string };
  permissions?: {
    isOwner?: boolean;
    role?: string;
    sections?: Record<string, { view?: boolean; edit?: boolean }>;
  };
  // Job id is generated client-side so the response can return it before the
  // background work has even started talking to SpacetimeDB.
  jobId?: string;
}

// ── Response ─────────────────────────────────────────────────────────────────
//
// Returns immediately with the new jobId. The actual generation runs in the
// background via Next.js `after()` (Vercel Fluid Compute keeps the function
// alive past the response). The client subscribes to ai_job rows via
// SpacetimeDB live query and renders the partial / final text as it lands.

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EnqueueBody;
    const { token, organizationId, sessionId, message, history, context, lang, memory, permissions } = body;

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
    if (!organizationId || !sessionId || !message) {
      return NextResponse.json({ error: "Missing organizationId, sessionId, or message" }, { status: 400 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "AI not configured (OPENROUTER_API_KEY missing)" }, { status: 503 });
    }

    // Create the job row up-front so the response can return its expected id
    // immediately. The reducer assigns a UUID; we round-trip through the user's
    // own jobs to find it, but in practice the client queries by sessionId+
    // status so it doesn't need the id back.
    try {
      await callReducer({
        token,
        name: "createAiJob",
        args: [organizationId, sessionId, message],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The maincloud module may not have been republished with the AI-job
      // reducers yet. Surface a recognizable code so the client can silently
      // fall back to the streaming path without throwing a 500 in the console.
      if (/\(404\)|No such procedure/i.test(msg)) {
        return NextResponse.json(
          { error: "createAiJob reducer not deployed", code: "reducer_missing" },
          { status: 501 },
        );
      }
      throw err;
    }

    // Kick off the actual AI work AFTER the response returns. Next.js
    // `after()` is the supported way to schedule post-response work on
    // Fluid Compute — the function keeps running until the work resolves
    // (subject to the platform's max function timeout).
    after(async () => {
      try {
        await runJob({
          token,
          organizationId,
          sessionId,
          message,
          history: history ?? [],
          context: context ?? {},
          lang: lang ?? "en",
          memory: memory ?? {},
          permissions,
        });
      } catch (err) {
        console.error("[enqueue] background job crashed:", err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[enqueue] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Background work ──────────────────────────────────────────────────────────

interface RunJobArgs {
  token: string;
  organizationId: string;
  sessionId: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  context: Record<string, unknown>;
  lang: string;
  memory: { summary?: string; storeOverview?: string; userPreferences?: string };
  permissions?: EnqueueBody["permissions"];
}

async function runJob(args: RunJobArgs): Promise<void> {
  // We don't have the new job's id from createAiJob — reducers don't return
  // values. Instead we look it up by sessionId + the most-recent pending job
  // for this user. Race-free in practice because the client only enqueues one
  // job per send.
  const jobId = await findLatestPendingJobId(args.token, args.organizationId, args.sessionId);
  if (!jobId) {
    console.error("[runJob] could not locate freshly-enqueued job");
    return;
  }

  try {
    const openrouter = getOpenRouter();
    const isBuilderMode = !!(args.context && (args.context as Record<string, unknown>).builder);

    // Triage: cheap classifier decides direct-answer vs. escalate.
    let triage: { needsThinking: boolean; needsDeepThinking?: boolean; message: string };
    try {
      const triageRes = await generateObject({
        model: openrouter.chat(FAST_MODEL),
        schema: triageSchema,
        system: buildTriagePrompt(args.lang),
        messages: [
          ...args.history.slice(-10).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content: args.message },
        ],
        maxOutputTokens: 800,
        temperature: 0.3,
      });
      triage = triageRes.object;
      await recordAiUsage({
        organizationId: args.organizationId,
        feature: "store_ai_bg_triage",
        model: FAST_MODEL,
        description: args.message,
        ...normalizeUsage(triageRes.usage),
      });
    } catch (e) {
      console.warn("[runJob] triage failed; escalating:", e);
      triage = { needsThinking: true, message: "" };
    }

    // Stream chunks into the job row. We buffer small chunks so we don't
    // hammer the database with one reducer call per token.
    const flusher = makeChunkFlusher(args.token, args.organizationId, jobId);

    if (!triage.needsThinking) {
      flusher.push(triage.message);
      await flusher.flush(true);
      await callReducer({
        token: args.token,
        name: "finalizeAiJob",
        args: [args.organizationId, jobId, triage.message, undefined],
      });
      return;
    }

    // Emit the short ack wrapped in a sentinel so the client can peel it off
    // into its own chat bubble, separate from the substantive reply that
    // follows. Kept inline (rather than a header) because the background job
    // delivers everything through the single ai_job row.
    if (triage.message) flusher.push("[[MERCHIVA_ACK]]" + triage.message + "[[/MERCHIVA_ACK]]");

    // Read-tools: same as the streaming route. Not for builder/HTML mode, and
    // only when the service connection + org id are available.
    const toolsEnabled = merchivaToolsEnabled() && !!args.organizationId && !isBuilderMode;
    const systemPrompt = buildSystemPrompt(args.context, args.lang, args.memory, args.permissions, toolsEnabled);
    const ackNote = triage.message
      ? `\n\nNOTE: An acknowledgment has ALREADY been sent: "${triage.message}". Skip greetings.`
      : "\n\nNOTE: Skip greetings; go straight to substantive answer or action blocks.";

    const useThinking = triage.needsDeepThinking === true;
    const stream = streamText({
      model: openrouter.chat(useThinking ? THINKING_MODEL : MODEL),
      system: systemPrompt + ackNote,
      messages: [
        ...args.history.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: args.message },
      ],
      maxOutputTokens: isBuilderMode ? 3500 : 1500,
      temperature: 0.2,
      ...(toolsEnabled
        ? {
            tools: buildMerchivaTools({
              organizationId: args.organizationId,
              today: (args.context as Record<string, unknown> | undefined)?.today as string | undefined,
            }),
            stopWhen: stepCountIs(6),
          }
        : {}),
    });

    let fullReply = "";
    for await (const chunk of stream.textStream) {
      fullReply += chunk;
      flusher.push(chunk);
      await flusher.maybeFlush();
    }
    await flusher.flush(true);
    await recordAiUsage({
      organizationId: args.organizationId,
      feature: "store_ai_bg",
      model: useThinking ? THINKING_MODEL : MODEL,
      description: args.message,
      ...normalizeUsage(await stream.usage),
    });

    // finalText mirrors the streamed partial: ack wrapped in the sentinel so
    // the client splits it into its own bubble on the final render too.
    const finalText =
      (triage.message ? "[[MERCHIVA_ACK]]" + triage.message + "[[/MERCHIVA_ACK]]" : "") + fullReply;
    await callReducer({
      token: args.token,
      name: "finalizeAiJob",
      args: [args.organizationId, jobId, finalText, undefined],
    });

    // The user may have closed the tab while this background reply ran. Ping
    // them that it's ready: an in-app notification (the bell) plus a web push
    // to any device they've registered, so they're reachable even off-site.
    // Best-effort — never let notification failures fault the job.
    await notifyReplyReady(args, jobId, fullReply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[runJob] generation failed:", msg);
    try {
      await callReducer({
        token: args.token,
        name: "finalizeAiJob",
        args: [args.organizationId, jobId, undefined, msg],
      });
    } catch (finalErr) {
      console.error("[runJob] failed to mark job failed:", finalErr);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Coalesce token-level chunks into ~250ms / 600-char batches before flushing
// to SpacetimeDB. Reducer calls are not free; one per token would melt the DB
// and waste a lot of round-trip latency for no perceptible UX gain.
function makeChunkFlusher(token: string, organizationId: string, jobId: string) {
  let buf = "";
  let lastFlushAt = Date.now();
  let firstFlush = true;
  const FLUSH_EVERY_MS = 250;
  const FLUSH_AT_CHARS = 600;
  return {
    push(text: string) { buf += text; },
    async maybeFlush() {
      const now = Date.now();
      if (buf.length >= FLUSH_AT_CHARS || now - lastFlushAt >= FLUSH_EVERY_MS) {
        await this.flush(false);
      }
    },
    async flush(final: boolean) {
      if (!buf && !firstFlush && !final) return;
      const chunk = buf;
      buf = "";
      lastFlushAt = Date.now();
      const setRunning = firstFlush;
      firstFlush = false;
      if (!chunk && !setRunning) return;
      try {
        await callReducer({
          token,
          name: "appendAiJobChunk",
          args: [organizationId, jobId, chunk, setRunning],
        });
      } catch (err) {
        console.error("[chunk-flusher] reducer failed:", err);
      }
    },
  };
}

// Find the most recently-created pending job for this session. The reducer
// just inserted one, so it should exist. We use the database HTTP `sql`
// endpoint to avoid maintaining a long-lived SDK connection from the API.
async function findLatestPendingJobId(token: string, organizationId: string, sessionId: string): Promise<string | null> {
  const HTTP_BASE = (process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000")
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:");
  const MODULE_NAME =
    process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
    "c200b446cd88a8dfa10c16c03d8f315007c61f331ff36bd711acba146a2f43aa";
  const url = `${HTTP_BASE.replace(/\/$/, "")}/v1/database/${MODULE_NAME}/sql`;
  const sql = `
    SELECT id FROM ai_job
    WHERE organization_id = '${organizationId.replace(/'/g, "''")}'
      AND session_id = '${sessionId.replace(/'/g, "''")}'
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Bearer ${token}`,
      },
      body: sql,
    });
    if (!res.ok) {
      console.warn("[findLatestPendingJobId] sql query failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    // Result shape: [{ rows: [["<uuid-bytes>"]], schema: ... }]
    const row = Array.isArray(data) ? data[0]?.rows?.[0] : null;
    if (!row || !row[0]) return null;
    return String(row[0]);
  } catch (err) {
    console.warn("[findLatestPendingJobId] crashed:", err);
    return null;
  }
}

// ── Completion notification (in-app + web push) ──────────────────────────────

const REPLY_TITLE: Record<string, string> = {
  en: "Mr. Merchiva replied",
  zh: "Mr. Merchiva 回复了",
  es: "Mr. Merchiva respondió",
  fr: "Mr. Merchiva a répondu",
  ar: "رد عليك السيد ميرشيفا",
  hi: "Mr. Merchiva ने जवाब दिया",
};

const REPLY_FALLBACK_BODY: Record<string, string> = {
  en: "Your reply is ready.",
  zh: "你的回复已经准备好了。",
  es: "Tu respuesta está lista.",
  fr: "Votre réponse est prête.",
  ar: "ردك جاهز.",
  hi: "आपका जवाब तैयार है।",
};

// Strip ```action``` blocks / bare action JSON so the notification preview shows
// the conversational reply, not machine instructions.
function stripActionsForPreview(text: string): string {
  return text
    .replace(/```action\s*\n?[\s\S]*?```/g, "")
    .replace(/```action\s*\n?[\s\S]*$/, "")
    .replace(/^\s*\{\s*"action"\s*:[\s\S]*?\}\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function notifyReplyReady(
  args: RunJobArgs,
  jobId: string,
  fullReply: string,
): Promise<void> {
  try {
    const lang = args.lang || "en";
    const title = REPLY_TITLE[lang] ?? REPLY_TITLE.en;
    const preview = stripActionsForPreview(fullReply);
    const body = preview
      ? preview.length > 140
        ? preview.slice(0, 139) + "…"
        : preview
      : REPLY_FALLBACK_BODY[lang] ?? REPLY_FALLBACK_BODY.en;
    // Carries the session id so the client can suppress the bell entry when the
    // user actually watched the reply stream in (see merchiva-chat-dashboard).
    const link = `/~/chat?mvsession=${encodeURIComponent(args.sessionId)}`;

    const conn = await getServiceConn();
    const target = await getAiReplyTarget(conn, args.organizationId, args.sessionId);
    if (!target) return;

    await serviceCreateNotification(conn, {
      organizationId: args.organizationId,
      targetIdentity: target.targetIdentity,
      type: "general",
      title,
      body,
      link,
    });

    if (target.pushSubs.length > 0) {
      await sendWebPush(target.pushSubs, {
        title,
        body,
        link,
        type: "merchiva_reply",
        id: jobId,
      });
    }
  } catch (err) {
    // SPACETIMEDB_SERVICE_TOKEN may be unset in dev, or push may be
    // unconfigured — the in-chat result still renders, so this is non-fatal.
    console.warn("[notifyReplyReady] skipped:", err instanceof Error ? err.message : err);
  }
}

// ── Prompt builders (trimmed copies of /api/store-ai logic) ──────────────────

function languageNameFor(lang: string): string {
  return lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";
}

function buildTriagePrompt(lang: string): string {
  return `You are Mr. Merchiva's triage layer. Decide if the user's request is simple (needsThinking=false, you answer directly) or complex (needsThinking=true, escalate). Reply in ${languageNameFor(lang)}. Keep ack messages short and concrete.

Also set needsDeepThinking=true ONLY for the rare requests that genuinely need heavy step-by-step reasoning — optimizing a whole week's schedule under competing constraints, root-cause analysis across multiple data sources, multi-variable forecasting, or untangling a very tangled multi-part request. For ordinary complex tasks (single data lookup, straightforward bulk write, normal recommendations) leave needsDeepThinking=false. When unsure, false.`;
}

function buildSystemPrompt(
  context: Record<string, unknown>,
  lang: string,
  memory: { summary?: string; storeOverview?: string; userPreferences?: string },
  permissions?: EnqueueBody["permissions"],
  toolsEnabled = false,
): string {
  const skillPrompts = getAllPromptSegments();
  const langName = languageNameFor(lang);
  const memoryBlock = [
    memory.summary && `CONVERSATION SUMMARY:\n${memory.summary}`,
    memory.storeOverview && `STORE OVERVIEW:\n${memory.storeOverview}`,
    memory.userPreferences && `USER PREFERENCES:\n${memory.userPreferences}`,
  ].filter(Boolean).join("\n\n");
  const permBlock = permissions?.isOwner
    ? `USER ROLE: Owner (full access)`
    : permissions
      ? `USER ROLE: ${permissions.role ?? "staff"}`
      : "";
  const dataBlock = toolsEnabled
    ? `${TOOLS_PROMPT_BLOCK}\n\nSTORE OVERVIEW:\n${buildSlimContext(context)}`
    : `LIVE STORE DATA:\n${JSON.stringify(context, null, 2)}`;
  return `You are Mr. Merchiva, an AI ops agent for a small business. Reply in ${langName}.

${permBlock}

${memoryBlock}

${dataBlock}

${skillPrompts}

Output your reply as plain text plus \`\`\`action\`\`\` JSON blocks for any actions. The client will execute the actions when it receives the finalized job result.

🚨 CRITICAL — NEVER HALLUCINATE SUCCESS:
- When the user asks to ADD / CREATE / EDIT / DELETE anything (training docs, products, shifts, roles, values, pages, etc.), you MUST emit a \`\`\`action\`\`\` block with the matching action name. NEVER respond with "已为您添加…" / "Done, added X" / "Added the training doc" without a preceding \`\`\`action\`\`\` block — those are hallucinations, the action did not happen.
- If you don't have enough info yet (missing title, missing id), ASK ONCE for the missing piece. Don't pretend.
- If you don't know which action name applies, look at the actions catalog above; pick the closest one. If genuinely none applies, say so honestly: "I don't have a tool for that yet."
- After emitting the action block, you may add a one-line confirmation in plain text, but the block itself is what actually executes — the text alone does nothing.`;
}
