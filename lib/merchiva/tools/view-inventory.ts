/**
 * viewInventory — the store's inventory items: stock levels, limits and
 * ordering specs.
 *
 * Three ways in: one item by its id (the itemId the Inventory page's CURRENT
 * PAGE facts carry for the open item, or one an earlier tool returned), the
 * items whose name contains some text, or the whole list — optionally only the
 * items at or below their minimum. The result always says how many items the
 * store has and which filter it applied, and a filtered result says how to see
 * the rest: "how much of this is left" once went through lowOnly, got back a
 * list without the open item, and ended in an empty reply.
 */

import { z } from "zod";
import { canonicalUuid, opt, rowId, type Row } from "@/lib/merchiva/tools/rows";

/** The most items one call returns; narrow with itemId or search for the rest. */
export const MAX_INVENTORY_ITEMS = 200;

export const viewInventoryInput = z.object({
  itemId: z
    .string()
    .optional()
    .describe("One item's id, e.g. the itemId in the CURRENT PAGE facts. Returns only that item; the other filters are ignored."),
  search: z.string().optional().describe("Only items whose name contains this text (any case)."),
  lowOnly: z
    .boolean()
    .optional()
    .describe("Only items at or below their minimum stock — for \"what is running low\", never to read one item's stock."),
});
export type ViewInventoryArgs = z.infer<typeof viewInventoryInput>;

function itemView(i: Row) {
  return {
    id: rowId(i),
    name: i.name,
    category: i.category,
    stock: i.currentStock,
    min: i.minStock,
    max: i.maxStock,
    unit: i.unit,
    supplier: i.supplier,
    minOrderQty: opt(i.minOrderQty),
    unitsPerCase: opt(i.unitsPerCase),
    unitContentAmount: opt(i.unitContentAmount),
    unitContentUnit: opt(i.unitContentUnit),
  };
}

/** The tool's result for the org's inventory rows. Pure. */
export function inventoryView(rows: readonly Row[], args: ViewInventoryArgs) {
  const itemId = args.itemId?.trim() ? canonicalUuid(args.itemId) : "";
  const search = itemId ? "" : (args.search?.trim().toLowerCase() ?? "");
  const lowOnly = !itemId && args.lowOnly === true;

  let items = [...rows];
  if (itemId) items = items.filter((i) => canonicalUuid(rowId(i)) === itemId);
  if (search) items = items.filter((i) => String(i.name ?? "").toLowerCase().includes(search));
  if (lowOnly) items = items.filter((i) => Number(i.currentStock) <= Number(i.minStock));

  const filter = [itemId && "itemId", search && "search", lowOnly && "lowOnly"].filter(Boolean).join(" + ");
  const notes: string[] = [];
  if (itemId && items.length === 0) {
    notes.push("No item has this itemId. Call viewInventory again with search (part of the item's name) or with no filter.");
  } else if (filter && !itemId && items.length < rows.length) {
    notes.push(
      `Only the ${items.length} of ${rows.length} items matching ${filter} are listed. To read an item that is not listed, call viewInventory with its itemId, or without the filter.`,
    );
  }
  if (items.length > MAX_INVENTORY_ITEMS) {
    notes.push(`Only the first ${MAX_INVENTORY_ITEMS} of ${items.length} are listed; narrow with itemId or search.`);
  }

  return {
    totalItems: rows.length,
    ...(filter ? { filter } : {}),
    count: items.length,
    items: items.slice(0, MAX_INVENTORY_ITEMS).map(itemView),
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
}

/** The tool's description; the tool itself is built in lib/merchiva/tools.ts (server-only). */
export const VIEW_INVENTORY_DESCRIPTION =
  "Inventory items with stock levels and ordering specs (id, name, stock, min, max, unit, supplier, minOrderQty, unitsPerCase). To read one item's stock, pass its itemId (the CURRENT PAGE facts carry it for the item open on the Inventory page) or search by name. Pass lowOnly=true only for what is running low. items[].id is the itemId updateInventoryItem/deleteInventoryItem take, and the inventoryItemId of a product's inventoryUsage.";
