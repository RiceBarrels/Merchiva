"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  GraduationCap,
  Inbox,
  Shield,
  Users,
} from "lucide-react";
import { PermissionGuard } from "@/components/permission-guard";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import {
  useOrgMembers,
  useShiftTrades,
  useTimeOffRequests,
} from "@/lib/spacetimedb/hooks";
import { cn } from "@/lib/utils";
import {
  TrainingRoleSwitcher,
  type TrainingRole,
} from "@/components/training/role-switcher";
import { TrainingManagerView } from "@/components/training/manager-view";
import { TrainingTrainerView } from "@/components/training/trainer-view";
import { TrainingInternView } from "@/components/training/intern-view";
import { StaffingFull } from "@/components/personnel/staffing-full";
import {
  MobileSchedule,
  MobileTeam,
  MobileRoles,
  MobileRequestsSheet,
} from "@/components/personnel/mobile";
import { OrgPanel } from "@/components/personnel/team";
import { useSpacetimeDB } from "spacetimedb/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type PersonnelTab = "schedule" | "team" | "roles" | "training";

const TAB_STORAGE_KEY = "bz_personnel_tab";
const TRAINING_ROLE_STORAGE_KEY = "bz_personnel_training_role";

// ─── Top tab bar ─────────────────────────────────────────────────────────────

interface TopTab {
  id: PersonnelTab;
  i18nKey: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TABS: TopTab[] = [
  { id: "schedule", i18nKey: "schedule", icon: CalendarClock },
  { id: "team",     i18nKey: "team",     icon: Users },
  { id: "roles",    i18nKey: "roles",    icon: Shield },
  { id: "training", i18nKey: "training", icon: GraduationCap },
];

function TopTabs({
  tab,
  onChange,
  pendingRequests,
}: {
  tab: PersonnelTab;
  onChange: (t: PersonnelTab) => void;
  pendingRequests: number;
}) {
  const t = useT();
  return (
    <>
      {/* Mobile — horizontally scrollable pill tabs */}
      <div className="md:hidden border-b border-border bg-background shrink-0">
        <div className="flex gap-1.5 px-3.5 py-2.5 overflow-x-auto no-scrollbar">
          {TABS.map((tab2) => {
            const active = tab2.id === tab;
            const Icon = tab2.icon;
            const label = t(`personnel.tabs.${tab2.i18nKey}`);
            return (
              <button
                key={tab2.id}
                type="button"
                onClick={() => onChange(tab2.id)}
                className={cn(
                  "h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-[13px] transition-colors shrink-0 whitespace-nowrap",
                  active
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "bg-background text-stone-700 dark:text-stone-200 border-border font-medium hover:bg-muted",
                )}
              >
                <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
                {label}
                {tab2.id === "schedule" && pendingRequests > 0 && (
                  <span
                    className={cn(
                      "ml-1 min-w-[16px] h-[16px] px-1 rounded-full font-mono font-bold text-[9.5px] tabular-nums inline-flex items-center justify-center",
                      active
                        ? "bg-background/20 text-background"
                        : "bg-amber-500 text-white",
                    )}
                  >
                    {pendingRequests}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop — card-style segmented tabs */}
      <div className="hidden md:flex border-b border-border bg-background items-stretch shrink-0">
        <div className="flex-1 flex overflow-x-auto">
          {TABS.map((tab2) => {
            const active = tab2.id === tab;
            const Icon = tab2.icon;
            const label = t(`personnel.tabs.${tab2.i18nKey}`);
            const sub = t(`personnel.tabs.${tab2.i18nKey}Sub`);
            return (
              <button
                key={tab2.id}
                type="button"
                onClick={() => onChange(tab2.id)}
                className={cn(
                  "flex-1 min-w-[170px] flex items-center gap-2.5 px-3 md:px-5 py-2.5 transition-colors border-r border-border last:border-r-0 relative",
                  active ? "bg-muted/50" : "bg-background hover:bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "w-8 h-8 rounded-[0.3rem] inline-flex items-center justify-center shrink-0",
                    active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} />
                </span>
                <div className="text-left min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "text-[13.5px] font-semibold tracking-[-0.01em]",
                        active ? "text-foreground" : "text-stone-700 dark:text-stone-200",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px] truncate hidden md:block",
                      active ? "text-muted-foreground" : "text-muted-foreground/80",
                    )}
                  >
                    {sub}
                  </div>
                </div>
                {tab2.id === "schedule" && pendingRequests > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold inline-flex items-center justify-center">
                    {pendingRequests}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Training panel ──────────────────────────────────────────────────────────

function TrainingPanel({
  orgId,
  myMemberId,
  canManage,
  canGrade,
}: {
  orgId: string;
  myMemberId: string | null;
  canManage: boolean;
  canGrade: boolean;
}) {
  const [role, setRole] = useState<TrainingRole>(() => {
    if (typeof window === "undefined") return "intern";
    try {
      const stored = window.localStorage.getItem(
        TRAINING_ROLE_STORAGE_KEY,
      ) as TrainingRole | null;
      if (stored === "manager" || stored === "trainer" || stored === "intern") return stored;
    } catch {}
    return "intern";
  });

  const effectiveRole: TrainingRole = useMemo(() => {
    if (role === "manager" && !canManage) return canGrade ? "trainer" : "intern";
    if (role === "trainer" && !canGrade) return "intern";
    return role;
  }, [role, canManage, canGrade]);

  const handleRoleChange = (next: TrainingRole) => {
    setRole(next);
    try {
      window.localStorage.setItem(TRAINING_ROLE_STORAGE_KEY, next);
    } catch {}
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <TrainingRoleSwitcher
        role={effectiveRole}
        onChange={handleRoleChange}
        canManage={canManage}
        canGrade={canGrade}
      />
      {effectiveRole === "manager" ? (
        <TrainingManagerView orgId={orgId} />
      ) : effectiveRole === "trainer" ? (
        <TrainingTrainerView orgId={orgId} />
      ) : (
        <TrainingInternView orgId={orgId} userId={myMemberId} />
      )}
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function PersonnelPage() {
  const t = useT();
  const { organizationId, isOwner, role: orgRole, can } = usePermissions();
  const stdb = useSpacetimeDB();
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];

  const canManage = isOwner || orgRole === "manager";
  const canGrade = canManage || can("training_grading", "edit");

  const [tab, setTab] = useState<PersonnelTab>(() => {
    if (typeof window === "undefined") return "schedule";
    try {
      const stored = window.localStorage.getItem(TAB_STORAGE_KEY) as
        | PersonnelTab
        | null;
      if (
        stored === "schedule" ||
        stored === "team" ||
        stored === "roles" ||
        stored === "training"
      ) {
        return stored;
      }
    } catch {}
    return "schedule";
  });

  const handleTabChange = (next: PersonnelTab) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {}
  };

  // Bottom-sheet for time-off + trade requests on mobile.
  const [requestsOpen, setRequestsOpen] = useState(false);

  // Pending count for the schedule tab badge.
  const [rawTimeOff] = useTimeOffRequests() as [unknown[], boolean];
  const [rawTrades] = useShiftTrades() as [unknown[], boolean];
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

  return (
    <PermissionGuard section="staffing">
      <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
        <div className="px-4 lg:px-6 py-3 border-b border-border bg-background flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold tracking-[-0.01em]">
              {t("personnel.title")}
            </h1>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {t("personnel.subtitle")}
            </div>
          </div>
          {/* Mobile-only inbox button — opens the requests bottom sheet */}
          <button
            type="button"
            onClick={() => setRequestsOpen(true)}
            className="md:hidden relative h-9 w-9 rounded-[0.3rem] border border-border bg-background inline-flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"
            aria-label="Pending requests"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.75} />
            {pending > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-mono font-bold inline-flex items-center justify-center border-[1.5px] border-background">
                {pending}
              </span>
            )}
          </button>
        </div>

        <TopTabs tab={tab} onChange={handleTabChange} pendingRequests={pending} />

        {organizationId ? (
          <>
            {/* Mobile content — dedicated layouts matching the 人员管理 Mobile design */}
            <div className="md:hidden flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {tab === "schedule" ? (
                <MobileSchedule
                  orgId={organizationId}
                  myMemberId={myMemberId}
                  onOpenRequests={() => setRequestsOpen(true)}
                />
              ) : tab === "team" ? (
                <MobileTeam orgId={organizationId} />
              ) : tab === "roles" ? (
                <MobileRoles orgId={organizationId} />
              ) : (
                <TrainingPanel
                  orgId={organizationId}
                  myMemberId={myMemberId}
                  canManage={canManage}
                  canGrade={canGrade}
                />
              )}
            </div>

            {/* Desktop content */}
            <div className="hidden md:flex md:flex-col md:flex-1 min-h-0 overflow-hidden">
              {tab === "schedule" ? (
                <StaffingFull subtabs={["schedule", "myShifts"]} />
              ) : tab === "team" ? (
                <OrgPanel orgId={organizationId} />
              ) : tab === "roles" ? (
                <StaffingFull subtabs={["roles"]} />
              ) : (
                <TrainingPanel
                  orgId={organizationId}
                  myMemberId={myMemberId}
                  canManage={canManage}
                  canGrade={canGrade}
                />
              )}
            </div>

            <MobileRequestsSheet
              open={requestsOpen}
              onClose={() => setRequestsOpen(false)}
              orgId={organizationId}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
