"use client";

// Derives who is currently punched in from the punch_event + org_member tables
// (the same derivation the old punch-in terminal used).

import { useCallback, useMemo } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { useT } from "@/lib/i18n/context";
import { initialsOf } from "./time";
import type { OnShiftEntry } from "./types";

export interface UseOnShiftResult {
  entries: OnShiftEntry[];     // sorted by since ascending
  ready: boolean;
  /** Entry for one member, or null when off shift. */
  forMember: (memberId: string) => OnShiftEntry | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventTime(v: any): Date {
  if (!v) return new Date(0);
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.microsSinceUnixEpoch === "bigint") return new Date(Number(v.microsSinceUnixEpoch / 1000n));
  return new Date(v);
}

export function useOnShift(organizationId: string): UseOnShiftResult {
  const t = useT();
  const [punchRows, punchReady] = useTable(tables.punchEvent);
  const [memberRows, membersReady] = useTable(tables.orgMember);

  const entries = useMemo<OnShiftEntry[]>(() => {
    if (!organizationId) return [];
    const orgEvents = punchRows.filter((e) => e.organizationId === organizationId);
    const openIns = orgEvents.filter((e) => e.action === "in" && !e.closed);
    const out = openIns.map<OnShiftEntry>((inEv) => {
      const member = memberRows.find((m) => m.id.toString() === inEv.memberId);
      const onBreak = orgEvents.some((e) => e.memberId === inEv.memberId && e.action === "break-start" && !e.closed);
      const name = member?.displayName ?? t("device.unknownSender");
      const role = member?.role ?? "staff";
      const roleLabel =
        role === "owner" ? t("device.roleOwner") : role === "manager" ? t("device.roleManager") : t("device.roleStaff");
      return {
        memberId: inEv.memberId,
        name,
        initials: initialsOf(name),
        roleLabel,
        since: eventTime(inEv.at),
        onBreak,
      };
    });
    out.sort((a, b) => a.since.getTime() - b.since.getTime());
    return out;
  }, [punchRows, memberRows, organizationId, t]);

  const forMember = useCallback(
    (memberId: string) => entries.find((e) => e.memberId === memberId) ?? null,
    [entries],
  );

  return { entries, ready: punchReady && membersReady, forMember };
}
