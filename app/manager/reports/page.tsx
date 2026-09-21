"use client";

import { useMemo, useState } from "react";
import { FileText, Download, DollarSign, Users, Package, ShoppingBag, TrendingUp, TrendingDown, AlertTriangle, Target, Clock, BarChart3, Minus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Num, NumCell } from "@/components/ui/num";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
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
import { PageTabs } from "@/components/page-tabs";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { useCurrency } from "@/lib/currency";
import { usePermissions } from "@/lib/context/permissions";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useStaffing } from "@/lib/spacetimedb/hooks/useStaffing";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { downloadCSV, downloadPDF } from "@/lib/export";
import type { InventoryItem } from "@/lib/types";
import { Spinner } from "@/components/ui/loaders/geometric";
import { dateKey } from "@/lib/date-key";

// ─── Date Range Helpers ─────────────────────────────────────────────────────

type DateRange = "this_month" | "last_month" | "last_90";

function getDateBounds(
  range: DateRange,
  formatDate: (d: Date, o: Intl.DateTimeFormatOptions) => string,
  t: (key: string) => string,
): { start: string; end: string; label: string } {
  const now = new Date();
  const monthLabel: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };

  if (range === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: dateKey(start), end: dateKey(now), label: formatDate(now, monthLabel) };
  }
  if (range === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: dateKey(start), end: dateKey(end), label: formatDate(start, monthLabel) };
  }
  // last_90
  const start = new Date(now);
  start.setDate(start.getDate() - 90);
  return { start: dateKey(start), end: dateKey(now), label: t("reports.last90Days") };
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

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ─── Trend Icon ─────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
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
  const t = useT();
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
        {t("reports.exportCsv")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onPDF}
        className="gap-1.5 h-8 text-xs"
      >
        <FileText className="h-3.5 w-3.5" />
        {t("reports.exportPdf")}
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
  const t = useT();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DateRange)}>
      <SelectTrigger className="w-[160px] h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="this_month">{t("reports.thisMonth")}</SelectItem>
        <SelectItem value="last_month">{t("reports.lastMonth")}</SelectItem>
        <SelectItem value="last_90">{t("reports.last90Days")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReportsPage() {
  const { organizationId, role } = usePermissions();
  const t = useT();
  const formatDate = useDateFormat();
  // Amounts follow the organization's configured currency, not a hardcoded USD.
  const { format } = useCurrency();
  const fmtCurrency = (n: number) => format(n, { decimals: 0 });
  const fmtCurrency2 = (n: number) => format(n, { decimals: 2 });

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
  const salesBounds = useMemo(() => getDateBounds(salesRange, formatDate, t), [salesRange, formatDate, t]);
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
  const staffBounds = useMemo(() => getDateBounds(staffRange, formatDate, t), [staffRange, formatDate, t]);
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
    downloadPDF(t("reports.salesReportTitle"), headers, rows, {
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
    downloadPDF(t("reports.staffHoursReportTitle"), headers, rows, {
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
    downloadPDF(t("reports.inventoryReportTitle"), headers, rows, { landscape: true });
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
    downloadPDF(t("reports.productPerformanceReportTitle"), headers, rows, { landscape: true });
  }

  // ── Inventory status helper ───────────────────────────────────────────────

  function invStatus(item: InventoryItem): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
    if (item.currentStock <= 0) return { label: t("reports.outOfStock"), variant: "destructive" };
    if (item.currentStock <= item.minStock) return { label: t("reports.lowStock"), variant: "secondary" };
    return { label: t("reports.inStock"), variant: "outline" };
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!allReady) {
    return (
      <PermissionGuard section="sales">
        <div className="">
          <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
          <PageTabs tabs={[
            { label: t("nav.sales"), href: "/manager/sales" },
            { label: t("nav.reports"), href: "/manager/reports" },
            { label: t("nav.finances"), href: "/manager/finances" },
          ]} />
          <div className="flex h-[50vh] items-center justify-center">
            <Spinner size={20} className="text-muted-foreground" />
          </div>
        </div>
      </PermissionGuard>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PermissionGuard section="sales">
      <div className="">
        <PageHeader
          title={t("reports.title")}
          subtitle={t("reports.subtitle")}
          right={
            <Badge variant="outline" className="gap-1.5 text-xs px-2.5 py-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground" />
              {t("reports.recordsCount").replace("{count}", String(salesHistory.length + shifts.length + inventoryItems.length + products.length))}
            </Badge>
          }
        />
        <PageTabs tabs={[
          { label: t("nav.sales"), href: "/manager/sales" },
          { label: t("nav.reports"), href: "/manager/reports" },
          { label: t("nav.finances"), href: "/manager/finances" },
        ]} />

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales" className="gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              {t("reports.tabSales")}
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              {t("reports.tabStaffHours")}
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              {t("reports.tabInventory")}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 text-xs">
              <ShoppingBag className="h-3.5 w-3.5" />
              {t("reports.tabProducts")}
            </TabsTrigger>
          </TabsList>

          {/* ── Sales Report ─────────────────────────────────────────────── */}
          <TabsContent value="sales" className="mt-4 space-y-4">
            <StatGrid>
              <StatTile
                icon={DollarSign}
                label={t("reports.totalRevenue")}
                value={salesTotalRevenue > 0 ? fmtCurrency(salesTotalRevenue) : "--"}
                sub={salesBounds.label}
              />
              <StatTile
                icon={BarChart3}
                label={t("reports.avgDailyRevenue")}
                value={salesAvgDaily > 0 ? fmtCurrency(salesAvgDaily) : "--"}
                sub={t("reports.perDayAverage")}
              />
              <StatTile
                icon={TrendingUp}
                label={t("reports.bestDay")}
                value={salesBestDay ? fmtCurrency(salesBestDay.actual) : "--"}
                sub={salesBestDay?.date ?? ""}
              />
              <StatTile
                icon={Target}
                label={t("reports.forecastAccuracy")}
                value={salesAccuracy > 0 ? `${salesAccuracy}%` : "--"}
                sub={t("reports.predictedVsActual")}
              />
            </StatGrid>

            <ExportBar onCSV={exportSalesCSV} onPDF={exportSalesPDF}>
              <DateRangeSelect value={salesRange} onChange={setSalesRange} />
            </ExportBar>

            {filteredSales.length === 0 ? (
              <Card>
                <EmptyState icon={DollarSign} description={t("reports.noSalesData")} />
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("reports.salesRecords")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("reports.recordsForPeriod").replace("{count}", String(filteredSales.length)).replace("{period}", salesBounds.label)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t("reports.colDate")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colActual")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colPredicted")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colWeather")}</TableHead>
                          <TableHead className="text-xs text-center">{t("reports.colHoliday")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 50)
                          .map((r, i) => (
                            <TableRow key={`${r.date}-${i}`}>
                              <TableCell><Num size="xs" value={r.date} /></TableCell>
                              <NumCell className="text-xs">{fmtCurrency(r.actual)}</NumCell>
                              <NumCell className="text-xs text-muted-foreground">{fmtCurrency(r.predicted)}</NumCell>
                              <TableCell className="text-xs capitalize">{r.weather || "-"}</TableCell>
                              <TableCell className="text-xs text-center">
                                {r.isHoliday ? (
                                  <Badge variant="secondary" className="text-[10px]">{t("reports.yes")}</Badge>
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
                      {t("reports.showingRecords").replace("{count}", String(filteredSales.length))}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Staff Hours Report ───────────────────────────────────────── */}
          <TabsContent value="staff" className="mt-4 space-y-4">
            <StatGrid className="lg:grid-cols-3">
              <StatTile
                icon={Clock}
                label={t("reports.totalScheduledHours")}
                value={staffTotalHours > 0 ? `${staffTotalHours.toFixed(1)}h` : "--"}
                sub={staffBounds.label}
              />
              <StatTile
                icon={Users}
                label={t("reports.numberOfStaff")}
                value={staffUniqueNames > 0 ? String(staffUniqueNames) : "--"}
                sub={t("reports.uniqueStaffScheduled")}
              />
              <StatTile
                icon={BarChart3}
                label={t("reports.avgHoursPerStaff")}
                value={staffAvgHours > 0 ? `${staffAvgHours}h` : "--"}
                sub={t("reports.averagePerPerson")}
              />
            </StatGrid>

            <ExportBar onCSV={exportStaffCSV} onPDF={exportStaffPDF}>
              <DateRangeSelect value={staffRange} onChange={setStaffRange} />
            </ExportBar>

            {filteredShifts.length === 0 ? (
              <Card>
                <EmptyState icon={Users} description={t("reports.noShifts")} />
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("reports.shiftRecords")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("reports.shiftsForPeriod").replace("{count}", String(filteredShifts.length)).replace("{period}", staffBounds.label)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t("reports.colStaffName")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colDate")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colStart")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colEnd")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colHours")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colType")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...filteredShifts]
                          .sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName))
                          .slice(0, 50)
                          .map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="text-xs font-medium">{s.staffName}</TableCell>
                              <TableCell><Num size="xs" value={s.date} /></TableCell>
                              <TableCell><Num size="xs" value={s.startTime} /></TableCell>
                              <TableCell><Num size="xs" value={s.endTime} /></TableCell>
                              <NumCell className="text-xs">{shiftHours(s.startTime, s.endTime).toFixed(1)}</NumCell>
                              <TableCell className="text-xs capitalize">{s.shiftType}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  {filteredShifts.length > 50 && (
                    <p className="text-[11px] text-muted-foreground text-center py-2 border-t">
                      {t("reports.showingShifts").replace("{count}", String(filteredShifts.length))}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Inventory Report ─────────────────────────────────────────── */}
          <TabsContent value="inventory" className="mt-4 space-y-4">
            <StatGrid>
              <StatTile
                icon={Package}
                label={t("reports.totalItems")}
                value={inventoryItems.length > 0 ? String(inventoryItems.length) : "--"}
                sub={t("reports.trackedInventoryItems")}
              />
              <StatTile
                icon={AlertTriangle}
                label={t("reports.lowOutOfStock")}
                value={
                  inventoryItems.length > 0
                    ? `${invLowStockCount} / ${invOutOfStockCount}`
                    : "--"
                }
                sub={t("reports.needsAttention")}
              />
              <StatTile
                icon={DollarSign}
                label={t("reports.totalValue")}
                value={invTotalValue > 0 ? fmtCurrency(invTotalValue) : "--"}
                sub={t("reports.stockTimesCostPerUnit")}
              />
              <StatTile
                icon={TrendingDown}
                label={t("reports.avgLossRate")}
                value={inventoryItems.length > 0 ? fmtPct(invAvgLossRate) : "--"}
                sub={t("reports.acrossAllItems")}
              />
            </StatGrid>

            <ExportBar onCSV={exportInventoryCSV} onPDF={exportInventoryPDF} />

            {inventoryItems.length === 0 ? (
              <Card>
                <EmptyState icon={Package} description={t("reports.noInventoryItems")} />
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("reports.inventoryItems")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("reports.itemsCount").replace("{count}", String(inventoryItems.length))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t("common.name")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colCategory")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colStock")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colMin")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colMax")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colUnit")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colCostPerUnit")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colValue")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colSupplier")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colLossPct")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colStatus")}</TableHead>
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
                                <NumCell className="text-xs">{item.currentStock}</NumCell>
                                <NumCell className="text-xs text-muted-foreground">{item.minStock}</NumCell>
                                <NumCell className="text-xs text-muted-foreground">{item.maxStock}</NumCell>
                                <TableCell className="text-xs">{item.unit}</TableCell>
                                <NumCell className="text-xs">{fmtCurrency2(item.costPerUnit)}</NumCell>
                                <NumCell className="text-xs">{fmtCurrency2(item.currentStock * item.costPerUnit)}</NumCell>
                                <TableCell className="text-xs">{item.supplier}</TableCell>
                                <NumCell className="text-xs">{fmtPct(item.lossRate)}</NumCell>
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
                      {t("reports.showingItems").replace("{count}", String(inventoryItems.length))}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Product Performance Report ───────────────────────────────── */}
          <TabsContent value="products" className="mt-4 space-y-4">
            <StatGrid>
              <StatTile
                icon={ShoppingBag}
                label={t("reports.totalProducts")}
                value={products.length > 0 ? String(products.length) : "--"}
                sub={t("reports.activeProducts")}
              />
              <StatTile
                icon={DollarSign}
                label={t("reports.totalRevenue")}
                value={prodTotalRevenue > 0 ? fmtCurrency(prodTotalRevenue) : "--"}
                sub={t("reports.allProductsCombined")}
              />
              <StatTile
                icon={Target}
                label={t("reports.avgMargin")}
                value={products.length > 0 ? fmtPct(prodAvgMargin) : "--"}
                sub={t("reports.averageProfitMargin")}
              />
              <StatTile
                icon={AlertTriangle}
                label={t("reports.underperforming")}
                value={products.length > 0 ? String(prodUnderperforming) : "--"}
                sub={t("reports.needsReview")}
              />
            </StatGrid>

            <ExportBar onCSV={exportProductsCSV} onPDF={exportProductsPDF} />

            {products.length === 0 ? (
              <Card>
                <EmptyState icon={ShoppingBag} description={t("reports.noProducts")} />
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("reports.productPerformance")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("reports.productsCount").replace("{count}", String(products.length))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t("common.name")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colCategory")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colPrice")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colCost")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colMargin")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colThisMonth")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colLastMonth")}</TableHead>
                          <TableHead className="text-xs text-right">{t("reports.colRevenue")}</TableHead>
                          <TableHead className="text-xs text-center">{t("reports.colTrend")}</TableHead>
                          <TableHead className="text-xs">{t("reports.colAlert")}</TableHead>
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
                              <NumCell className="text-xs">{fmtCurrency2(p.price)}</NumCell>
                              <NumCell className="text-xs text-muted-foreground">{fmtCurrency2(p.cost)}</NumCell>
                              <NumCell className="text-xs">{fmtPct(p.margin)}</NumCell>
                              <NumCell className="text-xs">{p.unitsSoldThisMonth}</NumCell>
                              <NumCell className="text-xs text-muted-foreground">{p.unitsSoldLastMonth}</NumCell>
                              <NumCell className="text-xs">{fmtCurrency(p.revenue)}</NumCell>
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
                      {t("reports.showingProducts").replace("{count}", String(products.length))}
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
