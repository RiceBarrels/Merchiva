import type { ProductInventoryUsage } from "@/lib/types";

export const INVENTORY_CONTENT_UNITS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "oz", label: "oz" },
  { value: "lb", label: "lb" },
  { value: "ml", label: "ml" },
  { value: "l", label: "L" },
  { value: "fl_oz", label: "fl oz" },
  { value: "gal", label: "gal" },
] as const;

export type InventoryContentUnit = (typeof INVENTORY_CONTENT_UNITS)[number]["value"];

export function inventoryContentUnitLabel(value: string | null | undefined): string {
  return INVENTORY_CONTENT_UNITS.find((u) => u.value === value)?.label ?? String(value ?? "");
}

export function formatInventoryContentAmount(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(Number(amount)) || !unit) return "";
  return `${Number(amount)} ${inventoryContentUnitLabel(unit)}`;
}

export function sanitizeProductInventoryUsage(value: unknown): ProductInventoryUsage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      inventoryItemId: String((item as ProductInventoryUsage | null)?.inventoryItemId ?? ""),
      inventoryItemName: String((item as ProductInventoryUsage | null)?.inventoryItemName ?? ""),
      quantity: Number((item as ProductInventoryUsage | null)?.quantity ?? 0),
      unit: String((item as ProductInventoryUsage | null)?.unit ?? ""),
    }))
    .filter((item) => item.inventoryItemId && item.inventoryItemName && Number.isFinite(item.quantity));
}
