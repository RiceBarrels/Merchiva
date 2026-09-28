// The inventory partial-update path Mr. Merchiva's updateInventoryItem /
// updatePrice / updateProduct / deleteProduct actions end in. Read tools hand
// the model hyphenated ids (rows.ts rowId), and so does useInventory; the
// merge with the cached row must find the row by either form, or every partial
// patch fails with "Cannot update inventory item without current …".

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Uuid } from "spacetimedb";
import { rowId } from "@/lib/merchiva/tools/rows";
import { deleteProduct, updateInventoryItem, updateProduct } from "@/lib/spacetimedb/actions";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";

const ORG = "org-inventory-ids";
const MILK_ID = Uuid.parse("01888d6e-5c00-7000-8000-000000000abc");

const milk = {
  id: MILK_ID,
  organizationId: ORG,
  name: "Milk",
  category: "Dairy",
  currentStock: 12,
  minStock: 4,
  maxStock: 40,
  unit: "L",
  costPerUnit: 1.25,
  supplier: "Dairy Co",
  lastRestocked: "2026-09-20",
  lossRate: 0,
  retailEnabled: true,
  retailPrice: 4.5,
};

const calls: Record<string, unknown>[] = [];
const fakeConn = {
  db: { inventoryItem: { iter: () => [milk][Symbol.iterator]() } },
  reducers: {
    updateInventoryItem: async (args: Record<string, unknown>) => {
      calls.push(args);
    },
  },
};

const onLine = Object.getOwnPropertyDescriptor(globalThis.navigator, "onLine");

beforeAll(() => {
  // Bun has no navigator.onLine; without it every write takes the offline queue.
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  setConnection(fakeConn as unknown as Parameters<typeof setConnection>[0]);
  setActiveOrgId(ORG);
});

afterAll(() => {
  clearConnection();
  if (onLine) Object.defineProperty(globalThis.navigator, "onLine", onLine);
  else Reflect.deleteProperty(globalThis.navigator, "onLine");
});

const last = () => calls[calls.length - 1];

describe("inventory partial updates find the cached row by any id form", () => {
  test("the id a read tool gives the model is the hyphenated form", () => {
    expect(rowId(milk)).toBe("01888d6e-5c00-7000-8000-000000000abc");
  });

  test.each([
    ["hyphenated (read tools, useInventory)", "01888d6e-5c00-7000-8000-000000000abc"],
    ["bare hex (toHexString)", "01888d6e5c0070008000000000000abc"],
    ["upper-case hyphenated", "01888D6E-5C00-7000-8000-000000000ABC"],
  ])("updateInventoryItem with a %s id merges the patch into the current row", async (_label, id) => {
    await updateInventoryItem(id, { minStock: 10 });
    expect(last()).toMatchObject({
      organizationId: ORG,
      itemId: id,
      name: "Milk",
      minStock: 10,
      maxStock: 40,
      currentStock: 12,
      costPerUnit: 1.25,
      lossRate: 0,
      lastRestocked: "2026-09-20",
    });
  });

  test("updatePrice (updateProduct) and deleteProduct with a tool id keep the rest of the row", async () => {
    await updateProduct(rowId(milk), { price: 5 });
    expect(last()).toMatchObject({ name: "Milk", retailPrice: 5, retailEnabled: true, minStock: 4 });
    await deleteProduct(rowId(milk));
    expect(last()).toMatchObject({ name: "Milk", retailEnabled: false, retailPrice: 4.5 });
  });

  test("an unknown id still refuses a partial patch", async () => {
    await expect(updateInventoryItem("01888d6e-5c00-7000-8000-000000000abd", { minStock: 10 })).rejects.toThrow(
      "Cannot update inventory item without current",
    );
  });
});
