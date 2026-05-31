// Page data hooks — thin wrappers over `useTable`, filtered by the active org,
// mirroring the row mappings in lib/spacetimedb/hooks/*. Each returns
// [rows, isReady] exactly like the web hooks.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { useOrg } from "./provider.tsx";

function tsToMs(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object") {
    const o = v as { microsSinceUnixEpoch?: bigint | number; toDate?: () => Date };
    if (typeof o.toDate === "function") return o.toDate().getTime();
    const m = o.microsSinceUnixEpoch;
    if (typeof m === "bigint") return Number(m / 1000n);
    if (typeof m === "number") return m / 1000;
  }
  return NaN;
}

export interface InvItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lossRate: number;
  status: "out_of_stock" | "low_stock" | "in_stock";
}

export function useInventory(): [InvItem[], boolean] {
  const { orgId } = useOrg();
  const [rows, ready] = useTable(tables.inventoryItem as any);
  const items = useMemo<InvItem[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        category: r.category,
        currentStock: r.currentStock,
        minStock: r.minStock,
        maxStock: r.maxStock ?? 0,
        unit: r.unit,
        costPerUnit: r.costPerUnit,
        supplier: r.supplier ?? "",
        lossRate: r.lossRate ?? 0,
        status: (r.currentStock <= 0
          ? "out_of_stock"
          : r.currentStock <= r.minStock
            ? "low_stock"
            : "in_stock") as InvItem["status"],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, orgId]);
  return [items, ready];
}

export interface Sale {
  date: string;
  total: number;
  items: number;
  source: string;
  ms: number;
}

export function useSales(): [Sale[], boolean] {
  const { orgId } = useOrg();
  const [records, ready] = useTable(tables.salesRecord as any);
  const [payments] = useTable(tables.payment as any);
  const sales = useMemo<Sale[]>(() => {
    if (!orgId) return [];
    const fromRecords: Sale[] = (records as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        date: String(r.date ?? ""),
        total: Number(r.revenue ?? r.total ?? r.amount ?? 0),
        items: Number(r.transactions ?? r.items ?? 0),
        source: "sales",
        ms: tsToMs(r.createdAt ?? r.date),
      }));
    const fromPayments: Sale[] = (payments as any[])
      .filter((r) => r.organizationId === orgId && (r.status === "completed" || r.status == null))
      .map((r) => ({
        date: String(r.date ?? ""),
        total: Number(r.amount ?? 0),
        items: 1,
        source: "pos",
        ms: tsToMs(r.createdAt ?? r.date),
      }));
    return [...fromRecords, ...fromPayments].sort((a, b) => (b.ms || 0) - (a.ms || 0));
  }, [records, payments, orgId]);
  return [sales, ready];
}

export interface Prod {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  soldThisMonth: number;
  margin: number;
}

export function useProducts(): [Prod[], boolean] {
  const { orgId } = useOrg();
  const [rows, ready] = useTable(tables.product as any);
  const products = useMemo<Prod[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        category: r.category,
        price: Number(r.price ?? 0),
        cost: Number(r.cost ?? 0),
        soldThisMonth: Number(r.unitsSoldThisMonth ?? 0),
        margin: Number(r.price ?? 0) - Number(r.cost ?? 0),
      }))
      .sort((a, b) => b.soldThisMonth - a.soldThisMonth);
  }, [rows, orgId]);
  return [products, ready];
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  hourlyRate: number;
}

export function useStaff(): [Staff[], boolean] {
  const { orgId } = useOrg();
  const [rows, ready] = useTable(tables.staffMember as any);
  const staff = useMemo<Staff[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: r.name,
        role: r.role,
        hourlyRate: Number(r.hourlyRate ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, orgId]);
  return [staff, ready];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  totalSpent: number;
}

export function useCustomers(): [Customer[], boolean] {
  const { orgId } = useOrg();
  const [rows, ready] = useTable(tables.siteCustomer as any);
  const customers = useMemo<Customer[]>(() => {
    if (!orgId) return [];
    return (rows as any[])
      .filter((r) => r.organizationId === orgId)
      .map((r) => ({
        id: String(r.id),
        name: r.name ?? r.displayName ?? r.email ?? "—",
        email: r.email ?? "",
        totalSpent: Number(r.totalSpent ?? r.lifetimeValue ?? 0),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [rows, orgId]);
  return [customers, ready];
}
