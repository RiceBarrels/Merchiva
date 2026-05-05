"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Download,
  Loader2,
  DollarSign,
  Users,
  Package,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Clock,
  BarChart3,
  Minus,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { downloadCSV, downloadPDF } from "@/lib/export";
import type { InventoryItem } from "@/lib/types";

// ─── Date Range Helpers ─────────────────────────────────────────────────────

type DateRange = "this_month" | "last_month" | "last_90";

function getDateBounds(range: DateRange): { start: string; end: string; label: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (range === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: fmt(start),
      end: fmt(now),
      label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }
  if (range === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: fmt(start),
      end: fmt(end),
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    };
  }
  // last_90
  const start = new Date(now);
  start.setDate(start.getDate() - 90);
  return { start: fmt(start), end: fmt(now), label: "Last 90 Days" };
}

function inRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

// ─── Shift Duration ─────────────────────────────────────────────────────────

function shiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight shift
  return Math.round((mins / 60) * 100) / 100;
}

// ─── Currency / Percent Formatters ──────────────────────────────────────────

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtCurrency2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ─── Trend Icon ─────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-3">
        <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-[0.3rem] bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold font-mono leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          <p className="text-[10px] text-muted-foreground mt-1 font-medium uppercase tracking-wide">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Export Toolbar ─────────────────────────────────────────────────────────

function ExportBar({
  onCSV,
  onPDF,
  children,
}: {
  onCSV: () => void;
  onPDF: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {children}
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        onClick={onCSV}
        className="gap-1.5 h-8 text-xs"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onPDF}
        className="gap-1.5 h-8 text-xs"
      >
        <FileText className="h-3.5 w-3.5" />
        Export PDF
      </Button>
    </div>
  );
}

// ─── Date Range Selector ────────────────────────────────────────────────────

function DateRangeSelect({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className="w-[160px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="this_month">This Month</SelectItem>
        <SelectItem value="last_month">Last Month</SelectItem>
        <SelectItem value="last_90">Last 90 Days</SelectItem>
      </SelectContent>
    </Select>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReportsPage() {
  const { organizationId, role } = usePermissions();

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { history: salesHistory, isReady: salesReady } = useSales();
  const {
    shifts,
    team,
    loading: staffingLoading,
  } = useStaffing(organizationId, null, role === "staff");
  const { items: inventoryItems, isReady: inventoryReady } = useInventory(organizationId);
  const { products, isReady: productsReady } = useProducts(organizationId);

  const allReady = salesReady && !staffingLoading && inventoryReady && productsReady;

  // ── Date range state (shared for sales + staff) ───────────────────────────
  const [salesRange, setSalesRange] = useState<DateRange>("this_month");
  const [staffRange, setStaffRange] = useState<DateRange>("this_month");

  // ── Sales filtered data ───────────────────────────────────────────────────
  const salesBounds = useMemo(() => getDateBounds(salesRange), [salesRange]);
  const filteredSales = useMemo(
    () => salesHistory.filter((r) => inRange(r.date, salesBounds.start, salesBounds.end)),
    [salesHistory, salesBounds]
  );

  const salesTotalRevenue = useMemo(
    () => filteredSales.reduce((s, r) => s + r.actual, 0),
    [filteredSales]
  );
  const salesAvgDaily = useMemo(
    () => (filteredSales.length > 0 ? Math.round(salesTotalRevenue / filteredSales.length) : 0),
    [filteredSales, salesTotalRevenue]
  );
  const salesBestDay = useMemo(() => {
    if (filteredSales.length === 0) return null;
    return filteredSales.reduce((best, r) => (r.actual > best.actual ? r : best), filteredSales[0]);
  }, [filteredSales]);
  const salesAccuracy = useMemo(() => {
    if (filteredSales.length === 0) return 0;
    const total = filteredSales.reduce((sum, s) => {
      if (!s.predicted || s.predicted === 0) return sum + 1;
      const err = Math.abs(s.actual - s.predicted) / s.actual;
      return sum + Math.max(0, 1 - err);
    }, 0);
    return Math.round((total / filteredSales.length) * 100);
  }, [filteredSales]);

  // ── Staff filtered data ───────────────────────────────────────────────────
  const staffBounds = useMemo(() => getDateBounds(staffRange), [staffRange]);
  const filteredShifts = useMemo(
    () => shifts.filter((s) => inRange(s.date, staffBounds.start, staffBounds.end)),
    [shifts, staffBounds]
  );

  const staffTotalHours = useMemo(
    () => filteredShifts.reduce((sum, s) => sum + shiftHours(s.startTime, s.endTime), 0),
    [filteredShifts]
  );
  const staffUniqueNames = useMemo(
    () => new Set(filteredShifts.map((s) => s.staffName)).size,
    [filteredShifts]
  );
  const staffAvgHours = useMemo(
    () => (staffUniqueNames > 0 ? Math.round((staffTotalHours / staffUniqueNames) * 10) / 10 : 0),
    [staffTotalHours, staffUniqueNames]
  );

  // ── Inventory summary ─────────────────────────────────────────────────────
  const invLowStockCount = useMemo(
    () => inventoryItems.filter((i) => i.currentStock <= i.minStock && i.currentStock > 0).length,
    [inventoryItems]
  );
  const invOutOfStockCount = useMemo(
    () => inventoryItems.filter((i) => i.currentStock <= 0).length,
    [inventoryItems]
  );
  const invTotalValue = useMemo(
    () => inventoryItems.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0),
    [inventoryItems]
  );
  const invAvgLossRate = useMemo(
    () =>
      inventoryItems.length > 0
        ? inventoryItems.reduce((sum, i) => sum + i.lossRate, 0) / inventoryItems.length
        : 0,
    [inventoryItems]
  );

  // ── Products summary ──────────────────────────────────────────────────────
  const prodTotalRevenue = useMemo(
    () => products.reduce((sum, p) => sum + p.revenue, 0),
    [products]
  );
  const prodAvgMargin = useMemo(
    () =>
      products.length > 0
        ? products.reduce((sum, p) => sum + p.margin, 0) / products.length
        : 0,
    [products]
  );
  const prodUnderperforming = useMemo(
    () => products.filter((p) => p.alert === "underperforming" || p.alert === "remove").length,
    [products]
  );

  // ── Export handlers ───────────────────────────────────────────────────────

  function exportSalesCSV() {
    const headers = ["Date", "Actual", "Predicted", "Weather", "Holiday"];
    const rows = filteredSales.map((r) => [
      r.date,
      String(r.actual),
      String(r.predicted),
      r.weather || "",
      r.isHoliday ? "Yes" : "No",
    ]);
    downloadCSV("sales-report", headers, rows);
  }

  function exportSalesPDF() {
    const headers = ["Date", "Actual", "Predicted", "Weather", "Holiday"];
    const rows = filteredSales.map((r) => [
      r.date,
      fmtCurrency(r.actual),
      fmtCurrency(r.predicted),
      r.weather || "-",
      r.isHoliday ? "Yes" : "No",
    ]);
    downloadPDF(`Sales Report`, headers, rows, {
      subtitle: salesBounds.label,
    });
  }

  function exportStaffCSV() {
    const headers = ["Staff Name", "Date", "Start", "End", "Hours", "Shift Type"];
    const rows = filteredShifts.map((s) => [
      s.staffName,
      s.date,
      s.startTime,
      s.endTime,
      shiftHours(s.startTime, s.endTime).toFixed(2),
      s.shiftType,
    ]);
    downloadCSV("staff-hours-report", headers, rows);
  }

  function exportStaffPDF() {
    const headers = ["Staff Name", "Date", "Start", "End", "Hours", "Shift Type"];
    // Group by staff for PDF
    const sorted = [...filteredShifts].sort((a, b) =>
      a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date)
    );
    const rows = sorted.map((s) => [
      s.staffName,
      s.date,
      s.startTime,
      s.endTime,
      shiftHours(s.startTime, s.endTime).toFixed(2),
      s.shiftType,
    ]);
    downloadPDF(`Staff Hours Report`, headers, rows, {
      subtitle: staffBounds.label,
    });
  }

  function exportInventoryCSV() {
    const headers = [
      "Name", "Category", "Stock", "Min", "Max", "Unit",
      "Cost/Unit", "Value", "Supplier", "Loss Rate", "Status",
    ];
    const rows = inventoryItems.map((i) => [
      i.name,
      i.category,
      String(i.currentStock),
      String(i.minStock),
      String(i.maxStock),
      i.unit,
      i.costPerUnit.toFixed(2),
      (i.currentStock * i.costPerUnit).toFixed(2),
      i.supplier,
      `${i.lossRate.toFixed(1)}%`,
      i.status.replace("_", " "),
    ]);
    downloadCSV("inventory-report", headers, rows);
  }

  function exportInventoryPDF() {
    const headers = [
      "Name", "Category", "Stock", "Min", "Max", "Unit",
      "Cost/Unit", "Value", "Supplier", "Loss %", "Status",
    ];
    const rows = inventoryItems.map((i) => [
      i.name,
      i.category,
      String(i.currentStock),
      String(i.minStock),
      String(i.maxStock),
      i.unit,
      fmtCurrency2(i.costPerUnit),
      fmtCurrency2(i.currentStock * i.costPerUnit),
      i.supplier,
      fmtPct(i.lossRate),
      i.status.replace("_", " "),
    ]);
    downloadPDF(`Inventory Report`, headers, rows, { landscape: true });
  }

  function exportProductsCSV() {
    const headers = [
      "Name", "Category", "Price", "Cost", "Margin %",
      "Sold This Month", "Sold Last Month", "Revenue", "Trend", "Alert",
    ];
    const rows = products.map((p) => [
      p.name,
      p.category,
      p.price.toFixed(2),
      p.cost.toFixed(2),
      p.margin.toFixed(1),
      String(p.unitsSoldThisMonth),
      String(p.unitsSoldLastMonth),
      p.revenue.toFixed(2),
      p.trend,
      p.alert === "none" ? "" : p.alert,
    ]);
    downloadCSV("product-performance-report", headers, rows);
  }

  function exportProductsPDF() {
    const headers = [
      "Name", "Category", "Price", "Cost", "Margin %",
      "This Mo.", "Last Mo.", "Revenue", "Trend", "Alert",
    ];
    const rows = products.map((p) => [
      p.name,
      p.category,
      fmtCurrency2(p.price),
      fmtCurrency2(p.cost),
      fmtPct(p.margin),
      String(p.unitsSoldThisMonth),
      String(p.unitsSoldLastMonth),
      fmtCurrency(p.revenue),
      p.trend,
      p.alert === "none" ? "-" : p.alert,
    ]);
    downloadPDF(`Product Performance Report`, headers, rows, { landscape: true });
  }

  // ── Inventory status helper ───────────────────────────────────────────────

  function invStatus(item: InventoryItem): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
    if (item.currentStock <= 0) return { label: "Out of Stock", variant: "destructive" };
    if (item.currentStock <= item.minStock) return { label: "Low Stock", variant: "secondary" };
    return { label: "In Stock", variant: "outline" };
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!allReady) {
    return (
      <PermissionGuard section="sales">
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </PermissionGuard>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PermissionGuard section="sales">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Reports"
          subtitle="Export and review business data"
          right={
            <Badge variant="outline" className="gap-1.5 text-xs px-2.5 py-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground" />
              {salesHistory.length + shifts.length + inventoryItems.length + products.length} records
            </Badge>
          }
        />

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales" className="gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Staff Hours
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 text-xs">
              <ShoppingBag className="h-3.5 w-3.5" />
              Products
            </TabsTrigger>
          </TabsList>

          {/* ── Sales Report ─────────────────────────────────────────────── */}
          <TabsContent value="sales" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard
                icon={DollarSign}
                label="Total Revenue"
                value={salesTotalRevenue > 0 ? fmtCurrency(salesTotalRevenue) : "--"}
                sub={salesBounds.label}
              />
              <SummaryCard
                icon={BarChart3}
                label="Avg Daily Revenue"
                value={salesAvgDaily > 0 ? fmtCurrency(salesAvgDaily) : "--"}
                sub="Per day average"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Best Day"
                value={salesBestDay ? fmtCurrency(salesBestDay.actual) : "--"}
                sub={salesBestDay?.date ?? ""}
              />
              <SummaryCard
                icon={Target}
                label="Forecast Accuracy"
                value={salesAccuracy > 0 ? `${salesAccuracy}%` : "--"}
                sub="Predicted vs actual"
              />
            </div>

            <ExportBar onCSV={exportSalesCSV} onPDF={exportSalesPDF}>
              <DateRangeSelect value={salesRange} onChange={setSalesRange} />
            </ExportBar>

            {filteredSales.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground mt-2">No sales data for this period</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Sales Records</CardTitle>
                  <CardDescription className="text-xs">
                    {filteredSales.length} records -- {salesBounds.label}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs text-right">Actual</TableHead>
                          <TableHead className="text-xs text-right">Predicted</TableHead>
                          <TableHead className="text-xs">Weather</TableHead>
                          <TableHead className="text-xs text-center">Holiday</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 50)
                          .map((r, i) => (
                            <TableRow key={`${r.date}-${i}`}>
                              <TableCell className="text-xs font-mono">{r.date}</TableCell>
                              <TableCell className="text-xs font-mono text-right">
                                {fmtCurrency(r.actual)}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-right text-muted-foreground">
                                {fmtCurrency(r.predicted)}
                              </TableCell>
                              <TableCell className="text-xs capitalize">{r.weather || "-"}</TableCell>
                              <TableCell className="text-xs text-center">
                                {r.isHoliday ? (
                                  <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  {filteredSales.length > 50 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 border-t">
                      Showing 50 of {filteredSales.length} records. Export for full data.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Staff Hours Report ───────────────────────────────────────── */}
          <TabsContent value="staff" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <SummaryCard
                icon={Clock}
                label="Total Scheduled Hours"
                value={staffTotalHours > 0 ? `${staffTotalHours.toFixed(1)}h` : "--"}
                sub={staffBounds.label}
              />
              <SummaryCard
                icon={Users}
                label="Number of Staff"
                value={staffUniqueNames > 0 ? String(staffUniqueNames) : "--"}
                sub="Unique staff scheduled"
              />
              <SummaryCard
                icon={BarChart3}
                label="Avg Hours / Staff"
                value={staffAvgHours > 0 ? `${staffAvgHours}h` : "--"}
                sub="Average per person"
              />
            </div>

            <ExportBar onCSV={exportStaffCSV} onPDF={exportStaffPDF}>
              <DateRangeSelect value={staffRange} onChange={setStaffRange} />
            </ExportBar>

            {filteredShifts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground mt-2">No shifts for this period</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Shift Records</CardTitle>
                  <CardDescription className="text-xs">
                    {filteredShifts.length} shifts -- {staffBounds.label}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Staff Name</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Start</TableHead>
                          <TableHead className="text-xs">End</TableHead>
                          <TableHead className="text-xs text-right">Hours</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...filteredShifts]
                          .sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName))
                          .slice(0, 50)
                          .map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-xs font-medium">{s.staffName}</TableCell>
                              <TableCell className="text-xs font-mono">{s.date}</TableCell>
                              <TableCell className="text-xs font-mono">{s.startTime}</TableCell>
                              <TableCell className="text-xs font-mono">{s.endTime}</TableCell>
                              <TableCell className="text-xs font-mono text-right">
                                {shiftHours(s.startTime, s.endTime).toFixed(1)}
                              </TableCell>
                              <TableCell className="text-xs capitalize">{s.shiftType}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  {filteredShifts.length > 50 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 border-t">
                      Showing 50 of {filteredShifts.length} shifts. Export for full data.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Inventory Report ─────────────────────────────────────────── */}
          <TabsContent value="inventory" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard
                icon={Package}
                label="Total Items"
                value={inventoryItems.length > 0 ? String(inventoryItems.length) : "--"}
                sub="Tracked inventory items"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Low / Out of Stock"
                value={
                  inventoryItems.length > 0
                    ? `${invLowStockCount} / ${invOutOfStockCount}`
                    : "--"
                }
                sub="Needs attention"
              />
              <SummaryCard
                icon={DollarSign}
                label="Total Value"
                value={invTotalValue > 0 ? fmtCurrency(invTotalValue) : "--"}
                sub="Stock x cost/unit"
              />
              <SummaryCard
                icon={TrendingDown}
                label="Avg Loss Rate"
                value={inventoryItems.length > 0 ? fmtPct(invAvgLossRate) : "--"}
                sub="Across all items"
              />
            </div>

            <ExportBar onCSV={exportInventoryCSV} onPDF={exportInventoryPDF} />

            {inventoryItems.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Package className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground mt-2">No inventory items tracked</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Inventory Items</CardTitle>
                  <CardDescription className="text-xs">
                    {inventoryItems.length} items
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs text-right">Stock</TableHead>
                          <TableHead className="text-xs text-right">Min</TableHead>
                          <TableHead className="text-xs text-right">Max</TableHead>
                          <TableHead className="text-xs">Unit</TableHead>
                          <TableHead className="text-xs text-right">Cost/Unit</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs text-right">Loss %</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryItems
                          .sort((a, b) => {
                            // Out of stock first, then low stock, then in stock
                            const order = { out_of_stock: 0, low_stock: 1, in_stock: 2 };
                            return (order[a.status] ?? 2) - (order[b.status] ?? 2) || a.name.localeCompare(b.name);
                          })
                          .slice(0, 50)
                          .map((item) => {
                            const st = invStatus(item);
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="text-xs font-medium">{item.name}</TableCell>
                                <TableCell className="text-xs">{item.category}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{item.currentStock}</TableCell>
                                <TableCell className="text-xs font-mono text-right text-muted-foreground">{item.minStock}</TableCell>
                                <TableCell className="text-xs font-mono text-right text-muted-foreground">{item.maxStock}</TableCell>
                                <TableCell className="text-xs">{item.unit}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{fmtCurrency2(item.costPerUnit)}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{fmtCurrency2(item.currentStock * item.costPerUnit)}</TableCell>
                                <TableCell className="text-xs">{item.supplier}</TableCell>
                                <TableCell className="text-xs font-mono text-right">{fmtPct(item.lossRate)}</TableCell>
                                <TableCell>
                                  <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                  {inventoryItems.length > 50 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 border-t">
                      Showing 50 of {inventoryItems.length} items. Export for full data.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Product Performance Report ───────────────────────────────── */}
          <TabsContent value="products" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard
                icon={ShoppingBag}
                label="Total Products"
                value={products.length > 0 ? String(products.length) : "--"}
                sub="Active products"
              />
              <SummaryCard
                icon={DollarSign}
                label="Total Revenue"
                value={prodTotalRevenue > 0 ? fmtCurrency(prodTotalRevenue) : "--"}
                sub="All products combined"
              />
              <SummaryCard
                icon={Target}
                label="Avg Margin"
                value={products.length > 0 ? fmtPct(prodAvgMargin) : "--"}
                sub="Average profit margin"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Underperforming"
                value={products.length > 0 ? String(prodUnderperforming) : "--"}
                sub="Needs review"
              />
            </div>

            <ExportBar onCSV={exportProductsCSV} onPDF={exportProductsPDF} />

            {products.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                  <p className="text-sm text-muted-foreground mt-2">No products tracked</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Product Performance</CardTitle>
                  <CardDescription className="text-xs">
                    {products.length} products
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">Category</TableHead>
                          <TableHead className="text-xs text-right">Price</TableHead>
                          <TableHead className="text-xs text-right">Cost</TableHead>
                          <TableHead className="text-xs text-right">Margin</TableHead>
                          <TableHead className="text-xs text-right">This Mo.</TableHead>
                          <TableHead className="text-xs text-right">Last Mo.</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                          <TableHead className="text-xs text-center">Trend</TableHead>
                          <TableHead className="text-xs">Alert</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...products]
                          .sort((a, b) => b.revenue - a.revenue)
                          .slice(0, 50)
                          .map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs font-medium">{p.name}</TableCell>
                              <TableCell className="text-xs">{p.category}</TableCell>
                              <TableCell className="text-xs font-mono text-right">{fmtCurrency2(p.price)}</TableCell>
                              <TableCell className="text-xs font-mono text-right text-muted-foreground">{fmtCurrency2(p.cost)}</TableCell>
                              <TableCell className="text-xs font-mono text-right">{fmtPct(p.margin)}</TableCell>
                              <TableCell className="text-xs font-mono text-right">{p.unitsSoldThisMonth}</TableCell>
                              <TableCell className="text-xs font-mono text-right text-muted-foreground">{p.unitsSoldLastMonth}</TableCell>
                              <TableCell className="text-xs font-mono text-right">{fmtCurrency(p.revenue)}</TableCell>
                              <TableCell className="text-center">
                                <TrendIcon trend={p.trend} />
                              </TableCell>
                              <TableCell>
                                {p.alert !== "none" ? (
                                  <Badge
                                    variant={p.alert === "remove" ? "destructive" : "secondary"}
                                    className="text-[10px]"
                                  >
                                    {p.alert}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  {products.length > 50 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 border-t">
                      Showing 50 of {products.length} products. Export for full data.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  );
}
