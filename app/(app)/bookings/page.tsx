"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarCheck,
  Users,
  Clock,
  Plus,
  Check,
  X,
  UserX,
  Armchair,
  Loader2,
  Phone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
  DynamicUIElementFooter,
  DynamicUIElementClose,
} from "@/components/ui/dynamic-ui-element";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useSiteBookings, useSites } from "@/lib/spacetimedb/hooks";
import { updateBookingStatus } from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// ─── Types ──────────────────────────────────────────────────────────────────

type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
type QueueStatus = "waiting" | "seated" | "cancelled" | "no_show";

interface QueueEntry {
  id: string;
  name: string;
  partySize: number;
  phone: string;
  estimatedWait: number; // minutes
  notes: string;
  status: QueueStatus;
  addedAt: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${suffix}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
    case "seated":
    case "completed":
      return "default";
    case "pending":
    case "waiting":
      return "secondary";
    case "cancelled":
    case "no_show":
      return "destructive";
    default:
      return "outline";
  }
}

function minutesElapsed(since: Date): number {
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 60000));
}

// ─── Queue Local State ──────────────────────────────────────────────────────
// Queue entries are managed in local state since there is no SpacetimeDB
// queueEntry table. In production this would be persisted.

let nextQueueId = 1;

// ─── Component ──────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const t = useT();
  const { currentOrg } = usePermissions();
  const organizationId = currentOrg?.id ?? "";

  // SpacetimeDB data
  const [allBookingsRaw] = useSiteBookings();
  const [allSitesRaw] = useSites();
  const allBookings = allBookingsRaw || [];
  const allSites = allSitesRaw || [];

  // Find sites belonging to this org
  const orgSites = useMemo(
    () => allSites.filter((s) => s.organizationId === organizationId),
    [allSites, organizationId]
  );
  const orgSiteIds = useMemo(() => new Set(orgSites.map((s) => s.id.toString())), [orgSites]);

  // Filter bookings to this org's sites
  const bookings = useMemo(
    () => allBookings.filter((b) => orgSiteIds.has(b.siteId)),
    [allBookings, orgSiteIds]
  );

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("reservations");

  // ── Booking filter ──
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (dateFilter && b.date !== dateFilter) return false;
        if (statusFilter !== "all" && b.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [bookings, dateFilter, statusFilter]);

  const todayBookings = useMemo(
    () => bookings.filter((b) => b.date === todayStr()),
    [bookings]
  );

  const confirmedToday = todayBookings.filter((b) => b.status === "confirmed").length;
  const totalToday = todayBookings.length;
  const confirmedPct = totalToday > 0 ? Math.round((confirmedToday / totalToday) * 100) : 0;
  const upcomingCount = todayBookings.filter((b) => {
    const now = new Date();
    const [h, m] = b.time.split(":").map(Number);
    const bookingTime = new Date();
    bookingTime.setHours(h, m, 0, 0);
    return bookingTime > now && (b.status === "pending" || b.status === "confirmed");
  }).length;

  // ── Queue state (local) ──
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [addQueueOpen, setAddQueueOpen] = useState(false);
  const [queueForm, setQueueForm] = useState({
    name: "",
    partySize: "2",
    phone: "",
    estimatedWait: "15",
    notes: "",
  });

  // Auto-update wait times every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const waitingEntries = queue.filter((q) => q.status === "waiting");
  const seatedToday = queue.filter((q) => q.status === "seated").length;
  const avgWait = waitingEntries.length > 0
    ? Math.round(waitingEntries.reduce((sum, q) => sum + minutesElapsed(q.addedAt), 0) / waitingEntries.length)
    : 0;

  // ── Handlers ──

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string) => {
    try {
      await updateBookingStatus(bookingId, newStatus);
    } catch (err) {
      console.error("Failed to update booking status:", err);
    }
  }, []);

  const handleAddToQueue = useCallback(() => {
    const entry: QueueEntry = {
      id: `q-${nextQueueId++}`,
      name: queueForm.name.trim(),
      partySize: parseInt(queueForm.partySize, 10) || 2,
      phone: queueForm.phone.trim(),
      estimatedWait: parseInt(queueForm.estimatedWait, 10) || 15,
      notes: queueForm.notes.trim(),
      status: "waiting",
      addedAt: new Date(),
    };
    setQueue((prev) => [...prev, entry]);
    setQueueForm({ name: "", partySize: "2", phone: "", estimatedWait: "15", notes: "" });
    setAddQueueOpen(false);
  }, [queueForm]);

  const handleQueueAction = useCallback((id: string, action: QueueStatus) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status: action } : q)));
  }, []);

  // ── Loading ──
  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard section="settings">
      <PageHeader title={t("bookings.title")} subtitle={t("bookings.subtitle")} />

      <div className="p-4 lg:p-6 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="reservations">
              <CalendarCheck className="h-4 w-4 mr-1.5" />
              {t("bookings.reservations")}
            </TabsTrigger>
            <TabsTrigger value="queue">
              <Users className="h-4 w-4 mr-1.5" />
              {t("bookings.walkInQueue")}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Reservations ── */}
          <TabsContent value="reservations">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.totalToday")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{totalToday}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.confirmed")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{confirmedPct}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.upcoming")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{upcomingCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.totalAll")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{bookings.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-auto text-sm"
              />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                <SelectTrigger className="w-[140px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("bookings.allStatuses")}</SelectItem>
                  <SelectItem value="pending">{t("bookings.statusPending")}</SelectItem>
                  <SelectItem value="confirmed">{t("bookings.statusConfirmed")}</SelectItem>
                  <SelectItem value="cancelled">{t("bookings.statusCancelled")}</SelectItem>
                  <SelectItem value="completed">{t("bookings.statusCompleted")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setDateFilter(todayStr()); setStatusFilter("all"); }}
                className="text-xs"
              >
                {t("bookings.today")}
              </Button>
            </div>

            {/* Table */}
            {filteredBookings.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {t("bookings.noReservations")}
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-[0.3rem] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("bookings.time")}</TableHead>
                      <TableHead className="text-xs">{t("bookings.name")}</TableHead>
                      <TableHead className="text-xs">{t("bookings.partySize")}</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">{t("bookings.phone")}</TableHead>
                      <TableHead className="text-xs">{t("bookings.status")}</TableHead>
                      <TableHead className="text-xs text-right">{t("bookings.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((b) => {
                      const isToday = b.date === todayStr();
                      const bid = b.id.toString();
                      return (
                        <TableRow
                          key={bid}
                          className={cn(isToday && "bg-muted/30")}
                        >
                          <TableCell className="text-sm font-mono">
                            {formatTime(b.time)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {b.name}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              {b.partySize}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm hidden sm:table-cell text-muted-foreground">
                            {b.phone ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(b.status)} className="text-[11px]">
                              {t(`bookings.status${b.status.charAt(0).toUpperCase() + b.status.slice(1)}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {b.status === "pending" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleStatusChange(bid, "confirmed")}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  {t("bookings.confirm")}
                                </Button>
                              )}
                              {(b.status === "pending" || b.status === "confirmed") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => handleStatusChange(bid, "cancelled")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Tab 2: Walk-in Queue ── */}
          <TabsContent value="queue">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.currentlyWaiting")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{waitingEntries.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.avgWait")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{avgWait}<span className="text-sm text-muted-foreground ml-0.5">min</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{t("bookings.seatedToday")}</div>
                  <div className="text-2xl font-bold font-mono mt-0.5">{seatedToday}</div>
                </CardContent>
              </Card>
            </div>

            {/* Add to queue button */}
            <div className="mb-4">
              <Button size="sm" onClick={() => setAddQueueOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t("bookings.addToQueue")}
              </Button>
            </div>

            {/* Queue list */}
            {waitingEntries.length === 0 && queue.filter((q) => q.status !== "waiting").length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  {t("bookings.noQueueEntries")}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {queue.map((entry, idx) => {
                  const elapsed = minutesElapsed(entry.addedAt);
                  const overEstimate = elapsed > entry.estimatedWait;
                  const isActive = entry.status === "waiting";
                  const position = isActive
                    ? waitingEntries.findIndex((w) => w.id === entry.id) + 1
                    : 0;

                  if (!isActive) return null;

                  return (
                    <Card key={entry.id} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          {/* Position number */}
                          <div className="w-16 shrink-0 flex items-center justify-center bg-muted border-r border-border">
                            <span className="text-2xl font-bold font-mono text-foreground">
                              {position}
                            </span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 p-3 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold truncate">{entry.name}</span>
                                  <Badge variant="secondary" className="text-[10px] shrink-0">
                                    <Users className="h-3 w-3 mr-0.5" />
                                    {entry.partySize}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  {entry.phone && (
                                    <span className="inline-flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {entry.phone}
                                    </span>
                                  )}
                                  <span className={cn(
                                    "inline-flex items-center gap-1 font-mono",
                                    overEstimate ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                                  )}>
                                    <Clock className="h-3 w-3" />
                                    {elapsed}m / {entry.estimatedWait}m
                                  </span>
                                </div>
                                {entry.notes && (
                                  <p className="text-[11px] text-muted-foreground mt-1 truncate">{entry.notes}</p>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleQueueAction(entry.id, "seated")}
                                >
                                  <Armchair className="h-3.5 w-3.5 mr-1" />
                                  {t("bookings.seat")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleQueueAction(entry.id, "cancelled")}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => handleQueueAction(entry.id, "no_show")}
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Resolved entries (seated, cancelled, no-show) */}
                {queue.some((q) => q.status !== "waiting") && (
                  <div className="mt-4">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-2">
                      {t("bookings.resolved")}
                    </p>
                    <div className="space-y-1">
                      {queue
                        .filter((q) => q.status !== "waiting")
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center gap-3 px-3 py-2 border rounded-[0.3rem] bg-muted/30 text-sm"
                          >
                            <span className="font-medium text-muted-foreground">{entry.name}</span>
                            <Badge variant={statusVariant(entry.status)} className="text-[10px]">
                              {t(`bookings.queue${entry.status.charAt(0).toUpperCase() + entry.status.slice(1).replace("_", "")}`)}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-auto font-mono">
                              {minutesElapsed(entry.addedAt)}m
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add to Queue Dialog */}
            <DynamicUIElement open={addQueueOpen} onOpenChange={setAddQueueOpen}>
              <DynamicUIElementContent className="max-w-md">
                <DynamicUIElementHeader>
                  <DynamicUIElementTitle mobileTitle={t("bookings.addToQueue")}>
                    {t("bookings.addToQueue")}
                  </DynamicUIElementTitle>
                  <DynamicUIElementDescription>
                    {t("bookings.addToQueueDesc")}
                  </DynamicUIElementDescription>
                </DynamicUIElementHeader>

                <div className="space-y-3 px-1">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {t("bookings.name")} *
                    </label>
                    <Input
                      value={queueForm.name}
                      onChange={(e) => setQueueForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t("bookings.namePlaceholder")}
                      className="text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {t("bookings.partySize")}
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="99"
                        value={queueForm.partySize}
                        onChange={(e) => setQueueForm((f) => ({ ...f, partySize: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        {t("bookings.estWait")}
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="1"
                          value={queueForm.estimatedWait}
                          onChange={(e) => setQueueForm((f) => ({ ...f, estimatedWait: e.target.value }))}
                          className="text-sm pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {t("bookings.phone")}
                    </label>
                    <Input
                      value={queueForm.phone}
                      onChange={(e) => setQueueForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder={t("bookings.phonePlaceholder")}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      {t("bookings.notes")}
                    </label>
                    <Input
                      value={queueForm.notes}
                      onChange={(e) => setQueueForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder={t("bookings.notesPlaceholder")}
                      className="text-sm"
                    />
                  </div>
                </div>

                <DynamicUIElementFooter>
                  <DynamicUIElementClose>
                    <Button variant="outline" size="sm">{t("common.cancel")}</Button>
                  </DynamicUIElementClose>
                  <Button
                    size="sm"
                    onClick={handleAddToQueue}
                    disabled={!queueForm.name.trim()}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("bookings.add")}
                  </Button>
                </DynamicUIElementFooter>
              </DynamicUIElementContent>
            </DynamicUIElement>
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  );
}
