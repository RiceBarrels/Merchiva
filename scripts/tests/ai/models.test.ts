import { describe, expect, test } from "bun:test";
import { DEFAULT_TIER_MODELS, TIER_MODEL_ENV, tierLabel, tierModelId } from "@/lib/ai/models";

describe("tier models", () => {
  test("defaults to the approved OpenRouter models", () => {
    expect(tierModelId(1, {})).toBe("openai/gpt-6-luna-pro");
    expect(tierModelId(2, {})).toBe("deepseek/deepseek-v4.1-flash");
    expect(tierModelId(3, {})).toBe("openai/gpt-6.1-sol");
    expect(DEFAULT_TIER_MODELS[3]).toBe("openai/gpt-6.1-sol");
  });

  test("MERCHIVA_AI_L{n}_MODEL overrides one tier", () => {
    const env = { MERCHIVA_AI_L2_MODEL: "  vendor/other-model  " };
    expect(tierModelId(2, env)).toBe("vendor/other-model");
    expect(tierModelId(1, env)).toBe("openai/gpt-6-luna-pro");
    expect(TIER_MODEL_ENV).toEqual({
      1: "MERCHIVA_AI_L1_MODEL",
      2: "MERCHIVA_AI_L2_MODEL",
      3: "MERCHIVA_AI_L3_MODEL",
    });
  });

  test("an empty override falls back to the default", () => {
    expect(tierModelId(3, { MERCHIVA_AI_L3_MODEL: "   " })).toBe("openai/gpt-6.1-sol");
  });

  test("the legacy OPENROUTER_* variables do not move any tier", () => {
    const env = {
      OPENROUTER_MODEL: "xiaomi/mimo-v2.5-pro",
      OPENROUTER_FAST_MODEL: "x/fast",
      OPENROUTER_THINKING_MODEL: "x-ai/grok-4.3",
      OPENROUTER_VOICE_MODEL: "x/voice",
    };
    expect([tierModelId(1, env), tierModelId(2, env), tierModelId(3, env)]).toEqual([
      "openai/gpt-6-luna-pro",
      "deepseek/deepseek-v4.1-flash",
      "openai/gpt-6.1-sol",
    ]);
  });

  test("labels", () => {
    expect(tierLabel(1)).toBe("L1");
    expect(tierLabel(3)).toBe("L3");
  });
});
