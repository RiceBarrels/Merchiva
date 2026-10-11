import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { streamText, stepCountIs } from "ai";
import { buildMerchivaTools, merchivaToolsEnabled } from "@/lib/merchiva/tools";
import { allowedMerchivaTools } from "@/lib/merchiva/tools/access";
import { validTimeZone } from "@/lib/merchiva/tools/store-time";
import { buildMcpToolContext, closeMcpClients } from "@/lib/merchiva/mcp/ai-tools";
import {
  MERCHIVA_DISABLED_ERROR,
  canUseMerchiva,
  permissionSummary,
  verifyActiveMember,
  type MemberAccess,
} from "@/lib/auth/verify-member";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import {
  getServiceConn,
  getAiReplyTarget,
  serviceCreateNotification,
} from "@/lib/spacetimedb/service-client";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { tierLabel, tierModel, tierModelId, type AiTier } from "@/lib/ai/models";
import { fallbackTier, routeRequest } from "@/lib/ai/router";
import { ackFor, conversationMessages, shouldReplyDirectly } from "@/lib/ai/triage";
import { runTriage } from "@/lib/ai/run-triage";
import { buildSystemPrompt } from "@/lib/ai/store-ai-prompt";
import { ackSentinel, replyString, stripIncompleteTrailingAction } from "@/lib/ai/reply-text";
import { toolFrameCallbacks } from "@/lib/ai/tool-stream";
import { BLANK_RETRY_MAX_STEPS, withBlankRetry } from "@/lib/ai/blank-reply";
import { createJobFlusher } from "@/lib/ai/job-flusher";
import { pageTriageNote, sanitizeCurrentPage, withCurrentPage, type CurrentPage } from "@/lib/ai/page-prompt";

// Background replies are delivered through the ai_job row and their actions
// run only when the job is finalized, so the prompt says so — and repeats the
// no-hallucinated-success rule this path has always carried.
const BACKGROUND_NOTE = `

Output your reply as plain text plus \`\`\`action\`\`\` JSON blocks for any actions. The client will execute the actions when it receives the finalized job result.

🚨 CRITICAL — NEVER HALLUCINATE SUCCESS:
- When the user asks to ADD / CREATE / EDIT / DELETE anything (training docs, products, shifts, roles, values, pages, etc.), you MUST emit a \`\`\`action\`\`\` block with the matching action name. NEVER respond with "已为您添加…" / "Done, added X" / "Added the training doc" without a preceding \`\`\`action\`\`\` block — those are hallucinations, the action did not happen.
- If you don't have enough info yet (missing title, missing id), ASK ONCE for the missing piece. Don't pretend.
- If you don't know which action name applies, look at the actions catalog above; pick the closest one. If genuinely none applies, say so honestly: "I don't have a tool for that yet."
- After emitting the action block, you may add a one-line confirmation in plain text, but the block itself is what actually executes — the text alone does nothing.`;

// Room for a full week of engine-proposed addShift blocks. There is no
// continuation batch on this path (unlike /api/store-ai), and the old 1500
// cut a week's schedule off mid-block; a reply that still hits the cap has its
// incomplete trailing action trimmed so the rest parses.
const MAX_OUTPUT_TOKENS = 4000;

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
  mcpServers?: unknown;
  // The page the user is looking at in the chat's tab (lib/merchiva/current-page.ts).
  // Untrusted: sanitizeCurrentPage decides what of it reaches the prompts.
  page?: unknown;
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
    const { token, organizationId, sessionId, message, history, context, lang, memory } = body;

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
    if (!organizationId || !sessionId || !message) {
      return NextResponse.json({ error: "Missing organizationId, sessionId, or message" }, { status: 400 });
    }
    // createAiJob below would refuse a non-member too, but the job also reads
    // the org's data with this token: prove the membership here, and take the
    // role and section permissions that decide the read tools from it — never
    // from the body.
    const auth = await verifyActiveMember(token, organizationId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    // Mr. Merchiva switched off for this member by an admin: no job, no reply.
    if (!canUseMerchiva(auth.access)) {
      return NextResponse.json({ error: MERCHIVA_DISABLED_ERROR }, { status: 403 });
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
          mcpServers: body.mcpServers,
          access: auth.access,
          page: sanitizeCurrentPage(body.page),
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
  mcpServers?: unknown;
  // The verified membership (verifyActiveMember in POST).
  access: MemberAccess;
  // The sanitized current page, or null.
  page: CurrentPage | null;
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

  // Stream chunks into the job row. Text is coalesced so we don't hammer the
  // database with one reducer call per token; tool frames go out at once.
  const flusher = createJobFlusher((chunk, setRunning) =>
    callReducer({
      token: args.token,
      name: "appendAiJobChunk",
      args: [args.organizationId, jobId, chunk, setRunning],
    }),
  );

  try {
    const messages = conversationMessages(args.history, args.message);
    // Triage (L1) decides direct answer vs. escalation, and scores the rest.
    const triage = await runTriage({
      mode: "chat",
      lang: args.lang,
      messages,
      organizationId: args.organizationId,
      feature: "store_ai_bg_triage",
      description: args.message,
      pageNote: pageTriageNote(args.page),
    });

    if (triage && shouldReplyDirectly(triage, "chat")) {
      flusher.push(triage.message);
      await flusher.flush();
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
    // delivers everything through the single ai_job row. It leads both the
    // partial and the final text; tool frames and reply text follow in the
    // order they happened.
    const ack = ackFor(triage);
    let transcript = ackSentinel(ack);
    if (transcript) flusher.pushNow(transcript);

    // Every tier runs with the tools; only the model changes.
    const route = triage ? routeRequest(triage.signals, { mode: "chat" }) : null;
    const tier: AiTier = route?.tier ?? fallbackTier("chat");
    const modelId = tierModelId(tier);
    console.log(
      route
        ? `[runJob] Route: score=${route.score} [${route.signals.join(", ") || "no signals"}] → ${tierLabel(tier)} ${modelId}`
        : `[runJob] Route: no triage → ${tierLabel(tier)} ${modelId}`,
    );

    // Read-tools: same as the streaming route — read as the caller with their
    // token, and only those the member's permissions allow.
    const readTools =
      merchivaToolsEnabled(args.token) && !!args.organizationId ? allowedMerchivaTools(args.access) : null;
    const mcpContext = await buildMcpToolContext(args.mcpServers);
    const systemPrompt = withCurrentPage(
      buildSystemPrompt(
        args.context,
        args.lang,
        args.memory,
        permissionSummary(args.access),
        "chat",
        readTools,
        mcpContext.prompt,
      ),
      args.page,
    );
    const ackNote = ack
      ? `\n\nNOTE: An acknowledgment has ALREADY been sent: "${ack}". Skip greetings.`
      : "\n\nNOTE: Skip greetings; go straight to substantive answer or action blocks.";

    const localTools = readTools
      ? buildMerchivaTools({
          token: args.token,
          organizationId: args.organizationId,
          allowed: readTools,
          today: args.context.today as string | undefined,
          timeZone: validTimeZone(args.context.timeZone) ?? undefined,
        })
      : {};
    const allTools = { ...localTools, ...mcpContext.tools };
    const hasTools = Object.keys(allTools).length > 0;

    let fullReply = "";
    const usage = { inputTokens: 0, outputTokens: 0 };
    try {
      // A reply that comes back blank gets one retry with the tool results it
      // already fetched, then the fallback line (lib/ai/blank-reply.ts).
      const { retried, blank } = await withBlankRetry(
        { system: systemPrompt + BACKGROUND_NOTE + ackNote, messages },
        async (attempt) => {
          const stream = streamText({
            model: tierModel(tier),
            system: attempt.system,
            messages: attempt.messages,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.2,
            ...(hasTools
              ? { tools: allTools, stopWhen: stepCountIs(attempt.retry ? BLANK_RETRY_MAX_STEPS : 6) }
              : {}),
            // Each tool call lands in the row the moment it starts and finishes.
            ...(hasTools
              ? toolFrameCallbacks(
                  (frame) => {
                    transcript += frame;
                    flusher.pushNow(frame);
                  },
                  { mcpLabels: mcpContext.connected.map((server) => server.label) },
                )
              : {}),
          });

          let text = "";
          for await (const chunk of stream.textStream) {
            text += chunk;
            transcript += chunk;
            flusher.push(chunk);
            await flusher.maybeFlush();
          }
          await flusher.flush();

          if ((await stream.finishReason) === "length") {
            // Cut mid-block: drop the incomplete trailing action so the blocks
            // before it still parse on the client.
            const { trimmed, stripped } = stripIncompleteTrailingAction(transcript);
            if (stripped) {
              console.log(`[runJob] finishReason=length; stripped ${transcript.length - trimmed.length} char incomplete trailing action`);
              transcript = trimmed;
              text = stripIncompleteTrailingAction(text).trimmed;
            }
          }
          fullReply += text;
          // Every step of the tool loop, not just the last one.
          const spent = normalizeUsage(await stream.totalUsage);
          usage.inputTokens += spent.inputTokens;
          usage.outputTokens += spent.outputTokens;
          return { text, messages: (await stream.response).messages };
        },
      );
      if (retried) console.log(`[runJob] blank reply retried once → ${blank ? "still blank" : "answered"}`);
      if (blank) {
        // Never finalize a job that holds only the ack and tool steps.
        fullReply = replyString(args.lang, "merchiva.errors.chatFallback");
        transcript += fullReply;
        flusher.push(fullReply);
        await flusher.flush();
      }
      await recordAiUsage({
        organizationId: args.organizationId,
        feature: "store_ai_bg",
        model: modelId,
        description: args.message,
        ...usage,
      });
    } finally {
      await closeMcpClients(mcpContext.clients);
    }

    // finalText mirrors the streamed partial: the ack sentinel first, then
    // tool frames and text in order, so the client renders the same thing on
    // the final pass.
    const finalText = transcript;
    await callReducer({
      token: args.token,
      name: "finalizeAiJob",
      args: [args.organizationId, jobId, finalText, undefined],
    });

    // The user may have closed the tab while this background reply ran. Ping
    // them that it's ready: an in-app notification, which the notifications
    // cron also pushes to any device they've registered, so they're reachable
    // even off-site. Best-effort — never let notification failures fault the job.
    await notifyReplyReady(args, fullReply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[runJob] generation failed:", msg);
    try {
      // Let queued chunk writes land first, so none arrives after the job
      // is marked failed.
      await flusher.flush();
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

// ── Completion notification (in-app; /api/cron/notifications pushes it) ──────

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
  fullReply: string,
): Promise<void> {
  try {
    const title = replyString(args.lang, "merchiva.replyReady.title");
    const preview = stripActionsForPreview(fullReply);
    const body = preview
      ? preview.length > 140
        ? preview.slice(0, 139) + "…"
        : preview
      : replyString(args.lang, "merchiva.replyReady.body");
    // Mr. Merchiva lives in the dock beside every /manager page (one conversation
    // per browser tab), so the link just lands in /manager. It carries the session
    // id so the client can mark the notification read when the user actually
    // watched the reply stream in, so it neither dots Mr. Merchiva's rail nor
    // emails (see merchiva-chat-dashboard).
    const link = `/manager/dashboard?mvsession=${encodeURIComponent(args.sessionId)}`;

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
  } catch (err) {
    // SPACETIMEDB_SERVICE_TOKEN may be unset in dev — the in-chat result
    // still renders, so this is non-fatal.
    console.warn("[notifyReplyReady] skipped:", err instanceof Error ? err.message : err);
  }
}
