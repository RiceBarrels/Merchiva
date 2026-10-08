/**
 * What an AI call costs, per model. USD per 1,000,000 tokens, OpenRouter list prices.
 *
 * Pure and dependency-free so the cost math can be tested; lib/ai/usage.ts re-exports it and
 * records the result.
 */

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
}

/**
 * Fallback for any model not listed in AI_MODEL_PRICING. Deliberately high, so an unpriced model
 * over-reports rather than disappears from the bill.
 */
export const AI_PRICING: ModelPricing = {
  inputPerMillion: 2,
  outputPerMillion: 10,
};

/** Keyed by OpenRouter model id, lowercase. */
export const AI_MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  "openai/gpt-oss-120b": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai/gpt-6-luna": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  "deepseek/deepseek-v4.1-flash": { inputPerMillion: 0.035, outputPerMillion: 0.29 },
  "openai/gpt-6-luna-pro": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  "openai/gpt-6.1-sol": { inputPerMillion: 2, outputPerMillion: 10 },
};

/** The price list for `model`, or the flat fallback when it is unknown. */
export function pricingFor(model: string | null | undefined): ModelPricing {
  const key = (model ?? "").trim().toLowerCase();
  return AI_MODEL_PRICING[key] ?? AI_PRICING;
}

export interface AiCostBreakdown {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  cost: number;
}

/** Compute the per-call cost from token counts, at `model`'s price (fallback when omitted). */
export function computeAiCost(
  inputTokens: number,
  outputTokens: number,
  model?: string | null,
): AiCostBreakdown {
  const i = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const o = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  const price = pricingFor(model);
  const inputCost = (i / 1_000_000) * price.inputPerMillion;
  const outputCost = (o / 1_000_000) * price.outputPerMillion;
  return {
    inputTokens: i,
    outputTokens: o,
    inputCost,
    outputCost,
    cost: inputCost + outputCost,
  };
}
