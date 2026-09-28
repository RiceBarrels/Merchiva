/**
 * Mr. Merchiva's three model tiers and the one OpenRouter client every AI route shares.
 *
 *   L1  openai/gpt-oss-120b           triage, look-ups, simple writes, engine-backed work
 *   L2  openai/gpt-6-luna             summaries, explanations, "why did it drop"
 *   L3  deepseek/deepseek-v4.1-flash  finance, forecasts, strategy
 *
 * `lib/ai/router.ts` picks the tier; this module only turns a tier into a model. Each tier can be
 * pointed elsewhere with MERCHIVA_AI_L1_MODEL / _L2_ / _L3_. The older OPENROUTER_MODEL,
 * OPENROUTER_FAST_MODEL, OPENROUTER_THINKING_MODEL and OPENROUTER_VOICE_MODEL are deliberately not
 * read here: .env.local still sets OPENROUTER_MODEL for other experiments, and it must not move
 * the chat.
 *
 * Users see one assistant. The tier never reaches the UI; routes log it and record the real
 * model id in `ai_usage`.
 *
 * Server code only. It carries no `server-only` marker so the pure tier helpers can be unit-tested
 * under bun; the API key is read from the server environment at call time, never inlined.
 */

import { createOpenAI } from "@ai-sdk/openai";

export type AiTier = 1 | 2 | 3;

export const AI_TIERS: readonly AiTier[] = [1, 2, 3];

export const DEFAULT_TIER_MODELS: Readonly<Record<AiTier, string>> = {
  1: "openai/gpt-oss-120b",
  2: "openai/gpt-6-luna",
  3: "deepseek/deepseek-v4.1-flash",
};

export const TIER_MODEL_ENV: Readonly<Record<AiTier, string>> = {
  1: "MERCHIVA_AI_L1_MODEL",
  2: "MERCHIVA_AI_L2_MODEL",
  3: "MERCHIVA_AI_L3_MODEL",
};

/** The OpenRouter model id serving `tier`: its env override when set, else the default. */
export function tierModelId(
  tier: AiTier,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = env[TIER_MODEL_ENV[tier]]?.trim();
  return override || DEFAULT_TIER_MODELS[tier];
}

/** "L1" / "L2" / "L3", for logs. */
export function tierLabel(tier: AiTier): string {
  return `L${tier}`;
}

let cached: { key: string; client: ReturnType<typeof createOpenAI> } | null = null;

/** The shared OpenRouter client. Throws when OPENROUTER_API_KEY is not configured. */
export function openRouter(): ReturnType<typeof createOpenAI> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  if (cached?.key === key) return cached.client;
  const client = createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Mr. Merchiva",
    },
  });
  cached = { key, client };
  return client;
}

/** The chat model for `tier`, ready for generateText / streamText / generateObject. */
export function tierModel(tier: AiTier) {
  return openRouter().chat(tierModelId(tier));
}
