import { uuid } from "@/lib/utils";
// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { ShiftPreset } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): ShiftPreset {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    startTime: row.startTime,
    endTime: row.endTime,
    color: row.color ?? "#44403c",
    sortOrder: row.sortOrder ?? 0,
  };
}

export async function getShiftPresets(organizationId: string): Promise<ShiftPreset[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.shiftPreset.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId)
    .map(fromRow)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

export async function addShiftPreset(
  organizationId: string,
  preset: { name: string; startTime: string; endTime: string; color: string }
): Promise<ShiftPreset> {
  console.warn("[shift-presets] addShiftPreset: writes go through SpacetimeDB actions.ts");
  return {
    id: uuid(),
    organizationId,
    name: preset.name,
    startTime: preset.startTime,
    endTime: preset.endTime,
    color: preset.color,
    sortOrder: 0,
  };
}

export async function updateShiftPreset(
  id: string,
  updates: Partial<{ name: string; startTime: string; endTime: string; color: string }>
): Promise<void> {
  console.warn("[shift-presets] updateShiftPreset: writes go through SpacetimeDB actions.ts");
}

export async function deleteShiftPreset(id: string): Promise<void> {
  console.warn("[shift-presets] deleteShiftPreset: writes go through SpacetimeDB actions.ts");
}
