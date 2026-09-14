/**
 * Row shapes for the inventory / supplier tables as they come back from
 * adminSql (camelCase keys, uuid/identity as strings, timestamps as unix ms,
 * option none as null).
 */

export interface InventoryItemRow {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lastRestocked: string;
  lossRate: number;
  squareItemId: string | null;
  createdAt: number;
  updatedAt: number;
  minOrderQty: number | null;
  unitsPerCase: number | null;
  description: string | null;
  unitContentAmount: number | null;
  unitContentUnit: string | null;
  retailEnabled: boolean | null;
  retailPrice: number | null;
  retailDescription: string | null;
  retailImageUrl: string | null;
  retailUsageQty: number | null;
  expirationDate: string | null;
  expirationBatches: string | null;
}

export interface InventoryTransactionRow {
  id: string;
  organizationId: string;
  itemId: string | null;
  itemName: string;
  type: string;
  quantity: number;
  note: string;
  date: string;
  createdAt: number;
  operatorMemberId: string | null;
  operatorName: string | null;
  evidenceUrls: string | null;
  expirationDate: string | null;
  batchExpirationDate: string | null;
}

export interface WasteLogRow {
  id: string;
  organizationId: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  reason: string;
  costPerUnit: number;
  totalCost: number;
  date: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface SupplierRow {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  rating: number;
  createdAt: number;
  language: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  organizationId: string;
  supplierId: string;
  status: string;
  items: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  sentAt: number | null;
  receivedAt: number | null;
  createdAt: number;
}

export interface SupplierMessageRow {
  id: string;
  organizationId: string;
  supplierId: string;
  poId: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string | null;
  createdAt: number;
}

/** One line of a purchase order's `items` JSON. Field names vary by producer. */
export interface PoLine {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitsPerCase?: number;
  caseCount?: number;
}

export function parsePoLines(raw: string): PoLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry): PoLine => {
    const o = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const str = (...keys: string[]): string => {
      for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) return v;
      }
      return "";
    };
    const num = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = o[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
      }
      return undefined;
    };
    return {
      name: str("name", "itemName", "productName", "inventoryItemName", "item"),
      quantity: num("quantity", "qty") ?? 0,
      unit: str("unit") || "units",
      unitCost: num("unitCost", "unitPrice", "cost", "price") ?? 0,
      unitsPerCase: num("unitsPerCase"),
      caseCount: num("caseCount"),
    };
  });
}

export const TRANSACTION_TYPES = ["in", "out", "adjustment", "loss"] as const;
export const PO_STATUSES = ["draft", "sent", "received", "cancelled"] as const;
export const SUPPLIER_LANGUAGES = ["en", "zh", "es", "fr", "ar", "hi"] as const;
