// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { SalesRecord } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): SalesRecord {
  return {
    date: row.date,
    hour: row.hour ?? undefined,
    actual: Number(row.actual),
    predicted: row.predicted != null ? Number(row.predicted) : 0,
    weather: row.weather ?? "unknown",
    footTraffic: Number(row.footTraffic ?? 0),
    isHoliday: Boolean(row.isHoliday),
  };
}

export async function getSalesHistory(days = 30): Promise<SalesRecord[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split("T")[0];

  const rows = (c as any).db.salesRecord.iter();
  return Array.from(rows)
    .filter(
      (r: any) =>
        r.organizationId === orgId &&
        r.hour == null &&
        r.date >= sinceStr
    )
    .map(fromRow)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTodayHourlyRecords(): Promise<SalesRecord[]> {
  const c = getConnection();
  if (!c) return [];
  const orgId = getActiveOrgId();
  const today = new Date().toISOString().split("T")[0];

  const rows = (c as any).db.salesRecord.iter();
  return Array.from(rows)
    .filter(
      (r: any) =>
        r.organizationId === orgId &&
        r.date === today &&
        r.hour != null
    )
    .map(fromRow)
    .sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
}

export async function upsertSalesRecord(
  record: SalesRecord,
  userId: string
): Promise<void> {
  console.warn(
    "[sales] upsertSalesRecord: writes should go through SpacetimeDB actions.ts"
  );
  throw new Error("upsertSalesRecord: use SpacetimeDB reducers via actions.ts");
}
