"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Loader2, ChevronLeft, ChevronRight, X, Shield, Palette, Trash2,
  MoreHorizontal, ArrowLeftRight, UserPlus, CalendarX, Search, Check, Ban,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import {
  getTeamForScheduling, getShifts, addShift, deleteShift,
  getStaffRoles, addStaffRole, updateStaffRole, deleteStaffRole,
} from "@/lib/db/staffing";
import {
  getMyAvailability, upsertAvailability,
  getTimeOffRequests, getOrgTimeOffRequests,
  createTimeOffRequest, updateTimeOffStatus,
  getOrgShiftTrades, createShiftTrade, updateTradeStatus,
  getCoworkersWithShifts,
} from "@/lib/db/availability";
import type {
  OrgMember, Shift, ShiftType, StaffRole, StaffRolePermissions,
  StaffAvailability, TimeOffRequest, ShiftTrade,
} from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";

const ROLE_COLORS = [
  "#44403c", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

const ROLE_PERMISSION_LABELS: { key: keyof StaffRolePermissions; label: string }[] = [
  { key: "canViewSchedule", label: "View schedule" },
  { key: "canEditSchedule", label: "Edit schedule" },
  { key: "canViewInventory", label: "View inventory" },
  { key: "canEditInventory", label: "Edit inventory" },
  { key: "canViewSales", label: "View sales" },
  { key: "canHandleCash", label: "Handle cash" },
  { key: "canCloseStore", label: "Close store" },
];

const SHIFT_COLORS: Record<ShiftType, string> = {
  morning:   "#44403c",
  afternoon: "#0891b2",
  evening:   "#7c3aed",
  closing:   "#dc2626",
};

const SHIFT_LABELS: Record<ShiftType, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  closing:   "Closing",
};

const AVATAR_BG = [
  "bg-stone-200 text-stone-700",
  "bg-cyan-100 text-cyan-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ABBR  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function avatarBg(name: string): string {
  return AVATAR_BG[strHash(name) % AVATAR_BG.length];
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getWeekDates(base: Date): Date[] {
  const d = new Date(base);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(mon);
    date.setDate(mon.getDate() + i);
    return date;
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MainTab = "myShifts" | "schedule" | "roles";

const DEFAULT_AVAIL_FORM = {
  type: "permanent" as "permanent" | "temporary",
  startDate: "",
  endDate: "",
  days: [true, true, true, true, true, false, false] as boolean[],
  status: "available",
  fullDay: true,
  startTime: "09:00",
  endTime: "17:00",
  comments: "",
};

export default function StaffingPage() {
  const { organizationId, isOwner, can, currentOrg, role } = usePermissions();

  const [team,    setTeam]    = useState<OrgMember[]>([]);
  const [shifts,  setShifts]  = useState<Shift[]>([]);
  const [roles,   setRoles]   = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>("myShifts");

  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()));

  // ─── Add Shift ───
  const [addDialog, setAddDialog] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    memberId:  "",
    date:      isoDate(new Date()),
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime:   "14:00",
  });
  const [saving, setSaving] = useState(false);

  // ─── Role Dialog ───
  const [roleDialog,   setRoleDialog]   = useState(false);
  const [editingRole,  setEditingRole]  = useState<StaffRole | null>(null);
  const [roleForm,     setRoleForm]     = useState({
    name:        "",
    color:       "#44403c",
    permissions: {} as StaffRolePermissions,
  });

  // ─── Shift card menu ───
  const [shiftMenuOpen, setShiftMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ─── Trade Dialog ───
  const [tradeDialog, setTradeDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeDate,   setTradeDate]   = useState("");
  const [selectedTradeTarget, setSelectedTradeTarget] = useState<{ memberId: string; shiftId: string } | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [coworkersCache, setCoworkersCache] = useState<{
    memberId: string; name: string;
    shifts: { id: string; date: string; startTime: string; endTime: string }[];
  }[]>([]);

  // ─── Cover Dialog ───
  const [coverDialog, setCoverDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [savingCover, setSavingCover] = useState(false);

  // ─── Availability Dialog ───
  const [availDialog, setAvailDialog] = useState(false);
  const [myAvailability, setMyAvailability] = useState<StaffAvailability | null>(null);
  const [availForm, setAvailForm] = useState({ ...DEFAULT_AVAIL_FORM });
  const [savingAvail, setSavingAvail] = useState(false);

  // ─── Time Off Dialog ───
  const [timeOffDialog, setTimeOffDialog] = useState(false);
  const [myTimeOffRequests, setMyTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [timeOffForm, setTimeOffForm] = useState({
    fullDays:  true,
    startDate: isoDate(new Date()),
    endDate:   isoDate(new Date()),
    startTime: "09:00",
    endTime:   "17:00",
    comments:  "",
  });
  const [savingTimeOff, setSavingTimeOff] = useState(false);

  // ─── Manager Requests ───
  const [showRequests, setShowRequests] = useState(false);
  const [orgTimeOffRequests, setOrgTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [orgShiftTrades,     setOrgShiftTrades]     = useState<ShiftTrade[]>([]);

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const isStaff   = role === "staff";
  const canEdit   = isOwner || can("staffing", "edit");

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId || team.length === 0) return;
    setMyMemberId(team.find((m) => m.userId === userId)?.id ?? null);
  }, [team, userId]);

  useEffect(() => {
    if (!organizationId || !userId) return;
    setLoading(true);
    const promises: Promise<unknown>[] = [
      getTeamForScheduling(organizationId),
      getShifts(4),
      getStaffRoles(),
      getMyAvailability(userId, organizationId),
      getTimeOffRequests(userId, organizationId),
    ];
    if (!isStaff) {
      promises.push(getOrgTimeOffRequests(organizationId));
      promises.push(getOrgShiftTrades(organizationId));
    }
    Promise.all(promises)
      .then((results) => {
        setTeam(results[0] as OrgMember[]);
        setShifts(results[1] as Shift[]);
        setRoles(results[2] as StaffRole[]);
        setMyAvailability(results[3] as StaffAvailability | null);
        setMyTimeOffRequests(results[4] as TimeOffRequest[]);
        if (!isStaff) {
          setOrgTimeOffRequests(results[5] as TimeOffRequest[]);
          setOrgShiftTrades(results[6] as ShiftTrade[]);
        }
      })
      .catch((err) => console.error("Failed to load staffing:", err))
      .finally(() => setLoading(false));
  }, [organizationId, userId, isStaff]);

  // Close shift menu on outside click
  useEffect(() => {
    if (!shiftMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShiftMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shiftMenuOpen]);

  // ─── Computed ──────────────────────────────────────────────────────────────

  const weekShifts = shifts.filter(
    (s) => s.date >= isoDate(weekDates[0]) && s.date <= isoDate(weekDates[6])
  );
  const myShifts = weekShifts.filter((s) => s.memberId === myMemberId);

  const pendingCount = orgTimeOffRequests.filter((r) => r.status === "pending").length
    + orgShiftTrades.filter((t) => t.status === "pending").length;

  const visibleTabs: MainTab[] = isStaff ? ["myShifts", "roles"] : ["myShifts", "schedule", "roles"];

  const filteredCoworkers = useMemo(() => {
    return coworkersCache.filter((c) => {
      const matchesSearch = !tradeSearch || c.name.toLowerCase().includes(tradeSearch.toLowerCase());
      const matchesDate   = !tradeDate  || c.shifts.some((s) => s.date === tradeDate);
      return matchesSearch && matchesDate;
    });
  }, [coworkersCache, tradeSearch, tradeDate]);

  // ─── Helper ────────────────────────────────────────────────────────────────

  const getMemberName = useCallback(
    (memberId: string) => team.find((m) => m.id === memberId)?.displayName ?? "Unknown",
    [team]
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const prevWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const applyShiftType = (type: ShiftType) => {
    const map: Record<ShiftType, { start: string; end: string }> = {
      morning:   { start: "07:00", end: "14:00" },
      afternoon: { start: "13:00", end: "20:00" },
      evening:   { start: "14:00", end: "21:00" },
      closing:   { start: "18:00", end: "22:00" },
    };
    setShiftForm((f) => ({ ...f, shiftType: type, startTime: map[type].start, endTime: map[type].end }));
  };

  const handleAddShift = async () => {
    if (!userId) return;
    const member = team.find((m) => m.id === shiftForm.memberId);
    if (!member) return;
    setSaving(true);
    try {
      const sh = await addShift({
        memberId:        member.id,
        staffName:       member.displayName,
        staffRole:       member.role,
        date:            shiftForm.date,
        shiftType:       shiftForm.shiftType,
        startTime:       shiftForm.startTime,
        endTime:         shiftForm.endTime,
        predictedDemand: "medium",
      }, userId);
      setShifts((prev) => [...prev, sh]);
      setAddDialog(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    await deleteShift(id);
    setShifts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveRole = async () => {
    if (!roleForm.name || !userId) return;
    setSaving(true);
    try {
      if (editingRole) {
        await updateStaffRole(editingRole.id, roleForm);
        setRoles((prev) => prev.map((r) => r.id === editingRole.id ? { ...r, ...roleForm } : r));
      } else {
        const r = await addStaffRole(roleForm, userId);
        setRoles((prev) => [...prev, r]);
      }
      setRoleDialog(false);
      setEditingRole(null);
      setRoleForm({ name: "", color: "#44403c", permissions: {} });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    await deleteStaffRole(id);
    setRoles((prev) => prev.filter((r) => r.id !== id));
  };

  const openTradeDialog = async (shift: Shift) => {
    setTradeDialog({ open: true, shift });
    setTradeSearch("");
    setTradeDate("");
    setSelectedTradeTarget(null);
    if (organizationId && myMemberId) {
      const data = await getCoworkersWithShifts(organizationId, myMemberId);
      setCoworkersCache(data);
    }
  };

  const openCoverDialog = (shift: Shift) => {
    setCoverDialog({ open: true, shift });
    setSelectedCover(null);
  };

  const handleTradeRequest = async () => {
    if (!tradeDialog.shift || !selectedTradeTarget || !myMemberId || !organizationId) return;
    setSavingTrade(true);
    try {
      await createShiftTrade({
        organizationId,
        shiftId:       tradeDialog.shift.id,
        requesterId:   myMemberId,
        targetId:      selectedTradeTarget.memberId,
        targetShiftId: selectedTradeTarget.shiftId,
        type:          "trade",
        comments:      "",
      });
      setTradeDialog({ open: false, shift: null });
    } finally {
      setSavingTrade(false);
    }
  };

  const handleCoverRequest = async () => {
    if (!coverDialog.shift || !selectedCover || !myMemberId || !organizationId) return;
    setSavingCover(true);
    try {
      await createShiftTrade({
        organizationId,
        shiftId:       coverDialog.shift.id,
        requesterId:   myMemberId,
        targetId:      selectedCover,
        targetShiftId: null,
        type:          "cover",
        comments:      "",
      });
      setCoverDialog({ open: false, shift: null });
    } finally {
      setSavingCover(false);
    }
  };

  const openAvailDialog = () => {
    if (myAvailability) {
      setAvailForm({
        type:      myAvailability.type,
        startDate: myAvailability.startDate ?? "",
        endDate:   myAvailability.endDate ?? "",
        days:      myAvailability.days,
        status:    myAvailability.status,
        fullDay:   myAvailability.fullDay,
        startTime: myAvailability.startTime ?? "09:00",
        endTime:   myAvailability.endTime ?? "17:00",
        comments:  myAvailability.comments,
      });
    } else {
      setAvailForm({ ...DEFAULT_AVAIL_FORM });
    }
    setAvailDialog(true);
  };

  const handleSaveAvailability = async () => {
    if (!userId || !organizationId) return;
    setSavingAvail(true);
    try {
      const saved = await upsertAvailability({
        id:             myAvailability?.id,
        userId,
        organizationId,
        type:           availForm.type,
        startDate:      availForm.type === "temporary" ? availForm.startDate || null : null,
        endDate:        availForm.type === "temporary" ? availForm.endDate || null : null,
        days:           availForm.days,
        status:         availForm.status,
        fullDay:        availForm.fullDay,
        startTime:      availForm.fullDay ? null : availForm.startTime,
        endTime:        availForm.fullDay ? null : availForm.endTime,
        comments:       availForm.comments,
      });
      setMyAvailability(saved);
      setAvailDialog(false);
    } finally {
      setSavingAvail(false);
    }
  };

  const handleTimeOffRequest = async () => {
    if (!userId || !organizationId) return;
    setSavingTimeOff(true);
    try {
      const req = await createTimeOffRequest({
        userId,
        organizationId,
        startDate: timeOffForm.startDate,
        endDate:   timeOffForm.endDate,
        fullDays:  timeOffForm.fullDays,
        startTime: timeOffForm.fullDays ? null : timeOffForm.startTime,
        endTime:   timeOffForm.fullDays ? null : timeOffForm.endTime,
        comments:  timeOffForm.comments,
      });
      setMyTimeOffRequests((prev) => [req, ...prev]);
      setTimeOffDialog(false);
    } finally {
      setSavingTimeOff(false);
    }
  };

  const handleTimeOffStatusUpdate = async (id: string, status: "approved" | "denied") => {
    if (!userId) return;
    await updateTimeOffStatus(id, status, userId);
    setOrgTimeOffRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const handleTradeStatusUpdate = async (id: string, status: "accepted" | "denied") => {
    await updateTradeStatus(id, status, userId ?? undefined);
    setOrgShiftTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const todayStr = isoDate(new Date());
  const isToday  = (d: Date) => isoDate(d) === todayStr;
  const monthYear = weekDates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard section="staffing">
      <div className="p-3 sm:p-5 max-w-xl mx-auto">

        {/* ─── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold tracking-tight">Scheduling</h1>
          <div className="flex items-center gap-1.5">
            {canEdit && (
              <button
                onClick={() => {
                  setShiftForm({
                    memberId:  team[0]?.id ?? "",
                    date:      selectedDay,
                    shiftType: "morning",
                    startTime: "07:00",
                    endTime:   "14:00",
                  });
                  setAddDialog(true);
                }}
                className="h-8 w-8 flex items-center justify-center border border-border rounded hover:bg-stone-100 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Toggle Tabs ─────────────────────────────────────────── */}
        <div className="flex border border-border overflow-hidden w-fit mb-5">
          {visibleTabs.map((tab, i) => {
            const labels: Record<MainTab, string> = {
              myShifts: "My Shifts",
              schedule: "Schedule",
              roles:    "Roles",
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  i > 0 ? "border-l border-border" : ""
                } ${
                  activeTab === tab
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {labels[tab]}
                {tab === "schedule" && pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 bg-stone-900 text-white text-[9px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ─── Week Calendar Strip ─────────────────────────────────── */}
        {activeTab !== "roles" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-stone-600" />
              </button>
              <span className="text-sm font-semibold text-stone-800">{monthYear}</span>
              <button onClick={nextWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-stone-600" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-4">
              {weekDates.map((d, i) => {
                const ds         = isoDate(d);
                const isTodayD   = isToday(d);
                const isSelected = ds === selectedDay;
                return (
                  <button
                    key={ds}
                    onClick={() => setSelectedDay(ds)}
                    className="flex flex-col items-center gap-1 py-1"
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">{DAY_ABBR[i]}</span>
                    <span
                      className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        isTodayD
                          ? "bg-stone-900 text-white"
                          : isSelected
                          ? "bg-stone-200 text-stone-900"
                          : "text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border" />
          </>
        )}

        {/* ─── My Shifts ───────────────────────────────────────────── */}
        {activeTab === "myShifts" && (
          <>
            {/* Self-service actions */}
            <div className="flex items-center gap-2 py-3 border-b border-border">
              <button
                onClick={openAvailDialog}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded hover:bg-stone-50 transition-colors"
              >
                <CalendarX className="h-3.5 w-3.5" />
                Availability
              </button>
              <button
                onClick={() => {
                  setTimeOffForm({
                    fullDays:  true,
                    startDate: isoDate(new Date()),
                    endDate:   isoDate(new Date()),
                    startTime: "09:00",
                    endTime:   "17:00",
                    comments:  "",
                  });
                  setTimeOffDialog(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded hover:bg-stone-50 transition-colors"
              >
                <CalendarX className="h-3.5 w-3.5" />
                Time Off
              </button>
              {myTimeOffRequests.filter(r => r.status === "pending").length > 0 && (
                <span className="text-[11px] text-stone-500 ml-auto">
                  {myTimeOffRequests.filter(r => r.status === "pending").length} pending request
                  {myTimeOffRequests.filter(r => r.status === "pending").length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="divide-y divide-border" ref={menuRef}>
              {weekDates.map((d) => {
                const ds        = isoDate(d);
                const dayShifts = myShifts.filter((s) => s.date === ds);
                const isTodayD  = isToday(d);
                const label     = isTodayD
                  ? "Today"
                  : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

                return (
                  <div key={ds} className="py-3">
                    <p className={`text-xs font-semibold mb-2 ${isTodayD ? "text-stone-900" : "text-stone-500"}`}>
                      {label}
                    </p>
                    {dayShifts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">You are not scheduled to work.</p>
                    ) : (
                      <div className="space-y-2">
                        {dayShifts.map((shift) => (
                          <div key={shift.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-stone-900">
                                {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: SHIFT_COLORS[shift.shiftType] }}
                                />
                                <span className="text-xs text-muted-foreground truncate">
                                  {currentOrg?.name ?? "Store"} &middot; {SHIFT_LABELS[shift.shiftType]}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {/* Shift action menu */}
                              <div className="relative">
                                <button
                                  onClick={() => setShiftMenuOpen(shiftMenuOpen === shift.id ? null : shift.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                                {shiftMenuOpen === shift.id && (
                                  <div className="absolute right-0 top-full mt-0.5 z-50 w-36 border border-border bg-white shadow-sm">
                                    <button
                                      onClick={() => { setShiftMenuOpen(null); openTradeDialog(shift); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-stone-50 text-stone-700"
                                    >
                                      <ArrowLeftRight className="h-3.5 w-3.5" /> Trade Shift
                                    </button>
                                    <button
                                      onClick={() => { setShiftMenuOpen(null); openCoverDialog(shift); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-stone-50 text-stone-700 border-t border-border"
                                    >
                                      <UserPlus className="h-3.5 w-3.5" /> Find Cover
                                    </button>
                                  </div>
                                )}
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteShift(shift.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Availability summary */}
            {myAvailability && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-stone-700">My Availability</p>
                  <button onClick={openAvailDialog} className="text-xs text-stone-500 hover:text-stone-700 underline-offset-2 hover:underline">
                    Edit
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_NAMES.map((d, i) => (
                    <span
                      key={d}
                      className={`px-2 py-0.5 text-[11px] font-medium border ${
                        myAvailability.days[i]
                          ? "border-stone-300 bg-stone-900 text-white"
                          : "border-border text-stone-400"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                {!myAvailability.fullDay && myAvailability.startTime && myAvailability.endTime && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatTime(myAvailability.startTime)} – {formatTime(myAvailability.endTime)}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── Schedule (manager view) ──────────────────────────────── */}
        {activeTab === "schedule" && !isStaff && (
          <>
            <div className="divide-y divide-border">
              {weekDates.map((d) => {
                const ds        = isoDate(d);
                const dayShifts = weekShifts.filter((s) => s.date === ds);
                const isTodayD  = isToday(d);
                const label     = isTodayD
                  ? `Today · ${d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}`
                  : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

                return (
                  <div key={ds} className="py-3">
                    <p className={`text-xs font-semibold mb-2 ${isTodayD ? "text-stone-900" : "text-stone-500"}`}>
                      {label}
                    </p>
                    {dayShifts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No shifts scheduled.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {dayShifts.map((shift) => (
                          <div key={shift.id} className="flex items-center gap-3 group">
                            <div
                              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarBg(shift.staffName)}`}
                            >
                              {initials(shift.staffName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-stone-900 leading-snug">
                                {shift.staffName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: SHIFT_COLORS[shift.shiftType] }}
                                />
                                <span className="text-xs text-muted-foreground truncate">
                                  {formatTime(shift.startTime)} – {formatTime(shift.endTime)} &middot; {SHIFT_LABELS[shift.shiftType]}
                                </span>
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                onClick={() => handleDeleteShift(shift.id)}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-destructive transition-all"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ─── Manager Requests Section ──────────────────────── */}
            <div className="mt-4 border-t border-border">
              <button
                onClick={() => setShowRequests(!showRequests)}
                className="flex items-center gap-2 w-full py-3"
              >
                <span className="text-sm font-semibold text-stone-800">Requests</span>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1.5 bg-stone-900 text-white text-[9px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
                {showRequests
                  ? <ChevronUp className="h-4 w-4 ml-auto text-stone-400" />
                  : <ChevronDown className="h-4 w-4 ml-auto text-stone-400" />
                }
              </button>

              {showRequests && (
                <div className="space-y-4 pb-4">
                  {/* Time-off requests */}
                  {orgTimeOffRequests.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-2">Time Off</p>
                      <div className="space-y-2">
                        {orgTimeOffRequests.map((req) => (
                          <div key={req.id} className="border border-border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-stone-900">
                                  {getMemberName(req.userId)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatDateShort(req.startDate)} – {formatDateShort(req.endDate)}
                                  {!req.fullDays && req.startTime && req.endTime && (
                                    <> &middot; {formatTime(req.startTime)}–{formatTime(req.endTime)}</>
                                  )}
                                </p>
                                {req.comments && (
                                  <p className="text-xs text-stone-500 mt-1 italic">&ldquo;{req.comments}&rdquo;</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleTimeOffStatusUpdate(req.id, "approved")}
                                  className="p-1.5 border border-border hover:bg-emerald-50 hover:border-emerald-300 text-stone-500 hover:text-emerald-700 rounded transition-colors"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleTimeOffStatusUpdate(req.id, "denied")}
                                  className="p-1.5 border border-border hover:bg-red-50 hover:border-red-300 text-stone-500 hover:text-red-700 rounded transition-colors"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shift trade requests */}
                  {orgShiftTrades.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-2">Shift Trades</p>
                      <div className="space-y-2">
                        {orgShiftTrades.map((trade) => {
                          const shift = shifts.find((s) => s.id === trade.shiftId);
                          return (
                            <div key={trade.id} className="border border-border p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 bg-stone-100 text-stone-600">
                                      {trade.type}
                                    </span>
                                    <p className="text-sm font-medium text-stone-900">
                                      {getMemberName(trade.requesterId)}
                                      <span className="text-stone-400 font-normal"> → </span>
                                      {getMemberName(trade.targetId)}
                                    </p>
                                  </div>
                                  {shift && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {formatDateShort(shift.date)} &middot; {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleTradeStatusUpdate(trade.id, "accepted")}
                                    className="p-1.5 border border-border hover:bg-emerald-50 hover:border-emerald-300 text-stone-500 hover:text-emerald-700 rounded transition-colors"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleTradeStatusUpdate(trade.id, "denied")}
                                    className="p-1.5 border border-border hover:bg-red-50 hover:border-red-300 text-stone-500 hover:text-red-700 rounded transition-colors"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {orgTimeOffRequests.length === 0 && orgShiftTrades.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">No pending requests.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Roles ───────────────────────────────────────────────── */}
        {activeTab === "roles" && (
          <div className="mt-1 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">Staff Roles</p>
                <p className="text-xs text-muted-foreground mt-0.5">Define roles and permissions for your team</p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingRole(null);
                    setRoleForm({ name: "", color: "#44403c", permissions: {} });
                    setRoleDialog(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Role
                </Button>
              )}
            </div>

            {roles.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Shield className="h-8 w-8 mx-auto text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  No roles yet. Create roles like &quot;Barista&quot; or &quot;Shift Lead&quot;.
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {roles.map((r) => {
                  const activePerms = ROLE_PERMISSION_LABELS.filter((p) => r.permissions[p.key]);
                  return (
                    <div
                      key={r.id}
                      className="border border-border p-3 space-y-2 hover:border-stone-300 transition-colors cursor-pointer"
                      onClick={() => {
                        setEditingRole(r);
                        setRoleForm({ name: r.name, color: r.color, permissions: r.permissions });
                        setRoleDialog(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                          <span className="font-semibold text-sm">{r.name}</span>
                        </div>
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activePerms.length > 0 ? (
                          activePerms.map((p) => (
                            <span key={p.key} className="bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              {p.label}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No permissions set</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Add Shift Dialog ─────────────────────────────────────── */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Shift</DialogTitle>
            <DialogDescription>Schedule a shift for a team member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Team Member</Label>
              <Select
                value={shiftForm.memberId}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, memberId: v ?? "" }))}
              >
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={shiftForm.date}
                onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shift Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SHIFT_LABELS) as ShiftType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => applyShiftType(t)}
                    className={`px-3 py-2 text-xs font-semibold text-white transition-opacity ${
                      shiftForm.shiftType === t ? "opacity-100 ring-2 ring-offset-1 ring-stone-400" : "opacity-45"
                    }`}
                    style={{ backgroundColor: SHIFT_COLORS[t] }}
                  >
                    {SHIFT_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddShift} disabled={saving || !shiftForm.memberId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Shift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Role Dialog ─────────────────────────────────────────── */}
      <Dialog open={roleDialog} onOpenChange={(open) => { setRoleDialog(open); if (!open) setEditingRole(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
            <DialogDescription>
              {editingRole ? "Update this role and its permissions." : "Define a new role with specific permissions."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Barista, Shift Lead, Cashier"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" /> Color
              </Label>
              <div className="flex gap-2 flex-wrap">
                {ROLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      roleForm.color === c ? "border-stone-900 scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Permissions
              </Label>
              <div className="space-y-0.5">
                {ROLE_PERMISSION_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions[key] === true}
                      onChange={() =>
                        setRoleForm((f) => ({
                          ...f,
                          permissions: { ...f.permissions, [key]: !f.permissions[key] },
                        }))
                      }
                      className="h-4 w-4 accent-stone-900 cursor-pointer"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={saving || !roleForm.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRole ? "Save" : "Add Role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Trade Shift Dialog ───────────────────────────────────── */}
      <Dialog open={tradeDialog.open} onOpenChange={(open) => { if (!open) setTradeDialog({ open: false, shift: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Trade Shift</DialogTitle>
            <DialogDescription>Select a co-worker&apos;s shift to trade with.</DialogDescription>
          </DialogHeader>
          {tradeDialog.shift && (
            <div className="space-y-4 py-1">
              {/* Your shift */}
              <div className="bg-stone-50 border border-border p-3">
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Your shift</p>
                <p className="text-sm font-semibold text-stone-900">
                  {new Date(tradeDialog.shift.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(tradeDialog.shift.startTime)} – {formatTime(tradeDialog.shift.endTime)}
                  &nbsp;&middot;&nbsp;{currentOrg?.name ?? "Store"}
                </p>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Filter by date</Label>
                  <Input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Search co-workers</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                    <Input
                      value={tradeSearch}
                      onChange={(e) => setTradeSearch(e.target.value)}
                      placeholder="Name..."
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Coworker list */}
              <div className="border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {filteredCoworkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No co-workers with upcoming shifts.</p>
                ) : (
                  filteredCoworkers.flatMap((c) =>
                    (tradeDate
                      ? c.shifts.filter((s) => s.date === tradeDate)
                      : c.shifts
                    ).map((s) => {
                      const key = `${c.memberId}:${s.id}`;
                      const selected = selectedTradeTarget?.shiftId === s.id;
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            selected ? "bg-stone-50" : "hover:bg-stone-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="tradeTarget"
                            checked={selected}
                            onChange={() => setSelectedTradeTarget({ memberId: c.memberId, shiftId: s.id })}
                            className="accent-stone-900 shrink-0"
                          />
                          <div
                            className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarBg(c.name)}`}
                          >
                            {initials(c.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-900 leading-tight">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateShort(s.date)} &middot; {formatTime(s.startTime)}–{formatTime(s.endTime)}
                            </p>
                          </div>
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: "#44403c" }}
                          />
                        </label>
                      );
                    })
                  )
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setTradeDialog({ open: false, shift: null })}>Cancel</Button>
            <Button onClick={handleTradeRequest} disabled={savingTrade || !selectedTradeTarget}>
              {savingTrade ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Find Cover Dialog ────────────────────────────────────── */}
      <Dialog open={coverDialog.open} onOpenChange={(open) => { if (!open) setCoverDialog({ open: false, shift: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Find Cover</DialogTitle>
            <DialogDescription>Select a co-worker to cover your shift.</DialogDescription>
          </DialogHeader>
          {coverDialog.shift && (
            <div className="space-y-4 py-1">
              {/* Your shift */}
              <div className="bg-stone-50 border border-border p-3">
                <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1">Your shift</p>
                <p className="text-sm font-semibold text-stone-900">
                  {new Date(coverDialog.shift.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(coverDialog.shift.startTime)} – {formatTime(coverDialog.shift.endTime)}
                  &nbsp;&middot;&nbsp;{currentOrg?.name ?? "Store"}
                </p>
              </div>

              {/* Team list */}
              <div className="border border-border divide-y divide-border max-h-52 overflow-y-auto">
                {team.filter((m) => m.id !== myMemberId).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No other team members.</p>
                ) : (
                  team
                    .filter((m) => m.id !== myMemberId)
                    .map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          selectedCover === m.id ? "bg-stone-50" : "hover:bg-stone-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="coverTarget"
                          checked={selectedCover === m.id}
                          onChange={() => setSelectedCover(m.id)}
                          className="accent-stone-900 shrink-0"
                        />
                        <div
                          className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${avatarBg(m.displayName)}`}
                        >
                          {initials(m.displayName)}
                        </div>
                        <p className="text-sm font-medium text-stone-900">{m.displayName}</p>
                      </label>
                    ))
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setCoverDialog({ open: false, shift: null })}>Cancel</Button>
            <Button onClick={handleCoverRequest} disabled={savingCover || !selectedCover}>
              {savingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Availability Dialog ──────────────────────────────────── */}
      <Dialog open={availDialog} onOpenChange={setAvailDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Availability</DialogTitle>
            <DialogDescription>Set your regular availability for scheduling.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Type */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex border border-border overflow-hidden w-fit">
                {(["permanent", "temporary"] as const).map((t, i) => (
                  <button
                    key={t}
                    onClick={() => setAvailForm((f) => ({ ...f, type: t }))}
                    className={`px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                      i > 0 ? "border-l border-border" : ""
                    } ${
                      availForm.type === t
                        ? "bg-stone-900 text-white"
                        : "bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range (temporary only) */}
            {availForm.type === "temporary" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={availForm.startDate}
                    onChange={(e) => setAvailForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={availForm.endDate}
                    onChange={(e) => setAvailForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Day selector */}
            <div className="space-y-1.5">
              <Label>Available Days</Label>
              <div className="flex gap-1.5">
                {DAY_NAMES.map((d, i) => (
                  <button
                    key={d}
                    onClick={() =>
                      setAvailForm((f) => {
                        const days = [...f.days];
                        days[i] = !days[i];
                        return { ...f, days };
                      })
                    }
                    className={`flex-1 py-1.5 text-xs font-semibold border transition-colors ${
                      availForm.days[i]
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-white text-stone-500 border-border hover:bg-stone-50"
                    }`}
                  >
                    {d[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={availForm.status}
                onValueChange={(v) => setAvailForm((f) => ({ ...f, status: v ?? f.status }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Full Day toggle */}
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Full Day</Label>
              <button
                onClick={() => setAvailForm((f) => ({ ...f, fullDay: !f.fullDay }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                  availForm.fullDay ? "bg-stone-900 border-stone-900" : "bg-white border-border"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    availForm.fullDay ? "translate-x-4" : "translate-x-0.5"
                  }`}
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
                />
              </button>
            </div>

            {/* Times (if not full day) */}
            {!availForm.fullDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={availForm.startTime}
                    onChange={(e) => setAvailForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={availForm.endTime}
                    onChange={(e) => setAvailForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-1.5">
              <Label>Comments</Label>
              <Textarea
                value={availForm.comments}
                onChange={(e) => setAvailForm((f) => ({ ...f, comments: e.target.value }))}
                placeholder="Any notes about your availability..."
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setAvailDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveAvailability} disabled={savingAvail}>
              {savingAvail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Time Off Request Dialog ──────────────────────────────── */}
      <Dialog open={timeOffDialog} onOpenChange={setTimeOffDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>Submit a time off request for your manager to review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Full Days toggle */}
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">Full Days</Label>
              <button
                onClick={() => setTimeOffForm((f) => ({ ...f, fullDays: !f.fullDays }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                  timeOffForm.fullDays ? "bg-stone-900 border-stone-900" : "bg-white border-border"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    timeOffForm.fullDays ? "translate-x-4" : "translate-x-0.5"
                  }`}
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
                />
              </button>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={timeOffForm.startDate}
                  onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={timeOffForm.endDate}
                  onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Times (if not full days) */}
            {!timeOffForm.fullDays && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={timeOffForm.startTime}
                    onChange={(e) => setTimeOffForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={timeOffForm.endTime}
                    onChange={(e) => setTimeOffForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-1.5">
              <Label>Comments</Label>
              <Textarea
                value={timeOffForm.comments}
                onChange={(e) => setTimeOffForm((f) => ({ ...f, comments: e.target.value }))}
                placeholder="Reason for time off..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <Button
            onClick={handleTimeOffRequest}
            disabled={savingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate}
            className="w-full mt-1 bg-stone-900 hover:bg-stone-800 text-white"
          >
            {savingTimeOff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create time off request"}
          </Button>
        </DialogContent>
      </Dialog>
    </PermissionGuard>
  );
}
