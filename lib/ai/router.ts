/**
 * The complexity router: eleven yes/no signals about a request → a 0–100 score → a model tier.
 *
 * The signals come from the L1 triage call (lib/ai/triage.ts), which only describes the request;
 * the weights, the score and the tier live here, in pure code, so they can be tested and so the
 * triage model has nothing to game.
 *
 *   score = min(100, 5 + Σ weight of every signal that is true)
 *   0–30 → L1 · 31–70 → L2 · 71–100 → L3 · voice never goes above L2 (latency)
 */

import type { AiTier } from "@/lib/ai/models";

export const COMPLEXITY_SIGNALS = [
  "needsLiveData",
  "write",
  "summarize",
  "crossModule",
  "longText",
  "math",
  "multiStep",
  "anomaly",
  "strategy",
  "forecast",
  "finance",
] as const;

export type ComplexitySignal = (typeof COMPLEXITY_SIGNALS)[number];
export type ComplexitySignals = Record<ComplexitySignal, boolean>;

export const SIGNAL_WEIGHTS: Readonly<Record<ComplexitySignal, number>> = {
  needsLiveData: 15,
  write: 10,
  summarize: 20,
  crossModule: 20,
  longText: 15,
  math: 15,
  multiStep: 20,
  anomaly: 30,
  strategy: 30,
  forecast: 40,
  finance: 35,
};

/** Every request starts here, so an empty signal set still scores above zero. */
export const BASE_SCORE = 5;
export const MAX_SCORE = 100;
/** Highest score that stays on L1. */
export const L1_MAX_SCORE = 30;
/** Highest score that stays on L2. */
export const L2_MAX_SCORE = 70;
/** Voice replies are spoken as they arrive; L3 is too slow for a call. */
export const VOICE_MAX_TIER: AiTier = 2;

export type AiMode = "chat" | "voice";

export interface RouteDecision {
  score: number;
  tier: AiTier;
  /** The signals that were true, in rubric order (for logs). */
  signals: ComplexitySignal[];
  /** True when voice mode lowered the tier the score asked for. */
  capped: boolean;
}

/** All-false signals. */
export function emptySignals(): ComplexitySignals {
  return Object.fromEntries(COMPLEXITY_SIGNALS.map((s) => [s, false])) as ComplexitySignals;
}

/** The signals that are true, in rubric order. Missing keys count as false. */
export function activeSignals(signals: Partial<ComplexitySignals>): ComplexitySignal[] {
  return COMPLEXITY_SIGNALS.filter((s) => signals[s] === true);
}

export function scoreComplexity(signals: Partial<ComplexitySignals>): number {
  const sum = activeSignals(signals).reduce((total, s) => total + SIGNAL_WEIGHTS[s], BASE_SCORE);
  return Math.min(MAX_SCORE, sum);
}

export function tierForScore(score: number): AiTier {
  if (!Number.isFinite(score) || score <= L1_MAX_SCORE) return 1;
  if (score <= L2_MAX_SCORE) return 2;
  return 3;
}

export function routeRequest(
  signals: Partial<ComplexitySignals>,
  { mode }: { mode: AiMode },
): RouteDecision {
  const score = scoreComplexity(signals);
  const wanted = tierForScore(score);
  const tier = mode === "voice" && wanted > VOICE_MAX_TIER ? VOICE_MAX_TIER : wanted;
  return { score, tier, signals: activeSignals(signals), capped: tier !== wanted };
}

/**
 * The tier for a reply that has no signals to route on: the triage call failed, or the caller
 * skipped triage (the non-streaming fallback, which is about latency). Chat takes the middle tier
 * so an unknown request is neither starved nor overspent; voice takes L1 because a call cannot
 * wait.
 */
export function fallbackTier(mode: AiMode): AiTier {
  return mode === "voice" ? 1 : 2;
}
