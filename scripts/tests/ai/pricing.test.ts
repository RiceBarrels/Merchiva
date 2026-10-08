import { describe, expect, test } from "bun:test";
import { AI_PRICING, computeAiCost, pricingFor } from "@/lib/ai/pricing";

describe("per-model pricing", () => {
  test("each tier model has its OpenRouter list price", () => {
    expect(pricingFor("openai/gpt-oss-120b")).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.6 });
    expect(pricingFor("openai/gpt-6-luna")).toEqual({ inputPerMillion: 0.1, outputPerMillion: 0.5 });
    expect(pricingFor("deepseek/deepseek-v4.1-flash")).toEqual({ inputPerMillion: 0.035, outputPerMillion: 0.29 });
  });

  test("lookup ignores case and surrounding space", () => {
    expect(pricingFor("  OpenAI/GPT-OSS-120B ")).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.6 });
  });

  test("unknown or missing models keep the flat 2 / 10", () => {
    expect(AI_PRICING).toEqual({ inputPerMillion: 2, outputPerMillion: 10 });
    expect(pricingFor("xiaomi/mimo-v2.5-pro")).toBe(AI_PRICING);
    expect(pricingFor(undefined)).toBe(AI_PRICING);
  });

  test("computeAiCost prices by model", () => {
    const l1 = computeAiCost(1_000_000, 1_000_000, "openai/gpt-oss-120b");
    expect(l1.inputCost).toBeCloseTo(0.15, 10);
    expect(l1.outputCost).toBeCloseTo(0.6, 10);
    expect(l1.cost).toBeCloseTo(0.75, 10);

    const l3 = computeAiCost(2_000_000, 500_000, "deepseek/deepseek-v4.1-flash");
    expect(l3.cost).toBeCloseTo(0.07 + 0.145, 10);
  });

  test("without a model it uses the fallback, and bad counts clamp to zero", () => {
    expect(computeAiCost(1_000_000, 100_000).cost).toBeCloseTo(3, 10);
    expect(computeAiCost(-5, Number.NaN, "openai/gpt-6-luna")).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      inputCost: 0,
      outputCost: 0,
      cost: 0,
    });
  });
});
