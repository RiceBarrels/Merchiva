"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePermissions } from "@/lib/context/permissions";
import {
  useOrgMembers,
  useShiftTrades,
  useTimeOffRequests,
} from "@/lib/spacetimedb/hooks";
import { useSpacetimeDB } from "spacetimedb/react";
import { MobileRequestsSheet } from "@/components/personnel/mobile";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PersonnelHub {
  /** Active organization id, or null while the connection is still loading. */
  organizationId: string | null;
  /** The current user's org_member row id, or null. */
  myMemberId: string | null;
  /** Pending time-off + trade requests for the schedule badge. */
  pending: number;
  /** Whether the user can manage training (owner/manager). */
  canManage: boolean;
  /** Whether the user can grade training. */
  canGrade: boolean;
  /** Opens the mobile time-off / trade requests bottom sheet. */
  openRequests: () => void;
}

const PersonnelHubContext = createContext<PersonnelHub | null>(null);

export function usePersonnelHub(): PersonnelHub {
  const ctx = useContext(PersonnelHubContext);
  if (!ctx) {
    throw new Error("usePersonnelHub must be used within <PersonnelHubProvider>");
  }
  return ctx;
}

export function PersonnelHubProvider({ children }: { children: ReactNode }) {
  const { organizationId, isOwner, role: orgRole, can } = usePermissions();
  const stdb = useSpacetimeDB();
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];

  const [requestsOpen, setRequestsOpen] = useState(false);

  const canManage = isOwner || orgRole === "manager";
  const canGrade = canManage || can("training_grading", "edit");

  const pending = useMemo(() => {
    if (!organizationId) return 0;
    const to = (rawTimeOff as any[]).filter(
      (r) => r.organizationId === organizationId && r.status === "pending",
    ).length;
    const tr = (rawTrades as any[]).filter(
      (r) => r.organizationId === organizationId && r.status === "pending",
    ).length;
    return to + tr;
  }, [rawTimeOff, rawTrades, organizationId]);

  const myMemberId = useMemo<string | null>(() => {
    const identity = stdb?.identity;
    if (!identity || !organizationId) return null;
    const match = (rawMembers as any[]).find(
      (m) =>
        m.userId?.toString?.() === identity.toString() &&
        m.organizationId === organizationId &&
        m.status === "active",
    );
    return match ? match.id.toString() : null;
  }, [rawMembers, stdb, organizationId]);

  const value = useMemo<PersonnelHub>(
    () => ({
      organizationId: organizationId ?? null,
      myMemberId,
      pending,
      canManage,
      canGrade,
      openRequests: () => setRequestsOpen(true),
    }),
    [organizationId, myMemberId, pending, canManage, canGrade],
  );

  return (
    <PersonnelHubContext.Provider value={value}>
      {children}
      {organizationId && (
        <MobileRequestsSheet
          open={requestsOpen}
          onClose={() => setRequestsOpen(false)}
          orgId={organizationId}
        />
      )}
    </PersonnelHubContext.Provider>
  );
}
