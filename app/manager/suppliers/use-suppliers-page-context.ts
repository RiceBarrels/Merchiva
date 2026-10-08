"use client";

import { useMemo } from "react";
import { suppliersPageContext, type PageRecord, type SuppliersDialog } from "@/lib/merchiva/data-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva what the suppliers page shows: counts, the search and the supplier open in a dialog. */
export function useSuppliersPageContext(s: {
  suppliers: number;
  shown: number;
  search: string;
  openOrders: number;
  needsReview: number;
  supplierDialog: boolean;
  /** The supplier the supplier dialog edits (null when adding). */
  editingSupplier: PageRecord | null;
  orderDialog: boolean;
  /** The supplier picked in the purchase-order dialog, if any. */
  orderSupplier: PageRecord | null;
}): void {
  const { suppliers, shown, search, openOrders, needsReview, supplierDialog, orderDialog } = s;
  const dialog: SuppliersDialog | null = supplierDialog
    ? s.editingSupplier ? "editSupplier" : "addSupplier"
    : orderDialog ? "newOrder" : null;
  const supplier = dialog === "editSupplier" ? s.editingSupplier : dialog === "newOrder" ? s.orderSupplier : null;
  const supplierId = supplier?.id ?? null;
  const supplierName = supplier?.name ?? "";
  const context = useMemo(
    () =>
      suppliersPageContext({
        suppliers,
        shown,
        search,
        openOrders,
        needsReview,
        dialog,
        supplier: supplierId ? { id: supplierId, name: supplierName } : null,
      }),
    [suppliers, shown, search, openOrders, needsReview, dialog, supplierId, supplierName],
  );
  useMerchivaPageContext(context);
}
