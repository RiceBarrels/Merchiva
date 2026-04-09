// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
import type { InventoryItem, InventoryTransaction, InventoryStatus } from "@/lib/types";

// ─── Mappers ──────────────────────────────────────────────────────────────────

function computeStatus(current: number, min: number): InventoryStatus {
  if (current === 0) return "out_of_stock";
  if (current < min) return "low_stock";
  return "in_stock";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemFromDb(row: any): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    maxStock: Number(row.max_stock),
    unit: row.unit,
    costPerUnit: Number(row.cost_per_unit),
    supplier: row.supplier ?? "",
    lastRestocked: row.last_restocked ?? "",
    status: computeStatus(Number(row.current_stock), Number(row.min_stock)),
    lossRate: Number(row.loss_rate ?? 0),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function txFromDb(row: any): InventoryTransaction {
  return {
    id: row.id,
    itemId: row.item_id ?? "",
    itemName: row.item_name,
    type: row.type,
    quantity: Number(row.quantity),
    date: row.date,
    note: row.note ?? "",
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(itemFromDb);
}

export async function addInventoryItem(
  item: Omit<InventoryItem, "id" | "status">,
  userId: string
): Promise<InventoryItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      user_id: userId,
      name: item.name,
      category: item.category,
      current_stock: item.currentStock,
      min_stock: item.minStock,
      max_stock: item.maxStock,
      unit: item.unit,
      cost_per_unit: item.costPerUnit,
      supplier: item.supplier,
      last_restocked: item.lastRestocked || new Date().toISOString().split("T")[0],
      loss_rate: item.lossRate,
    })
    .select()
    .single();
  if (error) throw error;
  return itemFromDb(data);
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<InventoryItem>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.currentStock !== undefined) payload.current_stock = updates.currentStock;
  if (updates.minStock !== undefined) payload.min_stock = updates.minStock;
  if (updates.maxStock !== undefined) payload.max_stock = updates.maxStock;
  if (updates.unit !== undefined) payload.unit = updates.unit;
  if (updates.costPerUnit !== undefined) payload.cost_per_unit = updates.costPerUnit;
  if (updates.supplier !== undefined) payload.supplier = updates.supplier;
  if (updates.lossRate !== undefined) payload.loss_rate = updates.lossRate;
  const { error } = await supabase.from("inventory_items").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(txFromDb);
}

export async function addInventoryTransaction(
  tx: Omit<InventoryTransaction, "id">,
  userId: string
): Promise<InventoryTransaction> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inventory_transactions")
    .insert({
      user_id: userId,
      item_id: tx.itemId || null,
      item_name: tx.itemName,
      type: tx.type,
      quantity: tx.quantity,
      note: tx.note,
      date: tx.date,
    })
    .select()
    .single();
  if (error) throw error;
  return txFromDb(data);
}
