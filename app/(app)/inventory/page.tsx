"use client";

import { useState, useEffect } from "react";
import {
  Package,
  Plus,
  Search,
  TrendingDown,
  ArrowUpDown,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
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
import { createClient } from "@/lib/supabase/client";
import {
  getInventoryItems,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryTransactions,
} from "@/lib/db/inventory";
import type { InventoryItem, InventoryTransaction, InventoryStatus } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";

const statusConfig: Record<
  InventoryStatus,
  {
    label: string;
    icon: React.ElementType;
    color: string;
  }
> = {
  in_stock:     { label: "In Stock",     icon: CheckCircle2, color: "text-emerald-600" },
  low_stock:    { label: "Low Stock",    icon: AlertTriangle, color: "text-amber-600"  },
  out_of_stock: { label: "Out of Stock", icon: XCircle,       color: "text-destructive" },
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortKey, setSortKey] = useState<keyof InventoryItem>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<InventoryItem>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
    });
    Promise.all([getInventoryItems(), getInventoryTransactions()])
      .then(([inv, tx]) => {
        setItems(inv);
        setTransactions(tx);
      })
      .catch((err) => {
        console.error("Failed to load inventory:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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
      lossRate: 0,
      minStock: 10,
      maxStock: 100,
      currentStock: 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setForm({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !userId) return;
    setSaving(true);
    try {
      if (editItem) {
        await updateInventoryItem(editItem.id, form);
        setItems((prev) =>
          prev.map((i) =>
            i.id === editItem.id
              ? {
                  ...i,
                  ...form,
                  status:
                    (form.currentStock ?? i.currentStock) === 0
                      ? "out_of_stock"
                      : (form.currentStock ?? i.currentStock) <
                        (form.minStock ?? i.minStock)
                      ? "low_stock"
                      : "in_stock",
                }
              : i
          )
        );
      } else {
        const newItem = await addInventoryItem(
          {
            name: form.name ?? "",
            category: form.category ?? "Other",
            currentStock: form.currentStock ?? 0,
            minStock: form.minStock ?? 10,
            maxStock: form.maxStock ?? 100,
            unit: form.unit ?? "units",
            costPerUnit: form.costPerUnit ?? 0,
            supplier: form.supplier ?? "",
            lastRestocked:
              new Date().toISOString().split("T")[0],
            lossRate: form.lossRate ?? 0,
          },
          userId
        );
        setItems((prev) => [newItem, ...prev]);
      }
      hapticSuccess();
      setDialogOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    hapticWarning();
    await deleteInventoryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const lowStockCount = items.filter((i) => i.status === "low_stock").length;
  const outCount      = items.filter((i) => i.status === "out_of_stock").length;
  const totalValue    = items.reduce((s, i) => s + i.currentStock * i.costPerUnit, 0);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard section="inventory">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track stock levels, losses, and restocking needs
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={Package}      label="Total Items"   value={String(items.length)} />
        <SummaryCard icon={CheckCircle2} label="Total Value"   value={`$${totalValue.toFixed(0)}`} />
        <SummaryCard icon={AlertTriangle} label="Low Stock"    value={String(lowStockCount)} urgent={lowStockCount > 0} />
        <SummaryCard icon={XCircle}       label="Out of Stock" value={String(outCount)}      urgent={outCount > 0} />
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items" className="gap-2">
            <Package className="h-3.5 w-3.5" /> Items
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2">
            <History className="h-3.5 w-3.5" /> Transaction Log
          </TabsTrigger>
          <TabsTrigger value="losses" className="gap-2">
            <TrendingDown className="h-3.5 w-3.5" /> Loss Tracking
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
                    placeholder="Search items or suppliers…"
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
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
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
                  <p className="font-medium">No inventory items yet</p>
                  <p className="text-sm mt-1">Add your first item or sync from Square in Settings.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <SortButton label="Item" k="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                      </TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>
                        <SortButton label="Stock" k="currentStock" current={sortKey} dir={sortDir} onClick={toggleSort} />
                      </TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>
                        <SortButton label="Cost/Unit" k="costPerUnit" current={sortKey} dir={sortDir} onClick={toggleSort} />
                      </TableHead>
                      <TableHead>Loss Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => {
                      const pct = Math.min(
                        100,
                        Math.round((item.currentStock / item.maxStock) * 100)
                      );
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
                          <TableCell>${item.costPerUnit.toFixed(2)}</TableCell>
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
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                          No items found.
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
              <CardTitle className="text-base">Recent Transactions</CardTitle>
              <CardDescription>Stock movements — deliveries, usage, and waste</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No transactions yet. They&apos;ll appear here once you start tracking stock movements.
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground text-sm">{t.date}</TableCell>
                        <TableCell className="font-medium">{t.itemName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={t.type === "in" ? "outline" : t.type === "loss" ? "destructive" : "secondary"}
                            className="capitalize text-xs"
                          >
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={t.type === "in" ? "text-emerald-600 font-medium" : t.type === "loss" ? "text-destructive font-medium" : ""}>
                            {t.type === "in" ? "+" : "-"}{t.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.note}</TableCell>
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
              <CardTitle className="text-base">Loss Rate by Item</CardTitle>
              <CardDescription>
                Historical loss percentage — connect Square API to auto-populate
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Add inventory items to track loss rates.</p>
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
                          {item.lossRate}% loss
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
                Loss data connects to Square API for automatic tracking. Configure in Settings.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
            <DialogDescription>
              {editItem
                ? "Update the details for this inventory item."
                : "Add a new item to your inventory."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Item Name *</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Arabica Coffee Beans"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={form.category ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Beverages"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Current Stock</Label>
                <Input
                  type="number"
                  value={form.currentStock ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, currentStock: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Min Stock</Label>
                <Input
                  type="number"
                  value={form.minStock ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Stock</Label>
                <Input
                  type="number"
                  value={form.maxStock ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, maxStock: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input
                  value={form.unit ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="kg, liters, units…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cost per Unit ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.costPerUnit ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, costPerUnit: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input
                  value={form.supplier ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                  placeholder="Supplier name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Loss Rate (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.lossRate ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, lossRate: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              ) : editItem ? (
                "Save Changes"
              ) : (
                "Add Item"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
