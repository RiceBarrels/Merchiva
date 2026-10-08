"use client";

// The store rows Mr. Merchiva's cards resolve ids against (lib/merchiva/ref-labels.ts),
// scoped to the active org. One index for the whole chat: every card, toast
// and gate check names a row the same way.

import { useMemo } from "react";
import {
  useCoupons,
  useInventoryItems,
  useOrgMembers,
  useRoleTasks,
  useShiftTrades,
  useShifts,
  useStaffMembers,
  useStaffRoles,
  useSuppliers,
  useTimeOffRequests,
  useTrainingDays,
  useTrainingObjectives,
} from "@/lib/spacetimedb/hooks";
import { RefIndex } from "@/lib/merchiva/ref-labels";
import { idHex } from "@/lib/merchiva/tools/rows";

type Row = { id?: unknown } & Record<string, unknown>;

function orgRows(result: unknown, organizationId: string | null): Row[] {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? (result[0] as unknown[]) : [];
  if (!organizationId) return [];
  return rows.filter(
    (r): r is Row => !!r && typeof r === "object" && (r as Row).organizationId === organizationId,
  );
}

/** Identity columns decode to objects; labels compare them as hex strings. */
function withUserHex(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r, userId: idHex(r.userId) }));
}

export function useRefIndex(organizationId: string | null): RefIndex {
  const members = useOrgMembers() as unknown;
  const placeholders = useStaffMembers() as unknown;
  const shifts = useShifts() as unknown;
  const timeOff = useTimeOffRequests() as unknown;
  const trades = useShiftTrades() as unknown;
  const roles = useStaffRoles() as unknown;
  const tasks = useRoleTasks() as unknown;
  const trainingDays = useTrainingDays() as unknown;
  const objectives = useTrainingObjectives() as unknown;
  const items = useInventoryItems() as unknown;
  const suppliers = useSuppliers() as unknown;
  const coupons = useCoupons() as unknown;

  return useMemo(
    () =>
      new RefIndex({
        members: withUserHex(orgRows(members, organizationId)),
        placeholders: orgRows(placeholders, organizationId),
        shifts: orgRows(shifts, organizationId),
        timeOff: withUserHex(orgRows(timeOff, organizationId)),
        trades: orgRows(trades, organizationId),
        roles: orgRows(roles, organizationId),
        tasks: orgRows(tasks, organizationId),
        trainingDays: orgRows(trainingDays, organizationId),
        objectives: orgRows(objectives, organizationId),
        items: orgRows(items, organizationId),
        suppliers: orgRows(suppliers, organizationId),
        coupons: orgRows(coupons, organizationId),
      }),
    [organizationId, members, placeholders, shifts, timeOff, trades, roles, tasks, trainingDays, objectives, items, suppliers, coupons],
  );
}
