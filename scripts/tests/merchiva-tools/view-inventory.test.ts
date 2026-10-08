import { describe, expect, test } from "bun:test";
import { inventoryView, MAX_INVENTORY_ITEMS, viewInventoryInput } from "@/lib/merchiva/tools/view-inventory";
import { uuid } from "./fixtures";

const ORG = "org-1";
const wholeMilk = uuid(40);
const oatMilk = uuid(41);
const beans = uuid(42);

const item = (id: ReturnType<typeof uuid>, name: string, stock: number, min: number) => ({
  id, organizationId: ORG, name, category: "Dairy", currentStock: stock, minStock: min, maxStock: 40, unit: "L",
  supplier: "Dairy Co", minOrderQty: 6, unitsPerCase: undefined, unitContentAmount: undefined, unitContentUnit: undefined,
});
const ROWS = [item(wholeMilk, "Whole Milk", 3, 10), item(oatMilk, "Oat Milk", 8, 6), item(beans, "Espresso Beans", 12, 4)];
const names = (out: ReturnType<typeof inventoryView>) => out.items.map((i) => i.name);

describe("inventoryView", () => {
  test("no filter: every item, with the store's total and no note", () => {
    const out = inventoryView(ROWS, {});
    expect(names(out)).toEqual(["Whole Milk", "Oat Milk", "Espresso Beans"]);
    expect(out).toMatchObject({ totalItems: 3, count: 3 });
    expect(out).not.toHaveProperty("filter");
    expect(out).not.toHaveProperty("note");
  });

  test("an item's shape: its hyphenated id is the itemId the actions take", () => {
    expect(inventoryView(ROWS, { itemId: oatMilk.toString() }).items).toEqual([{
      id: oatMilk.toString(), name: "Oat Milk", category: "Dairy", stock: 8, min: 6, max: 40, unit: "L", supplier: "Dairy Co",
      minOrderQty: 6, unitsPerCase: null, unitContentAmount: null, unitContentUnit: null,
    }]);
  });

  test("itemId — the open item from the CURRENT PAGE — reads that one item, hyphenated or bare", () => {
    for (const id of [oatMilk.toString(), oatMilk.toHexString(), ` ${oatMilk.toString().toUpperCase()} `]) {
      const out = inventoryView(ROWS, { itemId: id });
      expect(names(out)).toEqual(["Oat Milk"]);
      expect(out).toMatchObject({ totalItems: 3, filter: "itemId", count: 1 });
      expect(out).not.toHaveProperty("note");
    }
  });

  test("itemId wins over lowOnly and search: the reported case asked lowOnly and lost the open item", () => {
    const out = inventoryView(ROWS, { itemId: oatMilk.toString(), lowOnly: true, search: "beans" });
    expect(names(out)).toEqual(["Oat Milk"]);
    expect(out.filter).toBe("itemId");
  });

  test("an unknown itemId returns nothing and says how to find the item", () => {
    const out = inventoryView(ROWS, { itemId: uuid(99).toString() });
    expect(out).toMatchObject({ totalItems: 3, filter: "itemId", count: 0, items: [] });
    expect(out.note).toContain("No item has this itemId");
    expect(out.note).toContain("search");
  });

  test("lowOnly lists what is running low and says the rest still exist", () => {
    const out = inventoryView(ROWS, { lowOnly: true });
    expect(names(out)).toEqual(["Whole Milk"]);
    expect(out).toMatchObject({ totalItems: 3, filter: "lowOnly", count: 1 });
    expect(out.note).toContain("Only the 1 of 3 items matching lowOnly are listed");
    expect(out.note).toContain("itemId");
  });

  test("search matches part of the name in any case, and combines with lowOnly", () => {
    expect(names(inventoryView(ROWS, { search: "MILK" }))).toEqual(["Whole Milk", "Oat Milk"]);
    const low = inventoryView(ROWS, { search: "milk", lowOnly: true });
    expect(names(low)).toEqual(["Whole Milk"]);
    expect(low.filter).toBe("search + lowOnly");
    expect(inventoryView(ROWS, { search: "  " })).not.toHaveProperty("filter");
  });

  test("a filter that keeps everything adds no note", () => {
    expect(inventoryView(ROWS.slice(0, 1), { lowOnly: true })).not.toHaveProperty("note");
  });

  test(`at most ${MAX_INVENTORY_ITEMS} items, with a note to narrow the rest`, () => {
    const many = Array.from({ length: MAX_INVENTORY_ITEMS + 5 }, (_, n) => item(uuid(1000 + n), `Item ${n}`, 50, 1));
    const out = inventoryView(many, {});
    expect(out.count).toBe(MAX_INVENTORY_ITEMS + 5);
    expect(out.items).toHaveLength(MAX_INVENTORY_ITEMS);
    expect(out.note).toContain(`first ${MAX_INVENTORY_ITEMS} of ${MAX_INVENTORY_ITEMS + 5}`);
  });

  test("the input schema takes itemId, search and lowOnly, all optional", () => {
    expect(viewInventoryInput.parse({})).toEqual({});
    expect(viewInventoryInput.parse({ itemId: "x", search: "milk", lowOnly: true })).toEqual({ itemId: "x", search: "milk", lowOnly: true });
    expect(viewInventoryInput.safeParse({ lowOnly: "yes" }).success).toBe(false);
  });
});
