import { createClient } from "@/lib/supabase/client";
import type { SalesRecord } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): SalesRecord {
  return {
    date: row.date,
    hour: row.hour ?? undefined,
    actual: Number(row.actual),
    predicted: row.predicted != null ? Number(row.predicted) : 0,
    weather: row.weather ?? "unknown",
    footTraffic: Number(row.foot_traffic ?? 0),
    isHoliday: Boolean(row.is_holiday),
  };
}

export async function getSalesHistory(days = 30): Promise<SalesRecord[]> {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("sales_records")
    .select("*")
    .is("hour", null) // daily records only
    .gte("date", since.toISOString().split("T")[0])
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function getTodayHourlyRecords(): Promise<SalesRecord[]> {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("sales_records")
    .select("*")
    .eq("date", today)
    .not("hour", "is", null)
    .order("hour", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function upsertSalesRecord(
  record: SalesRecord,
  userId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("sales_records").upsert(
    {
      user_id: userId,
      date: record.date,
      hour: record.hour ?? null,
      actual: record.actual,
      predicted: record.predicted,
      weather: record.weather,
      foot_traffic: record.footTraffic,
      is_holiday: record.isHoliday,
    },
    { onConflict: "user_id,date,hour" }
  );
  if (error) throw error;
}
