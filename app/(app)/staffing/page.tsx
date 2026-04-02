"use client";

import { useState, useEffect } from "react";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Zap,
  ChevronRight,
  Plus,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  getStaffMembers,
  addStaffMember,
  getShifts,
  addShift,
} from "@/lib/db/staffing";
import type { StaffMember, Shift, ShiftType } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";

const shiftConfig: Record<ShiftType, { label: string; hours: string; color: string }> = {
  morning:   { label: "Morning",   hours: "7am–2pm",  color: "bg-stone-100 text-stone-700" },
  afternoon: { label: "Afternoon", hours: "1pm–8pm",  color: "bg-stone-100 text-stone-700" },
  evening:   { label: "Evening",   hours: "2pm–9pm",  color: "bg-stone-200 text-stone-800" },
  closing:   { label: "Closing",   hours: "6pm–10pm", color: "bg-stone-200 text-stone-800" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StaffingPage() {
  const [staff, setStaff]   = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [staffDialog, setStaffDialog]   = useState(false);
  const [shiftDialog, setShiftDialog]   = useState(false);
  const [saving, setSaving] = useState(false);

  const [staffForm, setStaffForm] = useState<Partial<StaffMember>>({
    role: "Barista",
    hourlyRate: 18,
    availability: [],
  });
  const [shiftForm, setShiftForm] = useState<Partial<Shift>>({
    shiftType: "morning",
    predictedDemand: "medium",
    startTime: "07:00",
    endTime: "14:00",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
    Promise.all([getStaffMembers(), getShifts()])
      .then(([s, sh]) => {
        setStaff(s);
        setShifts(sh);
      })
      .catch((err) => {
        console.error("Failed to load staffing:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleAddStaff = async () => {
    if (!staffForm.name || !userId) return;
    setSaving(true);
    try {
      const m = await addStaffMember(
        {
          name: staffForm.name ?? "",
          role: staffForm.role ?? "Staff",
          hourlyRate: staffForm.hourlyRate ?? 0,
          availability: staffForm.availability ?? [],
        },
        userId
      );
      setStaff((prev) => [...prev, m]);
      setStaffDialog(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddShift = async () => {
    if (!shiftForm.staffName || !userId) return;
    setSaving(true);
    try {
      const sh = await addShift(
        {
          staffId:
            staff.find((s) => s.name === shiftForm.staffName)?.id ?? "",
          staffName: shiftForm.staffName ?? "",
          date: shiftForm.date ?? new Date().toISOString().split("T")[0],
          shiftType: shiftForm.shiftType ?? "morning",
          startTime: shiftForm.startTime ?? "07:00",
          endTime: shiftForm.endTime ?? "14:00",
          predictedDemand: shiftForm.predictedDemand ?? "medium",
        },
        userId
      );
      setShifts((prev) => [...prev, sh]);
      setShiftDialog(false);
    } finally {
      setSaving(false);
    }
  };

  const totalLaborCost = shifts.reduce((sum, shift) => {
    const m = staff.find((s) => s.id === shift.staffId);
    if (!m) return sum;
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    const hours = eh + em / 60 - (sh + sm / 60);
    return sum + m.hourlyRate * hours;
  }, 0);

  // Build per-day chart data
  const chartDays = [...new Set(shifts.map((s) => s.date))].sort().slice(0, 7);
  const chartData = chartDays.map((d) => ({
    day: new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }),
    scheduled: shifts.filter((s) => s.date === d).length,
  }));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty = staff.length === 0 && shifts.length === 0;

  return (
    <PermissionGuard section="staffing">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staffing</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Schedule management and demand-based workforce recommendations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStaffDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
          <Button onClick={() => setShiftDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Shift
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={Users}    label="Team Size"       value={String(staff.length)}     />
        <SummaryCard icon={Clock}    label="Upcoming Shifts" value={String(shifts.length)}    />
        <SummaryCard icon={TrendingUp} label="Est. Labor Cost" value={`$${totalLaborCost.toFixed(0)}`} />
        <SummaryCard icon={Zap}      label="AI Scheduling"   value="Active"                   />
      </div>

      {isEmpty ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <div>
              <p className="font-semibold">No staff data yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Add your team members, then schedule shifts. AI will recommend staffing
                levels based on your sales forecast.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-4 space-y-4">
            {chartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Staff Scheduled by Day</CardTitle>
                  <CardDescription>Upcoming {chartData.length}-day view</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: "2px", border: "1px solid #e7e5e4", fontSize: "12px" }} />
                      <Bar dataKey="scheduled" fill="#44403c" name="Scheduled" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Demand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shifts.map((shift) => {
                      const cfg = shiftConfig[shift.shiftType];
                      const demand = shift.predictedDemand as "low" | "medium" | "high";
                      const demandCfg = {
                        low:    "bg-stone-100 text-stone-600",
                        medium: "bg-stone-200 text-stone-700",
                        high:   "bg-stone-800 text-white",
                      }[demand];
                      return (
                        <TableRow key={shift.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(shift.date + "T00:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="font-medium">{shift.staffName}</TableCell>
                          <TableCell>
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{shift.startTime}–{shift.endTime}</TableCell>
                          <TableCell>
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${demandCfg}`}>
                              {demand}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team Members</CardTitle>
                <CardDescription>Staff roster with availability and rates</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Hourly Rate</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead>Shifts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((m) => {
                      const memberShifts = shifts.filter((s) => s.staffId === m.id).length;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                {m.name.split(" ").map((n) => n[0]).join("")}
                              </div>
                              <span className="font-medium">{m.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{m.role}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">${m.hourlyRate}/hr</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {m.availability.map((d) => (
                                <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{d}</span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{memberShifts}</span>
                              <span className="text-muted-foreground text-xs">upcoming</span>
                              {memberShifts > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* AI Insight */}
      {staff.length > 0 && (
        <Card>
          <CardContent className="p-3 flex gap-2.5">
            <Zap className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-stone-800">AI Staffing Note</p>
              <p className="text-sm text-stone-600 leading-relaxed">
                Staffing recommendations are generated based on your sales forecast data.
                Connect Square in Settings and enable sales syncing to get AI-powered
                staffing suggestions aligned with predicted demand.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Staff Dialog */}
      <Dialog open={staffDialog} onOpenChange={setStaffDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Add a team member to your roster.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={staffForm.name ?? ""}
                onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input
                value={staffForm.role ?? ""}
                onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="e.g. Barista, Cashier"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hourly Rate ($)</Label>
              <Input
                type="number"
                step="0.5"
                value={staffForm.hourlyRate ?? 0}
                onChange={(e) => setStaffForm((f) => ({ ...f, hourlyRate: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Availability (select days)</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setStaffForm((f) => ({
                        ...f,
                        availability: f.availability?.includes(d)
                          ? f.availability.filter((x) => x !== d)
                          : [...(f.availability ?? []), d],
                      }))
                    }
                    className={`rounded px-2 py-1 text-xs font-medium border transition-colors ${
                      staffForm.availability?.includes(d)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStaffDialog(false)}>Cancel</Button>
            <Button onClick={handleAddStaff} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Shift Dialog */}
      <Dialog open={shiftDialog} onOpenChange={setShiftDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Shift</DialogTitle>
            <DialogDescription>Schedule a shift for a team member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Staff Member *</Label>
              <Select
                value={shiftForm.staffName ?? ""}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, staffName: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select staff…" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((m) => (
                    <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={shiftForm.date ?? ""}
                onChange={(e) => setShiftForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={shiftForm.startTime ?? ""}
                  onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={shiftForm.endTime ?? ""}
                  onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Shift Type</Label>
              <Select
                value={shiftForm.shiftType ?? "morning"}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, shiftType: (v ?? "morning") as ShiftType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(shiftConfig) as ShiftType[]).map((t) => (
                    <SelectItem key={t} value={t}>{shiftConfig[t].label} ({shiftConfig[t].hours})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expected Demand</Label>
              <Select
                value={shiftForm.predictedDemand ?? "medium"}
                onValueChange={(v) => setShiftForm((f) => ({ ...f, predictedDemand: (v ?? "medium") as "low" | "medium" | "high" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShiftDialog(false)}>Cancel</Button>
            <Button onClick={handleAddShift} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Shift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PermissionGuard>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="rounded-sm p-1.5 bg-stone-100">
          <Icon className="h-4 w-4 text-stone-600" />
        </div>
        <div>
          <p className="text-lg font-bold font-mono">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
