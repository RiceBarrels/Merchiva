"use client";

import { useState, useCallback } from "react";
import { ShoppingBag, TrendingUp, TrendingDown, Minus, AlertTriangle, XCircle, CheckCircle2, Star, Zap, ArrowUpRight, Search, Plus, RefreshCw, ChevronDown } from "lucide-react";
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
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
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
import { addProduct, deleteProduct } from "@/lib/spacetimedb/actions";
import type { Product } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";
import { PageTabs } from "@/components/page-tabs";
import { Spinner } from "@/components/ui/loaders/geometric";

const alertConfig = {
  none:           { labelKey: "products.alerts.healthy",          icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  underperforming:{ labelKey: "products.alerts.underperforming",  icon: AlertTriangle, color: "text-amber-600",  bg: "bg-amber-50"   },
  remove:         { labelKey: "products.alerts.remove",           icon: XCircle,       color: "text-destructive", bg: "bg-destructive/5" },
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
  const t = useT();
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
  const [showTranslations, setShowTranslations] = useState(false);

  const CATEGORIES = ["All", ...Array.from(new Set(products.map((p) => p.category)))];

  const filtered = products.filter((p) => {
    const matchCat    = category === "All" || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchAlert  = filterAlert === "all" || p.alert !== "none";
    return matchCat && matchSearch && matchAlert;
  });

  const handleAdd = async () => {
    if (!form.name) {
      toast.error(t("products.toasts.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const margin =
        form.price && form.cost && form.price > 0
          ? Math.round(((form.price - form.cost) / form.price) * 1000) / 10
          : form.margin ?? 0;
      const newProd = await addProduct(
        { ...(BLANK as Omit<Product, "id">), ...form, margin } as Omit<Product, "id">,
      );
      hapticSuccess();
      toast.success(t("products.toasts.added"));
      void newProd;
      setDialogOpen(false);
      setForm(BLANK);
    } catch (err) {
      console.error(err);
      toast.error(t("products.toasts.addFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    hapticWarning();
    try {
      await deleteProduct(id);
      toast.success(t("products.toasts.deleted"));
    } catch (err) {
      console.error(err);
      toast.error(t("products.toasts.deleteFailed"));
    }
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
    <div className="">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        right={
          <div className="flex items-center gap-2">
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {atRisk > 0 && (
              <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1.5">
                <Zap className="h-3.5 w-3.5 text-violet-500" />
                {t("products.flagged").replace("{count}", String(atRisk))}
              </Badge>
            )}
            <Button onClick={() => { setForm(BLANK); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> {t("products.addProduct")}
            </Button>
          </div>
        }
      />
      <PageTabs tabs={[
        { label: t("nav.products"), href: "/~/products" },
        { label: t("nav.pricing"), href: "/~/pricing" },
      ]} />

      <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label={t("products.summary.products")}     value={String(products.length)} icon={ShoppingBag} />
        <SummaryCard label={t("products.summary.revenueMonth")} value={`$${totalRevenue.toLocaleString()}`} icon={TrendingUp} />
        <SummaryCard label={t("products.summary.avgMargin")}    value={`${avgMargin}%`}         icon={ArrowUpRight} />
        <SummaryCard label={t("products.summary.needReview")}   value={String(atRisk)}          icon={AlertTriangle} urgent={atRisk > 0} />
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <div>
              <p className="font-semibold">{t("products.empty.title")}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {t("products.empty.description")}
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
                <CardTitle className="text-base">{t("products.chart.title")}</CardTitle>
                <CardDescription>{t("products.chart.legend")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip contentStyle={{ borderRadius: "2px", border: "1px solid #e7e5e4", fontSize: "12px" }} formatter={(v) => [`$${v}`, t("products.chart.revenue")]} />
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
                  <Zap className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{t("products.insight.title")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {atRisk > 0
                        ? (atRisk > 1
                            ? t("products.insight.attentionPlural")
                            : t("products.insight.attentionSingular")
                          ).replace("{count}", String(atRisk))
                        : t("products.insight.healthy")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {topProduct && (
                <Card>
                  <CardContent className="p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t("products.top.label")}</p>
                    <p className="text-lg font-bold">{topProduct.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">${topProduct.revenue.toLocaleString()} {t("products.top.revenueSuffix")}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 font-semibold">{topProduct.margin}% {t("products.top.marginSuffix")}</span>
                      {trendIcon(topProduct.trend)}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(topProduct.rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{topProduct.rating}{t("products.top.ratingSuffix")}</span>
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
                  <Input placeholder={t("products.filters.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={category} onValueChange={(v) => setCategory(v ?? "All")}>
                  <SelectTrigger className="w-44"><SelectValue placeholder={t("products.filters.category")} /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button
                  variant={filterAlert === "alerts" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterAlert((f) => f === "all" ? "alerts" : "all")}
                  className="gap-1.5 shrink-0"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> {t("products.filters.alertsOnly")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("products.table.product")}</TableHead>
                    <TableHead>{t("products.table.category")}</TableHead>
                    <TableHead>{t("products.table.price")}</TableHead>
                    <TableHead>{t("products.table.unitsSold")}</TableHead>
                    <TableHead>{t("products.table.revenue")}</TableHead>
                    <TableHead>{t("products.table.margin")}</TableHead>
                    <TableHead>{t("products.table.rating")}</TableHead>
                    <TableHead>{t("products.table.trend")}</TableHead>
                    <TableHead>{t("products.table.status")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const cfg = alertConfig[p.alert] ?? alertConfig.none;
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
                          <div className="flex items-center gap-2">
                            {p.imageUrl && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="h-8 w-8 rounded-[0.3rem] object-cover border shrink-0"
                              />
                            )}
                            <div>
                              <p className="font-medium">{p.name}</p>
                              {p.alertReason && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate">{p.alertReason}</p>
                              )}
                            </div>
                          </div>
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
                            <span className="text-xs text-muted-foreground">{t(`products.trends.${p.trend}`)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                            <AlertIcon className="h-3 w-3" />
                            {t(cfg.labelKey)}
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
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-10">{t("products.table.noResults")}</TableCell>
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

      {/* Add Product DynamicUIElement */}
      <DynamicUIElement open={dialogOpen} onOpenChange={setDialogOpen}>
        <DynamicUIElementContent className="max-w-lg">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle>{t("products.dialog.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("products.dialog.description")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="grid gap-4 py-2">
            {/* Image Upload */}
            <div className="space-y-1.5">
              <Label>Image</Label>
              <ImageUpload
                value={form.imageUrl ?? ""}
                orgId={organizationId ?? ""}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url || undefined }))}
                className="max-w-[200px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("products.dialog.nameLabel")}</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("products.dialog.namePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("products.dialog.categoryLabel")}</Label>
                <Input value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder={t("products.dialog.categoryPlaceholder")} />
              </div>
            </div>
            {/* Translations */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowTranslations((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${showTranslations ? "" : "-rotate-90"}`} />
                {showTranslations ? t("products.dialog.translationsCollapse") : t("products.dialog.translationsExpand")}
              </button>
              {showTranslations && (
                <div className="grid grid-cols-3 gap-3 pt-1">
                  {([["zh", "中文"], ["es", "Español"], ["fr", "Français"]] as const).map(([code, label]) => (
                    <div key={code} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Input
                        value={(form.nameI18n as Record<string, string> | undefined)?.[code] ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            nameI18n: { ...(f.nameI18n as Record<string, string> ?? {}), [code]: e.target.value },
                          }))
                        }
                        placeholder={`${label}…`}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("products.dialog.priceLabel")}</Label>
                <Input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("products.dialog.costLabel")}</Label>
                <Input type="number" step="0.01" value={form.cost ?? 0} onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))} />
              </div>
            </div>
            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief product description..."
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground text-right">{(form.description ?? "").length}/500</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("products.dialog.unitsThisMonth")}</Label>
                <Input type="number" value={form.unitsSoldThisMonth ?? 0} onChange={(e) => setForm((f) => ({ ...f, unitsSoldThisMonth: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("products.dialog.unitsLastMonth")}</Label>
                <Input type="number" value={form.unitsSoldLastMonth ?? 0} onChange={(e) => setForm((f) => ({ ...f, unitsSoldLastMonth: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("products.dialog.ratingLabel")}</Label>
                <Input type="number" min="1" max="5" step="0.1" value={form.rating ?? 5} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("products.dialog.statusLabel")}</Label>
                <Select value={form.alert ?? "none"} onValueChange={(v) => setForm((f) => ({ ...f, alert: (v ?? "none") as Product["alert"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("products.alerts.healthy")}</SelectItem>
                    <SelectItem value="underperforming">{t("products.alerts.underperforming")}</SelectItem>
                    <SelectItem value="remove">{t("products.alerts.flagForRemoval")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("products.dialog.cancel")}</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Spinner size={16} /> : t("products.dialog.submit")}
            </Button>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>
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
