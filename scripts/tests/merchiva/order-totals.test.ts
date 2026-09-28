import { describe, expect, test } from "bun:test";
import { applyOrderTotals, computeOrderTotals, computeOrderTotalsStrict, orderAmounts } from "@/lib/merchiva/order-totals";
import {
  decideAutonomy,
  gateAction,
  type ActionRiskMeta,
  type AutonomyConfig,
} from "@/lib/merchiva/autonomy";
import { getAction, getActionCatalog } from "@/lib/merchiva/action-registry";

describe("computeOrderTotals", () => {
  test("sums unitCost × quantity in exact cents", () => {
    const totals = computeOrderTotals([
      { name: "A", quantity: 3, unitCost: 0.1 },
      { name: "B", quantity: 1, unitCost: 0.2 },
      { name: "C", qty: 2, cost: "1.005" },
    ]);
    // 0.30 + 0.20 + 2 × 1.005 = 2.01 (each line rounded once, of its own value)
    expect(totals.subtotalCents).toBe(30 + 20 + 201);
    expect(totals.totalCents).toBe(totals.subtotalCents);
    expect(orderAmounts(totals)).toEqual({ subtotal: 2.51, tax: 0, total: 2.51 });
  });

  test("0.1 + 0.2 stays 0.30, not 0.30000000000000004", () => {
    const { subtotal } = orderAmounts(computeOrderTotals([{ quantity: 1, unitCost: 0.1 }, { quantity: 1, unitCost: 0.2 }]));
    expect(subtotal).toBe(0.3);
  });

  test("fractional quantities and sub-cent unit costs are rounded once per line", () => {
    expect(computeOrderTotals([{ quantity: 2.5, unitCost: 3.99 }]).subtotalCents).toBe(998);
    expect(computeOrderTotals([{ quantity: 1000, unitCost: 0.125 }]).subtotalCents).toBe(12500);
  });

  test("tax adds on top; a negative or unreadable tax counts as none", () => {
    expect(computeOrderTotals([{ quantity: 2, unitCost: 5 }], 0.875).totalCents).toBe(1088);
    expect(computeOrderTotals([{ quantity: 2, unitCost: 5 }], -500).totalCents).toBe(1000);
    expect(computeOrderTotals([{ quantity: 2, unitCost: 5 }], "abc").totalCents).toBe(1000);
  });

  test("a line without a unit cost is unpriced, not free", () => {
    const totals = computeOrderTotals([{ quantity: 4, unitCost: 2 }, { quantity: 10 }, { quantity: 1, unitCost: "n/a" }]);
    expect(totals.subtotalCents).toBe(800);
    expect(totals.unpricedLines).toBe(2);
  });

  test("negative quantities or costs are invalid and never reduce the sum", () => {
    const totals = computeOrderTotals([{ quantity: 10, unitCost: 5 }, { quantity: -100, unitCost: 5 }, { quantity: 1, unitCost: -40 }]);
    expect(totals.subtotalCents).toBe(5000);
    expect(totals.invalidLines).toBe(2);
  });

  test("no items, or not an array → zero", () => {
    expect(computeOrderTotals(undefined).totalCents).toBe(0);
    expect(computeOrderTotals("3 boxes").totalCents).toBe(0);
  });
});

describe("computeOrderTotalsStrict (what a recorded PO is priced with)", () => {
  test("a negative line stops the order instead of being left out", () => {
    expect(() => computeOrderTotalsStrict([{ quantity: 10, unitCost: 5 }, { quantity: -90, unitCost: 5 }])).toThrow(
      "Order quantities and unit costs cannot be negative.",
    );
    expect(() => computeOrderTotalsStrict([{ quantity: 1, unitCost: -40 }])).toThrow();
  });

  test("otherwise the same totals as computeOrderTotals, unpriced lines included", () => {
    const items = [{ quantity: 48, unitCost: 1.25 }, { quantity: 3 }];
    expect(computeOrderTotalsStrict(items, 2)).toEqual(computeOrderTotals(items, 2));
  });
});

describe("applyOrderTotals", () => {
  test("replaces the model's subtotal and total with the computed ones", () => {
    const params: Record<string, unknown> = {
      items: [{ name: "Milk", quantity: 48, unitCost: 1.25 }],
      subtotal: 5,
      tax: 2,
      total: 7,
    };
    applyOrderTotals(params);
    expect(params).toMatchObject({ subtotal: 60, tax: 2, total: 62 });
  });

  test("with no priced line there is no amount to show", () => {
    const params: Record<string, unknown> = { items: [{ name: "Milk", quantity: 48 }], subtotal: 1, total: 1 };
    applyOrderTotals(params);
    expect(params).not.toHaveProperty("subtotal");
    expect(params).not.toHaveProperty("total");
  });
});

// Full autonomy with a 200 cap, so only the cap can hold an order back.
const FULL: AutonomyConfig = {
  enabled: true,
  mode: "full",
  perCategory: {},
  caps: { maxAutoOrderValue: 200, dailyActionLimit: null },
};
const ORDER: ActionRiskMeta = {
  name: "orderFromSupplier",
  category: "suppliers",
  riskLevel: "high",
  requiredPermission: { section: "inventory", action: "edit" },
};
const canAll = () => true;

describe("autonomy cap on order value", () => {
  test("an understated model total does not slip past the cap", () => {
    const params = { items: [{ name: "Beans", quantity: 30, unitCost: 12 }], subtotal: 10, total: 10 };
    const gate = decideAutonomy(ORDER, params, FULL, canAll);
    expect(gate.decision).toBe("propose");
    expect(gate.reason).toContain("order total 360 exceeds auto limit 200");
  });

  test("an overstated model total does not block a small order", () => {
    const params = { items: [{ name: "Cups", quantity: 30, unitCost: 0.2 }], total: 9999 };
    expect(decideAutonomy(ORDER, params, FULL, canAll).decision).toBe("auto");
  });

  test("tax counts toward the cap", () => {
    const params = { items: [{ name: "Beans", quantity: 10, unitCost: 19.5 }], tax: 10 };
    expect(decideAutonomy(ORDER, params, FULL, canAll).decision).toBe("propose");
  });

  test("an unpriced line makes the value unknown → propose", () => {
    const params = { items: [{ name: "Beans", quantity: 1000 }] };
    const gate = decideAutonomy(ORDER, params, FULL, canAll);
    expect(gate.decision).toBe("propose");
    expect(gate.reason).toContain("order value unknown");
  });

  test("a negative line → propose", () => {
    const params = { items: [{ name: "Beans", quantity: 100, unitCost: 5 }, { name: "Refund", quantity: -90, unitCost: 5 }] };
    expect(decideAutonomy(ORDER, params, FULL, canAll).decision).toBe("propose");
  });

  test("createPurchaseOrder is capped the same way", () => {
    const meta: ActionRiskMeta = { ...ORDER, name: "createPurchaseOrder", riskLevel: "medium" };
    const params = { items: [{ name: "Beans", quantity: 30, unitCost: 12 }], total: 1 };
    expect(decideAutonomy(meta, params, FULL, canAll).decision).toBe("propose");
  });

  test("with no cap the value is not checked", () => {
    const noCap: AutonomyConfig = { ...FULL, caps: { maxAutoOrderValue: null, dailyActionLimit: null } };
    expect(decideAutonomy(ORDER, { items: [{ name: "Beans", quantity: 1000 }] }, noCap, canAll).decision).toBe("auto");
  });

  test("gateAction also rewrites the card's totals to the computed ones", () => {
    const params: Record<string, unknown> = {
      items: [{ name: "Beans", quantity: 30, unitCost: 12 }],
      subtotal: 10,
      total: 10,
    };
    const gate = gateAction("orderFromSupplier", params, FULL, canAll);
    expect(gate.decision).toBe("propose");
    expect(params).toMatchObject({ subtotal: 360, total: 360 });
  });
});

describe("the action catalog no longer asks the model for totals", () => {
  test("orderFromSupplier and createPurchaseOrder take items (+ tax), never subtotal/total", () => {
    for (const name of ["orderFromSupplier", "createPurchaseOrder"]) {
      const params = Object.keys(getAction(name)!.parameters);
      expect(params).toContain("items");
      expect(params).not.toContain("subtotal");
      expect(params).not.toContain("total");
    }
    const order = getActionCatalog().find((a) => a.name === "orderFromSupplier")!;
    expect(order.description).toContain("viewRestockSuggestions");
  });
});
