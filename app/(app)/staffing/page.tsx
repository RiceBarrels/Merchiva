"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus, Loader2, ChevronLeft, ChevronRight, X, Shield, Palette, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import {
  getTeamForScheduling, getShifts, addShift, deleteShift,
  getStaffRoles, addStaffRole, updateStaffRole, deleteStaffRole,
} from "@/lib/db/staffing";
import type { OrgMember, Shift, ShiftType, StaffRole, StaffRolePermissions } from "@/lib/types";
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

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function avatarBg(name: string): string {
  return AVATAR_BG[strHash(name) % AVATAR_BG.length];
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

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type MainTab = "myShifts" | "schedule" | "roles";

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

  // Add shift dialog
  const [addDialog, setAddDialog] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    memberId:  "",
    date:      isoDate(new Date()),
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime:   "14:00",
  });
  const [saving, setSaving] = useState(false);

  // Role dialog
  const [roleDialog,   setRoleDialog]   = useState(false);
  const [editingRole,  setEditingRole]  = useState<StaffRole | null>(null);
  const [roleForm,     setRoleForm]     = useState({
    name:        "",
    color:       "#44403c",
    permissions: {} as StaffRolePermissions,
  });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId || team.length === 0) return;
    setMyMemberId(team.find((m) => m.userId === userId)?.id ?? null);
  }, [team, userId]);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    Promise.all([getTeamForScheduling(organizationId), getShifts(4), getStaffRoles()])
      .then(([t, sh, r]) => { setTeam(t); setShifts(sh); setRoles(r); })
      .catch((err) => console.error("Failed to load staffing:", err))
      .finally(() => setLoading(false));
  }, [organizationId]);

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

  const todayStr = isoDate(new Date());
  const isToday  = (d: Date) => isoDate(d) === todayStr;

  const monthYear = weekDates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const weekShifts = shifts.filter(
    (s) => s.date >= isoDate(weekDates[0]) && s.date <= isoDate(weekDates[6])
  );
  const myShifts = weekShifts.filter((s) => s.memberId === myMemberId);

  const canEdit     = isOwner || can("staffing", "edit");
  const isStaff     = role === "staff";
  const visibleTabs: MainTab[] = isStaff ? ["myShifts", "roles"] : ["myShifts", "schedule", "roles"];

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
              </button>
            );
          })}
        </div>

        {/* ─── Week Calendar Strip (shown for My Shifts + Schedule) ── */}
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
                const ds        = isoDate(d);
                const isTodayD  = isToday(d);
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
          <div className="divide-y divide-border">
            {weekDates.map((d) => {
              const ds       = isoDate(d);
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
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteShift(shift.id)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
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
        )}

        {/* ─── Schedule (manager view) ──────────────────────────────── */}
        {activeTab === "schedule" && !isStaff && (
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
                        const initials = shift.staffName
                          .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                        return (
                          <div key={shift.id} className="flex items-center gap-3 group">
                            <div
                              className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${avatarBg(shift.staffName)}`}
                            >
                              {initials}
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
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                {roles.map((role) => {
                  const activePerms = ROLE_PERMISSION_LABELS.filter((p) => role.permissions[p.key]);
                  return (
                    <div
                      key={role.id}
                      className="border border-border p-3 space-y-2 hover:border-stone-300 transition-colors cursor-pointer"
                      onClick={() => {
                        setEditingRole(role);
                        setRoleForm({ name: role.name, color: role.color, permissions: role.permissions });
                        setRoleDialog(true);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: role.color }} />
                          <span className="font-semibold text-sm">{role.name}</span>
                        </div>
                        {canEdit && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
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
    </PermissionGuard>
  );
}
