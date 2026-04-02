"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Clock,
  TrendingUp,
  Zap,
  Plus,
  Loader2,
  Trash2,
  Shield,
  Palette,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import {
  getTeamForScheduling,
  getShifts,
  addShift,
  deleteShift,
  getStaffRoles,
  addStaffRole,
  updateStaffRole,
  deleteStaffRole,
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

function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatShortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDayNum(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function StaffingPage() {
  const { organizationId } = usePermissions();
  const [team, setTeam] = useState<OrgMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Add shift popover
  const [addTarget, setAddTarget] = useState<{ memberId: string; date: string } | null>(null);
  const [shiftForm, setShiftForm] = useState({
    shiftType: "morning" as ShiftType,
    startTime: "07:00",
    endTime: "14:00",
  });
  const [saving, setSaving] = useState(false);

  // Role dialog
  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<StaffRole | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    color: "#44403c",
    permissions: {} as StaffRolePermissions,
  });

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

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
  const thisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    setWeekStart(monday);
  };

  const handleShiftTypeChange = (type: ShiftType) => {
    const timeMap: Record<ShiftType, { start: string; end: string }> = {
      morning:   { start: "07:00", end: "14:00" },
      afternoon: { start: "13:00", end: "20:00" },
      evening:   { start: "14:00", end: "21:00" },
      closing:   { start: "18:00", end: "22:00" },
    };
    setShiftForm({ shiftType: type, startTime: timeMap[type].start, endTime: timeMap[type].end });
  };

  const handleAddShift = async () => {
    if (!addTarget || !userId) return;
    const member = team.find((m) => m.id === addTarget.memberId);
    if (!member) return;
    setSaving(true);
    try {
      const sh = await addShift({
        memberId: member.id,
        staffName: member.displayName,
        staffRole: member.role,
        date: addTarget.date,
        shiftType: shiftForm.shiftType,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        predictedDemand: "medium",
      }, userId);
      setShifts((prev) => [...prev, sh]);
      setAddTarget(null);
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
        await updateStaffRole(editingRole.id, { name: roleForm.name, color: roleForm.color, permissions: roleForm.permissions });
        setRoles((prev) => prev.map((r) => r.id === editingRole.id ? { ...r, ...roleForm } : r));
      } else {
        const r = await addStaffRole({ name: roleForm.name, color: roleForm.color, permissions: roleForm.permissions }, userId);
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

  // Stats
  const weekShifts = shifts.filter((s) => {
    const sd = s.date;
    return sd >= formatDate(weekDates[0]) && sd <= formatDate(weekDates[6]);
  });
  const totalHours = weekShifts.reduce((sum, s) => {
    const [sh, sm] = s.startTime.split(":").map(Number);
    const [eh, em] = s.endTime.split(":").map(Number);
    return sum + (eh + em / 60 - (sh + sm / 60));
  }, 0);

  const isToday = (d: Date) => formatDate(d) === formatDate(new Date());

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard section="staffing">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {team.length} team members &middot; {weekShifts.length} shifts this week &middot; {totalHours.toFixed(0)}h scheduled
          </p>
        </div>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {/* ─── Schedule Tab (7shifts-style grid) ──────────────────── */}
        <TabsContent value="schedule" className="mt-4 space-y-3">
          {/* Week nav */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevWeek} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={thisWeek} className="h-8 text-xs">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={nextWeek} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium ml-2">
              {weekDates[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} — {weekDates[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </div>

          {/* Grid */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header row */}
                <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-border">
                  <div className="p-2 text-xs font-semibold text-muted-foreground border-r border-border flex items-center">
                    <Users className="h-3.5 w-3.5 mr-1.5" /> Team
                  </div>
                  {weekDates.map((d) => (
                    <div
                      key={formatDate(d)}
                      className={`p-2 text-center border-r border-border last:border-r-0 ${
                        isToday(d) ? "bg-stone-900 text-white" : ""
                      }`}
                    >
                      <p className="text-xs font-semibold">{formatShortDay(d)}</p>
                      <p className={`text-[11px] ${isToday(d) ? "text-stone-300" : "text-muted-foreground"}`}>
                        {formatDayNum(d)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Member rows */}
                {team.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No team members yet. Invite members from the Team page.
                  </div>
                ) : (
                  team.map((member) => (
                    <div
                      key={member.id}
                      className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-border last:border-b-0 group/row"
                    >
                      {/* Member info */}
                      <div className="p-2 border-r border-border flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                          {member.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">{member.displayName}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                        </div>
                      </div>

                      {/* Day cells */}
                      {weekDates.map((d) => {
                        const dateStr = formatDate(d);
                        const dayShifts = shifts.filter(
                          (s) => s.memberId === member.id && s.date === dateStr
                        );
                        const isAddOpen = addTarget?.memberId === member.id && addTarget.date === dateStr;

                        return (
                          <div
                            key={dateStr}
                            className={`relative p-1 border-r border-border last:border-r-0 min-h-[64px] ${
                              isToday(d) ? "bg-stone-50" : ""
                            }`}
                          >
                            {/* Existing shifts */}
                            {dayShifts.map((shift) => (
                              <div
                                key={shift.id}
                                className="rounded px-1.5 py-1 mb-1 text-white text-[10px] leading-tight group/shift relative"
                                style={{ backgroundColor: SHIFT_COLORS[shift.shiftType] }}
                              >
                                <p className="font-semibold">{SHIFT_LABELS[shift.shiftType]}</p>
                                <p className="opacity-80">{shift.startTime}-{shift.endTime}</p>
                                <button
                                  onClick={() => handleDeleteShift(shift.id)}
                                  className="absolute top-0.5 right-0.5 opacity-0 group-hover/shift:opacity-100 p-0.5 rounded bg-black/20 hover:bg-black/40 transition-opacity"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            ))}

                            {/* Add shift button */}
                            {!isAddOpen && (
                              <button
                                onClick={() => {
                                  setAddTarget({ memberId: member.id, date: dateStr });
                                  setShiftForm({ shiftType: "morning", startTime: "07:00", endTime: "14:00" });
                                }}
                                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
                              >
                                <div className="rounded bg-stone-200 hover:bg-stone-300 p-0.5 transition-colors">
                                  <Plus className="h-3.5 w-3.5 text-stone-600" />
                                </div>
                              </button>
                            )}

                            {/* Inline add form */}
                            {isAddOpen && (
                              <div className="absolute z-10 top-0 left-0 w-48 bg-white rounded-lg shadow-lg border border-border p-2 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold">Add Shift</p>
                                  <button onClick={() => setAddTarget(null)} className="p-0.5 rounded hover:bg-muted">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                  {(Object.keys(SHIFT_LABELS) as ShiftType[]).map((t) => (
                                    <button
                                      key={t}
                                      onClick={() => handleShiftTypeChange(t)}
                                      className={`rounded px-2 py-1 text-[10px] font-semibold text-white transition-opacity ${
                                        shiftForm.shiftType === t ? "opacity-100 ring-2 ring-offset-1 ring-stone-400" : "opacity-50"
                                      }`}
                                      style={{ backgroundColor: SHIFT_COLORS[t] }}
                                    >
                                      {SHIFT_LABELS[t]}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-1">
                                  <Input
                                    type="time"
                                    value={shiftForm.startTime}
                                    onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                                    className="h-7 text-[10px] px-1"
                                  />
                                  <Input
                                    type="time"
                                    value={shiftForm.endTime}
                                    onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full h-7 text-xs"
                                  onClick={handleAddShift}
                                  disabled={saving}
                                >
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card>

          {/* Shift legend */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {(Object.keys(SHIFT_LABELS) as ShiftType[]).map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SHIFT_COLORS[t] }} />
                {SHIFT_LABELS[t]}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ─── Roles Tab ───────────────────────────────────────────── */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Staff Roles</CardTitle>
                  <CardDescription>Define roles with specific permissions for your team</CardDescription>
                </div>
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
              </div>
            </CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Shield className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    No roles defined yet. Create roles like &quot;Barista&quot;, &quot;Cashier&quot;, or &quot;Shift Lead&quot;.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roles.map((role) => {
                    const activePerms = ROLE_PERMISSION_LABELS.filter((p) => role.permissions[p.key]);
                    return (
                      <div
                        key={role.id}
                        className="rounded-lg border border-border p-3 space-y-2 hover:border-stone-300 transition-colors cursor-pointer"
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
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {activePerms.length > 0 ? (
                            activePerms.map((p) => (
                              <span key={p.key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{p.label}</span>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* AI Insight */}
      {team.length > 0 && (
        <Card>
          <CardContent className="p-3 flex gap-2.5">
            <Zap className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-stone-800">AI Staffing Note</p>
              <p className="text-sm text-stone-600 leading-relaxed">
                Staffing recommendations are generated based on your sales forecast data.
                Connect Square in Settings to get AI-powered scheduling suggestions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Role Dialog ──────────────────────────────────────────── */}
      <Dialog open={roleDialog} onOpenChange={(open) => { setRoleDialog(open); if (!open) setEditingRole(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
            <DialogDescription>
              {editingRole ? "Update this role and its permissions." : "Define a new role with specific permissions."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
                      roleForm.color === c ? "border-foreground scale-110" : "border-transparent"
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
              <div className="space-y-1">
                {ROLE_PERMISSION_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions[key] === true}
                      onChange={() => setRoleForm((f) => ({
                        ...f,
                        permissions: { ...f.permissions, [key]: !f.permissions[key] },
                      }))}
                      className="h-4 w-4 accent-primary cursor-pointer"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRoleDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={saving || !roleForm.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRole ? "Save" : "Add Role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGuard>
  );
}
