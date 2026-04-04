"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Loader2, ChevronLeft, ChevronRight, X, Shield, Palette, Trash2,
  MoreHorizontal, ArrowLeftRight, UserPlus, CalendarX, Search, Check, Ban,
  ChevronDown, ChevronUp, User, Coffee, Utensils, ChefHat, Truck, Package,
  Clipboard, Wrench, Headphones, Store, Banknote, Sparkles, Box,
  ShoppingCart, Receipt, HeartPulse, Baby, Dog, Leaf, Music, Camera,
  Hammer, Zap, Star, Award, Briefcase, Phone, Mail, Clock, ArrowLeft,
  ClipboardList, Pencil,
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import {
  getTeamForScheduling, getShifts, addShift, updateShift, deleteShift,
  getStaffRoles, addStaffRole, updateStaffRole, deleteStaffRole,
  getRoleTasks, addRoleTask, updateRoleTask, deleteRoleTask,
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
  StaffAvailability, TimeOffRequest, ShiftTrade, RoleTask,
} from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { hapticLight, hapticSuccess, hapticWarning } from "@/lib/haptics";

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
  "shield": Shield,
};

const ROLE_ICON_LIST = [
  "coffee", "utensils", "chef-hat", "store", "receipt", "banknote",
  "package", "box", "shopping-cart", "truck", "clipboard", "clipboard",
  "wrench", "hammer", "sparkles", "headphones", "heart-pulse", "shield",
  "briefcase", "award", "star", "clock", "phone", "mail",
  "leaf", "music", "camera", "palette", "baby", "dog",
  "zap", "user",
].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

function RoleIconComp({ name, className }: { name: string; className?: string }) {
  const Comp = ROLE_ICON_MAP[name] ?? User;
  return <Comp className={className} />;
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

  // ─── Add / Edit Shift ───
  const [addDialog,     setAddDialog]     = useState(false);
  const [editingShift,  setEditingShift]  = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState({
    memberId:  "",
    date:      isoDate(new Date()),
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime:   "14:00",
    roleName:  "",
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
  const [taskForm,        setTaskForm]        = useState({ title: "", description: "", startTime: "08:00", endTime: "10:00" });
  const [savingTask,      setSavingTask]      = useState(false);
  const [viewTasksDialog, setViewTasksDialog] = useState<{ open: boolean; role: StaffRole | null }>({ open: false, role: null });

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
      const w = panelW.current || 300;

      if (Math.abs(dx) > w * 0.2) {
        // Animate to full panel width, then swap data
        const target = dx < 0 ? -w : w;
        setSwiping(false);
        setSlideAnim(true);
        setSwipeOffset(target);
        setTimeout(() => {
          if (dx < 0) nextWeekRef.current(); else prevWeekRef.current();
          setSwipeOffset(0);
          setSlideAnim(false);
        }, 200);
      } else {
        setSwiping(false);
        setSwipeOffset(0);
      }
      swipeAxis.current = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
  }, [slideAnim]);

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
    setSaving(true);
    try {
      if (editingShift) {
        const member = team.find((m) => m.id === shiftForm.memberId);
        const sh = await updateShift(editingShift.id, {
          memberId:  shiftForm.memberId,
          staffName: member?.displayName ?? editingShift.staffName,
          staffRole: shiftForm.roleName || null,
          date:      shiftForm.date,
          shiftType: shiftForm.shiftType,
          startTime: shiftForm.startTime,
          endTime:   shiftForm.endTime,
        });
        setShifts((prev) => prev.map((s) => s.id === sh.id ? sh : s));
      } else {
        const member = team.find((m) => m.id === shiftForm.memberId);
        if (!member) return;
        const sh = await addShift({
          memberId:        member.id,
          staffName:       member.displayName,
          staffRole:       shiftForm.roleName || null,
          date:            shiftForm.date,
          shiftType:       shiftForm.shiftType,
          startTime:       shiftForm.startTime,
          endTime:         shiftForm.endTime,
          predictedDemand: "medium",
        }, userId);
        setShifts((prev) => [...prev, sh]);
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
        const r = await addStaffRole(roleForm, userId, organizationId);
        setRoles((prev) => [...prev, r]);
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
    } catch (err) {
      console.error("Failed to load role tasks:", err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleSelectRole = (r: StaffRole) => {
    setSelectedRole(r);
    loadRoleTasksFor(r.id);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title || !selectedRole) return;
    setSavingTask(true);
    try {
      const existing = roleTasksCache[selectedRole.id] ?? [];
      if (taskDialog.task) {
        await updateRoleTask(taskDialog.task.id, {
          title: taskForm.title,
          description: taskForm.description,
          startTime: taskForm.startTime,
          endTime: taskForm.endTime,
        });
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: existing.map((t) =>
            t.id === taskDialog.task!.id
              ? { ...t, title: taskForm.title, description: taskForm.description, startTime: taskForm.startTime, endTime: taskForm.endTime }
              : t
          ).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }));
      } else {
        const t = await addRoleTask({
          roleId: selectedRole.id,
          organizationId: organizationId ?? null,
          title: taskForm.title,
          description: taskForm.description,
          startTime: taskForm.startTime,
          endTime: taskForm.endTime,
          sortOrder: existing.length,
        });
        setRoleTasksCache((prev) => ({
          ...prev,
          [selectedRole.id]: [...existing, t].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }));
      }
      setTaskDialog({ open: false, task: null });
      setTaskForm({ title: "", description: "", startTime: "08:00", endTime: "10:00" });
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

  const prevWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7); return getWeekDates(d);
  }, [weekStart]);
  const nextWeekDates = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return getWeekDates(d);
  }, [weekStart]);


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
                  setEditingShift(null);
                  setShiftForm({
                    memberId:  team[0]?.id ?? "",
                    date:      selectedDay,
                    shiftType: "morning",
                    startTime: "07:00",
                    endTime:   "14:00",
                    roleName:  "",
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

        {/* ─── Week Calendar Strip (swipe left/right to change weeks) ── */}
        {activeTab !== "roles" && (
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
                    transition: swiping ? "none" : slideAnim ? "transform 200ms ease-out" : "none",
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
                        {dayShifts.map((shift) => {
                          const matchedRole = shift.staffRole
                            ? roles.find((r) => r.name.toLowerCase() === shift.staffRole!.toLowerCase())
                            : null;
                          return (
                          <div key={shift.id} className="flex items-center gap-3">
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
                                {matchedRole && (
                                  <>
                                    <span className="text-stone-300">&middot;</span>
                                    <span className="inline-flex items-center gap-1">
                                      <span
                                        className="inline-block h-2 w-2 rounded-full shrink-0"
                                        style={{ backgroundColor: matchedRole.color }}
                                      />
                                      <span className="text-xs font-medium text-stone-600">{matchedRole.name}</span>
                                    </span>
                                    <button
                                      onClick={async () => {
                                        await loadRoleTasksFor(matchedRole.id);
                                        setViewTasksDialog({ open: true, role: matchedRole });
                                      }}
                                      className="text-[11px] font-medium underline-offset-2 hover:underline text-stone-400 hover:text-stone-700 transition-colors"
                                    >
                                      View tasks
                                    </button>
                                  </>
                                )}
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
                        {dayShifts.map((shift) => {
                          const shiftRole = shift.staffRole
                            ? roles.find((r) => r.name.toLowerCase() === shift.staffRole!.toLowerCase())
                            : null;
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
                                {shiftRole && (
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="inline-block h-2 w-2 rounded-full shrink-0"
                                      style={{ backgroundColor: shiftRole.color }}
                                    />
                                    <span className="text-xs font-medium text-stone-500">{shiftRole.name}</span>
                                  </span>
                                )}
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
                                      roleName:  shift.staffRole ?? "",
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
          <div className="mt-1">
            {/* ── Role detail view ── */}
            {selectedRole ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="p-1 rounded hover:bg-stone-100 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 text-stone-600" />
                  </button>
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
                        onClick={async () => { await handleDeleteRole(selectedRole.id); setSelectedRole(null); }}
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
                          setTaskForm({ title: "", description: "", startTime: "08:00", endTime: "10:00" });
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
                              <p className="font-mono text-[11px] text-muted-foreground leading-none mb-0.5">
                                {formatTime(task.startTime)} – {formatTime(task.endTime)}
                              </p>
                              <p className="text-sm font-semibold text-stone-900 leading-snug">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
                              )}
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={() => {
                                    setTaskForm({ title: task.title, description: task.description, startTime: task.startTime, endTime: task.endTime });
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
            ) : (
              /* ── Role grid ── */
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
            )}
          </div>
        )}
      </div>

      {/* ─── Add / Edit Shift Dialog ──────────────────────────────── */}
      <Dialog open={addDialog} onOpenChange={(open) => { setAddDialog(open); if (!open) setEditingShift(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
            <DialogDescription>
              {editingShift ? "Update shift details." : "Schedule a shift for a team member."}
            </DialogDescription>
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
            {roles.length > 0 && (
              <div className="space-y-1.5">
                <Label>Role <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select
                  value={shiftForm.roleName}
                  onValueChange={(v) => setShiftForm((f) => ({ ...f, roleName: v === "__none__" ? "" : (v ?? "") }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No role assigned">
                      {shiftForm.roleName
                        ? (() => {
                            const r = roles.find((r) => r.name === shiftForm.roleName);
                            return r ? (
                              <span className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                <RoleIconComp name={r.icon} className="h-3.5 w-3.5 shrink-0" />
                                <span>{r.name}</span>
                              </span>
                            ) : shiftForm.roleName;
                          })()
                        : "No role assigned"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No role</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.name}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                          <RoleIconComp name={r.icon} className="h-3.5 w-3.5 shrink-0" />
                          <span>{r.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setAddDialog(false); setEditingShift(null); }}>Cancel</Button>
            <Button onClick={handleAddShift} disabled={saving || (!editingShift && !shiftForm.memberId)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingShift ? "Save" : "Add Shift"}
            </Button>
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
                      <p className="font-mono text-[11px] text-muted-foreground leading-none mb-0.5">
                        {formatTime(task.startTime)} – {formatTime(task.endTime)}
                      </p>
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
