import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
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
    .describe("One-line headline (max 80 chars). Plain text, no markdown."),
  content: z
    .string()
    .describe(
      "Markdown body — 3 to 7 bullet items, each one concrete observation or recommendation grounded in the LIVE DATA. Group related items under short bold headers if useful. NO action blocks, NO JSON. End with the most urgent item, if any.",
    ),
});

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
FORMAT: \`summary\` is a one-line headline; \`content\` is markdown bullets. NO action JSON blocks, NO code blocks.

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

    const { object } = await generateObject({
      model: getOpenRouter().chat(modelName),
      schema: briefingSchema,
      system,
      messages: [{ role: "user", content: "Generate today's briefing." }],
      maxOutputTokens: 1200,
      temperature: 0.4,
      providerOptions: {
        openai: { reasoningEffort: "minimal", reasoning_effort: "minimal" },
        openrouter: { reasoning: { effort: "minimal", exclude: true } },
      },
    });

    return NextResponse.json({
      ...object,
      date: today,
      generatedBy: modelName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[insights/morning-briefing] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
