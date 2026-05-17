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

const briefingSchema = z.object({
  summary: z
    .string()
    .describe("One-line headline (max 80 chars). Plain text, no HTML, no markdown."),
  content: z
    .string()
    .describe(
      "HTML body — 3 to 7 bullet items as a single <ul> with <li> children, each one concrete observation or recommendation grounded in the LIVE DATA. You may use <strong>, <em>, <code>, and short <h3> headers to group related items. NO <script>, <style>, <iframe>, <img>, inline event handlers, or javascript: URLs. NO markdown, NO action blocks, NO JSON. End with the most urgent item, if any.",
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

  return `You are Mr. Merchiva generating the OWNER'S morning briefing for ${dateStr}.

Write a concise, actionable list of things the owner should pay attention to TODAY. Examples of useful signals (only include ones the data actually shows):
- Low / out-of-stock inventory items
- Pending shift trades or time-off requests
- Today's scheduled staff vs needed coverage
- Notable yesterday-vs-prior-week sales swings
- Unaddressed customer reviews
- Expiring promotions / coupons
- Overdue tasks
- Anomalies (unusually large transactions, sudden drops, etc.)

Style:
- Friendly but not chatty — owner wants signal fast
- Prefer concrete numbers from LIVE DATA over vague claims
- If everything looks normal, say so in one bullet; don't pad

LANGUAGE: ${languageName}.
FORMAT: \`summary\` is a plain-text one-line headline.
\`content\` is HTML — a single <ul> containing 3–7 <li> bullets. Allowed tags: <ul>, <ol>, <li>, <p>, <strong>, <em>, <code>, <h3>, <br>. Forbidden: <script>, <style>, <iframe>, <img>, inline event handlers (onclick, onload, …), javascript: URLs, markdown syntax (no \`*\`, \`#\`, or backticks), and JSON/code blocks.

LIVE DATA:
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
        maxOutputTokens: 1200,
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
          maxOutputTokens: 1200,
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
