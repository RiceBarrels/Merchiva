import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";

export const runtime = "nodejs";

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva schedule proposal",
    },
  });
}

function getModel() {
  // Thinking model: scheduling is a multi-constraint problem that benefits.
  return process.env.OPENROUTER_MODEL || "x-ai/grok-4.3";
}

const shiftSchema = z.object({
  date: z.string().describe("YYYY-MM-DD"),
  staffName: z
    .string()
    .describe(
      "MUST exactly match a name from the `team` array in LIVE DATA. Never invent names.",
    ),
  staffRoles: z
    .array(z.string())
    .describe("Role names from the staff member's roles, e.g. ['Barista']."),
  startTime: z.string().describe("HH:MM 24h"),
  endTime: z.string().describe("HH:MM 24h"),
  shiftType: z
    .enum(["morning", "afternoon", "evening", "overnight"])
    .describe("Bucket for this shift."),
});

const proposalSchema = z.object({
  weekStart: z.string().describe("YYYY-MM-DD of the proposed week's first day."),
  weekEnd: z.string().describe("YYYY-MM-DD of the proposed week's last day."),
  rationale: z
    .string()
    .describe(
      "2-4 sentences explaining the patterns you learned from history and how the proposal fits.",
    ),
  shifts: z.array(shiftSchema).describe("Proposed shifts for the 7-day window."),
});

function buildSystemPrompt(
  context: Record<string, unknown>,
  lang: string,
  weekStart: string,
  weekEnd: string,
): string {
  const languageName = lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";

  return `You are Mr. Merchiva drafting a 7-day shift schedule for the OWNER, covering ${weekStart} → ${weekEnd}.

Learn patterns from the LIVE DATA:
- \`recentShifts\` (last ~4 weeks): who works which weekdays, typical start/end times, shift types
- \`shiftPresets\`: the owner's preferred shift definitions — match these where possible
- \`team\`: roster (name, roles, availability). DO NOT invent names; staffName MUST match exactly
- \`availability\`: per-member day/time constraints — never schedule someone outside these
- \`timeOffRequests\` (approved): skip those people on those days
- \`storeHours\` (if present): align shifts to open/close
- \`shiftTrades\`: pending trades — defer to historical assignee until resolved

Strategy:
1. For each weekday, identify who historically works that day at what time. Copy that pattern forward.
2. If no clear pattern exists for a day, use the most frequent shift preset and an active team member with availability.
3. Avoid double-booking (same person, overlapping times on same date).
4. Keep total person-shifts roughly equal to the historical weekly count — don't dramatically over- or under-staff.
5. If the team has only 1-2 people, schedule everyone every operating day; don't try to spread thin.

Rationale: Write 2-4 sentences in ${languageName} summarizing what pattern you saw and how the proposal reflects it.

Output ONLY the structured schema. No markdown, no commentary outside the schema fields.

LIVE DATA:
${JSON.stringify(context, null, 2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { context, lang, weekStart, weekEnd, organizationId } = body as {
      context?: Record<string, unknown>;
      lang?: string;
      weekStart?: string;
      weekEnd?: string;
      organizationId?: string;
    };
    const usageOrgId =
      organizationId ||
      (typeof context?.organizationId === "string" ? (context.organizationId as string) : "") ||
      "";

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY not configured" },
        { status: 500 },
      );
    }

    if (!weekStart || !weekEnd) {
      return NextResponse.json({ error: "weekStart and weekEnd required" }, { status: 400 });
    }

    const modelName = getModel();
    const system = buildSystemPrompt(context ?? {}, lang ?? "en", weekStart, weekEnd);

    const proposalResult = await generateObject({
      model: getOpenRouter().chat(modelName),
      schema: proposalSchema,
      system,
      messages: [{ role: "user", content: "Draft the 7-day schedule." }],
      maxOutputTokens: 3000,
      temperature: 0.3,
    });
    const { object } = proposalResult;
    await recordAiUsage({
      organizationId: usageOrgId,
      feature: "schedule_proposal",
      model: modelName,
      ...normalizeUsage(proposalResult.usage),
    });

    // Normalize and clamp to the requested window in case the model drifts.
    // Also drop shifts whose staffName doesn't match a real team row — the
    // schema describe() text begs the model not to invent names, but at temp>0
    // it still happens, and bad names slip past addShift (no server-side
    // validation) and become "ghost" shifts that count in totals but don't
    // render in the grid.
    const team = (context?.team ?? []) as Array<{ name?: string }>;
    const validNames = new Set(
      team
        .map((m) => (typeof m?.name === "string" ? m.name.trim() : ""))
        .filter((n) => n.length > 0),
    );
    const validNamesLower = new Set(Array.from(validNames).map((n) => n.toLowerCase()));
    const droppedNames = new Set<string>();
    const filteredShifts = object.shifts.filter((s) => {
      if (s.date < weekStart || s.date > weekEnd) return false;
      const name = (s.staffName ?? "").trim();
      const ok = validNames.has(name) || validNamesLower.has(name.toLowerCase());
      if (!ok) droppedNames.add(name || "(empty)");
      return ok;
    });

    if (droppedNames.size > 0) {
      console.warn(
        "[insights/schedule-proposal] dropped shifts for unknown names:",
        Array.from(droppedNames),
      );
    }

    const clamped = {
      ...object,
      weekStart,
      weekEnd,
      shifts: filteredShifts,
    };

    return NextResponse.json({
      ...clamped,
      generatedBy: modelName,
      droppedNames: Array.from(droppedNames),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[insights/schedule-proposal] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
