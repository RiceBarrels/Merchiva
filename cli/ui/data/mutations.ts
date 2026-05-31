// Write actions for the TUI — calls the SAME reducers the web uses (via
// lib/spacetimedb/actions.ts → conn.reducers.<name>(args)). The active org id
// is injected automatically, mirroring actions.ts's orgId().
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useSpacetimeDB } from "spacetimedb/react";
import { useOrg } from "./provider.tsx";
import type { InvItem, Prod } from "./hooks.ts";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface NewProduct {
  name: string;
  category: string;
  price: number;
  cost: number;
}

export interface NewInventoryItem {
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
}

export function useMutations() {
  const state = useSpacetimeDB() as any;
  const { orgId } = useOrg();

  function reducers(): any {
    const conn = state?.getConnection?.();
    if (!conn) throw new Error("Not connected to SpacetimeDB");
    if (!orgId) throw new Error("No organization selected");
    return conn.reducers;
  }

  return {
    addProduct(d: NewProduct): Promise<void> {
      return reducers().addProduct({
        organizationId: orgId,
        name: d.name,
        category: d.category,
        price: d.price,
        cost: d.cost,
        imageUrl: undefined,
        description: undefined,
        nameI18N: undefined,
        options: undefined,
      });
    },

    updateProduct(p: Prod, d: NewProduct): Promise<void> {
      return reducers().updateProduct({
        organizationId: orgId,
        productId: p.id,
        name: d.name,
        category: d.category,
        price: d.price,
        cost: d.cost,
      });
    },

    addInventoryItem(d: NewInventoryItem): Promise<void> {
      return reducers().addInventoryItem({
        organizationId: orgId,
        name: d.name,
        category: d.category,
        currentStock: d.currentStock,
        minStock: d.minStock,
        maxStock: d.maxStock,
        unit: d.unit,
        costPerUnit: d.costPerUnit,
        supplier: d.supplier,
        lastRestocked: today(),
      });
    },

    updateInventoryItem(item: InvItem, patch: Partial<NewInventoryItem>): Promise<void> {
      return reducers().updateInventoryItem({
        organizationId: orgId,
        itemId: item.id,
        name: patch.name ?? item.name,
        category: patch.category ?? item.category,
        currentStock: patch.currentStock ?? item.currentStock,
        minStock: patch.minStock ?? item.minStock,
        maxStock: patch.maxStock ?? item.maxStock,
        unit: patch.unit ?? item.unit,
        costPerUnit: patch.costPerUnit ?? item.costPerUnit,
        supplier: patch.supplier ?? item.supplier,
        lastRestocked: today(),
        lossRate: item.lossRate,
      });
    },

    // Adjust stock by a delta (clamped at 0) — used by +/- and restock.
    adjustStock(item: InvItem, delta: number): Promise<void> {
      const next = Math.max(0, item.currentStock + delta);
      return this.updateInventoryItem(item, { currentStock: next });
    },
  };
}
