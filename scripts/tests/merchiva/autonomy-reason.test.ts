import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideAutonomy,
  gateAction,
  type ActionRiskMeta,
  type AutonomyConfig,
} from "@/lib/merchiva/autonomy";
import { gateReasonLabel, gateReasonText, type GateReason } from "@/lib/merchiva/autonomy-reason";

// The autonomy gate's reason is shown under an approval card, so it must reach
// the card as a code the card translates, never as a finished English sentence.

const LOCALES = ["en", "ar", "es", "fr", "hi", "zh-cn", "zh-hk", "zh-tw"] as const;
const ROOT = join(import.meta.dir, "../../..");

type Json = { [key: string]: Json | string };

function loadLocale(locale: string): Json {
  return JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as Json;
}

/** A t() that throws on a key the locale lacks, instead of falling back to English. */
function strictT(locale: string, used?: Set<string>): (key: string) => string {
  const dict = loadLocale(locale);
  return (key) => {
    used?.add(key);
    let cur: Json | string | undefined = dict;
    for (const part of key.split(".")) cur = typeof cur === "object" ? cur[part] : undefined;
    if (typeof cur !== "string") throw new Error(`${locale}.json has no ${key}`);
    return cur;
  };
}

const money = (amount: number) => `$${amount.toFixed(2)}`;

/** One reason per code (and per mode label). */
const SAMPLES: GateReason[] = [
  { code: "missingPermission", section: "inventory", action: "edit" },
  { code: "autonomyDisabled" },
  { code: "riskNeedsApproval", risk: "medium", mode: "auto_low" },
  { code: "riskNeedsApproval", risk: "high", mode: "propose_only" },
  { code: "dailyLimit", limit: 30 },
  { code: "orderInvalidLines", count: 1 },
  { code: "orderUnpriced", count: 2 },
  { code: "orderOverCap", total: 360, limit: 200 },
  { code: "refundOverCap", amount: 45, limit: 0 },
  { code: "refundOverCap", amount: null, limit: 0 },
  { code: "priceChangeOverCap", pct: 20, limit: 10 },
  { code: "auto", mode: "full" },
  { code: "unknownAction" },
];

const canAll = () => true;
const FULL: AutonomyConfig = {
  enabled: true,
  mode: "full",
  perCategory: {},
  caps: { maxAutoOrderValue: 200, maxAutoRefund: 0, maxPriceChangePct: 10, dailyActionLimit: 30 },
};
const ORDER: ActionRiskMeta = {
  name: "orderFromSupplier",
  category: "suppliers",
  riskLevel: "high",
  requiredPermission: { section: "inventory", action: "edit" },
};

describe("the gate returns a code, with the English text kept for logs", () => {
  const cases: Array<[string, ReturnType<typeof decideAutonomy>, GateReason, string]> = [
    [
      "no permission",
      decideAutonomy(ORDER, {}, FULL, (section) => section !== "inventory"),
      { code: "missingPermission", section: "inventory", action: "edit" },
      "missing permission: inventory.edit",
    ],
    [
      "autonomy off",
      decideAutonomy(ORDER, {}, { ...FULL, enabled: false }, canAll),
      { code: "autonomyDisabled" },
      "autonomy disabled",
    ],
    [
      "risk above the mode",
      decideAutonomy({ ...ORDER, riskLevel: "medium" }, {}, { ...FULL, mode: "auto_low" }, canAll),
      { code: "riskNeedsApproval", risk: "medium", mode: "auto_low" },
      'medium-risk needs approval under "auto_low"',
    ],
    [
      "daily limit",
      decideAutonomy(ORDER, {}, FULL, canAll, { autoActionsToday: 30 }),
      { code: "dailyLimit", limit: 30 },
      "daily auto-action limit (30) reached",
    ],
    [
      "negative line",
      decideAutonomy(ORDER, { items: [{ quantity: -1, unitCost: 2 }] }, FULL, canAll),
      { code: "orderInvalidLines", count: 1 },
      "order has 1 line(s) with a negative quantity or cost",
    ],
    [
      "unpriced line",
      decideAutonomy(ORDER, { items: [{ quantity: 5 }] }, FULL, canAll),
      { code: "orderUnpriced", count: 1 },
      "order value unknown: 1 item(s) without a unit cost",
    ],
    [
      "order over the cap",
      decideAutonomy(ORDER, { items: [{ quantity: 30, unitCost: 12 }] }, FULL, canAll),
      { code: "orderOverCap", total: 360, limit: 200 },
      "order total 360 exceeds auto limit 200",
    ],
    [
      "partial refund over the cap",
      decideAutonomy({ ...ORDER, name: "refundPayment", category: "finance" }, { amount: 45 }, FULL, canAll),
      { code: "refundOverCap", amount: 45, limit: 0 },
      "refund 45 exceeds auto limit 0",
    ],
    [
      "full refund over the cap",
      decideAutonomy({ ...ORDER, name: "refundPayment", category: "finance" }, {}, FULL, canAll),
      { code: "refundOverCap", amount: null, limit: 0 },
      "refund full exceeds auto limit 0",
    ],
    [
      "price change over the cap",
      decideAutonomy({ ...ORDER, name: "updatePrice", category: "products" }, { newPrice: 12.05, oldPrice: 10 }, FULL, canAll),
      { code: "priceChangeOverCap", pct: 21, limit: 10 },
      "price change 21% exceeds auto limit 10%",
    ],
    [
      "auto",
      decideAutonomy(ORDER, { items: [{ quantity: 1, unitCost: 2 }] }, FULL, canAll),
      { code: "auto", mode: "full" },
      "auto (full)",
    ],
    [
      "unknown action",
      gateAction("noSuchAction", {}, FULL, canAll),
      { code: "unknownAction" },
      "unknown action",
    ],
  ];

  for (const [name, gate, why, reason] of cases) {
    test(name, () => {
      expect(gate.why).toEqual(why);
      expect(gate.reason).toBe(reason);
      expect(gateReasonText(gate.why)).toBe(reason);
    });
  }
});

describe("gateReasonLabel", () => {
  for (const locale of LOCALES) {
    test(`${locale}: every reason renders from ${locale}.json, with no key path or placeholder left`, () => {
      const t = strictT(locale);
      for (const why of SAMPLES) {
        const label = gateReasonLabel(why, t, money);
        expect(label).not.toBeNull();
        expect(`${why.code}: ${label}`).not.toMatch(/\{\w+\}|merchiva\./);
      }
    });
  }

  test("every merchiva.autonomyReason key is one a reason uses", () => {
    const used = new Set<string>();
    const t = strictT("en", used);
    for (const why of SAMPLES) gateReasonLabel(why, t, money);
    const owned: string[] = [];
    const walk = (node: Json | string, path: string) => {
      if (typeof node === "string") owned.push(path);
      else for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    walk((loadLocale("en").merchiva as Json).autonomyReason, "merchiva.autonomyReason");
    expect(owned.filter((k) => !used.has(k))).toEqual([]);
  });

  test("full autonomy + an item without a unit cost: the card reads Chinese in a Chinese UI", () => {
    const params: Record<string, unknown> = { supplierId: "s1", items: [{ name: "Beans", quantity: 5 }] };
    const gate = gateAction("orderFromSupplier", params, FULL, canAll);
    expect(gate.decision).toBe("propose");
    expect(gateReasonLabel(gate.why, strictT("zh-cn"), money)).toBe("订单金额未知：有 1 个商品没有单价。");
    expect(gateReasonLabel(gate.why, strictT("en"), money)).toBe(
      "The order value is unknown. Items without a unit cost: 1.",
    );
  });

  test("risk and mode are translated too, the mode under its Settings name", () => {
    const why: GateReason = { code: "riskNeedsApproval", risk: "medium", mode: "auto_low_medium" };
    expect(gateReasonLabel(why, strictT("zh-cn"), money)).toBe("中风险操作在“部分自动”模式下需要你确认。");
    expect(gateReasonLabel(why, strictT("en"), money)).toBe("Risk: Medium. In “Partially automatic” mode this needs your OK.");
  });

  test("amounts go through the org's currency formatter", () => {
    const label = gateReasonLabel({ code: "orderOverCap", total: 360, limit: 200 }, strictT("en"), (n) => `€${n}`);
    expect(label).toBe("The order total, €360, is over the auto-order limit of €200.");
  });

  test("a code this build does not know renders as null, so the card falls back to the stored text", () => {
    const future = { code: "somethingNew" } as unknown as GateReason;
    expect(gateReasonLabel(future, strictT("en"), money)).toBeNull();
  });
});
