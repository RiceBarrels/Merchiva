import { describe, expect, test } from "bun:test";
import {
  COMPLEXITY_SIGNALS,
  SIGNAL_WEIGHTS,
  activeSignals,
  emptySignals,
  fallbackTier,
  routeRequest,
  scoreComplexity,
  tierForScore,
  type ComplexitySignal,
  type ComplexitySignals,
} from "@/lib/ai/router";

function signals(...on: ComplexitySignal[]): ComplexitySignals {
  const s = emptySignals();
  for (const name of on) s[name] = true;
  return s;
}

describe("complexity rubric", () => {
  test("weights match the rubric", () => {
    expect(SIGNAL_WEIGHTS).toEqual({
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
    });
    expect(COMPLEXITY_SIGNALS).toHaveLength(11);
  });

  test("score is 5 plus the weights of the true signals", () => {
    expect(scoreComplexity(emptySignals())).toBe(5);
    expect(scoreComplexity(signals("needsLiveData"))).toBe(20);
    expect(scoreComplexity(signals("anomaly", "finance"))).toBe(70);
  });

  test("score is capped at 100", () => {
    expect(scoreComplexity(signals(...COMPLEXITY_SIGNALS))).toBe(100);
  });

  test("missing keys count as false", () => {
    expect(scoreComplexity({ forecast: true })).toBe(45);
    expect(activeSignals({ forecast: true, math: false })).toEqual(["forecast"]);
  });

  test("tier boundaries: 0–30 L1, 31–70 L2, 71–100 L3", () => {
    expect(tierForScore(0)).toBe(1);
    expect(tierForScore(30)).toBe(1);
    expect(tierForScore(31)).toBe(2);
    expect(tierForScore(70)).toBe(2);
    expect(tierForScore(71)).toBe(3);
    expect(tierForScore(100)).toBe(3);
    expect(tierForScore(Number.NaN)).toBe(1);
  });
});

describe("contract examples", () => {
  const cases: Array<[string, ComplexitySignal[], 1 | 2 | 3]> = [
    ["Supplier A's phone?", ["needsLiveData"], 1],
    ["What time is my shift today?", ["needsLiveData"], 1],
    ["How were sales yesterday?", ["needsLiveData"], 1],
    ["Summarize this supplier", ["needsLiveData", "summarize"], 2],
    ["Why did it drop?", ["needsLiveData", "anomaly"], 2],
    // The scheduling engine does the multi-step work, so only look-up + write remain.
    ["Schedule next week (engine)", ["needsLiveData", "write"], 1],
    ["Generate a training quiz", ["summarize", "longText"], 2],
    ["Why has profit margin fallen for 3 months?", ["needsLiveData", "math", "anomaly", "finance"], 3],
    ["If this continues, cash flow in 3 months?", ["needsLiveData", "forecast", "finance"], 3],
    [
      "Allocate purchasing across suppliers for 6 months given price, lead time, stock risk and demand",
      ["needsLiveData", "crossModule", "math", "multiStep", "strategy", "forecast"],
      3,
    ],
  ];

  for (const [request, on, tier] of cases) {
    test(`${request} → L${tier}`, () => {
      expect(routeRequest(signals(...on), { mode: "chat" }).tier).toBe(tier);
    });
  }

  test("engine-handled scheduling would leave L1 if multiStep were (wrongly) set", () => {
    expect(routeRequest(signals("needsLiveData", "write", "multiStep"), { mode: "chat" }).tier).toBe(2);
  });

  test("a margin question without live data or math still stays below L3", () => {
    // Why the calibration sets needsLiveData on data questions: anomaly + finance alone is 70.
    expect(routeRequest(signals("anomaly", "finance"), { mode: "chat" }).tier).toBe(2);
  });
});

describe("routeRequest", () => {
  test("reports score, tier and the true signals in rubric order", () => {
    expect(routeRequest(signals("finance", "needsLiveData"), { mode: "chat" })).toEqual({
      score: 55,
      tier: 2,
      signals: ["needsLiveData", "finance"],
      capped: false,
    });
  });

  test("voice caps at L2", () => {
    const decision = routeRequest(signals("needsLiveData", "forecast", "finance"), { mode: "voice" });
    expect(decision.score).toBe(95);
    expect(decision.tier).toBe(2);
    expect(decision.capped).toBe(true);
  });

  test("voice leaves L1 and L2 alone", () => {
    expect(routeRequest(signals("needsLiveData"), { mode: "voice" })).toMatchObject({ tier: 1, capped: false });
    expect(routeRequest(signals("needsLiveData", "anomaly"), { mode: "voice" })).toMatchObject({ tier: 2, capped: false });
  });

  test("fallback tier: L2 for chat, L1 for voice", () => {
    expect(fallbackTier("chat")).toBe(2);
    expect(fallbackTier("voice")).toBe(1);
  });
});
