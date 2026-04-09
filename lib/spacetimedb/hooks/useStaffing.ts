"use client";
// SpacetimeDB migration layer — staffing
// TODO: replace internals with useTable calls on tables.shift, tables.staffRole, etc.

import { useState, useEffect, useCallback } from "react";
import { getTeamForScheduling, getShifts, getStaffRoles } from "@/lib/db/staffing";
import { getConversations } from "@/lib/db/chat";
import { getShiftPresets } from "@/lib/db/shift-presets";
import {
  getMyAvailability,
  getTimeOffRequests,
  getOrgTimeOffRequests,
  getOrgShiftTrades,
} from "@/lib/db/availability";
import { getCached, setCache } from "@/lib/cache";
import type {
  OrgMember, Shift, StaffRole, ShiftPreset,
  StaffAvailability, TimeOffRequest, ShiftTrade,
} from "@/lib/types";
import type { ChatConversation } from "@/lib/types";

type StaffCache = {
  team: OrgMember[];
  shifts: Shift[];
  roles: StaffRole[];
  conversations: ChatConversation[];
  presets: ShiftPreset[];
};

export function useStaffing(
  organizationId: string | null,
  userId: string | null,
  isStaff: boolean
) {
  const cacheKey = organizationId && userId ? `staffing_${organizationId}_${userId}` : null;
  const cached = cacheKey ? getCached<StaffCache>(cacheKey) : null;

  const [team,    setTeam]    = useState<OrgMember[]>(cached?.team ?? []);
  const [shifts,  setShifts]  = useState<Shift[]>(cached?.shifts ?? []);
  const [roles,   setRoles]   = useState<StaffRole[]>(cached?.roles ?? []);
  const [presets, setPresets] = useState<ShiftPreset[]>(cached?.presets ?? []);
  const [chatOptions, setChatOptions] = useState<ChatConversation[]>(cached?.conversations ?? []);
  const [myAvailability, setMyAvailability] = useState<StaffAvailability | null>(null);
  const [myTimeOffRequests, setMyTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [orgTimeOffRequests, setOrgTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [orgShiftTrades, setOrgShiftTrades] = useState<ShiftTrade[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    if (!organizationId || !userId) return;

    if (!loading) setRefreshing(true);

    const promises: Promise<unknown>[] = [
      getTeamForScheduling(organizationId),
      getShifts(4),
      getStaffRoles(),
      getConversations(organizationId),
      getShiftPresets(organizationId),
      getMyAvailability(userId, organizationId),
      getTimeOffRequests(userId, organizationId),
    ];
    if (!isStaff) {
      promises.push(getOrgTimeOffRequests(organizationId));
      promises.push(getOrgShiftTrades(organizationId));
    }

    Promise.all(promises)
      .then((results) => {
        const t = results[0] as OrgMember[];
        const s = results[1] as Shift[];
        const r = results[2] as StaffRole[];
        const c = results[3] as ChatConversation[];
        const p = results[4] as ShiftPreset[];
        setTeam(t);
        setShifts(s);
        setRoles(r);
        setChatOptions(c);
        setPresets(p);
        setMyAvailability(results[5] as StaffAvailability | null);
        setMyTimeOffRequests(results[6] as TimeOffRequest[]);
        if (!isStaff) {
          setOrgTimeOffRequests(results[7] as TimeOffRequest[]);
          setOrgShiftTrades(results[8] as ShiftTrade[]);
        }
        if (cacheKey) setCache(cacheKey, { team: t, shifts: s, roles: r, conversations: c, presets: p });
      })
      .catch((err) => console.error("[useStaffing]", err))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [organizationId, userId, isStaff, cacheKey, loading]);

  useEffect(() => {
    if (!organizationId || !userId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, userId, isStaff]);

  return {
    team, setTeam,
    shifts, setShifts,
    roles, setRoles,
    presets, setPresets,
    chatOptions, setChatOptions,
    myAvailability, setMyAvailability,
    myTimeOffRequests, setMyTimeOffRequests,
    orgTimeOffRequests, setOrgTimeOffRequests,
    orgShiftTrades, setOrgShiftTrades,
    loading, refreshing,
    refresh,
  } as const;
}
