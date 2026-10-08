"use client";

import { useMemo } from "react";
import { inventoryPageContext, type InventoryDialog } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import type { InventoryItem } from "@/lib/types";

/** Tells Mr. Merchiva what the inventory page shows: counts, filters and the item open in a dialog. */
export function useInventoryPageContext(s: {
  items: readonly InventoryItem[];
  shown: number;
  search: string;
  category: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  /** The item the quick stock sheet is open on (null while it is closed). */
  stockItem: InventoryItem | null;
  /** The item the details dialog edits (null while it is closed or adding). */
  editItem: InventoryItem | null;
  addingItem: boolean;
}): void {
  const { items, shown, search, category, sortKey, sortDir, stockItem, editItem, addingItem } = s;
  const counts = useMemo(
    () => ({
      low: items.filter((i) => i.status === "low_stock").length,
      out: items.filter((i) => i.status === "out_of_stock").length,
    }),
    [items],
  );
  // The details dialog opens over the stock sheet, so it wins when both are up.
  const dialog: InventoryDialog | null = addingItem ? "addItem" : editItem ? "editItem" : stockItem ? "adjustStock" : null;
  const open = editItem ?? stockItem;
  const openId = open?.id ?? null;
  const openName = open?.name ?? "";
  const context = useMemo(
    () =>
      inventoryPageContext({
        items: items.length,
        lowStock: counts.low,
        outOfStock: counts.out,
        shown,
        category,
        search,
        sortKey,
        sortDir,
        dialog,
        item: openId ? { id: openId, name: openName } : null,
      }),
    [items.length, counts, shown, category, search, sortKey, sortDir, dialog, openId, openName],
  );
  useMerchivaPageContext(context);
}
