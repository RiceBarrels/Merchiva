// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
import type { ShiftPreset } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): ShiftPreset {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    color: row.color ?? "#44403c",
    sortOrder: row.sort_order ?? 0,
  };
}

export async function getShiftPresets(organizationId: string): Promise<ShiftPreset[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shift_presets")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function addShiftPreset(
  organizationId: string,
  preset: { name: string; startTime: string; endTime: string; color: string }
): Promise<ShiftPreset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shift_presets")
    .insert({
      organization_id: organizationId,
      name: preset.name,
      start_time: preset.startTime,
      end_time: preset.endTime,
      color: preset.color,
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function updateShiftPreset(
  id: string,
  updates: Partial<{ name: string; startTime: string; endTime: string; color: string }>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.startTime !== undefined) payload.start_time = updates.startTime;
  if (updates.endTime !== undefined) payload.end_time = updates.endTime;
  if (updates.color !== undefined) payload.color = updates.color;
  const { error } = await supabase.from("shift_presets").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteShiftPreset(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("shift_presets").delete().eq("id", id);
  if (error) throw error;
}
