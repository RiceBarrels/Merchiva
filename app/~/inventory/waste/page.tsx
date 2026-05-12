"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Trash2,
  Plus,
  Search,
  Download,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useWasteLogs, useInventoryItems } from "@/lib/spacetimedb/hooks";
import { addWasteLog, deleteWasteLog } from "@/lib/spacetimedb/actions";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";
import { toast } from "sonner";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";

// ── Types ────────────────────────────────────────────────────────────────────

type WasteReason = "expired" | "damaged" | "overproduction" | "other";

interface WasteLogEntry {
  id: string;
  organizationId: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  costPerUnit: number;
  totalCost: number;
  date: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
}

interface InventoryItemRow {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  category: string;
}

type DateFilter = "today" | "week" | "month" | "all";

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

const REASON_BADGE: Record<WasteReason, { label: string; className: string }> = {
  expired: { label: "Expired", className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900" },
  damaged: { label: "Damaged", className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900" },
  overproduction: { label: "Overproduction", className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-900" },
  other: { label: "Other", className: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700" },
};

// ── Main Component ───────────────────────────────────────────────────────────

function WasteLogPage() {
  const t = useT();
  const { organizationId } = usePermissions();

  // SpacetimeDB subscriptions
  const [rawLogs, logsReady] = useWasteLogs();
  const [rawItems, itemsReady] = useInventoryItems();

  const ready = logsReady && itemsReady;

  // Memoize filtered data
  const logs = useMemo<WasteLogEntry[]>(() => {
    if (!organizationId) return [];
    return rawLogs
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: r.id.toString(),
        organizationId: r.organizationId,
        itemId: r.itemId ?? null,
        itemName: r.itemName,
        quantity: r.quantity,
        unit: r.unit,
        reason: r.reason as WasteReason,
        costPerUnit: r.costPerUnit,
        totalCost: r.totalCost,
        date: r.date,
        notes: r.notes ?? null,
        createdBy: r.createdBy ?? null,
        createdAt: r.createdAt.toDate(),
      }));
  }, [rawLogs, organizationId]);

  const items = useMemo<InventoryItemRow[]>(() => {
    if (!organizationId) return [];
    return rawItems
      .filter((r) => r.organizationId === organizationId)
      .map((r) => ({
        id: r.id.toString(),
        name: r.name,
        unit: r.unit,
        costPerUnit: r.costPerUnit,
        category: r.category,
      }));
  }, [rawItems, organizationId]);

  // UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [formItemName, setFormItemName] = useState("");
  const [formItemId, setFormItemId] = useState<string | null>(null);
  const [formQuantity, setFormQuantity] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formCostPerUnit, setFormCostPerUnit] = useState("");
  const [formReason, setFormReason] = useState<WasteReason>("expired");
  const [formDate, setFormDate] = useState(todayStr());
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");

  // Filtered items for the combobox
  const filteredItems = useMemo(() => {
    if (!itemSearchQuery) return items;
    const q = itemSearchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, itemSearchQuery]);

  // Apply date filter & search
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Date filter
    if (dateFilter === "today") {
      const today = todayStr();
      result = result.filter((l) => l.date === today);
    } else if (dateFilter === "week") {
      const start = startOfWeek();
      result = result.filter((l) => l.date >= start);
    } else if (dateFilter === "month") {
      const start = startOfMonth();
      result = result.filter((l) => l.date >= start);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) => l.itemName.toLowerCase().includes(q));
    }

    // Sort: date desc, then createdAt desc
    return result.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [logs, dateFilter, searchQuery]);

  // ── Summary cards ──────────────────────────────────────────────────────────

  const todayCost = useMemo(() => {
    const today = todayStr();
    return logs.filter((l) => l.date === today).reduce((sum, l) => sum + l.totalCost, 0);
  }, [logs]);

  const weekCost = useMemo(() => {
    const start = startOfWeek();
    return logs.filter((l) => l.date >= start).reduce((sum, l) => sum + l.totalCost, 0);
  }, [logs]);

  const monthCost = useMemo(() => {
    const start = startOfMonth();
    return logs.filter((l) => l.date >= start).reduce((sum, l) => sum + l.totalCost, 0);
  }, [logs]);

  const mostWastedItem = useMemo(() => {
    const start = startOfMonth();
    const monthLogs = logs.filter((l) => l.date >= start);
    if (monthLogs.length === 0) return null;
    const itemMap = new Map<string, { name: string; qty: number }>();
    for (const l of monthLogs) {
      const existing = itemMap.get(l.itemName);
      if (existing) {
        existing.qty += l.quantity;
      } else {
        itemMap.set(l.itemName, { name: l.itemName, qty: l.quantity });
      }
    }
    let top: { name: string; qty: number } | null = null;
    for (const entry of itemMap.values()) {
      if (!top || entry.qty > top.qty) top = entry;
    }
    return top;
  }, [logs]);

  // ── Waste by reason breakdown ──────────────────────────────────────────────

  const reasonBreakdown = useMemo(() => {
    const start = startOfMonth();
    const monthLogs = logs.filter((l) => l.date >= start);
    const breakdown: Record<WasteReason, { count: number; cost: number }> = {
      expired: { count: 0, cost: 0 },
      damaged: { count: 0, cost: 0 },
      overproduction: { count: 0, cost: 0 },
      other: { count: 0, cost: 0 },
    };
    for (const l of monthLogs) {
      const r = breakdown[l.reason];
      if (r) {
        r.count += 1;
        r.cost += l.totalCost;
      }
    }
    return breakdown;
  }, [logs]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormItemName("");
    setFormItemId(null);
    setFormQuantity("");
    setFormUnit("");
    setFormCostPerUnit("");
    setFormReason("expired");
    setFormDate(todayStr());
    setFormNotes("");
    setItemSearchQuery("");
    setItemSearchOpen(false);
  }, []);

  const handleSelectItem = useCallback((item: InventoryItemRow) => {
    setFormItemId(item.id);
    setFormItemName(item.name);
    setFormUnit(item.unit);
    setFormCostPerUnit(item.costPerUnit.toString());
    setItemSearchQuery("");
    setItemSearchOpen(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const name = formItemName.trim();
    if (!name) {
      toast.error(t("wasteLog.errorNoItem"));
      return;
    }
    const qty = parseFloat(formQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error(t("wasteLog.errorNoQuantity"));
      return;
    }
    const cost = parseFloat(formCostPerUnit) || 0;
    const unit = formUnit.trim() || "units";

    setSubmitting(true);
    try {
      await addWasteLog({
        itemId: formItemId ?? undefined,
        itemName: name,
        quantity: qty,
        unit,
        reason: formReason,
        costPerUnit: cost,
        totalCost: qty * cost,
        date: formDate,
        notes: formNotes.trim() || undefined,
      });
      hapticSuccess();
      toast.success(t("wasteLog.entryAdded"));
      // Batch mode: clear form but keep dialog open
      resetForm();
    } catch (err) {
      console.error("Failed to add waste log:", err);
      toast.error(t("wasteLog.errorAdd"));
      hapticWarning();
    } finally {
      setSubmitting(false);
    }
  }, [formItemName, formQuantity, formCostPerUnit, formUnit, formItemId, formReason, formDate, formNotes, resetForm, t]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await deleteWasteLog(id);
      hapticSuccess();
      toast.success(t("wasteLog.entryDeleted"));
    } catch (err) {
      console.error("Failed to delete waste log:", err);
      toast.error(t("wasteLog.errorDelete"));
      hapticWarning();
    } finally {
      setDeleting(null);
    }
  }, [t]);

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Item", "Qty", "Unit", "Reason", "Cost/Unit", "Total Cost", "Notes", "Created By"];
    const rows = filteredLogs.map((l) => [
      l.date,
      l.itemName,
      l.quantity.toString(),
      l.unit,
      l.reason,
      l.costPerUnit.toFixed(2),
      l.totalCost.toFixed(2),
      l.notes ?? "",
      l.createdBy ?? "",
    ]);
    downloadCSV("waste-log", headers, rows);
  }, [filteredLogs]);

  const handleExportPDF = useCallback(() => {
    const headers = ["Date", "Item", "Qty", "Unit", "Reason", "Cost/Unit", "Total"];
    const rows = filteredLogs.map((l) => [
      l.date,
      l.itemName,
      l.quantity.toString(),
      l.unit,
      l.reason,
      `$${l.costPerUnit.toFixed(2)}`,
      `$${l.totalCost.toFixed(2)}`,
    ]);
    downloadPDF("Waste Log Report", headers, rows, {
      subtitle: `Filter: ${dateFilter}`,
      landscape: true,
    });
  }, [filteredLogs, dateFilter]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      <PageHeader
        title={t("wasteLog.title")}
        subtitle={t("wasteLog.subtitle")}
        right={
          <Button
            size="sm"
            className="gap-1.5 rounded-[0.3rem]"
            onClick={() => { resetForm(); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("wasteLog.addEntry")}</span>
          </Button>
        }
      />
      <PageTabs tabs={[
        { label: t("nav.inventory"), href: "/~/inventory" },
        { label: t("nav.suppliers"), href: "/~/suppliers" },
        { label: t("nav.wasteLog"), href: "/~/inventory/waste" },
      ]} />

      <div className="p-4 lg:p-6 space-y-6">
        {/* ── Summary Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="rounded-[0.3rem] border">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("wasteLog.todayCost")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-xl font-semibold font-mono">{fmt(todayCost)}</p>
            </CardContent>
          </Card>

          <Card className="rounded-[0.3rem] border">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("wasteLog.weekCost")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-xl font-semibold font-mono">{fmt(weekCost)}</p>
            </CardContent>
          </Card>

          <Card className="rounded-[0.3rem] border">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("wasteLog.monthCost")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-xl font-semibold font-mono">{fmt(monthCost)}</p>
            </CardContent>
          </Card>

          <Card className="rounded-[0.3rem] border">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("wasteLog.mostWasted")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {mostWastedItem ? (
                <>
                  <p className="text-sm font-semibold truncate">{mostWastedItem.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{mostWastedItem.qty} {t("wasteLog.thisMonth")}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">--</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("wasteLog.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 rounded-[0.3rem] text-sm"
            />
          </div>

          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[130px] h-8 rounded-[0.3rem] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-[0.3rem]">
              <SelectItem value="today">{t("wasteLog.filterToday")}</SelectItem>
              <SelectItem value="week">{t("wasteLog.filterWeek")}</SelectItem>
              <SelectItem value="month">{t("wasteLog.filterMonth")}</SelectItem>
              <SelectItem value="all">{t("wasteLog.filterAll")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-[0.3rem] h-8"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-[0.3rem] h-8"
              onClick={handleExportPDF}
              disabled={filteredLogs.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          </div>
        </div>

        {/* ── Waste History Table ────────────────────────────────────────── */}
        <Card className="rounded-[0.3rem] border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("wasteLog.colDate")}</TableHead>
                  <TableHead className="text-xs">{t("wasteLog.colItem")}</TableHead>
                  <TableHead className="text-xs text-right">{t("wasteLog.colQty")}</TableHead>
                  <TableHead className="text-xs">{t("wasteLog.colUnit")}</TableHead>
                  <TableHead className="text-xs">{t("wasteLog.colReason")}</TableHead>
                  <TableHead className="text-xs text-right">{t("wasteLog.colCost")}</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">{t("wasteLog.colNotes")}</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">{t("wasteLog.colCreatedBy")}</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Trash2 className="h-5 w-5" />
                        <p className="text-sm">{t("wasteLog.empty")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const badge = REASON_BADGE[log.reason] ?? REASON_BADGE.other;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-mono whitespace-nowrap">{log.date}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[160px] truncate">{log.itemName}</TableCell>
                        <TableCell className="text-sm font-mono text-right">{log.quantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.unit}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] rounded-[0.3rem] border px-1.5 py-0", badge.className)}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-mono text-right">{fmt(log.totalCost)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">
                          {log.notes ?? "--"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                          {log.createdBy ?? "--"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-[0.3rem]"
                            onClick={() => handleDelete(log.id)}
                            disabled={deleting === log.id}
                          >
                            {deleting === log.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredLogs.length > 0 && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground font-mono">
              {filteredLogs.length} {t("wasteLog.entries")} &middot; {t("wasteLog.totalCostLabel")} {fmt(filteredLogs.reduce((s, l) => s + l.totalCost, 0))}
            </div>
          )}
        </Card>

        {/* ── Waste by Reason Breakdown ──────────────────────────────────── */}
        <Card className="rounded-[0.3rem] border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">{t("wasteLog.byReason")}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(REASON_BADGE) as WasteReason[]).map((reason) => {
                const badge = REASON_BADGE[reason];
                const data = reasonBreakdown[reason];
                return (
                  <div key={reason} className="flex items-center gap-3 p-2.5 rounded-[0.3rem] border">
                    <Badge variant="outline" className={cn("text-[10px] rounded-[0.3rem] border px-1.5 py-0 shrink-0", badge.className)}>
                      {badge.label}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-mono font-semibold">{fmt(data.cost)}</p>
                      <p className="text-[10px] text-muted-foreground">{data.count} {t("wasteLog.entries")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Add Waste Entry Dialog ────────────────────────────────────────── */}
      <DynamicUIElement open={dialogOpen} onOpenChange={setDialogOpen}>
        <DynamicUIElementContent className="max-w-md rounded-[0.3rem]">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("wasteLog.addEntry")}>
              {t("wasteLog.addEntry")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {t("wasteLog.addEntryDesc")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>

          <div className="space-y-4 px-4 pb-4">
            {/* Item selector / combobox */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("wasteLog.formItem")}</Label>
              <div className="relative">
                <Input
                  placeholder={t("wasteLog.formItemPlaceholder")}
                  value={formItemName}
                  onChange={(e) => {
                    setFormItemName(e.target.value);
                    setFormItemId(null);
                    setItemSearchQuery(e.target.value);
                    setItemSearchOpen(true);
                  }}
                  onFocus={() => { if (formItemName) setItemSearchOpen(true); }}
                  className="h-8 rounded-[0.3rem] text-sm"
                />
                {formItemId && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormItemId(null);
                      setFormItemName("");
                      setFormUnit("");
                      setFormCostPerUnit("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Dropdown results */}
              {itemSearchOpen && formItemName.length > 0 && filteredItems.length > 0 && (
                <div className="border border-border rounded-[0.3rem] bg-card max-h-40 overflow-y-auto">
                  {filteredItems.slice(0, 8).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => handleSelectItem(item)}
                    >
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{item.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("wasteLog.formQuantity")}</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  min={0}
                  step="any"
                  className="h-8 rounded-[0.3rem] text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("wasteLog.formUnit")}</Label>
                <Input
                  placeholder="units"
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  className="h-8 rounded-[0.3rem] text-sm"
                />
              </div>
            </div>

            {/* Cost per unit (auto-filled if selected from inventory) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("wasteLog.formCostPerUnit")}</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formCostPerUnit}
                onChange={(e) => setFormCostPerUnit(e.target.value)}
                min={0}
                step="0.01"
                className="h-8 rounded-[0.3rem] text-sm font-mono"
              />
              {formQuantity && formCostPerUnit && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  {t("wasteLog.formEstTotal")} {fmt(parseFloat(formQuantity || "0") * parseFloat(formCostPerUnit || "0"))}
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("wasteLog.formReason")}</Label>
              <Select value={formReason} onValueChange={(v) => setFormReason(v as WasteReason)}>
                <SelectTrigger className="h-8 rounded-[0.3rem] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[0.3rem]">
                  <SelectItem value="expired">{t("wasteLog.reasonExpired")}</SelectItem>
                  <SelectItem value="damaged">{t("wasteLog.reasonDamaged")}</SelectItem>
                  <SelectItem value="overproduction">{t("wasteLog.reasonOverproduction")}</SelectItem>
                  <SelectItem value="other">{t("wasteLog.reasonOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("wasteLog.formDate")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-8 rounded-[0.3rem] text-sm font-mono"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("wasteLog.formNotes")}</Label>
              <Textarea
                placeholder={t("wasteLog.formNotesPlaceholder")}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="rounded-[0.3rem] text-sm resize-none"
              />
            </div>

            <Separator />

            {/* Submit */}
            <Button
              className="w-full gap-1.5 rounded-[0.3rem]"
              onClick={handleSubmit}
              disabled={submitting || !formItemName.trim()}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("wasteLog.addEntry")}
            </Button>

            <p className="text-[10px] text-center text-muted-foreground">
              {t("wasteLog.batchHint")}
            </p>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </div>
  );
}

// ── Exported with PermissionGuard ────────────────────────────────────────────

export default function WasteLogWithGuard() {
  return (
    <PermissionGuard section="inventory">
      <WasteLogPage />
    </PermissionGuard>
  );
}
