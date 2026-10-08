import { NextRequest, NextResponse } from "next/server";
import { streamText, generateText, stepCountIs, type ModelMessage } from "ai";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { languageNameFor } from "@/lib/i18n/ai-language";
import { buildMerchivaTools, merchivaToolsEnabled } from "@/lib/merchiva/tools";
import { allowedMerchivaTools } from "@/lib/merchiva/tools/access";
import { validTimeZone } from "@/lib/merchiva/tools/store-time";
import { buildMcpToolContext, closeMcpClients } from "@/lib/merchiva/mcp/ai-tools";
import {
  MERCHIVA_DISABLED_ERROR,
  canUseMerchiva,
  permissionSummary,
  requestToken,
  verifyActiveMember,
} from "@/lib/auth/verify-member";
import { tierLabel, tierModel, tierModelId, type AiTier } from "@/lib/ai/models";
import { fallbackTier, routeRequest, type AiMode } from "@/lib/ai/router";
import { ackFor, conversationMessages, shouldReplyDirectly } from "@/lib/ai/triage";
import { runTriage } from "@/lib/ai/run-triage";
import {
  buildSummarizePrompt,
  buildSystemPrompt,
  type MemoryContext,
  type UserPermissions,
} from "@/lib/ai/store-ai-prompt";
import {
  ackSentinel,
  replyString,
  stripActionBlocks,
  stripIncompleteTrailingAction,
} from "@/lib/ai/reply-text";
import { toolFrameCallbacks, type ToolFrameCallbacks } from "@/lib/ai/tool-stream";
import { BLANK_RETRY_MAX_STEPS, withBlankRetry, type ReplyAttempt } from "@/lib/ai/blank-reply";
import { pageTriageNote, sanitizeCurrentPage, withCurrentPage } from "@/lib/ai/page-prompt";

// Mr. Merchiva's chat endpoint: streaming chat (the dashboard's fallback when the background-job
// path is unavailable), voice calls and the CLI. Models, routing, triage and prompts live in
// lib/ai/ — this file only walks one request through them.

// ── Verbose prompt logging ────────────────────────────────────────────────
// Dumps the FULL raw system prompt and conversation messages sent to each
// model to the server console, so you can see exactly what Mr. Merchiva
// receives. On by default; set STORE_AI_LOG_PROMPTS="false" to silence (e.g.
// to keep production logs lean) or "preview" to truncate long blocks.
const LOG_PROMPTS = process.env.STORE_AI_LOG_PROMPTS !== "false";
const LOG_PREVIEW = process.env.STORE_AI_LOG_PROMPTS === "preview";

function logBlock(label: string, content: string) {
  if (!LOG_PROMPTS) return;
  const body = LOG_PREVIEW && content.length > 2000
    ? `${content.slice(0, 2000)}\n…[+${content.length - 2000} chars truncated]`
    : content;
  const bar = "─".repeat(16);
  console.log(`\n${bar} [store-ai] ${label} (${content.length} chars) ${bar}\n${body}\n${bar} /${label} ${bar}\n`);
}

function logMessages(label: string, msgs: readonly ModelMessage[]) {
  if (!LOG_PROMPTS) return;
  logBlock(
    label,
    msgs
      .map((m, i) => `[${i}] ${m.role}:\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n\n"),
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, context, type, lang, memory, summarize, mode } = body;
    const callMode: AiMode = mode === "voice" ? "voice" : "chat";

    // Every branch below spends model tokens, and the chat reads the org's
    // team, sales and inventory for whatever organizationId the body names.
    // So before anything else: the caller's token must verify and belong to
    // an ACTIVE member of that org. The membership it proves also decides
    // which read tools the chat gets, and the tools read with that token.
    const organizationId =
      typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const callerToken = requestToken(body.token, req.headers.get("authorization"));
    const auth = await verifyActiveMember(callerToken, organizationId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    // An admin may have switched Mr. Merchiva off for this member; the chat
    // won't open for them, and neither does this route.
    if (!canUseMerchiva(auth.access)) {
      return NextResponse.json({ error: MERCHIVA_DISABLED_ERROR }, { status: 403 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({
        reply: "AI assistant is not configured. Set OPENROUTER_API_KEY in environment variables.",
      });
    }

    // Summarization request — memory compression, L1.
    if (summarize) {
      const { prevSummary, newMessages } = summarize;
      const prompt = buildSummarizePrompt(prevSummary ?? "", newMessages ?? []);
      logBlock("summarize prompt", prompt);
      const summaryResult = await generateText({
        model: tierModel(1),
        messages: [{ role: "system", content: prompt }],
        maxOutputTokens: 800,
        temperature: 0,
      });
      await recordAiUsage({
        organizationId,
        feature: "store_ai_summarize",
        model: tierModelId(1),
        description: "Summarized conversation history",
        ...normalizeUsage(summaryResult.totalUsage),
      });
      return NextResponse.json({ summary: summaryResult.text });
    }

    // Weekly summary — a written report, L2.
    if (type === "weekly_summary") {
      const systemPrompt = `You are Mr. Merchiva generating a weekly summary. Store data:\n${JSON.stringify(context ?? {}, null, 2)}\n\nGenerate a concise weekly report with: Revenue, Top Products, Staffing, Inventory Alerts, Recommendations. Use real numbers. Respond in ${languageNameFor(lang)}.`;
      logBlock("weekly_summary system prompt", systemPrompt);
      const weeklyResult = await generateText({
        model: tierModel(2),
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate this week's summary." }],
        maxOutputTokens: 2048,
        temperature: 0,
      });
      await recordAiUsage({
        organizationId,
        feature: "store_ai_weekly_summary",
        model: tierModelId(2),
        description: "Generated weekly summary report",
        ...normalizeUsage(weeklyResult.totalUsage),
      });
      return NextResponse.json({ reply: weeklyResult.text });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const memCtx: MemoryContext = memory ?? {};
    // The permissions the prompt describes are the verified member's, not the
    // ones the body claims.
    const userPerms: UserPermissions = permissionSummary(auth.access);
    // Tool calling is for store-data work. The tools read as the caller, with
    // their token, in the org they were just verified against, and only the
    // tools their section permissions allow are given to the model (MCP tools
    // are the user's own and stay as they are).
    const readTools = merchivaToolsEnabled(callerToken) ? allowedMerchivaTools(auth.access) : null;
    const storeContext = (context ?? {}) as Record<string, unknown>;
    const mcpContext = await buildMcpToolContext(body.mcpServers);
    // The page the user is looking at in the chat's own tab. Client-supplied,
    // so capped and flattened here, and rendered as quoted data.
    const page = sanitizeCurrentPage(body.page);
    const systemPrompt = withCurrentPage(
      buildSystemPrompt(
        context ?? {},
        lang ?? "en",
        memCtx,
        userPerms,
        callMode,
        readTools,
        mcpContext.prompt,
      ),
      page,
    );
    // Built once per request, so a continuation batch reuses the rows the
    // first one loaded.
    const localTools =
      readTools && callerToken
        ? buildMerchivaTools({
            token: callerToken,
            organizationId,
            allowed: readTools,
            today: storeContext.today as string | undefined,
            timeZone: validTimeZone(storeContext.timeZone) ?? undefined,
          })
        : {};
    // A blank reply's retry (lib/ai/blank-reply.ts) gets fewer steps.
    const toolOptions = (maxSteps = 6) => {
      const allTools = { ...localTools, ...mcpContext.tools };
      return Object.keys(allTools).length > 0
        ? { tools: allTools, stopWhen: stepCountIs(maxSteps) }
        : {};
    };
    const stepsFor = (attempt: ReplyAttempt) => (attempt.retry ? BLANK_RETRY_MAX_STEPS : 6);

    // Conversation messages only — the system prompt is passed via the SDK's
    // `system` option (not as a messages[] entry) to avoid the prompt-injection
    // warning and keep the system instruction out of the user-controlled array.
    const convoMsgs = conversationMessages(history, message);

    const totalChars =
      systemPrompt.length + convoMsgs.reduce((s, m) => s + m.content.length, 0);
    console.log(`[store-ai] Mode: ${callMode}, messages: ${convoMsgs.length}, total chars: ${totalChars}`);

    // Raw dump of everything we're about to feed the model.
    logBlock(
      `request (mode=${callMode}, lang=${lang ?? "en"}, stream=${!!body.stream})`,
      [
        `message: ${message}`,
        `history turns: ${Array.isArray(history) ? history.length : 0}`,
        `permissions: ${JSON.stringify(userPerms ?? null)}`,
        `memory keys: ${Object.keys(memCtx).join(", ") || "(none)"}`,
        `context keys: ${context ? Object.keys(context as object).join(", ") : "(none)"}`,
        `page: ${JSON.stringify(page)}`,
        `context: ${JSON.stringify(context ?? null)}`,
      ].join("\n"),
    );
    logBlock("system prompt", systemPrompt);
    logMessages("conversation messages", convoMsgs);

    // Standard chat was 1500 originally, but batch operations (e.g. scheduling
    // 14 shifts via 14 ```action``` blocks) trip that cap and end mid-JSON
    // around action #7. 4000 fits ~25 shift blocks plus reasonable preamble
    // and still stays well under what any of the three tiers can produce.
    const maxOutput = callMode === "voice" ? 800 : 4000;

    if (body.stream) {
      // Chat and voice both triage on L1: simple requests are answered
      // directly, the rest get an ack and go to the tier the signals score.
      logMessages("triage messages", convoMsgs);
      const triage = await runTriage({
        mode: callMode,
        lang: lang ?? "en",
        messages: convoMsgs,
        organizationId,
        feature: "store_ai_triage",
        description: message,
        logPrompt: logBlock,
        pageNote: pageTriageNote(page),
      });
      if (triage) {
        console.log(
          `[store-ai] Triage (${callMode}): direct=${triage.directReply}, kaomoji="${triage.kaomoji}", msg="${triage.message.slice(0, 120)}"`,
        );
      }
      const direct = triage !== null && shouldReplyDirectly(triage, callMode);
      const ack = direct ? "" : ackFor(triage);

      const encoder = new TextEncoder();
      // Triage's kaomoji + ack message are surfaced as response headers so the
      // client can render the ack bubble and pin the watermark to the chosen
      // face the instant the response status line arrives — well before any
      // body bytes flush. Body streaming for short chunks was getting buffered
      // by the Node.js HTTP layer in the App Router (small chunks accumulate
      // until ~4-8KB or the stream closes), which made the in-body ack invisible
      // until the whole reply was done. Headers bypass that buffering. Headers
      // must be ASCII-safe; we base64-encode the UTF-8 bytes.
      const kaomojiHeader = triage?.kaomoji
        ? Buffer.from(triage.kaomoji, "utf-8").toString("base64")
        : "";
      // The ack header is a SHORT preamble shown while the escalated model works
      // — it only applies on the escalation path, where the body carries a
      // separate substantive reply. For a direct answer the message IS the
      // body, so emitting it as an ack too made the client render the same
      // text twice (ack bubble + main bubble). `ack` is empty then.
      const ackHeader = ack ? Buffer.from(ack, "utf-8").toString("base64") : "";
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      };
      if (kaomojiHeader) responseHeaders["X-Merchiva-Kaomoji"] = kaomojiHeader;
      if (ackHeader) responseHeaders["X-Merchiva-Ack"] = ackHeader;

      // Direct answer — the triage reply is the whole reply.
      if (triage && direct) {
        const reply = triage.message;
        console.log(`[store-ai] Reply (triage direct, ${reply.length} chars):\n${reply}`);
        await closeMcpClients(mcpContext.clients);
        const directStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(reply));
            controller.close();
          },
        });
        return new Response(directStream, { headers: responseHeaders });
      }

      // Escalate to the tier the signals score. Every tier runs with the
      // tools; only the model changes. The tier stays server-side (logs and
      // ai_usage) — the user sees one assistant.
      const route = triage ? routeRequest(triage.signals, { mode: callMode }) : null;
      const tier: AiTier = route?.tier ?? fallbackTier(callMode);
      const modelId = tierModelId(tier);
      console.log(
        route
          ? `[store-ai] Route (${callMode}): score=${route.score} [${route.signals.join(", ") || "no signals"}]${route.capped ? " capped for voice" : ""} → ${tierLabel(tier)} ${modelId}`
          : `[store-ai] Route (${callMode}): no triage → ${tierLabel(tier)} ${modelId}`,
      );

      // Tool-call frames are opt-in: only the dashboard's streaming path parses
      // them. Voice would speak them and the CLI would print them.
      const emitToolEvents = body.events === true && callMode === "chat";
      const mcpLabels = mcpContext.connected.map((server) => server.label);

      // Escalate: ack is already on X-Merchiva-Ack (above). Body carries the
      // substantive reply only. We keep emitting the [[MERCHIVA_ACK]] sentinel
      // at the front of the body as a fallback for any environment that strips
      // custom response headers (older proxies, some service workers).
      const mainSystem =
        systemPrompt +
        (ack
          ? `\n\nNOTE: An acknowledgment has ALREADY been sent to the user: "${ack}". Skip greetings/preamble — go straight to the substantive answer or action blocks.`
          : `\n\nNOTE: Skip greetings/preamble — go straight to the substantive answer or action blocks.`);

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Fallback ack-in-body: client prefers the X-Merchiva-Ack header and
          // ignores this sentinel if the header was present, but environments
          // that strip the header still get the ack peeled out of the body.
          if (ack) controller.enqueue(encoder.encode(ackSentinel(ack)));
          // Frames go out the moment a tool starts or finishes — ahead of the
          // batch text, which is buffered below.
          const toolFrames: Partial<ToolFrameCallbacks> = emitToolEvents
            ? toolFrameCallbacks((frame) => controller.enqueue(encoder.encode(frame)), { mcpLabels })
            : {};
          try {
            const escalationModel = tierModel(tier);
            logBlock(`main system (${tierLabel(tier)} ${modelId})`, mainSystem);

            // Auto-batching: when a reply hits the maxOutput cap mid-stream
            // (finishReason === "length"), the action-block parser bails at
            // the first unclosed ```action fence and discards everything
            // after it — so a single truncated block silently wipes out the
            // rest of the response on the client. Instead we re-prompt the
            // model to continue, stripping any incomplete trailing action
            // first so concatenation stays parseable. Hard-capped at 3
            // batches so a confused model can't drain credits.
            const MAX_BATCHES = 3;
            let cleanReply = "";
            let lastFinishReason: string | undefined;
            let usageInput = 0;
            let usageOutput = 0;

            // A reply that comes back blank gets one retry with the tool
            // results it already fetched (lib/ai/blank-reply.ts).
            const { retried, blank } = await withBlankRetry({ system: mainSystem, messages: convoMsgs }, async (attempt) => {
              let attemptReply = "";
              // The first batch's tool calls and results, for a retry.
              let fetched: readonly ModelMessage[] = [];
              for (let batchN = 1; batchN <= MAX_BATCHES; batchN++) {
                const continuationNote = batchN > 1
                  ? `\n\nCONTINUATION TURN ${batchN}: Your previous reply was cut off because it exceeded the response size cap. Pick up exactly where you stopped. Any incomplete trailing action block has already been removed — re-emit it from scratch if needed, then emit any remaining action blocks. DO NOT repeat the preamble or explanation. DO NOT repeat action blocks you already finished. Just emit the remaining \`\`\`action\`\`\` blocks.`
                  : "";
                const turnMessages: ModelMessage[] = batchN === 1
                  ? attempt.messages
                  : [...attempt.messages, { role: "assistant", content: attemptReply }];

                logMessages(`main messages (${attempt.retry ? "retry, " : ""}batch ${batchN})`, turnMessages);

                const mainResult = streamText({
                  model: escalationModel,
                  system: attempt.system + continuationNote,
                  messages: turnMessages,
                  maxOutputTokens: maxOutput,
                  temperature: callMode === "voice" ? 0.4 : 0.2,
                  // Read-tools + user-connected MCP tools. Writes stay as
                  // ```action``` blocks. stepCountIs caps fetch->reason loops.
                  ...toolOptions(stepsFor(attempt)),
                  ...toolFrames,
                });

                // Buffer the batch server-side rather than streaming chunk by
                // chunk — we need the full batch text to decide whether to
                // strip an incomplete trailing action block before forwarding.
                // (The client already renders the main bubble all-at-once on
                // finalize, so per-chunk streaming wasn't being shown anyway.)
                let batchText = "";
                for await (const chunk of mainResult.textStream) {
                  batchText += chunk;
                }
                lastFinishReason = await mainResult.finishReason;
                if (batchN === 1) fetched = (await mainResult.response).messages;
                try {
                  // totalUsage spans every step of the batch (tool round trips
                  // included); `usage` is the last step only.
                  const batchUsage = normalizeUsage(await mainResult.totalUsage);
                  usageInput += batchUsage.inputTokens;
                  usageOutput += batchUsage.outputTokens;
                } catch {
                  /* usage unavailable for this batch — skip */
                }

                if (lastFinishReason === "length") {
                  const { trimmed, stripped } = stripIncompleteTrailingAction(batchText);
                  console.log(
                    `[store-ai] Batch ${batchN}: ${batchText.length} chars, finishReason=length${
                      stripped ? `, stripped ${batchText.length - trimmed.length} char incomplete trailing action` : ""
                    }`,
                  );
                  controller.enqueue(encoder.encode(trimmed));
                  attemptReply += trimmed;
                  if (batchN === MAX_BATCHES) {
                    console.log(`[store-ai] Hit MAX_BATCHES (${MAX_BATCHES}); stopping continuation`);
                  }
                } else {
                  console.log(
                    `[store-ai] Batch ${batchN}: ${batchText.length} chars, finishReason=${lastFinishReason}`,
                  );
                  controller.enqueue(encoder.encode(batchText));
                  attemptReply += batchText;
                  break;
                }
              }
              cleanReply += attemptReply;
              return { text: attemptReply, messages: fetched };
            });
            if (retried) console.log(`[store-ai] Blank reply retried once → ${blank ? "still blank" : "answered"}`);
            if (blank) {
              // Never end on the ack and tool steps alone.
              const fallback = replyString(lang, callMode === "voice" ? "merchiva.errors.voiceFallback" : "merchiva.errors.chatFallback");
              controller.enqueue(encoder.encode(fallback));
              cleanReply += fallback;
            }

            controller.close();
            await recordAiUsage({
              organizationId,
              feature: "store_ai",
              model: modelId,
              description: message,
              inputTokens: usageInput,
              outputTokens: usageOutput,
            });
            console.log(
              `[store-ai] Reply (${tierLabel(tier)} ${modelId}, ${cleanReply.length} chars total):\n${cleanReply}`,
            );
          } catch (e) {
            console.error(
              "[store-ai] Main stage failed:",
              e instanceof Error ? e.message : String(e),
            );
            controller.error(e);
          } finally {
            await closeMcpClients(mcpContext.clients);
          }
        },
      });

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming fallback. No triage here: this path exists for callers
    // that cannot read a stream, and a triage round trip would add latency to
    // a reply the user already waits for in full. So the tier is fixed:
    // L2 for chat, L1 for voice (fallbackTier).
    const fallbackTierForCall = fallbackTier(callMode);
    const fallbackModelId = tierModelId(fallbackTierForCall);
    logBlock(`non-stream system prompt (${tierLabel(fallbackTierForCall)} ${fallbackModelId})`, systemPrompt);
    logMessages("non-stream messages", convoMsgs);
    let text = "";
    const usage = { inputTokens: 0, outputTokens: 0 };
    // A blank reply gets one retry with the tool results it already fetched
    // (lib/ai/blank-reply.ts); a second blank one gets the fallback below.
    await withBlankRetry({ system: systemPrompt, messages: convoMsgs }, async (attempt) => {
      const result = await generateText({
        model: tierModel(fallbackTierForCall),
        system: attempt.system,
        messages: attempt.messages,
        maxOutputTokens: maxOutput,
        temperature: callMode === "voice" ? 0.4 : 0.2,
        ...toolOptions(stepsFor(attempt)),
      });
      const spent = normalizeUsage(result.totalUsage);
      usage.inputTokens += spent.inputTokens;
      usage.outputTokens += spent.outputTokens;
      text = result.text;
      return { text: result.text, messages: result.response.messages };
    }).finally(async () => {
      await closeMcpClients(mcpContext.clients);
    });
    await recordAiUsage({
      organizationId,
      feature: callMode === "voice" ? "store_ai_voice" : "store_ai",
      model: fallbackModelId,
      description: message,
      ...usage,
    });

    if (callMode === "voice") {
      const spoken = stripActionBlocks(text ?? "");
      const reply = spoken || replyString(lang, "merchiva.errors.voiceFallback");
      return NextResponse.json({ reply });
    }

    return NextResponse.json({
      reply: text || replyString(lang, "merchiva.errors.chatFallback"),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : "";
    console.error("[store-ai] Error:", errMsg);
    if (errStack) console.error("[store-ai] Stack:", errStack);
    return NextResponse.json({ error: `AI service error: ${errMsg}` }, { status: 500 });
  }
}
