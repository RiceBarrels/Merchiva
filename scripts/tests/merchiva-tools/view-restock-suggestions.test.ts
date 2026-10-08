import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeRestock,
  RESTOCK_HISTORY_DAYS,
  toInventoryItem,
  toInventoryTransaction,
  viewRestockSuggestionsTool,
  withinRestockWindow,
} from "@/lib/merchiva/tools/view-restock-suggestions";
import { canonicalUuid, rowId } from "@/lib/merchiva/tools/rows";
import { CALL, fakeConn, fakeCtx, uuid } from "./fixtures";

const milkId = uuid(101);
const cupsId = uuid(102);
const beansId = uuid(103);

const items = [
  // 2 of 50 left, used 4/day → critical. Cases of 12 → 48 rounds up to 48 (4 cases).
  { organizationId: "org-1", id: milkId, name: "Milk", category: "Dairy", currentStock: 2, minStock: 10, maxStock: 50, unit: "L", costPerUnit: 0.1, costPerUnitCents: 10n, supplier: "Dairy Co", lastRestocked: "2026-09-20", unitsPerCase: 12 },
  // Healthy stock: no suggestion.
  { organizationId: "org-1", id: beansId, name: "Beans", category: "Dry", currentStock: 90, minStock: 10, maxStock: 100, unit: "kg", costPerUnit: 5, supplier: "Bean Co", lastRestocked: "2026-09-20" },
  // Below min, supplier minimum of 30 applies.
  { organizationId: "org-1", id: cupsId, name: "Cups", category: "Paper", currentStock: 5, minStock: 20, maxStock: 25, unit: "pcs", costPerUnit: 0.2, supplier: "dairy co ", lastRestocked: "2026-09-20", minOrderQty: 30 },
];
const txns = [
  { organizationId: "org-1", id: uuid(), itemId: milkId.toString(), type: "out", quantity: 8, date: "2026-09-22" },
  { organizationId: "org-1", id: uuid(), itemId: milkId.toHexString(), type: "out", quantity: 8, date: "2026-09-24" },
];

describe("row mapping", () => {
  test("transactions match their item whether the reference was stored hyphenated or bare", () => {
    const item = toInventoryItem(items[0]);
    expect(txns.map(toInventoryTransaction).every((t) => t.itemId === item.id)).toBe(true);
    expect(item.id).toBe(canonicalUuid(milkId.toString()));
  });

  test("ids handed to the model are the hyphenated form client actions look up", () => {
    expect(rowId({ id: milkId })).toBe(milkId.toString());
  });
});

describe("computeRestock", () => {
  const run = (supplier?: string) =>
    computeRestock(
      items.map(toInventoryItem),
      txns.map(toInventoryTransaction),
      new Map(items.map((r) => [toInventoryItem(r).id, Math.round(r.costPerUnit * 100)])),
      [{ id: "sup-1", name: "Dairy Co", language: "zh" }],
      supplier,
    );

  test("engine quantities, whole cases, supplier minimums; exact costs", () => {
    const out = run();
    expect(out.count).toBe(2);
    const milk = out.suggestions.find((s) => s.name === "Milk")!;
    expect(milk.priority).toBe("critical");
    expect(milk.orderQty).toBe(48);
    expect(milk.cases).toBe(4);
    expect(milk.dailyUse).toBe(8);
    expect(milk.estimatedCost).toBe(4.8);
    const cups = out.suggestions.find((s) => s.name === "Cups")!;
    expect(cups.orderQty).toBe(30);
    expect(cups.estimatedCost).toBe(6);
    expect(out.totalEstimatedCost).toBe(10.8);
  });

  test("each suggestion carries the unit cost on file for the order line, null when none", () => {
    const out = computeRestock(
      items.map(toInventoryItem),
      txns.map(toInventoryTransaction),
      new Map([[toInventoryItem(items[0]).id, 10]]),
      [],
    );
    expect(out.suggestions.find((s) => s.name === "Milk")!.unitCost).toBe(0.1);
    expect(out.suggestions.find((s) => s.name === "Cups")!.unitCost).toBeNull();
  });

  test("groups by supplier (name match ignores case and spaces) with id and language", () => {
    const out = run();
    expect(out.bySupplier).toEqual([
      { supplier: "Dairy Co", supplierId: "sup-1", supplierLanguage: "zh", items: 2, estimatedCost: 10.8 },
    ]);
  });

  test("the supplier filter keeps only that supplier", () => {
    expect(run("Bean Co").count).toBe(0);
    expect(run("DAIRY CO").count).toBe(2);
  });
});

describe("history window", () => {
  test("matches the client's inventory_transaction subscription window", () => {
    const provider = readFileSync(join(import.meta.dir, "../../../lib/spacetimedb/provider.tsx"), "utf8");
    const days = /const HISTORY_WINDOW_DAYS = (\d+);/.exec(provider)?.[1];
    expect(Number(days)).toBe(RESTOCK_HISTORY_DAYS);
    expect(provider).toContain("SELECT * FROM inventory_transaction WHERE ${org} AND date >= '${since}'");
    expect(provider).toContain("const since = isoDaysAgo(HISTORY_WINDOW_DAYS);");
  });

  test("keeps movements from the last 120 store days, the cut-off day included", () => {
    const t = (date: string) => toInventoryTransaction({ id: uuid(), itemId: milkId.toString(), type: "out", quantity: 1, date });
    const kept = withinRestockWindow([t("2026-05-28"), t("2026-05-29"), t("2026-09-26")], "2026-09-26");
    expect(kept.map((x) => x.date)).toEqual(["2026-05-29", "2026-09-26"]);
  });

  test("old usage no longer drags the rate down: the tool quotes what the Restock tab shows", async () => {
    // Milk: 2/day last winter, 10/day now; 30 on hand.
    const milk = { ...items[0], currentStock: 30, minStock: 20, maxStock: 200 };
    const winter = Array.from({ length: 30 }, (_, i) => ({
      organizationId: "org-1", id: uuid(), itemId: milkId.toString(), type: "out", quantity: 2, date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    }));
    const now = Array.from({ length: 10 }, (_, i) => ({
      organizationId: "org-1", id: uuid(), itemId: milkId.toString(), type: "out", quantity: 10, date: `2026-09-${String(i + 15).padStart(2, "0")}`,
    }));
    const all = [...winter, ...now];
    const conn = fakeConn({ inventoryItem: [milk], inventoryTransaction: all, supplier: [] });
    const out = (await viewRestockSuggestionsTool(fakeCtx(conn, "2026-09-26")).execute!({}, CALL)) as ReturnType<typeof computeRestock>;
    const page = computeRestock([toInventoryItem(milk)], withinRestockWindow(all.map(toInventoryTransaction), "2026-09-26"), new Map(), []);
    const unwindowed = computeRestock([toInventoryItem(milk)], all.map(toInventoryTransaction), new Map(), []);

    const quoted = out.suggestions[0];
    expect(quoted.dailyUse).toBe(page.suggestions[0].dailyUse);
    expect(quoted.priority).toBe(page.suggestions[0].priority);
    expect(quoted.dailyUse).toBeGreaterThan(unwindowed.suggestions[0].dailyUse);
    expect(quoted.daysUntilStockout).toBeLessThan(unwindowed.suggestions[0].daysUntilStockout!);
  });
});

describe("viewRestockSuggestions tool", () => {
  test("reads items, transactions and suppliers of the org only", async () => {
    const conn = fakeConn({
      inventoryItem: [...items, { ...items[0], organizationId: "org-2", id: uuid() }],
      inventoryTransaction: txns,
      supplier: [{ organizationId: "org-1", id: uuid(200), name: "Dairy Co", language: "en" }],
    });
    const out = (await viewRestockSuggestionsTool(fakeCtx(conn, "2026-09-26")).execute!({}, CALL)) as {
      count: number;
      bySupplier: { supplierId: string | null }[];
      suggestions: { itemId: string }[];
    };
    expect(out.count).toBe(2);
    expect(out.bySupplier[0].supplierId).toBe(uuid(200).toString());
    expect(out.suggestions.map((s) => s.itemId)).toContain(milkId.toString());
  });
});
