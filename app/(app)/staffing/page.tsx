"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Loader2, ChevronLeft, ChevronRight, X, Shield, Palette, Trash2,
  ArrowLeftRight, UserPlus, CalendarX, Search, Check, Ban,
  ChevronDown, ChevronUp, User, Coffee, Utensils, ChefHat, Truck, Package,
  Clipboard, Wrench, Headphones, Store, Banknote, Sparkles, Box,
  ShoppingCart, Receipt, HeartPulse, Baby, Dog, Leaf, Music, Camera,
  Hammer, Zap, Star, Award, Briefcase, Phone, Mail, Clock, ArrowLeft,
  ClipboardList, Pencil, Download, Wine, Bubbles, MoonStar, Sun, ReceiptText, HandPlatter,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, useDialogUrl,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/lib/context/permissions";
import {
  addShift, updateShift, deleteShift,
  addStaffRole, updateStaffRole, deleteStaffRole,
  getRoleTasks, addRoleTask, updateRoleTask, deleteRoleTask,
  addShiftPreset, updateShiftPreset, deleteShiftPreset,
} from "@/lib/spacetimedb/actions";
import type { ShiftPreset } from "@/lib/types";
import type { ChatConversation } from "@/lib/types";
import {
  upsertAvailability,
  createTimeOffRequest, updateTimeOffStatus,
  createShiftTrade, updateTradeStatus,
} from "@/lib/spacetimedb/actions";
import { getCoworkersWithShifts } from "@/lib/db/availability";
import type {
  OrgMember, Shift, ShiftType, StaffRole, StaffRolePermissions,
  StaffAvailability, TimeOffRequest, ShiftTrade, RoleTask,
} from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { hapticLight, hapticSuccess, hapticWarning } from "@/lib/haptics";
import { getCached, setCache } from "@/lib/cache";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";

const ROLE_COLORS = [
  "#44403c", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

const ROLE_ICON_MAP: Record<string, LucideIcon> = {
  "user": User, "coffee": Coffee, "utensils": Utensils, "chef-hat": ChefHat,
  "truck": Truck, "package": Package, "clipboard": Clipboard, "wrench": Wrench,
  "headphones": Headphones, "store": Store, "banknote": Banknote,
  "sparkles": Sparkles, "box": Box, "shopping-cart": ShoppingCart,
  "receipt": Receipt, "heart-pulse": HeartPulse, "baby": Baby, "dog": Dog,
  "leaf": Leaf, "music": Music, "camera": Camera, "palette": Palette,
  "hammer": Hammer, "zap": Zap, "star": Star, "award": Award,
  "briefcase": Briefcase, "phone": Phone, "mail": Mail, "clock": Clock,
  "shield": Shield, "wine": Wine, "bubbles": Bubbles, "moon-star": MoonStar,
  "sun": Sun, "receipt-text": ReceiptText, "hand-platter": HandPlatter,
};

const ROLE_ICON_LIST = [
  "coffee", "utensils", "chef-hat", "store", "receipt", "banknote",
  "package", "box", "shopping-cart", "truck", "clipboard", "clipboard",
  "wrench", "hammer", "sparkles", "headphones", "heart-pulse", "shield",
  "briefcase", "award", "star", "clock", "phone", "mail",
  "leaf", "music", "camera", "palette", "baby", "dog",
  "zap", "user", "wine", "bubbles", "moon-star", "sun", "receipt-text", "hand-platter",
].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

function RoleIconComp({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const Comp = ROLE_ICON_MAP[name] ?? User;
  return <Comp className={className} style={style} />;
}

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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

type MainTab = "myShifts" | "schedule" | "table" | "roles";

const DEFAULT_AVAIL_FORM = {
  type: "permanent" as "permanent" | "temporary",
  startDate: "",
  endDate: "",
  dayTimes: [false, true, true, true, true, true, false].map((on) => ({
    enabled: on, fullDay: true, startTime: "09:00", endTime: "17:00",
  })),
  status: "available",
  comments: "",
};

export default function StaffingPage() {
  const { organizationId, isOwner, can, currentOrg, role } = usePermissions();

  const [presetDialog, setPresetDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ShiftPreset | null>(null);
  const [presetForm, setPresetForm] = useState({ name: "", startTime: "07:00", endTime: "14:00", color: "#44403c" });
  const [deletePresetConfirm, setDeletePresetConfirm] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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

  // ─── Add / Edit Shift ───
  const [addDialog,     setAddDialog]     = useState(false);
  const [editingShift,  setEditingShift]  = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({
    memberId:  "",
    date:      isoDate(new Date()),
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime:   "14:00",
    roleNames: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // ─── Role Dialog ───
  const [roleDialog,   setRoleDialog]   = useState(false);
  const [editingRole,  setEditingRole]  = useState<StaffRole | null>(null);
  const [roleForm,     setRoleForm]     = useState({
    name:        "",
    color:       "#44403c",
    icon:        "user",
    description: "",
    permissions: {} as StaffRolePermissions,
  });

  // ─── Role Detail / Tasks ───
  const [selectedRole,    setSelectedRole]    = useState<StaffRole | null>(null);
  const [roleTasksCache,  setRoleTasksCache]  = useState<Record<string, RoleTask[]>>({});
  const [loadingTasks,    setLoadingTasks]    = useState(false);
  const [taskDialog,      setTaskDialog]      = useState<{ open: boolean; task: RoleTask | null }>({ open: false, task: null });
  const [taskForm,        setTaskForm]        = useState({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] as string[] });
  // chatOptions managed by useStaffing hook below
  const [savingTask,      setSavingTask]      = useState(false);
  const [viewTasksDialog, setViewTasksDialog] = useState<{ open: boolean; role: StaffRole | null }>({ open: false, role: null });

  // ─── Today's Tasks ───
  const [todayTasks,       setTodayTasks]       = useState<RoleTask[]>([]);
  const [taskCompletions,  setTaskCompletions]  = useState<Record<string, boolean>>({});
  const [loadingTodayTasks, setLoadingTodayTasks] = useState(false);

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
  // myAvailability managed by useStaffing hook below
  const [availForm, setAvailForm] = useState({ ...DEFAULT_AVAIL_FORM });
  const [savingAvail, setSavingAvail] = useState(false);

  // ─── Time Off Dialog ───
  const [timeOffDialog, setTimeOffDialog] = useState(false);
  // myTimeOffRequests managed by useStaffing hook below
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
  // orgTimeOffRequests, orgShiftTrades managed by useStaffing hook below

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const isStaff   = role === "staff";
  const canEdit   = isOwner || can("staffing", "edit");

  // ─── Data via SpacetimeDB migration hook ──────────────────────────────────
  const {
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
  } = useStaffing(organizationId, userId, isStaff);

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    setUserId(token ? token.slice(0, 36) : null);
  }, []);

  useEffect(() => {
    if (!userId || team.length === 0) return;
    setMyMemberId(team.find((m) => m.userId === userId)?.id ?? null);
  }, [team, userId]);

  // Handle table drag-select via non-passive touchmove
  useEffect(() => {
    const el = document.getElementById("table-grid-container");
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (!selectModeRef.current || !dragStartRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;

      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const td = target?.closest("td[data-cellkey]") as HTMLElement | null;
      if (!td?.dataset.cellkey) return;
      const targetKey = td.dataset.cellkey;
      const [startMember, startDate] = dragStartRef.current.split("|");
      const [curMember, curDate] = targetKey.split("|");

      // Get current member/date lists from data attributes on the table
      const allTds = el.querySelectorAll("td[data-cellkey]");
      const mIds: string[] = [], dIds: string[] = [];
      allTds.forEach((t) => {
        const [m, d] = (t as HTMLElement).dataset.cellkey!.split("|");
        if (!mIds.includes(m)) mIds.push(m);
        if (!dIds.includes(d)) dIds.push(d);
      });

      const r1 = mIds.indexOf(startMember), r2 = mIds.indexOf(curMember);
      const c1 = dIds.indexOf(startDate), c2 = dIds.indexOf(curDate);
      if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return;

      // Start from pre-drag snapshot + current rectangle
      const next = new Set(preDragSelectionRef.current);
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          next.add(`${mIds[r]}|${dIds[c]}` as CellKey);
        }
      }
      setSelectedCells(next);
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  });

  // ─── Shift Details Dialog ──────────────────────────────────────────────────
  const [shiftDetailShift, setShiftDetailShift] = useState<Shift | null>(null);

  // ─── Computed ──────────────────────────────────────────────────────────────

  const weekShifts = shifts.filter(
    (s) => s.date >= isoDate(weekDates[0]) && s.date <= isoDate(weekDates[6])
  );
  const myShifts = weekShifts.filter((s) => s.memberId === myMemberId);

  const pendingCount = orgTimeOffRequests.filter((r) => r.status === "pending").length
    + orgShiftTrades.filter((t) => t.status === "pending").length;

  const visibleTabs: MainTab[] = isStaff ? ["myShifts", "roles"] : ["myShifts", "schedule", "table", "roles"];

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

  const prevWeek = () => { hapticLight(); setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); };
  const nextWeek = () => { hapticLight(); setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); };

  // Swipe left/right — 3-panel slide carousel
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [slideAnim, setSlideAnim] = useState(false);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const swipeAxis = useRef<"h" | "v" | null>(null);
  const panelW = useRef(0);
  const swipeStartTime = useRef(0);
  const prevWeekRef = useRef(prevWeek);
  const nextWeekRef = useRef(nextWeek);
  prevWeekRef.current = prevWeek;
  nextWeekRef.current = nextWeek;

  const calendarRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    panelW.current = el.offsetWidth;

    function onStart(e: TouchEvent) {
      if (slideAnim) return;
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      swipeAxis.current = null;
      swipeStartTime.current = Date.now();
      panelW.current = el!.offsetWidth;
    }

    function onMove(e: TouchEvent) {
      if (slideAnim) return;
      const dx = e.touches[0].clientX - swipeStartX.current;
      const dy = e.touches[0].clientY - swipeStartY.current;

      if (swipeAxis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (swipeAxis.current !== "h") return;

      e.preventDefault();
      e.stopPropagation();
      setSwiping(true);
      setSwipeOffset(dx);
    }

    function onEnd(e: TouchEvent) {
      if (swipeAxis.current !== "h") { swipeAxis.current = null; return; }

      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      const elapsed = Math.max(1, Date.now() - swipeStartTime.current);
      const velocity = Math.abs(dx) / elapsed; // px/ms

      setSwiping(false);
      setSlideAnim(true);
      if (Math.abs(dx) > 50 || velocity > 0.5) {
        if (dx < 0) nextWeekRef.current(); else prevWeekRef.current();
      }
      setSwipeOffset(0);
      setTimeout(() => setSlideAnim(false), 400);
      swipeAxis.current = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
  }, [slideAnim]);

  // Swipe handler for content area below calendar
  const contentRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;

    function onStart(e: TouchEvent) {
      if (slideAnim) return;
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      swipeAxis.current = null;
      swipeStartTime.current = Date.now();
      panelW.current = el!.offsetWidth;
    }

    function onMove(e: TouchEvent) {
      if (slideAnim) return;
      const dx = e.touches[0].clientX - swipeStartX.current;
      const dy = e.touches[0].clientY - swipeStartY.current;
      if (swipeAxis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (swipeAxis.current !== "h") return;
      e.preventDefault();
      e.stopPropagation();
      setSwiping(true);
      setSwipeOffset(dx);
    }

    function onEnd(e: TouchEvent) {
      if (swipeAxis.current !== "h") { swipeAxis.current = null; return; }
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      const elapsed = Math.max(1, Date.now() - swipeStartTime.current);
      const velocity = Math.abs(dx) / elapsed;
      setSwiping(false);
      setSlideAnim(true);
      if (Math.abs(dx) > 50 || velocity > 0.5) {
        if (dx < 0) nextWeekRef.current(); else prevWeekRef.current();
      }
      setSwipeOffset(0);
      setTimeout(() => setSlideAnim(false), 400);
      swipeAxis.current = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
  }, [slideAnim]);

  // Merge default shift types with custom presets
  const allPresets = presets.map((p) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime, color: p.color, id: p.id }));

  const applyShiftType = (type: ShiftType) => {
    const map: Record<ShiftType, { start: string; end: string }> = {
      morning:   { start: "07:00", end: "14:00" },
      afternoon: { start: "13:00", end: "20:00" },
      evening:   { start: "14:00", end: "21:00" },
      closing:   { start: "18:00", end: "22:00" },
    };
    setShiftForm((f) => ({ ...f, shiftType: type, startTime: map[type].start, endTime: map[type].end }));
  };

  const handleSavePreset = async () => {
    if (!organizationId || !presetForm.name) return;
    try {
      if (editingPreset) {
        await updateShiftPreset(editingPreset.id, presetForm);
        setPresets((prev) => prev.map((p) => p.id === editingPreset.id ? { ...p, ...presetForm } : p));
      } else {
        const presetId = crypto.randomUUID();
        await addShiftPreset(organizationId, presetForm);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPresets((prev) => [...prev, { id: presetId, organizationId, ...presetForm } as any]);
      }
      setPresetDialog(false);
      setEditingPreset(null);
    } catch (err) {
      console.error("Save preset failed:", err);
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deleteShiftPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete preset failed:", err);
    }
  };

  const handleAddShift = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      if (editingShift) {
        const member = team.find((m) => m.id === shiftForm.memberId);
        const updated = {
          ...editingShift,
          memberId:   shiftForm.memberId,
          staffName:  member?.displayName ?? editingShift.staffName,
          staffRoles: shiftForm.roleNames,
          date:       shiftForm.date,
          shiftType:  shiftForm.shiftType,
          startTime:  shiftForm.startTime,
          endTime:    shiftForm.endTime,
        };
        await updateShift(editingShift.id, updated);
        setShifts((prev) => prev.map((s) => s.id === editingShift.id ? updated : s));
      } else {
        const member = team.find((m) => m.id === shiftForm.memberId);
        if (!member) return;
        const shiftId = crypto.randomUUID();
        await addShift({
          memberId:        member.id,
          staffName:       member.displayName,
          staffRole:       shiftForm.roleNames[0] || null,
          staffRoles:      shiftForm.roleNames,
          date:            shiftForm.date,
          shiftType:       shiftForm.shiftType,
          startTime:       shiftForm.startTime,
          endTime:         shiftForm.endTime,
          predictedDemand: "medium",
        }, userId, organizationId ?? undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setShifts((prev) => [...prev, { id: shiftId, memberId: member.id, staffName: member.displayName, staffRoles: shiftForm.roleNames, date: shiftForm.date, shiftType: shiftForm.shiftType, startTime: shiftForm.startTime, endTime: shiftForm.endTime } as any]);
      }
      hapticSuccess();
      setAddDialog(false);
      setEditingShift(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    hapticWarning();
    await deleteShift(id);
    setShifts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveRole = async () => {
    if (!roleForm.name || !userId) return;
    setSaving(true);
    try {
      if (editingRole) {
        await updateStaffRole(editingRole.id, roleForm);
        const updated = { ...editingRole, ...roleForm };
        setRoles((prev) => prev.map((r) => r.id === editingRole.id ? updated : r));
        if (selectedRole?.id === editingRole.id) setSelectedRole(updated);
      } else {
        const roleId = crypto.randomUUID();
        await addStaffRole(roleForm, userId, organizationId ?? undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRoles((prev) => [...prev, { id: roleId, ...roleForm } as any]);
      }
      hapticSuccess();
      setRoleDialog(false);
      setEditingRole(null);
      setRoleForm({ name: "", color: "#44403c", icon: "user", description: "", permissions: {} });
    } finally {
      setSaving(false);
    }
  };

  const loadRoleTasksFor = async (roleId: string) => {
    if (roleTasksCache[roleId]) return;
    setLoadingTasks(true);
    try {
      const tasks = await getRoleTasks(roleId);
      setRoleTasksCache((prev) => ({ ...prev, [roleId]: tasks }));
      setCache(`role_tasks_${roleId}`, tasks);
    } catch (err) {
      console.error("Failed to load role tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const [roleDetailOpen, setRoleDetailOpen] = useState(false);
  const handleSelectRole = (r: StaffRole) => {
    setSelectedRole(r);
    setRoleDetailOpen(true);
    loadRoleTasksFor(r.id);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title || !selectedRole) return;
    setSavingTask(true);
    try {
      const existing = roleTasksCache[selectedRole.id] ?? [];
      if (taskDialog.task) {
        const st = taskForm.hasTime ? taskForm.startTime : null;
        const et = taskForm.hasTime ? taskForm.endTime : null;
        await updateRoleTask(taskDialog.task.id, {
          title: taskForm.title,
          description: taskForm.description,
          startTime: st,
          endTime: et,
          requiresEvidence: taskForm.requiresEvidence,
          notifyChats: taskForm.notifyChats,
        });
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: existing.map((t) =>
            t.id === taskDialog.task!.id
              ? { ...t, title: taskForm.title, description: taskForm.description, startTime: st, endTime: et, requiresEvidence: taskForm.requiresEvidence, notifyChats: taskForm.notifyChats }
              : t
          ).sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")),
        }));
      } else {
        const taskId = crypto.randomUUID();
        await addRoleTask({
          roleId: selectedRole.id,
          organizationId: organizationId ?? null,
          title: taskForm.title,
          description: taskForm.description,
          startTime: taskForm.hasTime ? taskForm.startTime : null,
          endTime: taskForm.hasTime ? taskForm.endTime : null,
          sortOrder: existing.length,
          requiresEvidence: taskForm.requiresEvidence,
          notifyChats: taskForm.notifyChats,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newTask: any = { id: taskId, roleId: selectedRole.id, title: taskForm.title, description: taskForm.description, startTime: taskForm.hasTime ? taskForm.startTime : null, endTime: taskForm.hasTime ? taskForm.endTime : null, sortOrder: existing.length, requiresEvidence: taskForm.requiresEvidence, notifyChats: taskForm.notifyChats };
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: [...existing, newTask].sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")),
        }));
      }
      setTaskDialog({ open: false, task: null });
      setTaskForm({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] });
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedRole) return;
    await deleteRoleTask(taskId);
    setRoleTasksCache((prev) => ({
      ...prev,
      [selectedRole.id]: (prev[selectedRole.id] ?? []).filter((t) => t.id !== taskId),
    }));
  };

  const handleDeleteRole = async (id: string) => {
    hapticWarning();
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
      hapticSuccess();
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
      hapticSuccess();
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
        dayTimes:  myAvailability.dayTimes,
        status:    myAvailability.status,
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
      const days = availForm.dayTimes.map((dt) => dt.enabled);
      const allFullDay = availForm.dayTimes.every((dt) => dt.fullDay || !dt.enabled);
      const savedId = myAvailability?.id ?? crypto.randomUUID();
      await upsertAvailability({
        id:             myAvailability?.id,
        userId,
        organizationId,
        type:           availForm.type,
        startDate:      availForm.type === "temporary" ? availForm.startDate || null : null,
        endDate:        availForm.type === "temporary" ? availForm.endDate || null : null,
        days,
        dayTimes:       availForm.dayTimes,
        status:         availForm.status,
        fullDay:        allFullDay,
        startTime:      null,
        endTime:        null,
        comments:       availForm.comments,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const optimisticAvail: any = { id: savedId, userId, organizationId, type: availForm.type, days, dayTimes: availForm.dayTimes, status: availForm.status, fullDay: allFullDay, comments: availForm.comments };
      setMyAvailability((prev: StaffAvailability[]) => {
        const idx = prev.findIndex((a) => a.id === savedId);
        return idx >= 0 ? prev.map((a) => a.id === savedId ? optimisticAvail : a) : [...prev, optimisticAvail];
      });
      setAvailDialog(false);
    } finally {
      setSavingAvail(false);
    }
  };

  const handleTimeOffRequest = async () => {
    if (!userId || !organizationId) return;
    setSavingTimeOff(true);
    try {
      const reqId = crypto.randomUUID();
      await createTimeOffRequest({
        userId,
        organizationId,
        startDate: timeOffForm.startDate,
        endDate:   timeOffForm.endDate,
        fullDays:  timeOffForm.fullDays,
        startTime: timeOffForm.fullDays ? null : timeOffForm.startTime,
        endTime:   timeOffForm.fullDays ? null : timeOffForm.endTime,
        comments:  timeOffForm.comments,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyTimeOffRequests((prev) => [{ id: reqId, userId, organizationId, ...timeOffForm, status: "pending", createdAt: new Date().toISOString() } as any, ...prev]);
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

  // ─── Load today's role tasks (cache-first, then fresh) ────────────────────
  useEffect(() => {
    if (!myMemberId || shifts.length === 0) return;
    const todayShifts = shifts.filter((s) => s.memberId === myMemberId && s.date === todayStr);
    if (todayShifts.length === 0) { setTodayTasks([]); return; }

    const roleNames = [...new Set(todayShifts.flatMap((s) => s.staffRoles ?? []))];
    const roleIds = roleNames
      .map((name) => roles.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id)
      .filter(Boolean) as string[];

    if (roleIds.length === 0) { setTodayTasks([]); return; }

    // Show cached tasks immediately
    const cachedAll: RoleTask[] = [];
    for (const roleId of roleIds) {
      const cached = getCached<RoleTask[]>(`role_tasks_${roleId}`);
      if (cached) cachedAll.push(...cached);
    }
    cachedAll.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
    setTodayTasks(cachedAll);

    // Load completions from localStorage
    const completions: Record<string, boolean> = {};
    for (const task of cachedAll) {
      completions[task.id] = getCached<boolean>(`task_done_${task.id}_${todayStr}`) ?? false;
    }
    setTaskCompletions(completions);

    // Fetch fresh in background
    setLoadingTodayTasks(true);
    Promise.all(
      roleIds.map((roleId) =>
        getRoleTasks(roleId).then((tasks) => {
          setCache(`role_tasks_${roleId}`, tasks);
          setRoleTasksCache((prev) => ({ ...prev, [roleId]: tasks }));
          return tasks;
        })
      )
    )
      .then((results) => {
        const fresh = results.flat().sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"));
        setTodayTasks(fresh);
        // Merge completions for any new tasks
        setTaskCompletions((prev) => {
          const next = { ...prev };
          for (const task of fresh) {
            if (!(task.id in next)) {
              next[task.id] = getCached<boolean>(`task_done_${task.id}_${todayStr}`) ?? false;
            }
          }
          return next;
        });
      })
      .catch((err) => console.error("Failed to load today tasks:", err))
      .finally(() => setLoadingTodayTasks(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, myMemberId, roles]);

  const toggleTaskDone = (taskId: string) => {
    hapticLight();
    setTaskCompletions((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      setCache(`task_done_${taskId}_${todayStr}`, next[taskId]);
      return next;
    });
  };

  const prevWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7); return getWeekDates(d);
  }, [weekStart]);
  const nextWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return getWeekDates(d);
  }, [weekStart]);


  // Render a Lucide icon to PNG data URL by reading the existing DOM icon
  const renderIconToDataUrl = (iconName: string, color: string, size = 32): Promise<string> => {
    return new Promise((resolve) => {
      // Create a hidden container with the icon rendered via DOM
      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:-9999px";
      document.body.appendChild(container);

      // Manually create SVG element from Lucide icon component
      // First render a temporary icon to get its SVG content
      const IconComp = ROLE_ICON_MAP[iconName] ?? User;
      const tempDiv = document.createElement("div");
      container.appendChild(tempDiv);

      // Use ReactDOM to render synchronously via flushSync
      import("react-dom/client").then(({ createRoot }) => {
        import("react-dom").then(({ flushSync }) => {
          import("react").then((React) => {
            const root = createRoot(tempDiv);
            flushSync(() => {
              root.render(React.createElement(IconComp, {
                width: size,
                height: size,
                stroke: color,
                strokeWidth: 2,
                fill: "none",
              }));
            });

            const svg = tempDiv.querySelector("svg");
            if (!svg) { root.unmount(); container.remove(); resolve(""); return; }

            // Clone and ensure attributes
            const clone = svg.cloneNode(true) as SVGElement;
            clone.setAttribute("width", String(size));
            clone.setAttribute("height", String(size));
            clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

            const svgStr = new XMLSerializer().serializeToString(clone);
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = size * 2;
              canvas.height = size * 2;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0, size * 2, size * 2);
              resolve(canvas.toDataURL("image/png"));
              root.unmount();
              container.remove();
            };
            img.onerror = () => { root.unmount(); container.remove(); resolve(""); };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
          });
        });
      });
    });
  };

  // Get date array and filtered shifts for a date range
  const getExportData = (startStr: string, endStr: string) => {
    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    const dates: Date[] = [];
    const d = new Date(start);
    while (d <= end) { dates.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const rangeShifts = shifts.filter((s) => s.date >= startStr && s.date <= endStr);
    // Split into weeks (max 7 days per chunk)
    const weeks: Date[][] = [];
    for (let i = 0; i < dates.length; i += 7) {
      weeks.push(dates.slice(i, i + 7));
    }
    return { dates, weeks, rangeShifts };
  };

  const handleDownloadPDF = async (startStr: string, endStr: string) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const { weeks, rangeShifts } = getExportData(startStr, endStr);

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Pre-render all role icons
    const iconCache: Record<string, string> = {};
    const usedRoles = roles.filter((r) =>
      rangeShifts.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
    );
    await Promise.all(usedRoles.map(async (r) => {
      iconCache[r.name.toLowerCase()] = await renderIconToDataUrl(r.icon, r.color, 16);
    }));

    type CellRole = { name: string; color: string; iconKey: string };

    for (let wi = 0; wi < weeks.length; wi++) {
      const weekDays = weeks[wi];
      if (wi > 0) doc.addPage();

      const wStart = weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const wEnd = weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${currentOrg?.name ?? "Schedule"} — ${wStart} - ${wEnd}`, 20, 30);

      const dayHeaders = weekDays.map((d) =>
        `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`
      );
      const weekShiftRange = rangeShifts.filter((s) => {
        const sd = isoDate(weekDays[0]), ed = isoDate(weekDays[weekDays.length - 1]);
        return s.date >= sd && s.date <= ed;
      });
      const staffNames = [...new Set(weekShiftRange.map((s) => s.staffName))].sort();
      const head = [["Name", ...dayHeaders]];
      const cellRoles: Record<string, CellRole[]> = {};

      const body = staffNames.map((name, rowIdx) => {
        const cells = weekDays.map((d, colIdx) => {
          const ds = isoDate(d);
          const dayShifts = weekShiftRange.filter((s) => s.date === ds && s.staffName === name);
          if (dayShifts.length === 0) return "";
          const shiftRoles: CellRole[] = [];
          const text = dayShifts.map((s) => {
            const time = `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`;
            (s.staffRoles ?? []).forEach((rn) => {
              const role = roles.find((ro) => ro.name.toLowerCase() === rn.toLowerCase());
              if (!shiftRoles.find((sr) => sr.name === rn)) {
                shiftRoles.push({ name: rn, color: role?.color ?? "#44403c", iconKey: rn.toLowerCase() });
              }
            });
            return time;
          }).join("\n");
          if (shiftRoles.length > 0) {
            cellRoles[`${rowIdx}-${colIdx + 1}`] = shiftRoles;
            return text + "\n ";
          }
          return text;
        });
        return [name, ...cells];
      });

      const totals = weekDays.map((d) => String(weekShiftRange.filter((s) => s.date === isoDate(d)).length));
      body.push(["Total", ...totals]);

      autoTable(doc, {
        startY: 45, head, body, theme: "grid",
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak", lineWidth: 0.5 },
        headStyles: { fillColor: [245, 245, 244], textColor: [41, 37, 36], fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } },
        bodyStyles: { valign: "top" },
        didParseCell: (data) => {
          if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [245, 245, 244]; }
          if (data.section === "body" && data.column.index > 0 && data.row.index < body.length - 1 && data.cell.raw) {
            data.cell.styles.fillColor = [255, 247, 237];
          }
        },
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index === 0) return;
          const key = `${data.row.index}-${data.column.index}`;
          const rls = cellRoles[key];
          if (!rls) return;
          const pad = data.cell.styles.cellPadding as number;
          const iconSize = 8;
          const iconsY = data.cell.y + data.cell.height - pad - iconSize;
          let iconX = data.cell.x + pad;
          for (const role of rls) {
            const imgData = iconCache[role.iconKey];
            if (imgData) { try { doc.addImage(imgData, "PNG", iconX, iconsY, iconSize, iconSize); } catch { /* skip */ } }
            iconX += iconSize + 3;
          }
        },
      });

      // Legend after each table
      if (usedRoles.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
        let legendY = finalY + 15;
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("Roles:", 20, legendY);
        doc.setFont("helvetica", "normal"); legendY += 14;
        let legendX = 20;
        for (const role of usedRoles) {
          const imgData = iconCache[role.name.toLowerCase()];
          if (imgData) { try { doc.addImage(imgData, "PNG", legendX, legendY - 9, 10, 10); } catch { /* skip */ } }
          legendX += 13; doc.setFontSize(8); doc.text(`= ${role.name}`, legendX, legendY);
          legendX += doc.getTextWidth(`= ${role.name}`) + 15;
          if (legendX > pageW - 60) { legendX = 20; legendY += 16; }
        }
      }
    }

    doc.save(`schedule-${startStr}.pdf`);
  };

  const handleDownloadCSV = (startStr: string, endStr: string) => {
    const { dates, rangeShifts } = getExportData(startStr, endStr);
    const dayHeaders = dates.map((d) =>
      `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`
    );
    const staffNames = [...new Set(rangeShifts.map((s) => s.staffName))].sort();

    const rows = [["Name", ...dayHeaders]];
    for (const name of staffNames) {
      const cells = dates.map((d) => {
        const ds = isoDate(d);
        const dayShifts = rangeShifts.filter((s) => s.date === ds && s.staffName === name);
        if (dayShifts.length === 0) return "";
        return dayShifts.map((s) => {
          const time = `${formatTime(s.startTime)}-${formatTime(s.endTime)}`;
          const roleStr = (s.staffRoles ?? []).join(", ");
          return roleStr ? `${time} (${roleStr})` : time;
        }).join("; ");
      });
      rows.push([name, ...cells]);
    }
    const totals = dates.map((d) => String(rangeShifts.filter((s) => s.date === isoDate(d)).length));
    rows.push(["Total", ...totals]);

    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${startStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async (startStr: string, endStr: string) => {
    const { default: html2canvas } = await import("html2canvas");
    const { weeks, rangeShifts } = getExportData(startStr, endStr);

    // Pre-render role icons as PNG data URLs
    const pngIconCache: Record<string, string> = {};
    const allUsedRoles = roles.filter((r) =>
      rangeShifts.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
    );
    await Promise.all(allUsedRoles.map(async (r) => {
      pngIconCache[r.name.toLowerCase()] = await renderIconToDataUrl(r.icon, r.color, 16);
    }));

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "background:#fff;padding:20px;font-family:system-ui,sans-serif;font-size:12px;width:max-content;";

    for (const weekDays of weeks) {
      const wStart = weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const wEnd = weekDays[weekDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const weekShiftRange = rangeShifts.filter((s) => s.date >= isoDate(weekDays[0]) && s.date <= isoDate(weekDays[weekDays.length - 1]));
      const staffNames = [...new Set(weekShiftRange.map((s) => s.staffName))].sort();

      const title = document.createElement("h2");
      title.style.cssText = "margin:16px 0 12px;font-size:16px;";
      title.textContent = `${currentOrg?.name ?? "Schedule"} — ${wStart} - ${wEnd}`;
      wrapper.appendChild(title);

      const table = document.createElement("table");
      table.style.cssText = "border-collapse:collapse;width:100%;margin-bottom:8px;";
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      ["Name", ...weekDays.map((d) => `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`)].forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.cssText = "border:1px solid #d6d3d1;padding:6px 8px;background:#f5f5f4;font-size:11px;text-align:center;";
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const name of staffNames) {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        nameTd.textContent = name;
        nameTd.style.cssText = "border:1px solid #d6d3d1;padding:6px 8px;font-weight:600;white-space:nowrap;";
        tr.appendChild(nameTd);
        for (const d of weekDays) {
          const ds = isoDate(d);
          const dayShifts = weekShiftRange.filter((s) => s.date === ds && s.staffName === name);
          const td = document.createElement("td");
          td.style.cssText = `border:1px solid #d6d3d1;padding:6px 8px;font-size:11px;vertical-align:middle;text-align:center;min-width:90px;${dayShifts.length > 0 ? "background:#fff7ed;" : ""}`;
          if (dayShifts.length > 0) {
            dayShifts.forEach((s) => {
              const timeDiv = document.createElement("div");
              timeDiv.textContent = `${formatTime(s.startTime)} - ${formatTime(s.endTime)}`;
              td.appendChild(timeDiv);
            const iconsRow = document.createElement("div");
            iconsRow.style.cssText = "display:flex;justify-content:center;gap:3px;margin-top:7px;";
            (s.staffRoles ?? []).forEach((rn) => {
                const iconDataUrl = pngIconCache[rn.toLowerCase()];
                if (iconDataUrl) {
                  const iconImg = document.createElement("img");
                  iconImg.src = iconDataUrl;
                  iconImg.style.cssText = "width:12px;height:12px;";
                  iconsRow.appendChild(iconImg);
                }
              });
            td.appendChild(iconsRow);
            });
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrapper.appendChild(table);

      // Legend after each table
      const usedWeekRoles = roles.filter((r) =>
        weekShiftRange.some((s) => (s.staffRoles ?? []).some((rn) => rn.toLowerCase() === r.name.toLowerCase()))
      );
      if (usedWeekRoles.length > 0) {
        const legend = document.createElement("div");
        legend.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 16px;";
        const label = document.createElement("span");
        label.textContent = "Roles:";
        label.style.cssText = "font-weight:600;font-size:11px;";
        legend.appendChild(label);
        for (const role of usedWeekRoles) {
          const item = document.createElement("span");
          item.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:10px;";
          const iconDataUrl = pngIconCache[role.name.toLowerCase()];
          if (iconDataUrl) {
            const iconImg = document.createElement("img");
            iconImg.src = iconDataUrl;
            iconImg.style.cssText = "width:12px;height:12px;position:relative;top:7px;";
            item.appendChild(iconImg);
          }
          const text = document.createTextNode(`= ${role.name}`);
          item.appendChild(text);
          legend.appendChild(item);
        }
        wrapper.appendChild(legend);
      }
    }

    // Render in an iframe to isolate from Tailwind's lab() colors
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:absolute;left:-9999px;top:0;width:1400px;border:none;";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument!;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box;}</style></head><body>${wrapper.outerHTML}</body></html>`);
    iframeDoc.close();
    // Wait for all images (icons) to load
    const imgs = Array.from(iframeDoc.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })));
    await new Promise((r) => setTimeout(r, 100));
    const target = iframeDoc.body.firstElementChild as HTMLElement;
    // Size iframe to content
    const contentH = target.scrollHeight + 40;
    const contentW = target.scrollWidth + 40;
    iframe.style.width = `${contentW}px`;
    iframe.style.height = `${contentH}px`;
    const canvas = await html2canvas(target, { backgroundColor: "#ffffff", scale: 2, windowWidth: contentW, windowHeight: contentH });
    document.body.removeChild(iframe);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${startStr}.png`;
    a.click();
  };

  const [downloadDialog, setDownloadDialog] = useDialogUrl("Export Schedule");
  const [downloadRange, setDownloadRange] = useState({ start: "", end: "" });
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "png" | "csv">("pdf");

  // Table view state
  type CellKey = `${string}|${string}`; // "memberId|date"
  const [selectedCells, setSelectedCells] = useState<Set<CellKey>>(new Set());
  const lastCellRef = useRef<CellKey | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const dragStartRef = useRef<CellKey | null>(null);
  const isDraggingRef = useRef(false);
  const preDragSelectionRef = useRef<Set<CellKey>>(new Set());
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;
  const [batchDialog, setBatchDialog] = useState(false);
  const [batchForm, setBatchForm] = useState({ startTime: "09:00", endTime: "17:00", roleNames: [] as string[] });

  return (
    <PermissionGuard section="staffing">
      <div className={`p-3 sm:p-5 mx-auto ${activeTab === "table" ? "max-w-5xl" : "max-w-xl"}`}>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Scheduling</h1>
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setDownloadRange({ start: isoDate(weekDates[0]), end: isoDate(weekDates[6]) }); setDownloadDialog(true); }}
              className="h-8 w-8 flex items-center justify-center border border-border rounded hover:bg-stone-100 transition-colors"
              title="Export schedule"
            >
              <Download className="h-4 w-4" />
            </button>
            {canEdit && (
              <button
                onClick={() => {
                  setEditingShift(null);
                  setShiftForm({
                    memberId:  team[0]?.id ?? "",
                    date:      selectedDay,
                    shiftType: "morning",
                    startTime: "07:00",
                    endTime:   "14:00",
                    roleNames: [],
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
              table:    `Week ${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} – ${weekDates[6].getMonth() + 1}/${weekDates[6].getDate()}`,
              roles:    "Roles",
            };
            return (
              <button
                key={tab}
                onClick={() => { hapticLight(); setActiveTab(tab); }}
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

        {/* ─── Today's Tasks ──────────────────────────────────────── */}
        {activeTab === "myShifts" && (() => {
          const todayShifts = shifts.filter((s) => s.memberId === myMemberId && s.date === todayStr);
          if (todayShifts.length === 0) return null;

          const doneCount = todayTasks.filter((t) => taskCompletions[t.id]).length;

          return (
            <div className="border border-border p-3 mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-stone-500" />
                  <span className="text-sm font-semibold text-stone-900">Today&apos;s Tasks</span>
                </div>
                {todayTasks.length > 0 && (
                  <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 border border-stone-200">
                    {doneCount}/{todayTasks.length} done
                  </span>
                )}
              </div>
              {todayTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {loadingTodayTasks ? "Loading tasks…" : "No tasks assigned for today"}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {todayTasks.map((task) => {
                    const done = !!taskCompletions[task.id];
                    return (
                      <button
                        key={task.id}
                        onClick={() => toggleTaskDone(task.id)}
                        className="flex items-start gap-2.5 w-full text-left py-1 hover:bg-stone-50 -mx-1 px-1 transition-colors"
                      >
                        <div className={`mt-0.5 h-4 w-4 shrink-0 border flex items-center justify-center transition-colors ${done ? "bg-stone-900 border-stone-900" : "border-stone-400"}`}>
                          {done && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          {task.startTime && task.endTime && (
                            <span className="font-mono text-[11px] text-stone-400 shrink-0 tabular-nums">
                              {task.startTime.slice(0, 5)}–{task.endTime.slice(0, 5)}
                            </span>
                          )}
                          <span className={`text-sm leading-snug ${done ? "line-through text-muted-foreground" : "text-stone-800"}`}>
                            {task.title}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── Week Calendar Strip (swipe left/right to change weeks) ── */}
        {activeTab !== "roles" && activeTab !== "table" && (
          <div ref={calendarRef}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-stone-600" />
              </button>
              <span className="text-sm font-semibold text-stone-800">{monthYear}</span>
              <button onClick={nextWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-stone-600" />
              </button>
            </div>

            <div className="relative overflow-hidden mb-4" style={{ height: 56 }}>
              {[
                { dates: prevWeekDates, offset: -1, current: false },
                { dates: weekDates,     offset:  0, current: true  },
                { dates: nextWeekDates, offset:  1, current: false },
              ].map(({ dates, offset, current }) => (
                <div
                  key={offset}
                  className="absolute inset-0 grid grid-cols-7"
                  style={{
                    transform: `translateX(calc(${offset * 100}% + ${swipeOffset}px))`,
                    transition: swiping ? "none" : slideAnim ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
                  }}
                >
                  {dates.map((d, i) => {
                    const ds = isoDate(d);
                    const isTodayD = isToday(d);
                    const isSelected = current && ds === selectedDay;
                    return (
                      <button
                        key={ds}
                        onClick={current ? () => setSelectedDay(ds) : undefined}
                        className="flex flex-col items-center gap-1 py-1"
                      >
                        <span className="text-[10px] font-medium text-muted-foreground">{DAY_ABBR[i]}</span>
                        <span
                          className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                            !current
                              ? "text-stone-400"
                              : isTodayD
                              ? "bg-stone-900 text-white"
                              : isSelected
                              ? "bg-stone-200 text-stone-900"
                              : "text-stone-700"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="border-t border-border" />
          </div>
        )}

        {/* ─── My Shifts ───────────────────────────────────────────── */}
        {activeTab === "myShifts" && (
          <div
            ref={contentRef}
            style={{
              transform: `translateX(${swipeOffset}px)`,
              transition: swiping ? "none" : slideAnim ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
            }}
          >
            <div className="divide-y divide-border">
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
                        {dayShifts.map((shift) => {
                          const matchedRoles = (shift.staffRoles ?? [])
                            .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                            .filter(Boolean) as typeof roles;
                          return (
                          <div
                            key={shift.id}
                            className="flex items-center gap-3 cursor-pointer hover:bg-stone-50 -mx-1 px-1 py-0.5 rounded"
                            onClick={() => setShiftDetailShift(shift)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-stone-900">
                                {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span
                                  className="inline-block h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: SHIFT_COLORS[shift.shiftType] }}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {currentOrg?.name ?? "Store"} &middot; {SHIFT_LABELS[shift.shiftType]}
                                </span>
                                {matchedRoles.map((matchedRole) => (
                                  <span key={matchedRole.id} className="inline-flex items-center gap-1">
                                    <span className="text-stone-300">&middot;</span>
                                    <span
                                      className="inline-block h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: matchedRole.color }}
                                    />
                                    <span className="text-xs font-medium text-stone-600">{matchedRole.name}</span>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await loadRoleTasksFor(matchedRole.id);
                                        setViewTasksDialog({ open: true, role: matchedRole });
                                      }}
                                      className="text-[11px] font-medium underline-offset-2 hover:underline text-stone-400 hover:text-stone-700 transition-colors"
                                    >
                                      View tasks
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteShift(shift.id); }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                        })}
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
                  {DAY_NAMES.map((d, i) => {
                    const dt = myAvailability.dayTimes[i];
                    return (
                      <span
                        key={d}
                        className={`px-2 py-0.5 text-[11px] font-medium border ${
                          dt.enabled
                            ? "border-stone-300 bg-stone-900 text-white"
                            : "border-border text-stone-400"
                        }`}
                        title={dt.enabled && !dt.fullDay ? `${dt.startTime}–${dt.endTime}` : undefined}
                      >
                        {d}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Schedule (manager view) ──────────────────────────────── */}
        {activeTab === "schedule" && !isStaff && (
          <div
            ref={contentRef}
            style={{
              transform: `translateX(${swipeOffset}px)`,
              transition: swiping ? "none" : slideAnim ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
            }}
          >
            <div id="schedule-grid" className="divide-y divide-border">
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
                        {dayShifts.map((shift) => {
                          const shiftRoles = (shift.staffRoles ?? [])
                            .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                            .filter(Boolean) as typeof roles;
                          return (
                          <div key={shift.id} className="flex items-center gap-3 group">
                            <div
                              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarBg(shift.staffName)}`}
                            >
                              {initials(shift.staffName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium text-stone-900 leading-snug">
                                  {shift.staffName}
                                </p>
                                {shiftRoles.map((sr) => (
                                  <span key={sr.id} className="inline-flex items-center gap-1">
                                    <span
                                      className="inline-block h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: sr.color }}
                                    />
                                    <span className="text-xs font-medium text-stone-500">{sr.name}</span>
                                  </span>
                                ))}
                              </div>
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
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => {
                                    setEditingShift(shift);
                                    setShiftForm({
                                      memberId:  shift.memberId ?? team[0]?.id ?? "",
                                      date:      shift.date,
                                      shiftType: shift.shiftType,
                                      startTime: shift.startTime,
                                      endTime:   shift.endTime,
                                      roleNames: shift.staffRoles ?? [],
                                    });
                                    setAddDialog(true);
                                  }}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteShift(shift.id)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingShift(null);
                          setShiftForm({
                            memberId:  team[0]?.id ?? "",
                            date:      ds,
                            shiftType: "morning",
                            startTime: "07:00",
                            endTime:   "14:00",
                            roleNames: [],
                          });
                          setAddDialog(true);
                        }}
                        className="flex items-center gap-1.5 mt-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors w-full"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Shift
                      </button>
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
          </div>
        )}

        {/* ─── Table View (Excel-like grid) ────────────────────────── */}
        {activeTab === "table" && !isStaff && (() => {
          const allMembers = team.filter((m) => m.status === "active");
          const memberIds = allMembers.map((m) => m.id);
          const dateStrs = weekDates.map((d) => isoDate(d));

          const handleCellClick = (key: CellKey, e: React.MouseEvent) => {
            const [memberId, date] = key.split("|");
            const lastCell = lastCellRef.current; // capture before setState
            setSelectedCells((prev) => {
              const next = new Set(prev);
              if (e.shiftKey && lastCell) {
                // Rectangle select from last click to current, additive
                const [lastMember, lastDate] = lastCell.split("|");
                const r1 = memberIds.indexOf(lastMember);
                const r2 = memberIds.indexOf(memberId);
                const c1 = dateStrs.indexOf(lastDate);
                const c2 = dateStrs.indexOf(date);
                if (r1 >= 0 && r2 >= 0 && c1 >= 0 && c2 >= 0) {
                  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
                    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
                      next.add(`${memberIds[r]}|${dateStrs[c]}`);
                    }
                  }
                }
              } else if (e.metaKey || e.ctrlKey) {
                if (next.has(key)) next.delete(key); else next.add(key);
              } else {
                next.clear();
                next.add(key);
              }
              return next;
            });
            lastCellRef.current = key;
          };
          const handleBatchApply = async () => {
            if (selectedCells.size === 0 || !userId || !organizationId) return;
            setSaving(true);
            try {
              const newShifts: Shift[] = [];
              for (const key of selectedCells) {
                const [memberId, date] = key.split("|");
                const member = team.find((m) => m.id === memberId);
                if (!member) continue;
                // Check if shift already exists for this member+date
                const existing = shifts.find((s) => s.memberId === memberId && s.date === date);
                if (existing) {
                  const patched = { ...existing, startTime: batchForm.startTime, endTime: batchForm.endTime, staffRoles: batchForm.roleNames };
                  await updateShift(existing.id, patched);
                  setShifts((prev) => prev.map((s) => s.id === existing.id ? patched : s));
                } else {
                  const shiftId = crypto.randomUUID();
                  await addShift({
                    memberId: member.id,
                    staffName: member.displayName,
                    staffRole: batchForm.roleNames[0] || null,
                    staffRoles: batchForm.roleNames,
                    date,
                    shiftType: "morning",
                    startTime: batchForm.startTime,
                    endTime: batchForm.endTime,
                    predictedDemand: "medium",
                  }, userId, organizationId ?? undefined);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  newShifts.push({ id: shiftId, memberId: member.id, staffName: member.displayName, staffRoles: batchForm.roleNames, date, shiftType: "morning", startTime: batchForm.startTime, endTime: batchForm.endTime } as any);
                }
              }
              if (newShifts.length > 0) setShifts((prev) => [...prev, ...newShifts]);
              setSelectedCells(new Set());
              setBatchDialog(false);
            } finally { setSaving(false); }
          };
          const handleCopyLastWeek = async () => {
            if (!userId || !organizationId) return;
            const prevStart = new Date(weekStart);
            prevStart.setDate(prevStart.getDate() - 7);
            const prevEnd = new Date(prevStart);
            prevEnd.setDate(prevEnd.getDate() + 6);
            const prevStartStr = isoDate(prevStart);
            const prevEndStr = isoDate(prevEnd);
            const lastWeekShifts = shifts.filter((s) => s.date >= prevStartStr && s.date <= prevEndStr);
            if (lastWeekShifts.length === 0) { alert("No shifts found in the previous week."); return; }
            setSaving(true);
            try {
              const newShifts: Shift[] = [];
              for (const s of lastWeekShifts) {
                const oldDate = new Date(s.date + "T00:00:00");
                const newDate = new Date(oldDate);
                newDate.setDate(newDate.getDate() + 7);
                const newDateStr = isoDate(newDate);
                // Skip if shift already exists
                if (shifts.find((ex) => ex.memberId === s.memberId && ex.date === newDateStr)) continue;
                const shiftId = crypto.randomUUID();
                await addShift({
                  memberId: s.memberId,
                  staffName: s.staffName,
                  staffRole: s.staffRole,
                  staffRoles: s.staffRoles,
                  date: newDateStr,
                  shiftType: s.shiftType,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  predictedDemand: s.predictedDemand,
                }, userId, organizationId ?? undefined);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newShifts.push({ ...s, id: shiftId, date: newDateStr } as any);
              }
              setShifts((prev) => [...prev, ...newShifts]);
            } finally { setSaving(false); }
          };
          const handleDeleteSelected = async () => {
            if (selectedCells.size === 0) return;
            setSaving(true);
            try {
              const idsToDelete: string[] = [];
              for (const key of selectedCells) {
                const [memberId, date] = key.split("|");
                const existing = shifts.find((s) => s.memberId === memberId && s.date === date);
                if (existing) idsToDelete.push(existing.id);
              }
              for (const id of idsToDelete) await deleteShift(id);
              setShifts((prev) => prev.filter((s) => !idsToDelete.includes(s.id)));
              setSelectedCells(new Set());
            } finally { setSaving(false); }
          };

          return (
          <>
            {/* Week nav for table */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-stone-600" />
              </button>
              <span className="text-sm font-semibold text-stone-800">{monthYear}</span>
              <button onClick={nextWeek} className="p-1 rounded hover:bg-stone-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-stone-600" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* Mobile: Select toggle */}
              <button
                onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelectedCells(new Set()); }}
                className={`md:hidden px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                  selectMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border hover:bg-stone-50"
                }`}
              >
                {selectMode ? "Done" : "Select"}
              </button>
              <button
                onClick={() => { setBatchForm({ startTime: "09:00", endTime: "17:00", roleNames: [] }); setBatchDialog(true); }}
                disabled={selectedCells.size === 0}
                className="px-2.5 py-1 text-xs font-medium border border-border rounded hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Edit ({selectedCells.size})
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedCells.size === 0 || saving}
                className="px-2.5 py-1 text-xs font-medium border border-destructive/50 text-destructive rounded hover:bg-destructive/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Delete
              </button>
              <div className="flex-1" />
              <button
                onClick={handleCopyLastWeek}
                disabled={saving}
                className="px-2.5 py-1 text-xs font-medium border border-border rounded hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Copy Last Week"}
              </button>
              <button
                onClick={() => { setSelectMode(true); const all = new Set<CellKey>(); allMembers.forEach((m) => weekDates.forEach((d) => all.add(`${m.id}|${isoDate(d)}`))); setSelectedCells(all); }}
                className="hidden md:block px-2.5 py-1 text-xs font-medium border border-border rounded hover:bg-stone-50 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedCells(new Set())}
                disabled={selectedCells.size === 0}
                className="hidden md:block px-2.5 py-1 text-xs font-medium border border-border rounded hover:bg-stone-50 disabled:opacity-30 transition-colors"
              >
                Clear
              </button>
            </div>

            <p className="hidden md:block text-[10px] text-muted-foreground mb-2">⌘/Ctrl+click to toggle · Shift+click to range select</p>
            {selectMode && <p className="md:hidden text-[10px] text-muted-foreground mb-2">Tap to toggle · Drag to range select</p>}

            {/* Grid table */}
            <div className="overflow-x-auto border border-border rounded" id="table-grid-container">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-stone-100 border-b border-r border-border px-1.5 py-2 text-left font-semibold text-[10px] min-w-[60px]">Name</th>
                    {weekDates.map((d) => {
                      const ds = isoDate(d);
                      const isTodayD = isToday(d);
                      return (
                        <th key={ds} className={`border-b border-r border-border px-1 py-2 text-center font-semibold min-w-[70px] text-[10px] ${isTodayD ? "bg-stone-200" : "bg-stone-100"}`}>
                          {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getMonth() + 1}/{d.getDate()}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allMembers.map((member) => (
                    <tr key={member.id}>
                      <td className="sticky left-0 z-10 bg-white border-b border-r border-border px-1.5 py-2 font-medium text-[10px] leading-tight">
                        {(() => {
                          const parts = member.displayName.split(" ");
                          if (parts.length <= 1) return member.displayName;
                          return `${parts[0]} ${parts.slice(1).map((p) => p[0] + ".").join(" ")}`;
                        })()}
                      </td>
                      {weekDates.map((d) => {
                        const ds = isoDate(d);
                        const cellKey: CellKey = `${member.id}|${ds}`;
                        const isSelected = selectedCells.has(cellKey);
                        const shift = weekShifts.find((s) => s.memberId === member.id && s.date === ds);
                        const shiftRoles = shift ? (shift.staffRoles ?? []).map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase())).filter(Boolean) as typeof roles : [];
                        return (
                          <td
                            key={ds}
                            onClick={(e) => {
                              if (selectMode) {
                                // Select mode: tap = toggle (like cmd+click)
                                handleCellClick(cellKey, { ...e, metaKey: true, ctrlKey: true, shiftKey: false } as React.MouseEvent);
                              } else if (e.metaKey || e.ctrlKey || e.shiftKey) {
                                // Desktop multi-select
                                handleCellClick(cellKey, e);
                              } else {
                                // Normal click: open sheet to edit/create
                                if (shift) {
                                  setEditingShift(shift);
                                  setShiftForm({
                                    memberId:  shift.memberId ?? member.id,
                                    date:      shift.date,
                                    shiftType: shift.shiftType,
                                    startTime: shift.startTime,
                                    endTime:   shift.endTime,
                                    roleNames: shift.staffRoles ?? [],
                                  });
                                } else {
                                  setEditingShift(null);
                                  setShiftForm({
                                    memberId:  member.id,
                                    date:      ds,
                                    shiftType: "morning",
                                    startTime: "07:00",
                                    endTime:   "14:00",
                                    roleNames: [],
                                  });
                                }
                                setAddDialog(true);
                              }
                            }}
                            onTouchStart={() => {
                              if (!selectMode) return;
                              dragStartRef.current = cellKey;
                              isDraggingRef.current = false;
                              preDragSelectionRef.current = new Set(selectedCells);
                            }}
                            onTouchEnd={() => { dragStartRef.current = null; isDraggingRef.current = false; }}
                            data-cellkey={cellKey}
                            className={`border-b border-r border-border px-1 py-1 text-center cursor-pointer select-none transition-colors min-w-[70px] ${
                              isSelected
                                ? "bg-blue-100 ring-2 ring-inset ring-blue-400"
                                : shift
                                ? "bg-orange-50 hover:bg-orange-100"
                                : "hover:bg-stone-50"
                            }`}
                          >
                            {shift && (
                              <div>
                                <div className="text-[9px] font-medium">{formatTime(shift.startTime)}</div>
                                <div className="text-[9px] font-medium">{formatTime(shift.endTime)}</div>
                                {shiftRoles.length > 0 && (
                                  <div className="flex justify-center gap-1 mt-1">
                                    {shiftRoles.map((r) => (
                                      <RoleIconComp key={r.id} name={r.icon} className="h-3 w-3" style={{ color: r.color }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-stone-50">
                    <td className="sticky left-0 z-10 bg-stone-100 border-r border-border px-1.5 py-2 font-semibold text-[10px]">Total</td>
                    {weekDates.map((d) => {
                      const ds = isoDate(d);
                      const count = weekShifts.filter((s) => s.date === ds).length;
                      return <td key={ds} className="border-r border-border px-2 py-2 text-center font-semibold">{count}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Batch Edit Dialog — same style as Add Shift */}
            <Dialog open={batchDialog} onOpenChange={(open) => { if (!open) setBatchDialog(false); }}>
              <DialogContent className="max-w-md" noPadding>
                <DialogHeader>
                  <DialogTitle mobileTitle={`Edit ${selectedCells.size} shift${selectedCells.size > 1 ? "s" : ""}`}>
                    Edit {selectedCells.size} shift{selectedCells.size > 1 ? "s" : ""}
                  </DialogTitle>
                  <DialogDescription className="hidden">
                    Set shift time and roles for selected cells.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto">
                    {/* Time range */}
                    <div className="px-4 pt-2 pb-4 space-y-4">
                      <div className="flex items-center gap-2 py-2 border-b border-border">
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          type="time"
                          value={batchForm.startTime}
                          onChange={(e) => setBatchForm((f) => ({ ...f, startTime: e.target.value }))}
                          className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                        />
                        <span className="text-muted-foreground">—</span>
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          type="time"
                          value={batchForm.endTime}
                          onChange={(e) => setBatchForm((f) => ({ ...f, endTime: e.target.value }))}
                          className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(() => {
                            const [sh, sm] = batchForm.startTime.split(":").map(Number);
                            const [eh, em] = batchForm.endTime.split(":").map(Number);
                            const h = Math.max(0, eh + em / 60 - (sh + sm / 60));
                            return h % 1 === 0 ? `${h}hr` : `${h.toFixed(1)}hr`;
                          })()})
                        </span>
                      </div>

                      {/* Time Template */}
                      <div>
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5 block">Time Template</span>
                        {allPresets.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No templates yet.</p>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {allPresets.map((p) => {
                              const active = batchForm.startTime === p.startTime && batchForm.endTime === p.endTime;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => setBatchForm((f) => ({ ...f, startTime: p.startTime, endTime: p.endTime }))}
                                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded transition-all text-center ${
                                    active ? "text-white shadow-sm" : "text-muted-foreground bg-muted hover:bg-stone-200"
                                  }`}
                                  style={active ? { backgroundColor: p.color } : undefined}
                                >
                                  <div>{p.name}</div>
                                  <div className={`text-[9px] font-normal ${active ? "text-white/70" : "text-muted-foreground/60"}`}>{formatTime(p.startTime)}–{formatTime(p.endTime)}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-2 bg-muted/50" />

                    {/* Roles */}
                    <div className="px-4 py-4">
                      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Roles</Label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {roles.map((r) => {
                          const selected = batchForm.roleNames.includes(r.name);
                          return (
                            <button
                              key={r.id}
                              onClick={() => setBatchForm((f) => ({
                                ...f,
                                roleNames: selected ? f.roleNames.filter((n) => n !== r.name) : [...f.roleNames, r.name],
                              }))}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                                selected ? "border-stone-900 bg-stone-900 text-white" : "border-border text-stone-500 hover:bg-stone-50"
                              }`}
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "white" : r.color }} />
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Bottom CTA */}
                  <div className="px-4 py-4 border-t border-border mt-auto">
                    <Button
                      onClick={handleBatchApply}
                      disabled={saving}
                      className="w-full h-12 text-sm font-semibold"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Apply to ${selectedCells.size} shift${selectedCells.size > 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
          );
        })()}

        {/* ─── Roles ───────────────────────────────────────────────── */}
        {activeTab === "roles" && (
          <div className="mt-1">
            {/* ── Role detail sheet ── */}
            <Dialog open={roleDetailOpen && !!selectedRole} onOpenChange={(open) => { if (!open) { setRoleDetailOpen(false); } }}>
              <DialogContent noPadding>
                <DialogHeader>
                  <DialogTitle mobileTitle={selectedRole?.name ?? "Role"}>
                    {selectedRole?.name ?? "Role"}
                  </DialogTitle>
                  <DialogDescription className="hidden">Role details and tasks</DialogDescription>
                </DialogHeader>
            {selectedRole && (
              <div className="space-y-4 px-4 pb-4 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div
                      className="h-8 w-8 shrink-0 flex items-center justify-center border"
                      style={{ borderColor: selectedRole.color, color: selectedRole.color }}
                    >
                      <RoleIconComp name={selectedRole.icon} className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-stone-900">{selectedRole.name}</span>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }} />
                      </div>
                      {selectedRole.description && (
                        <p className="text-xs text-muted-foreground truncate">{selectedRole.description}</p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingRole(selectedRole);
                          setRoleForm({
                            name: selectedRole.name,
                            color: selectedRole.color,
                            icon: selectedRole.icon,
                            description: selectedRole.description,
                            permissions: selectedRole.permissions,
                          });
                          setRoleDialog(true);
                        }}
                        className="p-1.5 rounded hover:bg-stone-100 text-muted-foreground hover:text-stone-900 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={async () => { await handleDeleteRole(selectedRole.id); setSelectedRole(null); setRoleDetailOpen(false); }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Task Timeline */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide">Task Timeline</p>
                    {canEdit && (
                      <button
                        onClick={() => {
                          setTaskForm({ title: "", description: "", hasTime: false, startTime: "08:00", endTime: "10:00", requiresEvidence: false, notifyChats: [] });
                          setTaskDialog({ open: true, task: null });
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-border hover:bg-stone-50 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add Task
                      </button>
                    )}
                  </div>

                  {loadingTasks ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (roleTasksCache[selectedRole.id] ?? []).length === 0 ? (
                    <div className="text-center py-10">
                      <ClipboardList className="h-7 w-7 mx-auto text-muted-foreground opacity-25 mb-2" />
                      <p className="text-sm text-muted-foreground">No tasks yet. Add time-based tasks for this role.</p>
                    </div>
                  ) : (
                    <div className="space-y-0 pl-3 border-l-2" style={{ borderColor: selectedRole.color }}>
                      {(roleTasksCache[selectedRole.id] ?? []).map((task) => (
                        <div key={task.id} className="relative pl-4 pb-4 group">
                          <div
                            className="absolute -left-[5px] top-1 h-2 w-2 rounded-full border-2 bg-white"
                            style={{ borderColor: selectedRole.color }}
                          />
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {task.startTime && task.endTime && (
                                <p className="font-mono text-[11px] text-muted-foreground leading-none mb-0.5">
                                  {formatTime(task.startTime)} – {formatTime(task.endTime)}
                                </p>
                              )}
                              <p className="text-sm font-semibold text-stone-900 leading-snug">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                              )}
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={() => {
                                    setTaskForm({ title: task.title, description: task.description, hasTime: !!(task.startTime && task.endTime), startTime: task.startTime ?? "08:00", endTime: task.endTime ?? "10:00", requiresEvidence: task.requiresEvidence ?? false, notifyChats: task.notifyChats ?? [] });
                                    setTaskDialog({ open: true, task });
                                  }}
                                  className="p-1 rounded hover:bg-stone-100 text-muted-foreground hover:text-stone-700 transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
              </DialogContent>
            </Dialog>

              {/* ── Role grid ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">Staff Roles</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Define roles and task timelines for your team</p>
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingRole(null);
                        setRoleForm({ name: "", color: "#44403c", icon: "user", description: "", permissions: {} });
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roles.map((r) => (
                      <div
                        key={r.id}
                        className="border border-border p-3 hover:border-stone-300 transition-colors cursor-pointer group"
                        onClick={() => handleSelectRole(r)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div
                              className="h-8 w-8 shrink-0 flex items-center justify-center border"
                              style={{ borderColor: r.color, color: r.color }}
                            >
                              <RoleIconComp name={r.icon} className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-stone-900">{r.name}</span>
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                              </div>
                              {r.description ? (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</p>
                              ) : (
                                <p className="text-xs text-stone-400 mt-0.5">No description</p>
                              )}
                            </div>
                          </div>
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteRole(r.id); }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>
        )}
      </div>

      {/* ─── Add / Edit Shift Dialog (7shifts-style) ─────────────── */}
      <Dialog open={addDialog} onOpenChange={(open) => { setAddDialog(open); if (!open) setEditingShift(null); }}>
        <DialogContent className="max-w-md" noPadding>
          <DialogHeader>
            <DialogTitle mobileTitle={editingShift ? "Edit shift" : "Create a shift"}>
              {editingShift ? "Edit shift" : "Create a shift"}
            </DialogTitle>
            <DialogDescription className="hidden">
              {editingShift ? "Update shift details." : "Schedule a shift."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {/* Top section — date & time */}
              <div className="px-4 pt-2 pb-4 space-y-4">
                {/* Date */}
                <div className="flex items-center gap-3 py-2 border-b border-border">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0"
                  />
                </div>

                {/* Time range */}
                <div className="flex items-center gap-2 py-2 border-b border-border">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="border-0 p-0 h-auto text-sm font-medium shadow-none focus-visible:ring-0 flex-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({(() => {
                      const [sh, sm] = shiftForm.startTime.split(":").map(Number);
                      const [eh, em] = shiftForm.endTime.split(":").map(Number);
                      const h = Math.max(0, eh + em / 60 - (sh + sm / 60));
                      return h % 1 === 0 ? `${h}hr` : `${h.toFixed(1)}hr`;
                    })()})
                  </span>
                </div>

                {/* Time Template */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Time Template</span>
                    {canEdit && (
                      <button
                        onClick={() => { setEditingPreset(null); setPresetForm({ name: "", startTime: shiftForm.startTime, endTime: shiftForm.endTime, color: "#44403c" }); setPresetDialog(true); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    )}
                  </div>
                  {allPresets.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No templates yet. Add one to quickly fill shift times.</p>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {allPresets.map((p) => {
                        const active = shiftForm.startTime === p.startTime && shiftForm.endTime === p.endTime;
                        return (
                          <div key={p.id} className="relative group">
                            <button
                              onClick={() => setShiftForm((f) => ({ ...f, startTime: p.startTime, endTime: p.endTime }))}
                              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded transition-all text-center ${
                                active ? "text-white shadow-sm" : "text-muted-foreground bg-muted hover:bg-stone-200"
                              }`}
                              style={active ? { backgroundColor: p.color } : undefined}
                            >
                              <div>{p.name}</div>
                              <div className={`text-[9px] font-normal ${active ? "text-white/70" : "text-muted-foreground/60"}`}>{formatTime(p.startTime)}–{formatTime(p.endTime)}</div>
                            </button>
                            {canEdit && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletePresetConfirm(p.id); }}
                                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-stone-400 text-white flex items-center justify-center hover:bg-destructive transition-colors"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-2 bg-muted/50" />

              {/* Bottom section — employee, role, notes */}
              <div className="px-4 py-4 space-y-4">
                {/* Employee & Role side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Assign employee</Label>
                    <Select
                      value={shiftForm.memberId}
                      onValueChange={(v) => setShiftForm((f) => ({ ...f, memberId: v ?? "" }))}
                    >
                      <SelectTrigger className="mt-1 border-0 border-b border-border rounded-none px-0 shadow-none focus:ring-0">
                        <SelectValue placeholder="Select...">
                          {team.find((m) => m.id === shiftForm.memberId)?.displayName ?? "Select..."}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {team.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Roles</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {roles.map((r) => {
                        const selected = shiftForm.roleNames.includes(r.name);
                        return (
                          <button
                            key={r.id}
                            onClick={() => setShiftForm((f) => ({
                              ...f,
                              roleNames: selected
                                ? f.roleNames.filter((n) => n !== r.name)
                                : [...f.roleNames, r.name],
                            }))}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                              selected
                                ? "border-stone-900 bg-stone-900 text-white"
                                : "border-border text-stone-500 hover:bg-stone-50"
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "white" : r.color }} />
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Shift notes */}
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Shift notes</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Let the employee know any important details about the shift.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="px-4 py-4 border-t border-border mt-auto">
              <Button
                onClick={handleAddShift}
                disabled={saving || (!editingShift && !shiftForm.memberId)}
                className="w-full h-12 text-sm font-semibold"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingShift ? "Save shift" : "Create shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Role Dialog ─────────────────────────────────────────── */}
      <Dialog open={roleDialog} onOpenChange={(open) => { setRoleDialog(open); if (!open) setEditingRole(null); }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
            <DialogDescription>
              {editingRole ? "Update this role's details and permissions." : "Define a new staff role."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Icon picker */}
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid grid-cols-8 gap-1">
                {ROLE_ICON_LIST.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, icon: iconName }))}
                    className={`h-8 w-8 flex items-center justify-center transition-colors ${
                      roleForm.icon === iconName
                        ? "border-2 border-stone-900 bg-stone-100"
                        : "border border-transparent bg-stone-100 hover:bg-stone-200"
                    }`}
                    title={iconName}
                  >
                    <RoleIconComp name={iconName} className="h-4 w-4 text-stone-700" />
                  </button>
                ))}
              </div>
            </div>

            {/* Role name */}
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Barista, Shift Lead, Cashier"
              />
            </div>

            {/* Color picker */}
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {ROLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, color: c }))}
                    className={`h-6 w-6 rounded-full transition-all ${
                      roleForm.color === c ? "ring-2 ring-offset-1 ring-stone-900 scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does this role do?"
                className="resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Permissions */}
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

      {/* ─── Add/Edit Task Dialog ────────────────────────────────── */}
      <Dialog open={taskDialog.open} onOpenChange={(open) => { if (!open) setTaskDialog({ open: false, task: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{taskDialog.task ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              {taskDialog.task ? "Update this time-period task." : "Add a task for a specific time period in this role."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Task Title *</Label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Open register, Prep station, Brief team"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Details <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Step-by-step instructions or notes..."
                className="resize-none text-sm"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Time Window</Label>
              <button
                onClick={() => setTaskForm((f) => ({ ...f, hasTime: !f.hasTime }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                  taskForm.hasTime ? "bg-stone-900 border-stone-900" : "bg-white border-border"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  taskForm.hasTime ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>
            {taskForm.hasTime && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={taskForm.startTime}
                    onChange={(e) => setTaskForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={taskForm.endTime}
                    onChange={(e) => setTaskForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label>Require Evidence</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Staff must upload a photo/video to complete</p>
              </div>
              <button
                onClick={() => setTaskForm((f) => ({ ...f, requiresEvidence: !f.requiresEvidence }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                  taskForm.requiresEvidence ? "bg-stone-900 border-stone-900" : "bg-white border-border"
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  taskForm.requiresEvidence ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>
            <div className="space-y-1.5">
              <Label>Notify Chat on Completion</Label>
              <p className="text-xs text-muted-foreground">Send a message to selected chats when this task is completed</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {chatOptions.filter((c) => c.type === "group").map((c) => {
                  const selected = taskForm.notifyChats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setTaskForm((f) => ({
                        ...f,
                        notifyChats: selected
                          ? f.notifyChats.filter((id) => id !== c.id)
                          : [...f.notifyChats, c.id],
                      }))}
                      className={`px-2.5 py-1 text-xs font-medium border rounded transition-colors ${
                        selected
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-border text-stone-500 hover:bg-stone-50"
                      }`}
                    >
                      {c.name ?? "Unnamed"}
                    </button>
                  );
                })}
                {chatOptions.filter((c) => c.type === "group").length === 0 && (
                  <p className="text-xs text-muted-foreground">No group chats available</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setTaskDialog({ open: false, task: null })}>Cancel</Button>
            <Button onClick={handleSaveTask} disabled={savingTask || !taskForm.title}>
              {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : taskDialog.task ? "Save" : "Add Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View Role Tasks Dialog (read-only for staff) ─────────── */}
      <Dialog open={viewTasksDialog.open} onOpenChange={(open) => { if (!open) setViewTasksDialog({ open: false, role: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewTasksDialog.role && (
                <div className="h-6 w-6 flex items-center justify-center" style={{ color: viewTasksDialog.role.color }}>
                  <RoleIconComp name={viewTasksDialog.role.icon} className="h-4 w-4" />
                </div>
              )}
              {viewTasksDialog.role?.name ?? "Role"} Tasks
            </DialogTitle>
            <DialogDescription>
              {viewTasksDialog.role?.description || "Tasks for your shift role today."}
            </DialogDescription>
          </DialogHeader>
          {viewTasksDialog.role && (
            <div className="py-1">
              {(roleTasksCache[viewTasksDialog.role.id] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No tasks defined for this role yet.</p>
              ) : (
                <div className="space-y-0 pl-3 border-l-2" style={{ borderColor: viewTasksDialog.role.color }}>
                  {(roleTasksCache[viewTasksDialog.role.id] ?? []).map((task) => (
                    <div key={task.id} className="relative pl-4 pb-4">
                      <div
                        className="absolute -left-[5px] top-1 h-2 w-2 rounded-full border-2 bg-white"
                        style={{ borderColor: viewTasksDialog.role!.color }}
                      />
                      {task.startTime && task.endTime && (
                        <p className="font-mono text-[11px] text-muted-foreground leading-none mb-0.5">
                          {formatTime(task.startTime)} – {formatTime(task.endTime)}
                        </p>
                      )}
                      <p className="text-sm font-semibold text-stone-900 leading-snug">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="outline" onClick={() => setViewTasksDialog({ open: false, role: null })}>Close</Button>
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
                        const dayTimes = f.dayTimes.map((dt, j) => j === i ? { ...dt, enabled: !dt.enabled } : dt);
                        return { ...f, dayTimes };
                      })
                    }
                    className={`flex-1 py-1.5 text-xs font-semibold border transition-colors ${
                      availForm.dayTimes[i].enabled
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-white text-stone-500 border-border hover:bg-stone-50"
                    }`}
                  >
                    {d}
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

            {/* Per-day time settings */}
            <div className="space-y-2">
              {availForm.dayTimes.map((dt, i) => {
                if (!dt.enabled) return null;
                return (
                  <div key={DAY_NAMES[i]} className="space-y-1.5 rounded border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-700">{DAY_NAMES[i]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Full Day</span>
                        <button onClick={() => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, fullDay: !d.fullDay } : d);
                          return { ...f, dayTimes };
                        })}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors ${dt.fullDay ? "bg-stone-900 border-stone-900" : "bg-white border-border"}`}>
                          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${dt.fullDay ? "translate-x-3" : "translate-x-0.5"}`}
                            style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                        </button>
                      </div>
                    </div>
                    {!dt.fullDay && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="time" value={dt.startTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, startTime: e.target.value } : d);
                          return { ...f, dayTimes };
                        })} />
                        <Input type="time" value={dt.endTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                          const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, endTime: e.target.value } : d);
                          return { ...f, dayTimes };
                        })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
      {/* ─── Delete Preset Confirm ─────────────────────────────── */}
      <AlertDialog open={!!deletePresetConfirm} onOpenChange={(open) => { if (!open) setDeletePresetConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePresetConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePresetConfirm) handleDeletePreset(deletePresetConfirm);
                setDeletePresetConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Shift Preset Dialog ──────────────────────────────── */}
      <Dialog open={presetDialog} onOpenChange={(open) => { if (!open) { setPresetDialog(false); setEditingPreset(null); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{editingPreset ? "Edit Preset" : "New Preset"}</DialogTitle>
            <DialogDescription>Save a reusable shift time template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={presetForm.name} onChange={(e) => setPresetForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Early Morning" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input type="time" value={presetForm.startTime} onChange={(e) => setPresetForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input type="time" value={presetForm.endTime} onChange={(e) => setPresetForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {["#44403c", "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setPresetForm((f) => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${presetForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between pt-1">
            <div>
              {editingPreset && (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { handleDeletePreset(editingPreset.id); setPresetDialog(false); setEditingPreset(null); }}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPresetDialog(false); setEditingPreset(null); }}>Cancel</Button>
              <Button onClick={handleSavePreset} disabled={!presetForm.name}>
                {editingPreset ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Export Schedule Dialog ─────────────────────────── */}
      <Dialog open={downloadDialog} onOpenChange={(open) => { if (!open) setDownloadDialog(false); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Export Schedule</DialogTitle>
            <DialogDescription>Select date range and format.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={downloadRange.start} onChange={(e) => setDownloadRange((r) => ({ ...r, start: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={downloadRange.end} onChange={(e) => setDownloadRange((r) => ({ ...r, end: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex border border-border overflow-hidden w-fit rounded">
                {(["pdf", "png", "csv"] as const).map((fmt, i) => (
                  <button key={fmt} onClick={() => setDownloadFormat(fmt)}
                    className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${downloadFormat === fmt ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
                  >{fmt === "csv" ? "CSV" : fmt.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDownloadDialog(false)}>Cancel</Button>
            <Button
              disabled={!downloadRange.start || !downloadRange.end || downloadRange.start > downloadRange.end}
              onClick={() => {
                setDownloadDialog(false);
                const { start, end } = downloadRange;
                if (downloadFormat === "pdf") handleDownloadPDF(start, end);
                else if (downloadFormat === "png") handleDownloadPNG(start, end);
                else handleDownloadCSV(start, end);
              }}
            >
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Shift Details Dialog ─────────────────────────────── */}
      {shiftDetailShift && (() => {
        const s = shiftDetailShift;
        const dateLabel = new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        const matchedRoles = (s.staffRoles ?? [])
          .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
          .filter(Boolean) as StaffRole[];
        // Coworkers: same date, same org, different member
        const coworkerShifts = shifts.filter(
          (cs) => cs.date === s.date && cs.memberId !== myMemberId && cs.memberId !== null
        );
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setShiftDetailShift(null); }}>
            <DialogContent className="max-w-sm p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>Shift Details</DialogTitle>
                <DialogDescription>Your shift on {dateLabel}</DialogDescription>
              </DialogHeader>

              {/* Top section */}
              <div className="px-5 pt-5 pb-4 space-y-3">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{dateLabel}</p>
                <p className="text-3xl font-bold font-mono tracking-tight text-stone-900">
                  {formatTime(s.startTime)}<span className="text-stone-400 mx-2">→</span>{formatTime(s.endTime)}
                </p>

                {/* Shift type + roles */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: SHIFT_COLORS[s.shiftType] }}
                  />
                  <span className="text-sm text-stone-700">{currentOrg?.name ?? "Store"} · {SHIFT_LABELS[s.shiftType]}</span>
                  {matchedRoles.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1.5">
                      <span className="text-stone-300">·</span>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="text-xs font-medium text-stone-600">{r.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Working with */}
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs font-semibold text-stone-500 mb-2.5">Working with</p>
                {coworkerShifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No other staff scheduled.</p>
                ) : (
                  <div className="space-y-2.5">
                    {coworkerShifts.map((cs) => {
                      const member = team.find((m) => m.id === cs.memberId);
                      const name = member?.displayName ?? cs.staffName ?? "Staff";
                      const cwRoles = (cs.staffRoles ?? [])
                        .map((rn) => roles.find((r) => r.name.toLowerCase() === rn.toLowerCase()))
                        .filter(Boolean) as StaffRole[];
                      return (
                        <div key={cs.id} className="flex items-center gap-2.5">
                          <div className={`h-7 w-7 rounded-sm flex items-center justify-center text-xs font-semibold shrink-0 ${avatarBg(name)}`}>
                            {initials(name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-stone-800 truncate">{name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{formatTime(cs.startTime)}–{formatTime(cs.endTime)}</span>
                              {cwRoles.slice(0, 2).map((r) => (
                                <span key={r.id} className="inline-flex items-center gap-1">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                                  <span className="text-[11px] text-stone-500">{r.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Today's tasks for this shift */}
              {s.date === todayStr && todayTasks.length > 0 && (
                <div className="border-t border-border px-5 py-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-semibold text-stone-500">Tasks</p>
                    <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 border border-stone-200">
                      {todayTasks.filter((t) => taskCompletions[t.id]).length}/{todayTasks.length} done
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {todayTasks.map((task) => {
                      const done = !!taskCompletions[task.id];
                      return (
                        <button
                          key={task.id}
                          onClick={() => toggleTaskDone(task.id)}
                          className="flex items-start gap-2.5 w-full text-left py-1 hover:bg-stone-50 -mx-1 px-1 transition-colors"
                        >
                          <div className={`mt-0.5 h-4 w-4 shrink-0 border flex items-center justify-center transition-colors ${done ? "bg-stone-900 border-stone-900" : "border-stone-400"}`}>
                            {done && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            {task.startTime && task.endTime && (
                              <span className="font-mono text-[11px] text-stone-400 shrink-0 tabular-nums">
                                {task.startTime.slice(0, 5)}–{task.endTime.slice(0, 5)}
                              </span>
                            )}
                            <span className={`text-sm leading-snug ${done ? "line-through text-muted-foreground" : "text-stone-800"}`}>
                              {task.title}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="border-t border-border p-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => { setShiftDetailShift(null); openCoverDialog(s); }}
                >
                  <UserPlus className="h-4 w-4 mr-2" /> Find Cover
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setShiftDetailShift(null); openTradeDialog(s); }}
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2" /> Trade Shift
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

    </PermissionGuard>
  );
}
