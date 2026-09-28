/*
 * Page-context builders for the data pages: inventory, waste log, suppliers, products, pricing,
 * sales, reports and finances (Docs, Channel, New Tab and the dashboard: workspace-page-context.ts).
 * Each turns what the page shows into the one-sentence summary and scalar params that
 * useMerchivaPageContext publishes (lib/merchiva/page-context.ts), so Mr. Merchiva can act on
 * "this item" or "this month" without asking. Pure; the hooks that call them sit next to each page.
 *
 * Ids are the row ids the read tools return and the action blocks take (the uuid's text, as the
 * client's `row.id.toString()` gives it); calendar days are YYYY-MM-DD keys (lib/date-key.ts).
 * Only what the page itself shows goes in: no pay, contact details or tokens.
 */

import { dateFromKey, dateKeyOffset } from "@/lib/date-key";
import type { MerchivaPageContext } from "@/lib/merchiva/page-context";
import {
  clip,
  count,
  pageContext,
  quoted,
  sentence,
  span,
  text,
  type DayRange,
  type PageRecord,
} from "@/lib/merchiva/page-context-format";

export type { DayRange, PageRecord } from "@/lib/merchiva/page-context-format";

// ── Inventory ────────────────────────────────────────────────────────────────

export type InventoryDialog = "adjustStock" | "editItem" | "addItem";

export interface InventoryPageState {
  items: number;
  lowStock: number;
  outOfStock: number;
  /** Rows left after the category and search filters. */
  shown: number;
  /** "All" (or empty) = every category. */
  category: string;
  search: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  dialog: InventoryDialog | null;
  /** The item the stock sheet or the item dialog is open on. */
  item: PageRecord | null;
}

export function inventoryPageContext(s: InventoryPageState): MerchivaPageContext {
  const category = s.category === "All" ? "" : text(s.category);
  const search = text(s.search);
  const filtered = category !== "" || search !== "";
  const sort = s.sortKey !== "name" || s.sortDir !== "asc" ? `${s.sortKey} ${s.sortDir}` : "";
  const item = s.dialog && s.dialog !== "addItem" ? s.item : null;
  const itemName = item ? clip(item.name) : "";
  return pageContext(
    sentence([
      `Inventory, ${count(s.items, "item")} (${s.lowStock} low stock, ${s.outOfStock} out of stock)`,
      category && `category: ${category}`,
      search && `search ${quoted(search)}`,
      filtered && `showing ${s.shown}`,
      sort && `sorted by ${sort}`,
      s.dialog === "addItem" && "adding a new item",
      item && s.dialog === "adjustStock" && `adjusting stock of: ${itemName}`,
      item && s.dialog === "editItem" && `item open: ${itemName}`,
    ]),
    {
      items: s.items,
      lowStock: s.lowStock,
      outOfStock: s.outOfStock,
      category,
      search,
      shown: filtered ? s.shown : undefined,
      sort,
      dialog: s.dialog,
      itemId: item?.id,
      itemName,
    },
  );
}

// ── Waste log ────────────────────────────────────────────────────────────────

export type WastePeriod = "today" | "week" | "month" | "all";

const WASTE_PERIOD: Record<WastePeriod, string> = {
  today: "today",
  week: "in the last 7 days",
  month: "this month",
  all: "all time",
};

/** The days the waste log's period filter keeps, from the store's `today`; null = every day. */
export function wastePeriodRange(period: WastePeriod, today: string): DayRange | null {
  if (period === "all") return null;
  if (period === "today") return { from: today, to: today };
  if (period === "week") return { from: dateKeyOffset(-6, dateFromKey(today)), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export interface WastePageState {
  today: string;
  period: WastePeriod;
  /** Entries left after the period and search filters. */
  entries: number;
  search: string;
  /** The "log waste" dialog is open. */
  logging: boolean;
  /** The inventory item picked in that dialog (null when typed by hand or not picked yet). */
  itemId: string | null;
  itemName: string;
}

export function wastePageContext(s: WastePageState): MerchivaPageContext {
  const range = wastePeriodRange(s.period, s.today);
  const search = text(s.search);
  const itemName = s.logging ? clip(s.itemName) : "";
  return pageContext(
    sentence([
      `Waste log, ${count(s.entries, "entry", "entries")} ${WASTE_PERIOD[s.period]}${range ? ` (${span(range)})` : ""}`,
      search && `search ${quoted(search)}`,
      s.logging && (itemName ? `logging waste for: ${itemName}` : "logging a waste entry"),
    ]),
    {
      period: s.period,
      from: range?.from,
      to: range?.to,
      entries: s.entries,
      search,
      dialog: s.logging ? "logWaste" : undefined,
      itemId: s.logging ? s.itemId : undefined,
      itemName,
    },
  );
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export type SuppliersDialog = "editSupplier" | "addSupplier" | "newOrder";

export interface SuppliersPageState {
  suppliers: number;
  /** Suppliers left after the search. */
  shown: number;
  search: string;
  /** Purchase orders neither received nor cancelled. */
  openOrders: number;
  /** Supplier emails flagged for review. */
  needsReview: number;
  dialog: SuppliersDialog | null;
  /** The supplier being edited, or the one a new purchase order is for. */
  supplier: PageRecord | null;
}

export function suppliersPageContext(s: SuppliersPageState): MerchivaPageContext {
  const search = text(s.search);
  const supplier = s.dialog && s.dialog !== "addSupplier" ? s.supplier : null;
  const supplierName = supplier ? clip(supplier.name) : "";
  return pageContext(
    sentence([
      `Suppliers, ${count(s.suppliers, "supplier")}, ${count(s.openOrders, "open purchase order")}`,
      s.needsReview > 0 && `${count(s.needsReview, "supplier email")} to review`,
      search && `search ${quoted(search)}`,
      search && `showing ${s.shown}`,
      s.dialog === "addSupplier" && "adding a new supplier",
      s.dialog === "editSupplier" && supplier && `supplier open: ${supplierName}`,
      s.dialog === "newOrder" && (supplier ? `new purchase order for: ${supplierName}` : "new purchase order"),
    ]),
    {
      suppliers: s.suppliers,
      openOrders: s.openOrders,
      needsReview: s.needsReview,
      search,
      shown: search ? s.shown : undefined,
      dialog: s.dialog,
      supplierId: supplier?.id,
      supplierName,
    },
  );
}

// ── Products & pricing ───────────────────────────────────────────────────────

export interface ProductsPageState {
  products: number;
  /** Products carrying an underperforming / remove alert. */
  flagged: number;
  shown: number;
  /** "All" (or empty) = every category. */
  category: string;
  search: string;
  flaggedOnly: boolean;
  adding: boolean;
}

export function productsPageContext(s: ProductsPageState): MerchivaPageContext {
  const category = s.category === "All" ? "" : text(s.category);
  const search = text(s.search);
  const filtered = category !== "" || search !== "" || s.flaggedOnly;
  return pageContext(
    sentence([
      `Products, ${count(s.products, "product")} (${s.flagged} flagged)`,
      category && `category: ${category}`,
      s.flaggedOnly && "flagged only",
      search && `search ${quoted(search)}`,
      filtered && `showing ${s.shown}`,
      s.adding && "adding a new product",
    ]),
    {
      products: s.products,
      flagged: s.flagged,
      category,
      flaggedOnly: s.flaggedOnly || undefined,
      search,
      shown: filtered ? s.shown : undefined,
      dialog: s.adding ? "addProduct" : undefined,
    },
  );
}

export interface PricingPageState {
  ready: boolean;
  products: number;
  search: string;
}

export function pricingPageContext(s: PricingPageState): MerchivaPageContext {
  const search = text(s.search);
  if (!s.ready) return pageContext("Pricing, loading products.", {});
  return pageContext(
    sentence([
      `Pricing (price suggestions, happy hour, competitors), ${count(s.products, "product")}`,
      search && `search ${quoted(search)}`,
    ]),
    { products: s.products, search },
  );
}

// ── Sales, reports, finances ─────────────────────────────────────────────────

const SALES_TAB: Record<string, string> = {
  history: "daily sales history",
  hourly: "today's hourly sales",
  forecast: "sales forecast",
  "ai-items": "per-item forecast",
};

export interface SalesPageState {
  /** The open tab; null when there is nothing to show yet. */
  tab: string | null;
  /** Days with a daily sales record, and the first and last of them. */
  days: number;
  range: DayRange | null;
}

export function salesPageContext(s: SalesPageState): MerchivaPageContext {
  const tab = s.tab ? (SALES_TAB[s.tab] ?? s.tab) : "";
  return pageContext(
    sentence([
      s.days > 0 && s.range
        ? `Sales, ${count(s.days, "day")} of daily sales (${span(s.range)})`
        : "Sales, no daily sales recorded yet",
      tab && `tab: ${tab}`,
    ]),
    { tab: s.tab, from: s.range?.from, to: s.range?.to, daysTracked: s.days },
  );
}

const REPORT_RANGE: Record<string, string> = {
  this_month: "this month",
  last_month: "last month",
  last_90: "last 90 days",
};

export interface ReportPeriod extends DayRange {
  range: string;
}

export interface ReportsPageState {
  sales: ReportPeriod;
  staff: ReportPeriod;
}

export function reportsPageContext(s: ReportsPageState): MerchivaPageContext {
  const label = (p: ReportPeriod) => `${REPORT_RANGE[p.range] ?? p.range} (${span(p)})`;
  return pageContext(
    sentence([
      "Reports (sales, staff, inventory, products)",
      `sales period: ${label(s.sales)}`,
      `staff period: ${label(s.staff)}`,
    ]),
    {
      salesPeriod: s.sales.range,
      salesFrom: s.sales.from,
      salesTo: s.sales.to,
      staffPeriod: s.staff.range,
      staffFrom: s.staff.from,
      staffTo: s.staff.to,
    },
  );
}

const FINANCES_TAB: Record<string, string> = {
  overview: "overview (revenue, expenses, profit)",
  expenses: "expenses",
  cashflow: "cash flow",
  payroll: "payroll",
};

export function financesPageContext(tab: string): MerchivaPageContext {
  return pageContext(`Finances, tab: ${FINANCES_TAB[tab] ?? tab}.`, { tab });
}
