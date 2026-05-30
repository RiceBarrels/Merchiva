import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva morning briefing",
    },
  });
}

function getModel() {
  return process.env.OPENROUTER_FAST_MODEL || "openai/gpt-oss-120b";
}

const briefingActionSchema = z.object({
  label: z
    .string()
    .describe("Short action label in the user's language, e.g. '为今日排班 Alice 09:00–17:00'."),
  action: z
    .enum(["addShift", "updateInventory", "createNotification"])
    .describe("Canonical Mr. Merchiva action name (only these three are allowed)."),
  paramsJson: z
    .string()
    .describe("A JSON OBJECT STRING with the action's parameters (see ALLOWED ACTIONS in the system prompt)."),
});

const briefingSchema = z.object({
  summary: z
    .string()
    .describe("One-line headline (max 80 chars). Plain text, no HTML, no markdown."),
  content: z
    .string()
    .describe(
      "HTML body — bullet items as <ul> with <li> children (typically 3 to 10, as many as the data warrants), each one concrete observation or recommendation grounded in the LIVE STORE DATA. Lead with the most urgent item. You may use <strong>, <em>, <code>, and short <h3> headers to group related items (inventory, staffing, sales, tasks, promotions). NO <script>, <style>, <iframe>, <img>, inline event handlers, or javascript: URLs. NO markdown, NO action blocks, NO JSON.",
    ),
  actions: z
    .array(briefingActionSchema)
    .max(8)
    .optional()
    .describe(
      "Up to 8 one-click actions the owner can approve, each clearly justified by the LIVE STORE DATA. Omit or return [] when nothing is warranted.",
    ),
});

type Briefing = z.infer<typeof briefingSchema>;

// Extract a balanced top-level JSON object from a string that may contain
// surrounding prose, code fences, or other noise. Returns null on failure.
// Many cheap OpenRouter models wrap their JSON in ```json … ``` or add a
// preamble like "Here is the briefing:" — generateObject's strict parser
// rejects both, but we can recover from each.
function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;
  // Strip a leading code fence and language tag if present.
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
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function recoverBriefingFromText(text: string | undefined): Briefing | null {
  if (!text) return null;
  const candidate = extractFirstJsonObject(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    const result = briefingSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    /* fall through */
  }
  return null;
}

function buildSystemPrompt(context: Record<string, unknown>, lang: string, dateStr: string): string {
  const languageName = lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";

  // Same Mr. Merchiva persona as the right-panel assistant
  // (app/api/store-ai/route.ts buildSystemPrompt) and fed the same LIVE STORE
  // DATA — the only difference is this surface is a read-only morning briefing,
  // so it emits a {summary, content} object instead of chat + action blocks.
  return `You are Mr. Merchiva, an AI ops agent for a small business. You have full access to the store's real-time data. You are direct, data-driven, and concise.

🌐 USER LANGUAGE: ${languageName} (locale code: "${lang}")
ALL of your output (summary + every bullet) MUST be written in ${languageName}. Do not switch languages even if the LIVE STORE DATA contains other languages. The user's interface is set to "${lang}" — match it.

YOUR TASK: generate the OWNER'S morning briefing for ${dateStr}. Read EVERYTHING in LIVE STORE DATA below and call out every item that genuinely deserves the owner's attention today. Do not under-report: if the data shows a problem, surface it. Only say "all clear" when the data truly shows nothing actionable.

WHAT TO CHECK (scan the data for each; include the ones that actually apply, with concrete numbers):
- Pre-computed signals (\`insights\`): each has a type, title and severity — treat HIGH-severity insights as must-mention. Don't contradict them.
- Low / out-of-stock inventory (\`lowStock\`, and \`inventory[].status\` = out|low|ok) — name the items and their stock vs min.
- Today's coverage (\`todayShifts\`, \`team\`, \`openingHours\`, \`unassignedTodayShifts\`) — gaps, unassigned shifts, or nobody scheduled while open.
- Pending time-off requests (\`timeOffRequests\`) and pending shift trades (\`shiftTrades\`) awaiting the owner's approval — name who and the dates.
- Sales (\`sales\`): yesterday vs the same weekday last week (\`yesterdayRevenue\` vs \`priorWeekSameDayRevenue\`), today's revenue so far (\`todayRevenueSoFar\`, with intraday \`todayHourly\`), and any notable swing or anomaly in \`recentDaily\`. Call out a significant jump or drop in %.
- YESTERDAY'S TASK EVIDENCE (\`yesterdayTaskEvidence\`): which role tasks were completed yesterday, by whom, with notes/photos. Each item has \`evidenceStatus\` (complete | missing_required | not_required) — FLAG every \`missing_required\` by name.
- Task compliance (\`taskCompliance\`): \`completedYesterday\` / \`skippedYesterday\`, \`missingRequiredEvidence\` (required photo proof not submitted), and \`overduePending\` (overdue, still not done) — list \`overdueExamples\`.
- Expiring promotions/coupons (\`expiringCoupons\`) — codes lapsing within ~7 days.
- Underperforming products (\`products\` with an \`alert\`).
- Upcoming holidays in the next two weeks (\`upcomingHolidays\`) that may need staffing or special hours.
- Unread notifications (\`unreadNotifications\`) worth a glance.

STYLE:
- Friendly but not chatty — the owner wants signal fast.
- Prefer concrete numbers and names pulled from LIVE STORE DATA over vague claims. Never invent numbers.
- Lead with the most urgent item; group related items under short <h3> headers when there's a lot.
- If everything genuinely looks normal, say so in one bullet — don't pad.

ONE-CLICK ACTIONS (optional \`actions\` array — the owner approves each with one click):
Propose up to ~6 concrete actions that the LIVE STORE DATA clearly justifies. Each = { label, action, paramsJson }. \`label\` is a short phrase in ${languageName}. \`action\` is one of exactly these three; \`paramsJson\` is a JSON OBJECT STRING:
- \`addShift\` — when today (\`${dateStr}\`) has no/under coverage while open. paramsJson: {"staffName","date":"${dateStr}","startTime":"HH:MM","endTime":"HH:MM","shiftType":"morning|afternoon|evening|closing","staffRoles":["RoleName"]}.
  • \`staffName\` MUST be the exact \`name\` of a PERSON in \`team\`. It is NEVER a job title or role — e.g. "Evening Cashier" is a ROLE, not a person, so it must not appear here.
  • \`staffRoles\` MUST contain exact job-role name(s) copied verbatim from the \`roles\` array in LIVE STORE DATA (e.g. ${"`roles[].name`"}). Do NOT use a person's \`team[].role\` value — that is their permission level (owner/manager/staff), NOT a job role — and do NOT invent roles like "manager" or "cashier". If the \`roles\` array is empty, OMIT the addShift action entirely.
  Align times to \`openingHours\`. Output ONE addShift per person — never combine people.
- \`updateInventory\` — to restock a low/out item. paramsJson: {"itemName","type":"in","quantity":N,"notes":"reason"}. \`itemName\` MUST be from \`inventory\`/\`lowStock\`; pick a quantity that brings stock comfortably above its min.
- \`createNotification\` — to remind staff, e.g. submit missing required task evidence. paramsJson: {"type":"urgent","title":"...","body":"..."}.
RULES: never propose deletes, edits, pricing changes, or any action not in this list. Never invent a staffName or itemName that is not present in LIVE STORE DATA. Only propose an action when it is clearly warranted; otherwise omit the array or return []. The \`content\` bullets and the \`actions\` should agree (don't propose an action you didn't mention).

OUTPUT FORMAT:
- \`summary\`: a plain-text one-line headline (≤80 chars), no HTML, no markdown.
- \`content\`: HTML — bullets in <ul> with <li> children (you may use a few <h3> group headers). Allowed tags: <ul>, <ol>, <li>, <p>, <strong>, <em>, <code>, <h3>, <br>. Forbidden: <script>, <style>, <iframe>, <img>, inline event handlers (onclick, onload, …), javascript: URLs, markdown syntax (no \`*\`, \`#\`, or backticks), \`\`\`action\`\`\` blocks, and JSON/code blocks. This is a read-only briefing — do NOT emit actions or commands.

LIVE STORE DATA:
${JSON.stringify(context, null, 2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { context, lang, dateStr } = body as {
      context?: Record<string, unknown>;
      lang?: string;
      dateStr?: string;
    };

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not configured" },
        { status: 500 },
      );
    }

    const today = dateStr || new Date().toISOString().slice(0, 10);
    const modelName = getModel();
    const system = buildSystemPrompt(context ?? {}, lang ?? "en", today);
    const userMessage = "Generate today's briefing.";
    const openrouter = getOpenRouter();

    let briefing: Briefing | null = null;

    // 1) Preferred path — generateObject with JSON mode. Works for any model
    //    that respects the JSON schema we hand it.
    try {
      const { object } = await generateObject({
        model: openrouter.chat(modelName),
        schema: briefingSchema,
        system,
        messages: [{ role: "user", content: userMessage }],
        maxOutputTokens: 2500,
        temperature: 0.4,
        providerOptions: {
          openai: { reasoningEffort: "minimal", reasoning_effort: "minimal" },
          openrouter: { reasoning: { effort: "minimal", exclude: true } },
        },
      });
      briefing = object;
    } catch (err) {
      // 2) Recover from the most common failure: the model returned JSON but
      //    wrapped it in code fences or prose, so the strict parser threw
      //    NoObjectGeneratedError. We pull the first balanced `{…}` from the
      //    raw text and validate against the schema.
      if (NoObjectGeneratedError.isInstance(err)) {
        const raw = (err as { text?: string }).text ?? "";
        console.warn(
          "[insights/morning-briefing] generateObject failed — attempting JSON recovery from raw text (",
          raw.length,
          "chars)",
        );
        briefing = recoverBriefingFromText(raw);
      } else {
        throw err;
      }
    }

    // 3) Last-resort fallback — ask the model again with plain text mode and
    //    instruct it to emit JSON. Works for very small / OSS models that
    //    don't honor structured-output APIs at all.
    if (!briefing) {
      console.warn(
        "[insights/morning-briefing] JSON recovery failed — falling back to generateText",
      );
      try {
        const { text } = await generateText({
          model: openrouter.chat(modelName),
          system: `${system}

OUTPUT FORMAT (CRITICAL): respond with ONLY a valid JSON object matching this shape, nothing else — no preamble, no code fences, no markdown:
{"summary":"…","content":"<ul><li>…</li></ul>"}`,
          messages: [{ role: "user", content: userMessage }],
          maxOutputTokens: 2500,
          temperature: 0.4,
        });
        briefing = recoverBriefingFromText(text);
      } catch (err) {
        console.error(
          "[insights/morning-briefing] generateText fallback also failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    if (!briefing) {
      return NextResponse.json(
        {
          error:
            "Model returned no parseable JSON. Try a different OPENROUTER_FAST_MODEL (e.g. openai/gpt-4o-mini or anthropic/claude-haiku-4.5).",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...briefing,
      date: today,
      generatedBy: modelName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    // Log full stack so the offending model / schema problem is visible in
    // dev terminal — generateObject typically throws a wrapped LLM error here
    // when the configured OPENROUTER_FAST_MODEL doesn't support structured
    // outputs (xiaomi/mimo-v2.5-pro doesn't, for example).
    console.error("[insights/morning-briefing] failed:", msg);
    if (stack) console.error("[insights/morning-briefing] stack:", stack);
    return NextResponse.json({ error: msg, stack: stack?.slice(0, 1000) }, { status: 500 });
  }
}
