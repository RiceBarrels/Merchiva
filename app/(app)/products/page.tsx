"use client";

import { useState } from "react";
import {
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Star,
  Zap,
  ArrowUpRight,
  Search,
  Plus,
  Loader2,
  RefreshCw,
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
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { addProduct, deleteProduct } from "@/lib/db/products";
import type { Product } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";

const alertConfig = {
  none:           { label: "Healthy",         icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  underperforming:{ label: "Underperforming",  icon: AlertTriangle, color: "text-amber-600",  bg: "bg-amber-50"   },
  remove:         { label: "Remove",           icon: XCircle,       color: "text-destructive", bg: "bg-destructive/5" },
};

const trendIcon = (t: Product["trend"]) => {
  if (t === "up")   return <TrendingUp   className="h-3.5 w-3.5 text-emerald-500" />;
  if (t === "down") return <TrendingDown className="h-3.5 w-3.5 text-rose-500"    />;
  return                    <Minus       className="h-3.5 w-3.5 text-muted-foreground" />;
};

const BLANK: Partial<Product> = {
  category: "Other",
  price: 0,
  cost: 0,
  unitsSoldThisMonth: 0,
  unitsSoldLastMonth: 0,
  revenue: 0,
  margin: 0,
  rating: 5,
  trend: "stable",
  alert: "none",
};

export default function ProductsPage() {
  const { organizationId } = usePermissions();
  const router = useRouter();
  // Data via SpacetimeDB migration hook
  const { products, refreshing, userId } = useProducts(organizationId);

  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("All");
  const [filterAlert, setFilterAlert] = useState<"all" | "alerts">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Product>>(BLANK);
  const [saving, setSaving] = useState(false);

  const CATEGORIES = ["All", ...Array.from(new Set(products.map((p) => p.category)))];

  const filtered = products.filter((p) => {
    const matchCat    = category === "All" || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchAlert  = filterAlert === "all" || p.alert !== "none";
    return matchCat && matchSearch && matchAlert;
  });

  const handleAdd = async () => {
    if (!form.name || !userId) return;
    setSaving(true);
    try {
      const margin =
        form.price && form.cost && form.price > 0
          ? Math.round(((form.price - form.cost) / form.price) * 1000) / 10
          : form.margin ?? 0;
      const newProd = await addProduct(
        { ...(BLANK as Omit<Product, "id">), ...form, margin } as Omit<Product, "id">,
        userId
      );
      hapticSuccess();
      void newProd;
      setDialogOpen(false);
      setForm(BLANK);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    hapticWarning();
    await deleteProduct(id);
  };

  const totalRevenue  = products.reduce((s, p) => s + p.revenue, 0);
  const avgMargin     = products.length > 0
    ? Math.round(products.reduce((s, p) => s + p.margin, 0) / products.length)
    : 0;
  const atRisk        = products.filter((p) => p.alert !== "none").length;
  const topProduct    = [...products].sort((a, b) => b.revenue - a.revenue)[0];

  const chartData = [...products]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
      revenue: p.revenue,
      alert: p.alert,
    }));

  return (
    <PermissionGuard section="products">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track performance, margins, and AI-flagged underperformers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {atRisk > 0 && (
            <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1.5">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              {atRisk} flagged
            </Badge>
          )}
          <Button onClick={() => { setForm(BLANK); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Products"       value={String(products.length)} icon={ShoppingBag} />
        <SummaryCard label="Revenue (month)"value={`$${totalRevenue.toLocaleString()}`} icon={TrendingUp} />
        <SummaryCard label="Avg Margin"     value={`${avgMargin}%`}         icon={ArrowUpRight} />
        <SummaryCard label="Need Review"    value={String(atRisk)}          icon={AlertTriangle} urgent={atRisk > 0} />
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <div>
              <p className="font-semibold">No products yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Add products manually or connect Square in Settings to import your catalog automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue by Product</CardTitle>
                <CardDescription>Red = flagged for removal · Yellow = underperforming</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip contentStyle={{ borderRadius: "2px", border: "1px solid #e7e5e4", fontSize: "12px" }} formatter={(v) => [`$${v}`, "Revenue"]} />
                    <Bar dataKey="revenue" radius={[0, 2, 2, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.alert === "remove" ? "#dc2626" : entry.alert === "underperforming" ? "#78716c" : "#44403c"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-3">
              <Card>
                <CardContent className="p-3 flex gap-2.5">
                  <Zap className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-stone-800">AI Product Insight</p>
                    <p className="text-sm text-stone-600 leading-relaxed">
                      {atRisk > 0
                        ? `${atRisk} product${atRisk > 1 ? "s need" : " needs"} attention. Review flagged items below and consider removing low-performing SKUs to reduce operational complexity.`
                        : "All products are performing within acceptable thresholds. Keep monitoring weekly trends for early signals."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {topProduct && (
                <Card>
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Top Performer</p>
                    <p className="text-lg font-bold">{topProduct.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">${topProduct.revenue.toLocaleString()} revenue</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 font-semibold">{topProduct.margin}% margin</span>
                      {trendIcon(topProduct.trend)}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(topProduct.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{topProduct.rating}/5</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={category} onValueChange={(v) => setCategory(v ?? "All")}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button
                  variant={filterAlert === "alerts" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAlert((f) => f === "all" ? "alerts" : "all")}
                  className="gap-1.5 shrink-0"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Alerts Only
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Units Sold</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const cfg = alertConfig[p.alert];
                    const AlertIcon = cfg.icon;
                    const momPct = p.unitsSoldLastMonth > 0
                      ? Math.round(((p.unitsSoldThisMonth - p.unitsSoldLastMonth) / p.unitsSoldLastMonth) * 100)
                      : 0;
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/products/${p.id}`)}
                      >
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          {p.alertReason && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate">{p.alertReason}</p>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-normal">{p.category}</Badge></TableCell>
                        <TableCell className="font-medium">${p.price.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{p.unitsSoldThisMonth}</span>
                            {momPct !== 0 && (
                              <span className={`text-[11px] font-semibold ${momPct > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {momPct > 0 ? "+" : ""}{momPct}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">${p.revenue.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={p.margin} className="h-1.5 w-16 [&>div]:bg-primary" />
                            <span className="text-xs text-muted-foreground">{p.margin}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className={`h-3.5 w-3.5 ${p.rating >= 4 ? "fill-amber-400 text-amber-400" : p.rating >= 3 ? "fill-amber-200 text-amber-300" : "text-muted-foreground"}`} />
                            <span className="text-sm font-medium">{p.rating}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {trendIcon(p.trend)}
                            <span className="text-xs capitalize text-muted-foreground">{p.trend}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                            <AlertIcon className="h-3 w-3" />
                            {cfg.label}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-10">No products found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      </>

      {/* Add Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Add a product to track its performance.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Product Name *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Latte" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Hot Beverages" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cost ($)</Label>
                <Input type="number" step="0.01" value={form.cost ?? 0} onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Units Sold This Month</Label>
                <Input type="number" value={form.unitsSoldThisMonth ?? 0} onChange={(e) => setForm((f) => ({ ...f, unitsSoldThisMonth: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Units Sold Last Month</Label>
                <Input type="number" value={form.unitsSoldLastMonth ?? 0} onChange={(e) => setForm((f) => ({ ...f, unitsSoldLastMonth: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Rating (1–5)</Label>
                <Input type="number" min="1" max="5" step="0.1" value={form.rating ?? 5} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.alert ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, alert: (v ?? "none") as Product["alert"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Healthy</SelectItem>
                    <SelectItem value="underperforming">Underperforming</SelectItem>
                    <SelectItem value="remove">Flag for Removal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Product"}
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
