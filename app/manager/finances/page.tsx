"use client";

import { useState, useMemo } from "react";
import {
  Wallet,
  Plus,
  Download,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  CalendarDays,
  FileText,
  RotateCcw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { StatTile, StatGrid } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Money, NumCell } from "@/components/ui/num";
import { STATUS_TONE_TEXT } from "@/components/ui/status-badge";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { usePermissions } from "@/lib/context/permissions";
import { useExpenses, usePayments, useSalesRecords, usePurchaseOrders, useOrgMembers, usePunchEvents } from "@/lib/spacetimedb/hooks";
import { computeMemberPayroll, grossPay, toPayrollEvents } from "@/lib/payroll";
import { addExpense, updateExpense, deleteExpense } from "@/lib/spacetimedb/actions";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n/context";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_HOURLY_RATE = 15;

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Supplies",
  "Payroll",
  "Marketing",
  "Other",
] as const;

type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const RECURRING_PERIODS = ["Weekly", "Monthly", "Yearly"] as const;

type DateRange = "this_month" | "last_month" | "this_quarter" | "this_year";

// ─── Utilities ───────────────────────────────────────────────────────────────

function getDateRange(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (range) {
    case "this_month":
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0, 23, 59, 59),
      };
    case "last_month":
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59),
      };
    case "this_quarter": {
      const qStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, qStart, 1),
        end: new Date(year, qStart + 3, 0, 23, 59, 59),
      };
    }
    case "this_year":
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31, 23, 59, 59),
      };
  }
}

function isInRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ─── Expense Form Interface ──────────────────────────────────────────────────

interface ExpenseForm {
  category: ExpenseCategory;
  description: string;
  amount: string;
  date: string;
  recurring: boolean;
  recurringPeriod: string;
  receiptUrl: string;
  notes: string;
}

const emptyForm: ExpenseForm = {
  category: "Other",
  description: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  recurring: false,
  recurringPeriod: "Monthly",
  receiptUrl: "",
  notes: "",
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [activeTab, setActiveTab] = useState("overview");

  // Data hooks
  const [rawExpenses] = useExpenses();
  const [rawPayments] = usePayments();
  const [rawSalesRecords] = useSalesRecords();
  const [rawPurchaseOrders] = usePurchaseOrders();

  // Filter by organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses = useMemo(() => rawExpenses.filter((e: any) => e.organizationId === organizationId), [rawExpenses, organizationId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments = useMemo(() => rawPayments.filter((p: any) => p.organizationId === organizationId), [rawPayments, organizationId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salesRecords = useMemo(() => rawSalesRecords.filter((s: any) => s.organizationId === organizationId), [rawSalesRecords, organizationId]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseOrders = useMemo(() => rawPurchaseOrders.filter((po: any) => po.organizationId === organizationId), [rawPurchaseOrders, organizationId]);

  return (
    <PermissionGuard section="sales">
      <div className="">
        <PageHeader
          title={t("finances.title")}
          subtitle={t("finances.subtitle")}
        />
        <PageTabs tabs={[
          { label: t("nav.sales"), href: "/manager/sales" },
          { label: t("nav.reports"), href: "/manager/reports" },
          { label: t("nav.finances"), href: "/manager/finances" },
        ]} />

        <div className="px-4 sm:px-6 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">{t("finances.tabs.overview")}</TabsTrigger>
              <TabsTrigger value="expenses">{t("finances.tabs.expenses")}</TabsTrigger>
              <TabsTrigger value="cashflow">{t("finances.tabs.cashFlow")}</TabsTrigger>
              <TabsTrigger value="payroll">{t("finances.tabs.payroll")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab
                payments={payments}
                expenses={expenses}
                salesRecords={salesRecords}
                purchaseOrders={purchaseOrders}
              />
            </TabsContent>

            <TabsContent value="expenses" className="mt-4">
              <ExpensesTab expenses={expenses} />
            </TabsContent>

            <TabsContent value="cashflow" className="mt-4">
              <CashFlowTab
                payments={payments}
                expenses={expenses}
                salesRecords={salesRecords}
              />
            </TabsContent>

            <TabsContent value="payroll" className="mt-4">
              <PayrollTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PermissionGuard>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({
  payments,
  expenses,
  salesRecords,
  purchaseOrders,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expenses: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salesRecords: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  purchaseOrders: any[];
}) {
  const t = useT();
  const { format, symbol } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const { start, end } = getDateRange(dateRange);

  // Revenue: completed payments in date range
  const revenue = useMemo(() => {
    return payments
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) =>
          p.status === "completed" &&
          isInRange(p.createdAt?.toISOString?.() ?? p.createdAt, start, end)
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
  }, [payments, start, end]);

  // Expenses in date range
  const totalExpenses = useMemo(() => {
    return expenses
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => isInRange(e.date, start, end))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((sum: number, e: any) => sum + (e.amount ?? 0), 0);
  }, [expenses, start, end]);

  const netProfit = revenue - totalExpenses;
  const profitMargin = revenue > 0 ? ((revenue - totalExpenses) / revenue) * 100 : 0;

  // Bar chart: last 6 months
  const chartData = useMemo(() => {
    const months: { label: string; revenue: number; expenses: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);

      const mRevenue = payments
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.status === "completed" && isInRange(p.createdAt?.toISOString?.() ?? p.createdAt, mStart, mEnd))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, p: any) => s + (p.amount ?? 0), 0);

      const mExpenses = expenses
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((e: any) => isInRange(e.date, mStart, mEnd))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

      months.push({ label: getMonthLabel(d), revenue: mRevenue, expenses: mExpenses });
    }
    return months;
  }, [payments, expenses]);

  return (
    <div className="space-y-4">
      {/* Date range selector */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">{t("finances.dateRange.thisMonth")}</SelectItem>
            <SelectItem value="last_month">{t("finances.dateRange.lastMonth")}</SelectItem>
            <SelectItem value="this_quarter">{t("finances.dateRange.thisQuarter")}</SelectItem>
            <SelectItem value="this_year">{t("finances.dateRange.thisYear")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <StatGrid>
        <StatTile
          icon={DollarSign}
          label={t("finances.overview.revenue")}
          value={<span className={STATUS_TONE_TEXT.success}>{format(revenue)}</span>}
        />
        <StatTile
          icon={TrendingDown}
          label={t("finances.overview.expenses")}
          value={<span className={STATUS_TONE_TEXT.danger}>{format(totalExpenses)}</span>}
        />
        <StatTile
          icon={TrendingUp}
          label={t("finances.overview.netProfit")}
          value={<span className={netProfit >= 0 ? STATUS_TONE_TEXT.success : STATUS_TONE_TEXT.danger}>{format(netProfit)}</span>}
        />
        <StatTile
          icon={Percent}
          label={t("finances.overview.profitMargin")}
          value={<span className={profitMargin >= 0 ? STATUS_TONE_TEXT.success : STATUS_TONE_TEXT.danger}>{profitMargin.toFixed(1)}%</span>}
        />
      </StatGrid>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t("finances.overview.revenueVsExpenses")}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {chartData.every((d) => d.revenue === 0 && d.expenses === 0) ? (
            <EmptyState className="h-48" description={t("finances.overview.noData")} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.3rem",
                    fontSize: 12,
                  }}
                  formatter={(v, name) => [format(Number(v)), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name={t("finances.overview.revenue")} fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="expenses" name={t("finances.overview.expenses")} fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Expenses Tab ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExpensesTab({ expenses }: { expenses: any[] }) {
  const t = useT();
  const { format } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<DateRange>("this_month");
  const [saving, setSaving] = useState(false);

  const { start, end } = getDateRange(filterDateRange);

  const filteredExpenses = useMemo(() => {
    return expenses
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => {
        if (filterCategory !== "all" && e.category !== filterCategory) return false;
        return isInRange(e.date, start, end);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, filterCategory, start, end]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filteredExpenses.forEach((e: any) => {
      map[e.category] = (map[e.category] ?? 0) + (e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEdit = (expense: any) => {
    setEditingId(expense.id?.toString?.() ?? expense.id);
    setForm({
      category: expense.category ?? "Other",
      description: expense.description ?? "",
      amount: String(expense.amount ?? ""),
      date: expense.date ?? new Date().toISOString().slice(0, 10),
      recurring: expense.recurring ?? false,
      recurringPeriod: expense.recurringPeriod ?? "Monthly",
      receiptUrl: expense.receiptUrl ?? "",
      notes: expense.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        date: form.date,
        recurring: form.recurring,
        recurringPeriod: form.recurring ? form.recurringPeriod : undefined,
        receiptUrl: form.receiptUrl || undefined,
        notes: form.notes || undefined,
      };

      if (editingId) {
        await updateExpense(editingId, payload);
      } else {
        await addExpense(payload);
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      console.error("Failed to save expense:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExpense(id);
    } catch (err) {
      console.error("Failed to delete expense:", err);
    }
  };

  const handleExportCSV = () => {
    const headers = ["Date", "Category", "Description", "Amount", "Recurring", "Period"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = filteredExpenses.map((e: any) => [
      e.date,
      e.category,
      e.description,
      format(e.amount ?? 0),
      e.recurring ? "Yes" : "No",
      e.recurringPeriod ?? "",
    ]);
    downloadCSV("expenses-report", headers, rows);
  };

  const handleExportPDF = () => {
    const headers = ["Date", "Category", "Description", "Amount", "Recurring"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = filteredExpenses.map((e: any) => [
      e.date,
      e.category,
      e.description,
      format(e.amount ?? 0),
      e.recurring ? "Yes" : "No",
    ]);
    downloadPDF("Expenses Report", headers, rows, {
      subtitle: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("finances.expenses.addExpense")}
        </Button>

        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder={t("finances.expenses.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("finances.expenses.allCategories")}</SelectItem>
            {EXPENSE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDateRange} onValueChange={(v) => setFilterDateRange(v as DateRange)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">{t("finances.dateRange.thisMonth")}</SelectItem>
            <SelectItem value="last_month">{t("finances.dateRange.lastMonth")}</SelectItem>
            <SelectItem value="this_quarter">{t("finances.dateRange.thisQuarter")}</SelectItem>
            <SelectItem value="this_year">{t("finances.dateRange.thisYear")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5 h-8 text-xs">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} className="gap-1.5 h-8 text-xs">
            <FileText className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {categoryBreakdown.map(([cat, total]) => (
            <Card key={cat} className="p-2.5">
              <Eyebrow size="xs">{cat}</Eyebrow>
              <Money value={total} tone="danger" className="mt-0.5 block font-semibold" />
            </Card>
          ))}
        </div>
      )}

      {/* Expenses table */}
      {filteredExpenses.length === 0 ? (
        <EmptyState icon={Wallet} description={t("finances.expenses.noExpenses")} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finances.expenses.date")}</TableHead>
                <TableHead>{t("finances.expenses.category")}</TableHead>
                <TableHead>{t("finances.expenses.description")}</TableHead>
                <TableHead className="text-right">{t("finances.expenses.amount")}</TableHead>
                <TableHead>{t("finances.expenses.recurring")}</TableHead>
                <TableHead className="text-right">{t("finances.expenses.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {filteredExpenses.map((expense: any) => {
                const id = expense.id?.toString?.() ?? expense.id;
                return (
                  <TableRow key={id}>
                    <NumCell align="left" className="text-xs">{expense.date}</NumCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{expense.description}</TableCell>
                    <NumCell className="text-xs text-destructive">
                      {format(expense.amount ?? 0)}
                    </NumCell>
                    <TableCell>
                      {expense.recurring ? (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <RotateCcw className="h-2.5 w-2.5" />
                          {expense.recurringPeriod ?? "Monthly"}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleEdit(expense)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => handleDelete(id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit dialog */}
      <DynamicUIElement open={dialogOpen} onOpenChange={setDialogOpen}>
        <DynamicUIElementContent className="max-w-lg">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>
              {editingId ? t("finances.expenses.editExpense") : t("finances.expenses.addExpense")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription>
              {editingId ? t("finances.expenses.editDescription") : t("finances.expenses.addDescription")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("finances.expenses.category")}</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExpenseCategory }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("finances.expenses.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("finances.expenses.description")}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t("finances.expenses.descriptionPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("finances.expenses.date")}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("finances.expenses.receiptUrl")}</Label>
                <Input
                  value={form.receiptUrl}
                  onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="recurring"
                  checked={form.recurring}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, recurring: !!checked }))}
                />
                <Label htmlFor="recurring" className="text-xs cursor-pointer">
                  {t("finances.expenses.recurringExpense")}
                </Label>
              </div>
              {form.recurring && (
                <Select value={form.recurringPeriod} onValueChange={(v) => setForm((f) => ({ ...f, recurringPeriod: v ?? "Monthly" }))}>
                  <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRING_PERIODS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("finances.expenses.notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("finances.expenses.notesPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.description || !form.amount}>
                {saving ? t("common.saving") : editingId ? t("common.save") : t("finances.expenses.addExpense")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </div>
  );
}

// ─── Cash Flow Tab ───────────────────────────────────────────────────────────

function CashFlowTab({
  payments,
  expenses,
  salesRecords,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expenses: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salesRecords: any[];
}) {
  const t = useT();
  const { format, symbol } = useCurrency();

  // Current balance: total all-time revenue - total all-time expenses
  const totalRevenue = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => payments.filter((p: any) => p.status === "completed").reduce((s: number, p: any) => s + (p.amount ?? 0), 0),
    [payments]
  );
  const totalExpenses = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0),
    [expenses]
  );
  const currentBalance = totalRevenue - totalExpenses;

  // Average daily revenue from last 30 days of sales records
  const avgDailyRevenue = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recent = salesRecords.filter((s: any) => new Date(s.date) >= thirtyDaysAgo && !s.hour);
    if (recent.length === 0) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return recent.reduce((s: number, r: any) => s + (r.actual ?? 0), 0) / recent.length;
  }, [salesRecords]);

  // Recurring expenses for projection
  const recurringExpenses = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => expenses.filter((e: any) => e.recurring),
    [expenses]
  );

  // Project next 30 days
  const projectionData = useMemo(() => {
    const data: { date: string; balance: number }[] = [];
    let balance = currentBalance;
    const today = new Date();

    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayOfMonth = d.getDate();
      const dayOfWeek = d.getDay();

      // Add projected daily revenue (except weekends at reduced rate)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        balance += avgDailyRevenue * 0.6;
      } else {
        balance += avgDailyRevenue;
      }

      // Subtract recurring expenses on their expected due dates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recurringExpenses.forEach((exp: any) => {
        const period = exp.recurringPeriod ?? "Monthly";
        const expDay = new Date(exp.date).getDate();

        if (period === "Monthly" && dayOfMonth === expDay) {
          balance -= exp.amount ?? 0;
        } else if (period === "Weekly" && dayOfWeek === new Date(exp.date).getDay()) {
          balance -= exp.amount ?? 0;
        } else if (period === "Yearly") {
          const expDate = new Date(exp.date);
          if (d.getMonth() === expDate.getMonth() && dayOfMonth === expDate.getDate()) {
            balance -= exp.amount ?? 0;
          }
        }
      });

      data.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        balance: Math.round(balance * 100) / 100,
      });
    }
    return data;
  }, [currentBalance, avgDailyRevenue, recurringExpenses]);

  // Upcoming expenses (next 7 days)
  const upcomingExpenses = useMemo(() => {
    const today = new Date();
    const next7 = new Date(today);
    next7.setDate(next7.getDate() + 7);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upcoming: { name: string; amount: number; dueDate: string }[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recurringExpenses.forEach((exp: any) => {
      const period = exp.recurringPeriod ?? "Monthly";
      const expDate = new Date(exp.date);

      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dayOfMonth = d.getDate();
        const dayOfWeek = d.getDay();

        let isDue = false;
        if (period === "Monthly" && dayOfMonth === expDate.getDate()) isDue = true;
        if (period === "Weekly" && dayOfWeek === expDate.getDay()) isDue = true;
        if (period === "Yearly" && d.getMonth() === expDate.getMonth() && dayOfMonth === expDate.getDate()) isDue = true;

        if (isDue) {
          upcoming.push({
            name: exp.description || exp.category,
            amount: exp.amount ?? 0,
            dueDate: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
          });
        }
      }
    });

    return upcoming;
  }, [recurringExpenses]);

  return (
    <div className="space-y-4">
      {/* Current balance card */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {t("finances.cashFlow.currentBalance")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <p className={`text-2xl font-bold font-mono tabular-nums ${currentBalance >= 0 ? STATUS_TONE_TEXT.success : STATUS_TONE_TEXT.danger}`}>
            {format(currentBalance)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {t("finances.cashFlow.avgDailyRevenue")}: {format(avgDailyRevenue)}
          </p>
        </CardContent>
      </Card>

      {/* Projected cash flow chart */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t("finances.cashFlow.projected30Days")}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {projectionData.length === 0 || (avgDailyRevenue === 0 && recurringExpenses.length === 0) ? (
            <EmptyState className="h-48" description={t("finances.cashFlow.noProjectionData")} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={projectionData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.3rem",
                    fontSize: 12,
                  }}
                  formatter={(v, name) => [format(Number(v)), String(name)]}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name={t("finances.cashFlow.projectedBalance")}
                  stroke="hsl(142, 71%, 45%)"
                  fill="hsl(142, 71%, 45%)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Upcoming expenses */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm font-medium">{t("finances.cashFlow.upcomingExpenses")}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {upcomingExpenses.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {t("finances.cashFlow.noUpcoming")}
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingExpenses.map((exp, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-xs font-medium">{exp.name}</p>
                    <p className="text-[10px] text-muted-foreground">{exp.dueDate}</p>
                  </div>
                  <Money value={exp.amount} tone="danger" size="xs" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Payroll Tab ─────────────────────────────────────────────────────────────

function PayrollTab() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const [rawPunches] = usePunchEvents() as [unknown[], boolean];
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const [dateRange, setDateRange] = useState<"this_week" | "last_week" | "this_month">("this_week");

  // Date range calculation
  const { start, end } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    switch (dateRange) {
      case "this_week": {
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
      }
      case "last_week": {
        const lastMonday = new Date(monday);
        lastMonday.setDate(monday.getDate() - 7);
        const lastSunday = new Date(monday);
        lastSunday.setDate(monday.getDate() - 1);
        lastSunday.setHours(23, 59, 59, 999);
        return { start: lastMonday, end: lastSunday };
      }
      case "this_month": {
        const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        return { start: mStart, end: mEnd };
      }
    }
  }, [dateRange]);

  // Actual hours worked, from punch records (breaks deducted). Members with no
  // hourly rate set fall back to the default so totals stay estimable.
  const payrollData = useMemo(() => {
    if (!organizationId) return [];
    const now = Date.now();
    const events = toPayrollEvents(rawPunches as never[], organizationId);
    const byMember = new Map<string, typeof events>();
    for (const e of events) {
      const arr = byMember.get(e.memberId) ?? [];
      arr.push(e);
      byMember.set(e.memberId, arr);
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (rawMembers as any[])
      .filter((m) => m.organizationId === organizationId && m.status === "active")
      .map((m) => {
        const id = m.id?.toString?.() ?? String(m.id);
        const pay = computeMemberPayroll(byMember.get(id) ?? [], start.getTime(), end.getTime(), now);
        const rate = m.hourlyRate != null ? Number(m.hourlyRate) : DEFAULT_HOURLY_RATE;
        return {
          id,
          name: String(m.displayName ?? "—"),
          hours: Math.round((pay.paidMs / 3_600_000) * 100) / 100,
          rate,
          grossPay: grossPay(pay.paidMs, rate),
        };
      })
      .filter((r) => r.hours > 0)
      .sort((a, b) => b.hours - a.hours);
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [rawPunches, rawMembers, organizationId, start, end]);

  const totalPayroll = payrollData.reduce((s, d) => s + d.grossPay, 0);
  const totalHours = payrollData.reduce((s, d) => s + d.hours, 0);

  const handleExportCSV = () => {
    const headers = ["Staff Name", "Hours", "Hourly Rate", "Gross Pay"];
    const rows = payrollData.map((d) => [
      d.name,
      d.hours.toFixed(2),
      format(d.rate),
      format(d.grossPay),
    ]);
    rows.push(["TOTAL", totalHours.toFixed(2), "", format(totalPayroll)]);
    downloadCSV("payroll-report", headers, rows);
  };

  const handleExportPDF = () => {
    const headers = ["Staff Name", "Hours", "Hourly Rate", "Gross Pay"];
    const rows = payrollData.map((d) => [
      d.name,
      d.hours.toFixed(2),
      format(d.rate),
      format(d.grossPay),
    ]);
    rows.push(["TOTAL", totalHours.toFixed(2), "", format(totalPayroll)]);
    downloadPDF("Payroll Report", headers, rows, {
      subtitle: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as "this_week" | "last_week" | "this_month")}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_week">{t("finances.payroll.thisWeek")}</SelectItem>
            <SelectItem value="last_week">{t("finances.payroll.lastWeek")}</SelectItem>
            <SelectItem value="this_month">{t("finances.dateRange.thisMonth")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5 h-8 text-xs">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} className="gap-1.5 h-8 text-xs">
            <FileText className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Total payroll card */}
      <StatGrid className="lg:grid-cols-2">
        <StatTile
          label={t("finances.payroll.totalPayroll")}
          value={<span className={STATUS_TONE_TEXT.danger}>{format(totalPayroll)}</span>}
        />
        <StatTile
          label={t("finances.payroll.totalHours")}
          value={`${totalHours.toFixed(1)}h`}
          sub={`${payrollData.length} ${t("finances.payroll.staffMembers")}`}
        />
      </StatGrid>

      {/* Staff hours table */}
      {payrollData.length === 0 ? (
        <EmptyState icon={CalendarDays} description={t("finances.payroll.noPunches")} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finances.payroll.staffName")}</TableHead>
                <TableHead className="text-right">{t("finances.payroll.hours")}</TableHead>
                <TableHead className="text-right">{t("finances.payroll.hourlyRate")}</TableHead>
                <TableHead className="text-right">{t("finances.payroll.grossPay")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-medium">{row.name}</TableCell>
                  <NumCell className="text-xs">{row.hours.toFixed(2)}</NumCell>
                  <NumCell className="text-xs">{format(row.rate)}</NumCell>
                  <NumCell className="text-xs text-destructive">{format(row.grossPay)}</NumCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border bg-muted/30">
                <TableCell className="text-xs font-semibold">{t("finances.payroll.total")}</TableCell>
                <NumCell className="text-xs font-semibold">{totalHours.toFixed(2)}</NumCell>
                <NumCell className="text-xs">-</NumCell>
                <NumCell className="text-xs font-semibold text-destructive">{format(totalPayroll)}</NumCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        {t("finances.payroll.actualNote").replace("{rate}", format(DEFAULT_HOURLY_RATE))}
      </p>
    </div>
  );
}
