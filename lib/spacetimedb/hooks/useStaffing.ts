"use client";
// SpacetimeDB — staffing, scheduling, availability, and chat

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { usePermissions } from "@/lib/context/permissions";
import type {
  OrgMember, Shift, StaffRole, ShiftPreset,
  StaffAvailability, TimeOffRequest, ShiftTrade, ChatConversation,
} from "@/lib/types";
import type { Permissions } from "@/lib/types";

export function useStaffing(
  _organizationId: string | null,
  _userId: string | null,
  isStaff: boolean
) {
  const { organizationId } = usePermissions();

  const [rawMembers,  membersReady]  = useTable(tables.orgMember);
  const [rawShifts,   shiftsReady]   = useTable(tables.shift);
  const [rawRoles,    rolesReady]    = useTable(tables.staffRole);
  const [rawPresets,  presetsReady]  = useTable(tables.shiftPreset);
  const [rawConvos,   convosReady]   = useTable(tables.chatConversation);
  const [rawAvail,    availReady]    = useTable(tables.staffAvailability);
  const [rawTimeOff,  timeOffReady]  = useTable(tables.timeOffRequest);
  const [rawTrades,   tradesReady]   = useTable(tables.shiftTrade);

  const isReady = membersReady && shiftsReady && rolesReady &&
    presetsReady && convosReady && availReady && timeOffReady && tradesReady;

  const team = useMemo<OrgMember[]>(() => {
    if (!organizationId) return [];
    return rawMembers
      .filter((r) => r.organizationId === organizationId && r.status === "active")
      .map((r) => ({
        id:             r.id.toString(),
        organizationId: r.organizationId,
        userId:         r.userId.toHexString(),
        role:           r.role as OrgMember["role"],
        displayName:    r.displayName,
        email:          r.email,
        // permissions is JSON in SpacetimeDB; parse it safely
        permissions:    (() => {
          try { return JSON.parse(r.permissions) as Permissions; }
          catch { return {} as Permissions; }
        })(),
        status:         r.status as OrgMember["status"],
        punchInCode:    r.punchInCode ?? null,
      }));
  }, [rawMembers, organizationId]);

  const shifts = useMemo<Shift[]>(() => {
    if (!organizationId) return [];
    return rawShifts
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:              r.id.toString(),
        memberId:        r.memberId ?? null,
        staffName:       r.staffName,
        staffRole:       r.staffRole ?? null,
        staffRoles:      (() => {
          try { return JSON.parse(r.staffRoles) as string[]; }
          catch { return r.staffRoles ? [r.staffRoles] : []; }
        })(),
        date:            r.date,
        shiftType:       r.shiftType as Shift["shiftType"],
        startTime:       r.startTime,
        endTime:         r.endTime,
        predictedDemand: r.predictedDemand as Shift["predictedDemand"],
      }));
  }, [rawShifts, organizationId]);

  const roles = useMemo<StaffRole[]>(() => {
    if (!organizationId) return [];
    return rawRoles
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:          r.id.toString(),
        name:        r.name,
        color:       r.color,
        icon:        r.icon,
        description: r.description,
        permissions: (() => {
          try { return JSON.parse(r.permissions); }
          catch { return {}; }
        })(),
      }));
  }, [rawRoles, organizationId]);

  const presets = useMemo<ShiftPreset[]>(() => {
    if (!organizationId) return [];
    return rawPresets
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:             r.id.toString(),
        organizationId: r.organizationId,
        name:           r.name,
        startTime:      r.startTime,
        endTime:        r.endTime,
        color:          r.color,
        sortOrder:      r.sortOrder,
      }));
  }, [rawPresets, organizationId]);

  const chatOptions = useMemo<ChatConversation[]>(() => {
    if (!organizationId) return [];
    return rawConvos
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:             r.id.toString(),
        organizationId: r.organizationId,
        type:           r.type as ChatConversation["type"],
        name:           r.name ?? null,
        createdBy:      r.createdBy ?? null,
        createdAt:      r.createdAt.toDate().toISOString(),
      }));
  }, [rawConvos, organizationId]);

  const allAvailability = useMemo<StaffAvailability[]>(() => {
    if (!organizationId) return [];
    return rawAvail
      .filter((r) => r.organizationId === organizationId)
      .map((row) => ({
        id:             row.id.toString(),
        userId:         row.userId.toHexString(),
        organizationId: row.organizationId,
        type:           row.type as StaffAvailability["type"],
        startDate:      row.startDate ?? null,
        endDate:        row.endDate ?? null,
        days:           (() => {
          try { return JSON.parse(row.days) as boolean[]; }
          catch { return [false, false, false, false, false, false, false]; }
        })(),
        dayTimes:       (() => {
          try { return JSON.parse(row.dayTimes); }
          catch { return []; }
        })(),
        status:         row.status,
        fullDay:        row.fullDay,
        startTime:      row.startTime ?? null,
        endTime:        row.endTime ?? null,
        comments:       row.comments,
      }));
  }, [rawAvail, organizationId]);

  const myAvailability = useMemo<StaffAvailability | null>(() => {
    return allAvailability[0] ?? null;
  }, [allAvailability]);

  const myTimeOffRequests = useMemo<TimeOffRequest[]>(() => {
    if (!organizationId) return [];
    return rawTimeOff
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:             r.id.toString(),
        userId:         r.userId.toHexString(),
        organizationId: r.organizationId,
        startDate:      r.startDate,
        endDate:        r.endDate,
        fullDays:       r.fullDays,
        startTime:      r.startTime ?? null,
        endTime:        r.endTime ?? null,
        comments:       r.comments,
        status:         r.status as TimeOffRequest["status"],
        reviewedBy:     r.reviewedBy ?? null,
        reviewedAt:     r.reviewedAt ? r.reviewedAt.toDate().toISOString() : null,
      }));
  }, [rawTimeOff, organizationId]);

  const orgTimeOffRequests = myTimeOffRequests;

  const orgShiftTrades = useMemo<ShiftTrade[]>(() => {
    if (!organizationId) return [];
    return rawTrades
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id:              r.id.toString(),
        organizationId:  r.organizationId,
        shiftId:         r.shiftId,
        requesterId:     r.requesterId,
        broadcastToAll:  r.broadcastToAll ?? false,
        targetId:        r.targetId || null,
        acceptedById:    r.acceptedById ?? null,
        targetShiftId:   r.targetShiftId ?? null,
        type:            r.type as ShiftTrade["type"],
        status:          r.status as ShiftTrade["status"],
        managerApproved: r.managerApproved,
        managerId:       r.managerId ?? null,
        comments:        r.comments,
        createdAt:       (r as Record<string, unknown>).createdAt ? String((r as Record<string, unknown>).createdAt) : new Date().toISOString(),
      }));
  }, [rawTrades, organizationId]);

  return {
    team,
    shifts,
    roles,
    presets,
    chatOptions,
    allAvailability,
    myAvailability,
    myTimeOffRequests,
    orgTimeOffRequests,
    orgShiftTrades,
    loading:    !isReady,
    refreshing: false,
    // setters are no-ops — mutations via SpacetimeDB reducers; typed for page compatibility
    setTeam:               ((_v: SetStateAction<OrgMember[]>) => {}) as Dispatch<SetStateAction<OrgMember[]>>,
    setShifts:             ((_v: SetStateAction<Shift[]>) => {}) as Dispatch<SetStateAction<Shift[]>>,
    setRoles:              ((_v: SetStateAction<StaffRole[]>) => {}) as Dispatch<SetStateAction<StaffRole[]>>,
    setPresets:            ((_v: SetStateAction<ShiftPreset[]>) => {}) as Dispatch<SetStateAction<ShiftPreset[]>>,
    setChatOptions:        ((_v: SetStateAction<ChatConversation[]>) => {}) as Dispatch<SetStateAction<ChatConversation[]>>,
    setMyAvailability:     ((_v: SetStateAction<StaffAvailability[]>) => {}) as Dispatch<SetStateAction<StaffAvailability[]>>,
    setMyTimeOffRequests:  ((_v: SetStateAction<TimeOffRequest[]>) => {}) as Dispatch<SetStateAction<TimeOffRequest[]>>,
    setOrgTimeOffRequests: ((_v: SetStateAction<TimeOffRequest[]>) => {}) as Dispatch<SetStateAction<TimeOffRequest[]>>,
    setOrgShiftTrades:     ((_v: SetStateAction<ShiftTrade[]>) => {}) as Dispatch<SetStateAction<ShiftTrade[]>>,
    refresh:               () => {},
  };
}
