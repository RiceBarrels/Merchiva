"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Award,
  Cake,
  CalendarClock,
  Check,
  Download,
  FileText,
  GraduationCap,
  Inbox,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  Shield,
  Trash2,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import {
  removeMember,
} from "@/lib/spacetimedb/actions";
import { defaultPermissions } from "@/lib/db/team";
import type { Permissions } from "@/lib/types";
import {
  InviteMemberDialog,
  EditMemberDialog,
  resendInviteEmail,
  cancelPendingInvite,
  type EditMemberInput,
} from "@/components/personnel/team-dialogs";
import { PermissionGuard } from "@/components/permission-guard";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import {
  useOrgInvitations,
  useOrgMembers,
  useShiftTrades,
  useStaffRoles,
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
import { useSpacetimeDB } from "spacetimedb/react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type PersonnelTab = "schedule" | "team" | "roles" | "training";

const TAB_STORAGE_KEY = "bz_personnel_tab";
const TRAINING_ROLE_STORAGE_KEY = "bz_personnel_training_role";

// ─── Top tab bar ─────────────────────────────────────────────────────────────

interface TopTab {
  id: PersonnelTab;
  cn: string;
  en: string;
  sub: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const TABS: TopTab[] = [
  { id: "schedule", cn: "排班",     en: "Schedule",  sub: "本周班次 · 时间表",   icon: CalendarClock },
  { id: "team",     cn: "员工",     en: "Team",      sub: "团队成员 · 联系方式", icon: Users },
  { id: "roles",    cn: "角色任务", en: "Roles",     sub: "岗位职责 · 任务清单", icon: Shield },
  { id: "training", cn: "培训",     en: "Training",  sub: "课程 · 进度 · 考核",  icon: GraduationCap },
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
  return (
    <>
      {/* Mobile — horizontally scrollable pill tabs */}
      <div className="md:hidden border-b border-border bg-background shrink-0">
        <div className="flex gap-1.5 px-3.5 py-2.5 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className={cn(
                  "h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-[13px] transition-colors shrink-0 whitespace-nowrap",
                  active
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "bg-background text-stone-700 dark:text-stone-200 border-border font-medium hover:bg-muted",
                )}
              >
                <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
                {t.cn}
                <span
                  className={cn(
                    "text-[10.5px] ml-0.5",
                    active ? "text-background/60" : "text-muted-foreground/70",
                  )}
                >
                  {t.en}
                </span>
                {t.id === "schedule" && pendingRequests > 0 && (
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
          {TABS.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
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
                      {t.cn}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground/80 hidden sm:inline">
                      {t.en}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "text-[11px] truncate hidden md:block",
                      active ? "text-muted-foreground" : "text-muted-foreground/80",
                    )}
                  >
                    {t.sub}
                  </div>
                </div>
                {t.id === "schedule" && pendingRequests > 0 && (
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function avatarBg(name: string): string {
  const palette = [
    "bg-cyan-100 text-cyan-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800",
    "bg-amber-100 text-amber-800",
    "bg-emerald-100 text-emerald-800",
    "bg-sky-100 text-sky-800",
    "bg-fuchsia-100 text-fuchsia-800",
    "bg-lime-100 text-lime-800",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className={cn(
        "rounded-full inline-flex items-center justify-center font-semibold shrink-0",
        avatarBg(name),
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
    >
      {initials(name)}
    </span>
  );
}

function Pill({
  tone = "stone",
  children,
}: {
  tone?: "stone" | "emerald" | "amber" | "rose" | "dark";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    stone: "bg-muted text-muted-foreground border-border",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50",
    amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50",
    rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50",
    dark: "bg-foreground text-background border-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[0.3rem] border text-[10px] font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}


// ─── Team panel ──────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  punchInCode: string | null;
  userId: string;
}

interface RoleRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

function TeamPanel({ orgId }: { orgId: string }) {
  const { currentOrg, can } = usePermissions();
  const orgName = currentOrg?.name ?? null;
  // userEmail is used by resend helper, pulled directly there from useAuth.
  const canEditTeam = can("team", "edit");
  const canInviteTeam = can("team", "invite");

  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [unknown[], boolean];
  const [rawInvitations] = useOrgInvitations() as [unknown[], boolean];

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EditMemberInput | null>(null);

  // Action menu / confirms keyed by member or invitation id.
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Resend feedback per-invitation (id → state)
  const [resending, setResending] = useState<Record<string, boolean>>({});

  const members = useMemo<MemberRow[]>(
    () =>
      (rawMembers as any[])
        .filter((m) => m.organizationId === orgId)
        .map((m) => ({
          id: m.id?.toString?.() ?? String(m.id),
          displayName: String(m.displayName ?? "—"),
          email: String(m.email ?? ""),
          role: String(m.role ?? "staff"),
          status: String(m.status ?? "active"),
          punchInCode: m.punchInCode ?? null,
          userId: m.userId?.toString?.() ?? "",
        })),
    [rawMembers, orgId],
  );

  const roles = useMemo<RoleRow[]>(
    () =>
      (rawRoles as any[])
        .filter((r) => r.organizationId === orgId)
        .map((r) => ({
          id: r.id?.toString?.() ?? String(r.id),
          name: String(r.name ?? ""),
          color: String(r.color ?? "#44403c"),
          icon: String(r.icon ?? "user"),
          description: String(r.description ?? ""),
        })),
    [rawRoles, orgId],
  );

  const pendingInvitations = useMemo(
    () =>
      (rawInvitations as any[]).filter(
        (i) => i.organizationId === orgId && !i.acceptedAt,
      ),
    [rawInvitations, orgId],
  );

  const [filter, setFilter] = useState<"all" | "active" | "invited">("all");
  const [q, setQ] = useState("");

  const activeMembers = members.filter((m) => m.status === "active");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (filter === "invited") {
      const invited = pendingInvitations
        .filter((i: any) => {
          if (!needle) return true;
          return (
            String(i.email ?? "").toLowerCase().includes(needle) ||
            String(i.role ?? "").toLowerCase().includes(needle)
          );
        })
        .map((i: any) => ({
          id: `inv-${i.id?.toString?.() ?? i.id}`,
          displayName: String(i.email ?? "—").split("@")[0],
          email: String(i.email ?? ""),
          role: String(i.role ?? "staff"),
          status: "invited",
          punchInCode: null,
          userId: "",
        }));
      return invited;
    }
    return members.filter((m) => {
      if (filter === "active" && m.status !== "active") return false;
      if (!needle) return true;
      return (
        m.displayName.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        m.role.toLowerCase().includes(needle)
      );
    });
  }, [filter, q, members, pendingInvitations]);

  const counts = {
    all: members.length,
    active: activeMembers.length,
    invited: pendingInvitations.length,
  };

  const byRole = roles.map((r) => ({
    ...r,
    members: activeMembers.filter((m) =>
      m.role.toLowerCase().includes(r.name.toLowerCase()),
    ).length,
  }));

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openEditMember(m: MemberRow) {
    const raw = (rawMembers as Array<{ id: { toString(): string }; role: string; permissions: unknown }>)
      .find((x) => (x.id?.toString?.() ?? String(x.id)) === m.id);
    let parsed: Permissions = defaultPermissions();
    const rawPerms = raw?.permissions;
    if (typeof rawPerms === "string") {
      try { parsed = { ...parsed, ...(JSON.parse(rawPerms) as Partial<Permissions>) }; } catch {}
    } else if (rawPerms && typeof rawPerms === "object") {
      parsed = { ...parsed, ...(rawPerms as Partial<Permissions>) };
    }
    const role = String(raw?.role ?? m.role).toLowerCase();
    setEditingMember({
      id: m.id,
      displayName: m.displayName,
      email: m.email,
      role: role === "manager" ? "manager" : "staff",
      perms: parsed,
    });
  }

  async function handleRemoveMember(id: string, name: string) {
    if (!confirm(`确认移除 ${name}？`)) return;
    setRemovingId(id);
    try {
      await removeMember(id);
      toast.success("已移除成员");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除失败");
    } finally {
      setRemovingId(null);
      setMenuOpen(null);
    }
  }

  async function handleResendInvite(inv: { id: string; email: string; token: string; role: string }) {
    setResending((prev) => ({ ...prev, [inv.id]: true }));
    const userEmail = (typeof window !== "undefined" ? localStorage.getItem("workos_user") : null);
    let inviterEmail: string | null = null;
    try { inviterEmail = userEmail ? JSON.parse(userEmail).email ?? null : null; } catch {}
    const ok = await resendInviteEmail({
      email: inv.email, token: inv.token, role: inv.role,
      orgName, inviterEmail,
    });
    if (ok) toast.success("邀请邮件已重发");
    else toast.error("邮件发送失败");
    setResending((prev) => ({ ...prev, [inv.id]: false }));
    setMenuOpen(null);
  }

  async function handleCancelInvite(id: string, email: string) {
    if (!confirm(`撤回对 ${email} 的邀请？`)) return;
    setRemovingId(id);
    const ok = await cancelPendingInvite(id);
    if (ok) toast.success("已撤回邀请");
    setRemovingId(null);
    setMenuOpen(null);
  }

  // Close action menus when clicking outside
  const menuContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 lg:px-6 pt-5 pb-4 bg-background border-b border-border flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
            员工 · Team
          </h2>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {counts.active} 在职 · {counts.invited} 待入职 · 共 {counts.all} 人
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-muted-foreground"
              strokeWidth={1.75}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名或邮箱…"
              className="h-8 pl-7 pr-3 text-[12.5px] border border-border rounded-[0.3rem] bg-background w-[220px] outline-none focus:border-stone-400"
            />
          </div>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            options={[
              { value: "all", label: `全部 ${counts.all}` },
              { value: "active", label: `在职 ${counts.active}` },
              { value: "invited", label: `待入职 ${counts.invited}` },
            ]}
          />
          <Link
            href="/~/settings"
            className="h-8 px-3 rounded-[0.3rem] border border-border bg-background text-[12px] font-medium text-stone-700 dark:text-stone-200 hover:bg-muted inline-flex items-center gap-1.5"
          >
            <Download className="h-3 w-3" strokeWidth={1.75} /> 导出
          </Link>
          {canInviteTeam && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="h-8 px-3 rounded-[0.3rem] bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 inline-flex items-center gap-1.5"
            >
              <UserPlus className="h-3 w-3" strokeWidth={1.75} /> 邀请成员
            </button>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-6 py-5 grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="bg-background border border-border rounded-[0.3rem] overflow-hidden">
          <div className="grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_60px] gap-3 items-center px-4 py-2.5 bg-muted/40 border-b border-border text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold">
            <div />
            <div>姓名 · Name</div>
            <div>岗位 · Role</div>
            <div>联系方式</div>
            <div>状态</div>
            <div />
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-14 text-center text-[12.5px] text-muted-foreground">
              没有符合条件的成员
            </div>
          ) : (
            list.map((m, i) => {
              const role = roles.find((r) =>
                m.role.toLowerCase().includes(r.name.toLowerCase()),
              );
              return (
                <div
                  key={m.id}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_60px] gap-3 items-center px-4 py-2.5 hover:bg-muted/40",
                    i < list.length - 1 && "border-b border-border",
                  )}
                >
                  <Avatar name={m.displayName} size={30} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {m.displayName}
                    </div>
                    {m.punchInCode && (
                      <div className="text-[11px] text-muted-foreground font-mono">
                        #{m.punchInCode}
                      </div>
                    )}
                  </div>
                  <div className="text-[12.5px] text-stone-700 dark:text-stone-200 truncate flex items-center gap-1.5">
                    {role && (
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ background: role.color }}
                      />
                    )}
                    {m.role}
                  </div>
                  <div className="text-[12px] text-muted-foreground truncate font-mono">
                    {m.email}
                  </div>
                  <Pill tone={m.status === "active" ? "emerald" : "amber"}>
                    {m.status === "active" ? "在职" : "待入职"}
                  </Pill>
                  <div className="flex items-center justify-end gap-0.5 relative">
                    {m.status === "invited" ? (
                      <>
                        {/* Pending invite — id is "inv-<uuid>" */}
                        {(() => {
                          const invId = m.id.replace(/^inv-/, "");
                          const inv = (pendingInvitations as Array<{ id: { toString(): string }; email: string; token: string; role: string }>)
                            .find((i) => i.id?.toString?.() === invId);
                          const isResending = !!resending[invId];
                          const isRemoving = removingId === invId;
                          return (
                            <>
                              <button
                                type="button"
                                disabled={!inv || isResending}
                                title="重发邀请邮件"
                                onClick={() => inv && handleResendInvite({
                                  id: invId, email: inv.email, token: inv.token, role: inv.role,
                                })}
                                className="h-7 w-7 rounded-[0.3rem] hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center disabled:opacity-40"
                              >
                                {isResending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" strokeWidth={1.75} />}
                              </button>
                              <button
                                type="button"
                                disabled={!inv || isRemoving}
                                title="撤回邀请"
                                onClick={() => inv && handleCancelInvite(invId, inv.email)}
                                className="h-7 w-7 rounded-[0.3rem] hover:bg-destructive/10 text-muted-foreground hover:text-destructive inline-flex items-center justify-center disabled:opacity-40"
                              >
                                {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" strokeWidth={1.75} />}
                              </button>
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        {canEditTeam && m.role.toLowerCase() !== "owner" && (
                          <button
                            type="button"
                            onClick={() => openEditMember(m)}
                            title="编辑"
                            className="h-7 w-7 rounded-[0.3rem] hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                          >
                            <Pencil className="h-3 w-3" strokeWidth={1.75} />
                          </button>
                        )}
                        {canEditTeam && m.role.toLowerCase() !== "owner" && (
                          <div ref={menuOpen === m.id ? menuContainerRef : null}>
                            <button
                              type="button"
                              title="更多"
                              onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                              className="h-7 w-7 rounded-[0.3rem] hover:bg-muted text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                            >
                              <MoreHorizontal className="h-3 w-3" strokeWidth={1.75} />
                            </button>
                            {menuOpen === m.id && (
                              <div className="absolute right-0 top-8 z-20 w-40 rounded-[0.3rem] border border-border bg-background shadow-md p-1">
                                <button
                                  type="button"
                                  disabled={removingId === m.id}
                                  onClick={() => handleRemoveMember(m.id, m.displayName)}
                                  className="w-full inline-flex items-center gap-2 px-2 py-1.5 rounded-[0.3rem] text-[12px] text-destructive hover:bg-destructive/10 disabled:opacity-40"
                                >
                                  {removingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" strokeWidth={1.75} />}
                                  移除成员
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="按岗位分布" subtitle="by role" />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5">
              {byRole.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">
                  暂无岗位 — 在「角色任务」标签中创建
                </div>
              ) : (
                byRole.map((r) => {
                  const pct =
                    counts.active === 0
                      ? 0
                      : Math.min(100, Math.round((r.members / counts.active) * 100));
                  return (
                    <div key={r.id} className="text-[12px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: r.color }}
                          />
                          <span className="text-stone-700 dark:text-stone-200">
                            {r.name}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {r.members}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            background: r.color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="本周提醒" subtitle="this week" />
            <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5 text-[12px]">
              <Reminder
                icon={Cake}
                tint="text-pink-500"
                title="工作纪念 / 生日"
                body="管理员设定后将自动出现在此处"
              />
              <Reminder
                icon={Award}
                tint="text-amber-500"
                title="入职满周年"
                body="自动从入职日期计算"
              />
              {pendingInvitations.length > 0 && (
                <Reminder
                  icon={FileText}
                  tint="text-stone-500"
                  title={`${pendingInvitations.length} 份邀请待接受`}
                  body="提醒受邀人查收邮箱"
                />
              )}
            </div>
          </Card>

          {canInviteTeam && (
            <div className="bg-foreground text-background rounded-[0.3rem] p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <UserPlus className="h-[13px] w-[13px]" strokeWidth={1.75} />
                <div className="text-[12.5px] font-semibold">扩充团队？</div>
              </div>
              <div className="text-[11.5px] text-background/70 leading-relaxed mb-3">
                点击下方按钮发送邀请链接，新成员通过链接完成入职。
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="w-full h-8 rounded-[0.3rem] bg-background text-foreground text-[12px] font-medium hover:bg-background/90 inline-flex items-center justify-center"
              >
                生成邀请链接
              </button>
            </div>
          )}
        </div>
      </div>

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} orgId={orgId} />
      <EditMemberDialog member={editingMember} onClose={() => setEditingMember(null)} />
    </div>
  );
}

function Reminder({
  icon: IconComp,
  tint,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tint: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <IconComp className={cn("h-[13px] w-[13px] mt-0.5", tint)} strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <div className="text-stone-700 dark:text-stone-200 truncate">{title}</div>
        <div className="text-[10.5px] text-muted-foreground truncate">{body}</div>
      </div>
    </div>
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

// ─── primitives ──────────────────────────────────────────────────────────────

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-background border border-border rounded-[0.3rem] overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 bg-muted/30">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold tracking-[-0.005em] truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10.5px] text-muted-foreground font-mono uppercase tracking-wider truncate">
            {subtitle}
          </div>
        )}
      </div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-[0.3rem] border border-border bg-background overflow-hidden h-8">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-2.5 text-[11.5px] font-medium border-l border-border first:border-l-0",
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
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
              人员管理 · Personnel
            </h1>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {t("nav.staffing")} · {t("nav.training")} · Roles · Team
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

            {/* Desktop content — original layouts */}
            <div className="hidden md:flex md:flex-col md:flex-1 min-h-0 overflow-hidden">
              {tab === "schedule" ? (
                <StaffingFull subtabs={["schedule", "myShifts"]} />
              ) : tab === "team" ? (
                <TeamPanel orgId={organizationId} />
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
