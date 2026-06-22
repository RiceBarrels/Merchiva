"use client";

import { useState, useMemo } from "react";
import { Package, Plus, Search, TrendingDown, ArrowUpDown, Pencil, Trash2, AlertTriangle, CheckCircle2, XCircle, History, RefreshCw, Sparkles, ShoppingCart, AlertCircle, ArrowUp, ArrowDown, Minus as MinusIcon, Download, FileText, Truck, Boxes, Scale, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "@/lib/spacetimedb/actions";
import type { InventoryItem, InventoryTransaction, InventoryStatus } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { useSuppliers as useSupplierRows } from "@/lib/spacetimedb/hooks";
import { Combobox } from "@/components/ui/combobox";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";
import { generateRestockSuggestions, formatPurchaseOrder, type RestockSuggestion, type RestockPriority } from "@/lib/restock";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";
import { Spinner } from "@/components/ui/loaders/geometric";
import { INVENTORY_CONTENT_UNITS, formatInventoryContentAmount } from "@/lib/inventory-units";

type StatusCfg = { label: string; icon: React.ElementType; color: string };

function useStatusConfig(t: (path: string) => string): Record<InventoryStatus, StatusCfg> {
  return {
    in_stock:     { label: t("inventory.status.inStock"),    icon: CheckCircle2, color: "text-emerald-600" },
    low_stock:    { label: t("inventory.status.lowStock"),   icon: AlertTriangle, color: "text-amber-600"  },
    out_of_stock: { label: t("inventory.status.outOfStock"), icon: XCircle,       color: "text-destructive" },
  };
}

export default function InventoryPage() {
  const { organizationId } = usePermissions();
  const t = useT();
  const { format } = useCurrency();
  const statusConfig = useStatusConfig(t);
  // Data via SpacetimeDB migration hook (backed by Supabase; swap useTable internals once generated client is ready)
  const { items, transactions, refreshing, userId, refresh: _refresh } = useInventory(organizationId);

  // Existing suppliers (for the item dialog's supplier combobox). Free-text is
  // still allowed, but suggesting saved suppliers keeps inventory items linked
  // to real supplier records — which is what Mr. Merchiva's ordering uses.
  const [supplierRows] = useSupplierRows() as [unknown[], boolean];
  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of (supplierRows ?? []) as Array<{ organizationId?: string; name?: string }>) {
      if (r && r.organizationId === organizationId && r.name) names.add(r.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n }));
  }, [supplierRows, organizationId]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortKey, setSortKey] = useState<keyof InventoryItem>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<InventoryItem>>({});
  const [dialogStep, setDialogStep] = useState(0);

  const CATEGORIES = [
    "All",
    ...Array.from(new Set(items.map((i) => i.category))),
  ];

  const filtered = items
    .filter(
      (i) =>
        (category === "All" || i.category === category) &&
        (i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.supplier.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

  const toggleSort = (key: keyof InventoryItem) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openAdd = () => {
    setEditItem(null);
    setForm({
      status: "in_stock",
      unit: "units",
      description: "",
      lossRate: 0,
      minStock: 10,
      maxStock: 100,
      currentStock: 0,
      unitContentUnit: "g",
    });
    setDialogStep(0);
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setForm({ ...item, unitContentUnit: item.unitContentUnit ?? "g" });
    setDialogStep(0);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error(t("inventory.toast.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editItem) {
        await updateInventoryItem(editItem.id, form);
      } else {
        await addInventoryItem({
          name: form.name ?? "",
          category: form.category ?? "Other",
          currentStock: form.currentStock ?? 0,
          minStock: form.minStock ?? 10,
          maxStock: form.maxStock ?? 100,
          unit: form.unit ?? "units",
          costPerUnit: form.costPerUnit ?? 0,
          supplier: form.supplier ?? "",
          lastRestocked: new Date().toISOString().split("T")[0],
          minOrderQty: form.minOrderQty ?? null,
          unitsPerCase: form.unitsPerCase ?? null,
          description: form.description?.trim() ? form.description.trim() : null,
          unitContentAmount: form.unitContentAmount ?? null,
          unitContentUnit: form.unitContentUnit ?? null,
        });
      }
      hapticSuccess();
      toast.success(editItem ? t("inventory.toast.itemUpdated") : t("inventory.toast.itemAdded"));
      setDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    hapticWarning();
    try {
      await deleteInventoryItem(id);
      toast.success(t("inventory.toast.itemDeleted"));
    } catch (err) {
      console.error(err);
      toast.error(t("inventory.toast.deleteFailed"));
    }
  };

  const lowStockCount = items.filter((i) => i.status === "low_stock").length;
  const outCount      = items.filter((i) => i.status === "out_of_stock").length;
  const totalValue    = items.reduce((s, i) => s + i.currentStock * i.costPerUnit, 0);
  const inventoryDialogSteps = [
    { label: t("inventory.dialog.steps.identity"), icon: FileText },
    { label: t("inventory.dialog.steps.supplier"), icon: Truck },
    { label: t("inventory.dialog.steps.stock"), icon: Boxes },
    { label: t("inventory.dialog.steps.content"), icon: Scale },
  ];
  const currentDialogStep = Math.min(dialogStep, inventoryDialogSteps.length - 1);
  const isLastDialogStep = currentDialogStep === inventoryDialogSteps.length - 1;
  const contentPreview = formatInventoryContentAmount(form.unitContentAmount, form.unitContentUnit);
  const caseContentPreview =
    form.unitContentAmount && form.unitsPerCase && form.unitContentUnit
      ? formatInventoryContentAmount(form.unitContentAmount * form.unitsPerCase, form.unitContentUnit)
      : "";

  // Restock suggestions
  const restockSuggestions = useMemo(
    () => generateRestockSuggestions(items, transactions),
    [items, transactions]
  );
  const criticalCount = restockSuggestions.filter((s) => s.priority === "critical").length;
  const highCount = restockSuggestions.filter((s) => s.priority === "high").length;
  const totalOrderValue = restockSuggestions.reduce((s, r) => s + r.estimatedCost, 0);

  return (
    <PermissionGuard section="inventory">
    <>
      <PageHeader
        title={t("inventory.title")}
        subtitle={t("inventory.subtitle")}
        right={
          <div className="flex items-center gap-2">
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("inventory.addItem")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 m-3">
        <PageTabs tabs={[
          { label: t("nav.inventory"), href: "/~/inventory" },
          { label: t("nav.suppliers"), href: "/~/suppliers" },
          { label: t("nav.wasteLog"), href: "/~/inventory/waste" },
        ]} />
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={Package}      label={t("inventory.summary.totalItems")}  value={String(items.length)} />
          <SummaryCard icon={CheckCircle2} label={t("inventory.summary.totalValue")}  value={format(totalValue, { decimals: 0 })} />
          <SummaryCard icon={AlertTriangle} label={t("inventory.summary.lowStock")}    value={String(lowStockCount)} urgent={lowStockCount > 0} />
          <SummaryCard icon={XCircle}       label={t("inventory.summary.outOfStock")} value={String(outCount)}      urgent={outCount > 0} />
        </div>

        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items" className="gap-2">
              <Package className="h-3.5 w-3.5" /> {t("inventory.tabs.items")}
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-2">
              <History className="h-3.5 w-3.5" /> {t("inventory.tabs.transactions")}
            </TabsTrigger>
            <TabsTrigger value="losses" className="gap-2">
              <TrendingDown className="h-3.5 w-3.5" /> {t("inventory.tabs.losses")}
            </TabsTrigger>
            <TabsTrigger value="restock" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" /> {t("inventory.tabs.restock")}
            </TabsTrigger>
          </TabsList>

          {/* Items */}
          <TabsContent value="items" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("inventory.filters.searchPlaceholder")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v ?? "All")}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder={t("inventory.filters.categoryPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c === "All" ? t("inventory.filters.all") : c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {items.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{t("inventory.emptyItems.title")}</p>
                    <p className="text-sm mt-1">{t("inventory.emptyItems.hint")}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortButton label={t("inventory.tableHeaders.item")} k="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                        </TableHead>
                        <TableHead>{t("inventory.tableHeaders.category")}</TableHead>
                        <TableHead>
                          <SortButton label={t("inventory.tableHeaders.stock")} k="currentStock" current={sortKey} dir={sortDir} onClick={toggleSort} />
                        </TableHead>
                        <TableHead>{t("inventory.tableHeaders.level")}</TableHead>
                        <TableHead>
                          <SortButton label={t("inventory.tableHeaders.costPerUnit")} k="costPerUnit" current={sortKey} dir={sortDir} onClick={toggleSort} />
                        </TableHead>
                        <TableHead>{t("inventory.tableHeaders.unitContent")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.lossRate")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.status")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.supplier")}</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const pct = item.maxStock > 0
                          ? Math.min(100, Math.round((item.currentStock / item.maxStock) * 100))
                          : 0;
                        const cfg = statusConfig[item.status];
                        const StatusIcon = cfg.icon;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-normal">
                                {item.category}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`font-medium ${cfg.color}`}>
                                {item.currentStock} {item.unit}
                              </span>
                              <span className="text-xs text-muted-foreground"> / {item.maxStock}</span>
                            </TableCell>
                            <TableCell className="w-28">
                              <Progress
                                value={pct}
                                className={`h-2 ${
                                  item.status === "out_of_stock"
                                    ? "[&>div]:bg-destructive"
                                    : item.status === "low_stock"
                                    ? "[&>div]:bg-amber-500"
                                    : "[&>div]:bg-emerald-500"
                                }`}
                              />
                              <span className="text-[10px] text-muted-foreground">{pct}%</span>
                            </TableCell>
                            <TableCell>{format(item.costPerUnit)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatInventoryContentAmount(item.unitContentAmount, item.unitContentUnit) || "—"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={item.lossRate > 8 ? "text-rose-600 font-medium" : "text-muted-foreground"}
                              >
                                {item.lossRate}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                                <StatusIcon className="h-3.5 w-3.5" />
                                {cfg.label}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.supplier}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(item)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                            {t("inventory.noItems")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions */}
          <TabsContent value="transactions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("inventory.transactions.title")}</CardTitle>
                <CardDescription>{t("inventory.transactions.description")}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {transactions.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    {t("inventory.transactions.empty")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("inventory.tableHeaders.date")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.item")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.type")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.quantity")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.operator")}</TableHead>
                        <TableHead>{t("inventory.tableHeaders.note")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...transactions]
                        .sort((a, b) => {
                          const ta = a.createdAt?.getTime() ?? new Date(a.date).getTime();
                          const tb = b.createdAt?.getTime() ?? new Date(b.date).getTime();
                          return tb - ta;
                        })
                        .map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {tx.createdAt
                              ? tx.createdAt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                              : tx.date}
                          </TableCell>
                          <TableCell className="font-medium">{tx.itemName}</TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.type === "in" ? "outline" : tx.type === "loss" ? "destructive" : "secondary"}
                              className="capitalize text-xs"
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={tx.type === "in" ? "text-emerald-600 font-medium" : tx.type === "loss" ? "text-destructive font-medium" : ""}>
                              {tx.type === "in" ? "+" : tx.type === "out" || tx.type === "loss" ? "-" : "±"}{tx.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {tx.operatorName
                              ? <span className="inline-flex items-center gap-1.5 font-medium">{tx.operatorName}</span>
                              : <span className="text-muted-foreground">{t("inventory.transactions.systemOperator")}</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{tx.note}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Loss tracking */}
          <TabsContent value="losses" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("inventory.losses.title")}</CardTitle>
                <CardDescription>
                  {t("inventory.losses.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t("inventory.losses.empty")}</p>
                ) : (
                  [...items]
                    .sort((a, b) => b.lossRate - a.lossRate)
                    .map((item) => (
                      <div key={item.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span
                            className={`font-semibold ${
                              item.lossRate > 8
                                ? "text-destructive"
                                : item.lossRate > 4
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {item.lossRate}{t("inventory.losses.lossSuffix")}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, item.lossRate * 5)}
                          className={`h-2 ${
                            item.lossRate > 8
                              ? "[&>div]:bg-destructive"
                              : item.lossRate > 4
                              ? "[&>div]:bg-amber-500"
                              : "[&>div]:bg-emerald-500"
                          }`}
                        />
                      </div>
                    ))
                )}
                <Separator className="my-2" />
                <p className="text-xs text-muted-foreground">
                  {t("inventory.losses.footnote")}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Restock suggestions */}
          <TabsContent value="restock" className="mt-4 space-y-4">
            {restockSuggestions.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">{t("inventory.restock.emptyTitle")}</p>
                  <p className="text-sm mt-1">{t("inventory.restock.emptyHint")}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Card className={criticalCount > 0 ? "border-red-300" : ""}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="rounded-[0.3rem] p-1.5 bg-red-50 border border-red-200">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold font-mono">{criticalCount}</p>
                        <p className="text-xs text-muted-foreground">{t("inventory.restock.criticalItems")}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className={highCount > 0 ? "border-orange-300" : ""}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="rounded-[0.3rem] p-1.5 bg-orange-50 border border-orange-200">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold font-mono">{highCount}</p>
                        <p className="text-xs text-muted-foreground">{t("inventory.restock.highPriority")}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="rounded-[0.3rem] p-1.5 bg-muted">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-lg font-bold font-mono">{format(totalOrderValue, { decimals: 0 })}</p>
                        <p className="text-xs text-muted-foreground">{t("inventory.restock.totalOrderValue")}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="rounded-[0.3rem] p-1.5 bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-lg font-bold font-mono">{restockSuggestions.length}</p>
                        <p className="text-xs text-muted-foreground">{t("inventory.restock.itemsToRestock")}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const { headers, rows } = formatPurchaseOrder(restockSuggestions);
                      downloadCSV("purchase-order", headers, rows);
                      toast.success(t("inventory.restock.csvDownloaded"));
                    }}
                  >
                    <Download className="h-4 w-4" />
                    {t("inventory.restock.exportCsv")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const { headers, rows } = formatPurchaseOrder(restockSuggestions);
                      downloadPDF(t("inventory.restock.pdfTitle"), headers, rows, {
                        subtitle: t("inventory.restock.pdfSubtitle")
                          .replace("{count}", String(restockSuggestions.length))
                          .replace("{cost}", format(totalOrderValue)),
                        landscape: true,
                      });
                      toast.success(t("inventory.restock.pdfDownloaded"));
                    }}
                  >
                    <Download className="h-4 w-4" />
                    {t("inventory.restock.exportPdf")}
                  </Button>
                </div>

                {/* Suggestion cards grid */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {restockSuggestions.map((s) => (
                    <RestockCard key={s.itemId} suggestion={s} />
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Add/Edit DynamicUIElement */}
        <DynamicUIElement
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setDialogStep(0);
          }}
        >
          <DynamicUIElementContent className="max-w-2xl">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle>{editItem ? t("inventory.dialog.editTitle") : t("inventory.dialog.addTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {editItem
                  ? t("inventory.dialog.editDescription")
                  : t("inventory.dialog.addDescription")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="grid gap-4 py-2 md:grid-cols-[170px_1fr]">
              <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {inventoryDialogSteps.map((step, index) => {
                  const StepIcon = step.icon;
                  const active = index === currentDialogStep;
                  return (
                    <button
                      key={step.label}
                      type="button"
                      onClick={() => setDialogStep(index)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-[0.3rem] border px-2.5 py-2 text-left text-[12px] transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <StepIcon className="h-3.5 w-3.5" />
                      <span className="whitespace-nowrap font-medium">{step.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="min-h-[340px] rounded-[0.3rem] border border-border bg-muted/20 p-3">
                {currentDialogStep === 0 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.name")}</Label>
                        <Input
                          value={form.name ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder={t("inventory.dialog.namePlaceholder")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.category")}</Label>
                        <Input
                          value={form.category ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder={t("inventory.dialog.categoryPlaceholder")}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("inventory.dialog.description")}</Label>
                      <Textarea
                        rows={4}
                        value={form.description ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder={t("inventory.dialog.descriptionPlaceholder")}
                        className="resize-none"
                      />
                    </div>
                  </div>
                )}

                {currentDialogStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t("inventory.dialog.supplier")}</Label>
                      <Combobox
                        allowCustom
                        options={supplierOptions}
                        value={form.supplier ?? ""}
                        onValueChange={(v) => setForm((f) => ({ ...f, supplier: v }))}
                        placeholder={t("inventory.dialog.supplierPlaceholder")}
                        searchPlaceholder={t("inventory.dialog.supplierPlaceholder")}
                        className="w-full"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.costPerUnit")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={form.costPerUnit ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, costPerUnit: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.minOrderQty")}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={form.minOrderQty ?? ""}
                          placeholder={t("inventory.dialog.minOrderQtyPlaceholder")}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              minOrderQty: e.target.value === "" ? undefined : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentDialogStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.currentStock")}</Label>
                        <Input
                          type="number"
                          value={form.currentStock ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, currentStock: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.maxStock")}</Label>
                        <Input
                          type="number"
                          value={form.maxStock ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, maxStock: Number(e.target.value) }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.minStock")}</Label>
                        <Input
                          type="number"
                          value={form.minStock ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.unit")}</Label>
                        <Input
                          value={form.unit ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                          placeholder={t("inventory.dialog.unitPlaceholder")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.unitsPerCase")}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={form.unitsPerCase ?? ""}
                          placeholder={t("inventory.dialog.unitsPerCasePlaceholder")}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              unitsPerCase: e.target.value === "" ? undefined : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentDialogStep === 3 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.unitContentAmount")}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.unitContentAmount ?? ""}
                          placeholder={t("inventory.dialog.unitContentAmountPlaceholder")}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              unitContentAmount: e.target.value === "" ? undefined : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("inventory.dialog.unitContentUnit")}</Label>
                        <Select
                          value={form.unitContentUnit ?? "g"}
                          onValueChange={(v) => setForm((f) => ({ ...f, unitContentUnit: v ?? "g" }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVENTORY_CONTENT_UNITS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("inventory.dialog.lossRate")}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.lossRate ?? 0}
                        onChange={(e) => setForm((f) => ({ ...f, lossRate: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="rounded-[0.3rem] border border-border bg-background p-3 text-sm">
                      <p className="font-medium">{t("inventory.dialog.contentPreview")}</p>
                      <p className="mt-1 text-muted-foreground">
                        {contentPreview
                          ? t("inventory.dialog.contentPreviewValue")
                              .replace("{unit}", form.unit || "unit")
                              .replace("{amount}", contentPreview)
                          : t("inventory.dialog.contentPreviewEmpty")}
                      </p>
                      {caseContentPreview && (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {t("inventory.dialog.caseContentPreview")
                            .replace("{count}", String(form.unitsPerCase))
                            .replace("{amount}", caseContentPreview)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogStep((s) => Math.max(0, s - 1))}
                disabled={currentDialogStep === 0 || saving}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("inventory.dialog.back")}
              </Button>
              <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t("inventory.dialog.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (!isLastDialogStep) {
                    setDialogStep((s) => Math.min(inventoryDialogSteps.length - 1, s + 1));
                    return;
                  }
                  void handleSave();
                }}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <><Spinner size={16} />{t("inventory.dialog.saving")}</>
                ) : isLastDialogStep ? (
                  editItem ? t("inventory.dialog.save") : t("inventory.dialog.add")
                ) : (
                  <>{t("inventory.dialog.next")}<ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
              </div>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>
      </div>
    </>
    </PermissionGuard>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  urgent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <Card className={urgent ? "border-red-300" : ""}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="rounded-[0.3rem] p-1.5 bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-bold font-mono">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SortButton({
  label,
  k,
  current,
  dir,
  onClick,
}: {
  label: string;
  k: keyof InventoryItem;
  current: keyof InventoryItem;
  dir: "asc" | "desc";
  onClick: (k: keyof InventoryItem) => void;
}) {
  return (
    <button
      onClick={() => onClick(k)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${current === k ? "opacity-80" : "opacity-40"}`} />
    </button>
  );
}

const PRIORITY_STYLES: Record<RestockPriority, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  low: "bg-stone-50 dark:bg-stone-950 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700",
};

const PRIORITY_BAR_COLORS: Record<RestockPriority, string> = {
  critical: "[&>div]:bg-red-500",
  high: "[&>div]:bg-orange-500",
  medium: "[&>div]:bg-yellow-500",
  low: "[&>div]:bg-stone-400",
};

function RestockCard({ suggestion: s }: { suggestion: RestockSuggestion }) {
  const { format } = useCurrency();
  const t = useT();
  const stockPct = Math.min(100, Math.round((s.currentStock / s.maxStock) * 100));
  const daysSinceRestock = Math.round(
    (Date.now() - new Date(s.lastRestocked).getTime()) / 86_400_000
  );

  const TrendIcon =
    s.consumptionTrend === "increasing"
      ? ArrowUp
      : s.consumptionTrend === "decreasing"
      ? ArrowDown
      : MinusIcon;

  const trendLabel =
    s.consumptionTrend === "increasing"
      ? t("inventory.restock.trend.increasing")
      : s.consumptionTrend === "decreasing"
      ? t("inventory.restock.trend.decreasing")
      : t("inventory.restock.trend.stable");

  return (
    <Card className="rounded-[0.3rem]">
      <CardContent className="p-4 space-y-3">
        {/* Header: name + priority */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{s.itemName}</p>
            <Badge variant="outline" className="text-[10px] font-normal mt-1">
              {s.category}
            </Badge>
          </div>
          <Badge
            className={cn(
              "text-[10px] font-semibold border capitalize shrink-0",
              PRIORITY_STYLES[s.priority]
            )}
          >
            {s.priority}
          </Badge>
        </div>

        {/* Stock level */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("inventory.restock.stockLevel")}</span>
            <span className="font-mono font-medium">
              {s.currentStock} <span className="text-muted-foreground">/ {s.maxStock} {s.unit}</span>
            </span>
          </div>
          <Progress
            value={stockPct}
            className={cn("h-1.5", PRIORITY_BAR_COLORS[s.priority])}
          />
        </div>

        {/* Consumption + trend */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("inventory.restock.dailyConsumption")}</span>
          <span className="inline-flex items-center gap-1 font-mono font-medium">
            {t("inventory.restock.perDay").replace("{rate}", String(s.dailyConsumptionRate)).replace("{unit}", s.unit)}
            <TrendIcon className={cn(
              "h-3 w-3",
              s.consumptionTrend === "increasing" ? "text-red-500" :
              s.consumptionTrend === "decreasing" ? "text-emerald-500" :
              "text-stone-400 dark:text-stone-500"
            )} />
            <span className={cn(
              "text-[10px]",
              s.consumptionTrend === "increasing" ? "text-red-500" :
              s.consumptionTrend === "decreasing" ? "text-emerald-500" :
              "text-stone-400 dark:text-stone-500"
            )}>
              {trendLabel}
            </span>
          </span>
        </div>

        {/* Days until stockout */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("inventory.restock.daysUntilStockout")}</span>
          <span
            className={cn(
              "font-mono font-semibold",
              s.daysUntilStockout <= 3
                ? "text-red-600"
                : s.daysUntilStockout <= 7
                ? "text-orange-600"
                : "text-stone-700 dark:text-stone-300"
            )}
          >
            {s.daysUntilStockout >= 999 ? t("inventory.restock.notApplicable") : t("inventory.restock.daysValue").replace("{days}", String(s.daysUntilStockout))}
          </span>
        </div>

        <Separator />

        {/* Order recommendation */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("inventory.restock.recommendedOrder")}</span>
            <span className="font-mono font-semibold">
              {s.recommendedOrderQty} {s.unit}
              {s.unitsPerCase && s.unitsPerCase > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  = {s.recommendedOrderQty / s.unitsPerCase} ×{s.unitsPerCase}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("inventory.restock.estimatedCost")}</span>
            <span className="font-mono font-semibold">{format(s.estimatedCost)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("inventory.dialog.supplier")}</span>
            <span className="text-sm truncate max-w-[140px]">{s.supplier || "—"}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("inventory.restock.lastRestocked")}</span>
            <span className="text-muted-foreground font-mono">
              {t("inventory.restock.daysAgo").replace("{days}", String(daysSinceRestock))}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
