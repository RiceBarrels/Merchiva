/**
 * Pure builder for the morning-briefing AI context.
 *
 * Shared by the client (components/morning-briefing-card.tsx, from live
 * subscription rows) and the cron route (app/api/cron/morning-briefing,
 * from a server-side service connection). Both sources expose the same
 * camelCase SpacetimeDB row fields, so the logic lives here once.
 */

export interface BriefingContext {
  date: string;
  team: { name: string; role: string }[];
  inventory: {
    name: string;
    category: string;
    stock: number;
    min: number;
    unit: string;
  }[];
  todayShifts: { name: string; start: string; end: string; type: string }[];
  pendingTimeOff: number;
  pendingShiftTrades: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BriefingRows {
  staffMembers: any[];
  inventoryItems: any[];
  shifts: any[];
  timeOff: any[];
  shiftTrades: any[];
}

export function buildBriefingContext(
  rows: BriefingRows,
  organizationId: string,
  today: string,
): BriefingContext {
  const team = rows.staffMembers.filter(
    (m: any) => m.organizationId === organizationId,
  );
  const inv = rows.inventoryItems
    .filter((i: any) => i.organizationId === organizationId)
    .map((i: any) => ({
      name: i.name,
      category: i.category,
      stock: i.currentStock,
      min: i.minStock,
      unit: i.unit,
    }));
  const todayShifts = rows.shifts.filter(
    (s: any) => s.organizationId === organizationId && s.date === today,
  );
  const pendingTimeOff = rows.timeOff.filter(
    (r: any) => r.organizationId === organizationId && r.status === "pending",
  );
  const pendingTrades = rows.shiftTrades.filter(
    (r: any) => r.organizationId === organizationId && r.status === "pending",
  );

  return {
    date: today,
    team: team.map((m: any) => ({ name: m.name, role: m.role })),
    inventory: inv,
    todayShifts: todayShifts.map((s: any) => ({
      name: s.staffName,
      start: s.startTime,
      end: s.endTime,
      type: s.shiftType,
    })),
    pendingTimeOff: pendingTimeOff.length,
    pendingShiftTrades: pendingTrades.length,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
