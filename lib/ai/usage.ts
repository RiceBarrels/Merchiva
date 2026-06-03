/**
 * AI usage tracking — pricing, cost math, and a best-effort recorder that
 * writes one `ai_usage` row per LLM call through the SpacetimeDB service
 * identity.
 *
 * Pricing (per 1,000,000 tokens):
 *   input:  $2
 *   output: $10
 *
 * Call `recordAiUsage(...)` from any server route AFTER an AI call completes.
 * It never throws — a tracking failure must not break the user-facing request.
 */

import "server-only";

import { getServiceConn, serviceRecordAiUsage } from "@/lib/spacetimedb/service-client";

/** USD per 1M tokens. */
export const AI_PRICING = {
  inputPerMillion: 2,
  outputPerMillion: 10,
} as const;

export interface AiCostBreakdown {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  cost: number;
}

/** Compute the per-call cost from token counts. */
export function computeAiCost(inputTokens: number, outputTokens: number): AiCostBreakdown {
  const i = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const o = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const inputCost = (i / 1_000_000) * AI_PRICING.inputPerMillion;
  const outputCost = (o / 1_000_000) * AI_PRICING.outputPerMillion;
  return {
    inputTokens: i,
    outputTokens: o,
    inputCost,
    outputCost,
    cost: inputCost + outputCost,
  };
}

/** UTC day (YYYY-MM-DD) and month (YYYY-MM) buckets for grouping. */
export function utcDayMonth(date: Date = new Date()): { day: string; month: string } {
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return { day, month: day.slice(0, 7) };
}

/**
 * Normalize the various token-usage shapes the `ai` SDK and raw OpenAI-style
 * responses expose into `{ inputTokens, outputTokens }`.
 *
 * - ai SDK v5+: `{ inputTokens, outputTokens }`
 * - ai SDK legacy: `{ promptTokens, completionTokens }`
 * - OpenAI / OpenRouter REST: `{ prompt_tokens, completion_tokens }`
 */
export function normalizeUsage(
  usage:
    | {
        inputTokens?: number | null;
        outputTokens?: number | null;
        promptTokens?: number | null;
        completionTokens?: number | null;
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
      }
    | null
    | undefined,
): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  const inputTokens =
    usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0;
  const outputTokens =
    usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens ?? 0;
  return {
    inputTokens: Number(inputTokens) || 0,
    outputTokens: Number(outputTokens) || 0,
  };
}

export interface RecordAiUsageArgs {
  /** Org the usage is attributed to. When empty/unknown the call is skipped. */
  organizationId: string | null | undefined;
  /** Hex identity (or any stable id) of the caller; "" when unknown. */
  userId?: string | null;
  /** Stable feature key, e.g. "mr_merchiva", "design_chat", "morning_briefing". */
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Short human-readable summary of what the call did — usually the user's
   * prompt, or a fixed label for non-prompt calls. Truncated to 100 chars.
   */
  description?: string | null;
  /** Defaults to now (UTC); pass to control the day/month bucket. */
  at?: Date;
}

/**
 * Build a clean ≤100-char preview from arbitrary prompt text: collapse
 * whitespace, trim, and add an ellipsis if truncated. Returns undefined for
 * empty input so the column stays null.
 */
export function previewText(input: string | null | undefined, max = 100): string | undefined {
  if (!input) return undefined;
  const clean = String(input).replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/**
 * Record one AI call's usage. Best-effort: logs and swallows any error so the
 * caller's response is never affected. No-ops when there's no org to attribute
 * to or when both token counts are zero.
 */
export async function recordAiUsage(args: RecordAiUsageArgs): Promise<void> {
  try {
    const organizationId = (args.organizationId ?? "").trim();
    if (!organizationId) return;

    const { inputTokens, outputTokens, inputCost, outputCost, cost } = computeAiCost(
      args.inputTokens,
      args.outputTokens,
    );
    if (inputTokens === 0 && outputTokens === 0) return;

    const { day, month } = utcDayMonth(args.at ?? new Date());

    const conn = await getServiceConn();
    await serviceRecordAiUsage(conn, {
      organizationId,
      userId: (args.userId ?? "").trim(),
      feature: args.feature,
      model: args.model || "unknown",
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      cost,
      day,
      month,
      description: previewText(args.description),
    });
  } catch (err) {
    console.warn("[recordAiUsage] failed (non-fatal):", err);
  }
}
