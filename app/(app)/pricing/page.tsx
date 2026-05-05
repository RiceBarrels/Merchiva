"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  BadgeDollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Clock,
  Search,
  ShoppingBag,
  Loader2,
  Sparkles,
  Eye,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useProducts } from "@/lib/spacetimedb/hooks/useProducts";
import { updateProduct } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";
import { hapticSuccess } from "@/lib/haptics";
import type { Product } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PriceSuggestion {
  type: "increase" | "decrease" | "keep";
  suggestedPrice: number;
  reason: string;
}

interface HappyHourConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  discountPercent: number;
  applicableCategories: string[];
}

// ─── Suggestion Logic ───────────────────────────────────────────────────────

function getSuggestion(product: Product, t: (key: string) => string): PriceSuggestion {
  const { margin, trend, unitsSoldThisMonth, unitsSoldLastMonth, price, cost } = product;

  // Low margin: suggest raising to 25% margin
  if (margin < 15) {
    const target = cost > 0 ? cost / 0.75 : price * 1.1;
    return {
      type: "increase",
      suggestedPrice: Math.round(target * 100) / 100,
      reason: t("pricing.suggestions.lowMargin"),
    };
  }

  // Declining sales: suggest 10% discount
  if (trend === "down" && unitsSoldLastMonth > 0 && unitsSoldThisMonth < unitsSoldLastMonth * 0.7) {
    return {
      type: "decrease",
      suggestedPrice: Math.round(price * 0.9 * 100) / 100,
      reason: t("pricing.suggestions.decliningDemand"),
    };
  }

  // Growing sales: suggest 5% price increase
  if (trend === "up" && unitsSoldLastMonth > 0 && unitsSoldThisMonth > unitsSoldLastMonth * 1.3) {
    return {
      type: "increase",
      suggestedPrice: Math.round(price * 1.05 * 100) / 100,
      reason: t("pricing.suggestions.strongDemand"),
    };
  }

  return {
    type: "keep",
    suggestedPrice: price,
    reason: t("pricing.suggestions.keepCurrent"),
  };
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[0.3rem] bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-semibold font-mono leading-tight ${accent ? "text-foreground" : ""}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Price Overview Tab ─────────────────────────────────────────────────────

function PriceOverviewTab({
  products,
  search,
  setSearch,
}: {
  products: Product[];
  search: string;
  setSearch: (s: string) => void;
}) {
  const t = useT();
  const { can } = usePermissions();
  const canEdit = can("products", "edit");

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    product: Product | null;
    newPrice: number;
  }>({ open: false, product: null, newPrice: 0 });

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  const suggestions = useMemo(() => {
    const map = new Map<string, PriceSuggestion>();
    products.forEach((p) => map.set(p.id, getSuggestion(p, t)));
    return map;
  }, [products, t]);

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, search]);

  const actionableProducts = useMemo(
    () => products.filter((p) => suggestions.get(p.id)?.type !== "keep"),
    [products, suggestions]
  );

  const increases = useMemo(
    () => products.filter((p) => suggestions.get(p.id)?.type === "increase").length,
    [products, suggestions]
  );
  const decreases = useMemo(
    () => products.filter((p) => suggestions.get(p.id)?.type === "decrease").length,
    [products, suggestions]
  );
  const avgMargin = useMemo(() => {
    if (products.length === 0) return 0;
    return products.reduce((sum, p) => sum + p.margin, 0) / products.length;
  }, [products]);

  const handleApply = useCallback(
    async (product: Product, newPrice: number) => {
      setApplying(product.id);
      try {
        await updateProduct(product.id, { price: newPrice });
        hapticSuccess();
        toast.success(
          t("pricing.toast.priceUpdated").replace("{name}", product.name)
        );
      } catch (err) {
        console.error("Failed to update price:", err);
        toast.error(t("pricing.toast.updateFailed"));
      } finally {
        setApplying(null);
        setConfirmDialog({ open: false, product: null, newPrice: 0 });
      }
    },
    [t]
  );

  const handleBulkApply = useCallback(async () => {
    setBulkApplying(true);
    let successCount = 0;
    for (const product of actionableProducts) {
      const suggestion = suggestions.get(product.id);
      if (!suggestion || suggestion.type === "keep") continue;
      try {
        await updateProduct(product.id, { price: suggestion.suggestedPrice });
        successCount++;
      } catch (err) {
        console.error(`Failed to update ${product.name}:`, err);
      }
    }
    hapticSuccess();
    toast.success(
      t("pricing.toast.bulkUpdated").replace("{count}", String(successCount))
    );
    setBulkApplying(false);
    setBulkConfirmOpen(false);
  }, [actionableProducts, suggestions, t]);

  const trendIcon = (trend: Product["trend"]) => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
      case "down":
        return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={Eye}
          label={t("pricing.summary.reviewed")}
          value={String(products.length)}
        />
        <SummaryCard
          icon={ArrowUpRight}
          label={t("pricing.summary.increases")}
          value={String(increases)}
          accent
        />
        <SummaryCard
          icon={ArrowDownRight}
          label={t("pricing.summary.decreases")}
          value={String(decreases)}
        />
        <SummaryCard
          icon={BadgeDollarSign}
          label={t("pricing.summary.avgMargin")}
          value={`${avgMargin.toFixed(1)}%`}
        />
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("pricing.searchProducts")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            {canEdit && actionableProducts.length > 0 && (
              <Button
                size="sm"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={bulkApplying}
                className="gap-1.5"
              >
                {bulkApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {t("pricing.applyAll")} ({actionableProducts.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {t("pricing.emptyState")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">{t("pricing.table.name")}</TableHead>
                    <TableHead className="text-right">{t("pricing.table.currentPrice")}</TableHead>
                    <TableHead className="text-right">{t("pricing.table.cost")}</TableHead>
                    <TableHead className="text-right">{t("pricing.table.margin")}</TableHead>
                    <TableHead className="text-right">{t("pricing.table.unitsSold")}</TableHead>
                    <TableHead className="text-right">{t("pricing.table.revenue")}</TableHead>
                    <TableHead className="text-center">{t("pricing.table.trend")}</TableHead>
                    <TableHead className="text-right min-w-[120px]">{t("pricing.table.suggested")}</TableHead>
                    {canEdit && <TableHead className="w-[80px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => {
                    const suggestion = suggestions.get(product.id)!;
                    const diff = suggestion.suggestedPrice - product.price;
                    const isIncrease = suggestion.type === "increase";
                    const isDecrease = suggestion.type === "decrease";

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate max-w-[160px]">
                              {product.name}
                            </span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {product.category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${product.price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          ${product.cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-mono text-sm ${
                              product.margin < 15
                                ? "text-destructive"
                                : product.margin < 25
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {product.margin.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {product.unitsSoldThisMonth}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${product.revenue.toFixed(0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {trendIcon(product.trend)}
                        </TableCell>
                        <TableCell className="text-right">
                          {suggestion.type === "keep" ? (
                            <span className="text-xs text-muted-foreground">
                              {t("pricing.suggestions.keepCurrent")}
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {isIncrease ? (
                                <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3 text-destructive" />
                              )}
                              <span
                                className={`font-mono text-sm font-medium ${
                                  isIncrease
                                    ? "text-emerald-600"
                                    : "text-destructive"
                                }`}
                              >
                                ${suggestion.suggestedPrice.toFixed(2)}
                              </span>
                              <span
                                className={`text-[10px] ${
                                  isIncrease
                                    ? "text-emerald-600"
                                    : "text-destructive"
                                }`}
                              >
                                ({diff > 0 ? "+" : ""}
                                {diff.toFixed(2)})
                              </span>
                            </div>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            {suggestion.type !== "keep" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={applying === product.id}
                                onClick={() =>
                                  setConfirmDialog({
                                    open: true,
                                    product,
                                    newPrice: suggestion.suggestedPrice,
                                  })
                                }
                              >
                                {applying === product.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  t("pricing.apply")
                                )}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single confirm dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, product: null, newPrice: 0 });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pricing.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.product && (
                <>
                  {t("pricing.confirm.body")
                    .replace("{name}", confirmDialog.product.name)
                    .replace("{oldPrice}", `$${confirmDialog.product.price.toFixed(2)}`)
                    .replace("{newPrice}", `$${confirmDialog.newPrice.toFixed(2)}`)}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog.product) {
                  handleApply(confirmDialog.product, confirmDialog.newPrice);
                }
              }}
            >
              {t("pricing.confirm.apply")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk confirm dialog */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pricing.bulkConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pricing.bulkConfirm.body").replace(
                "{count}",
                String(actionableProducts.length)
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkApply}>
              {bulkApplying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              {t("pricing.bulkConfirm.apply")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Happy Hour Tab ─────────────────────────────────────────────────────────

function HappyHourTab({ products }: { products: Product[] }) {
  const t = useT();
  const { organizationId } = usePermissions();
  const storageKey = `happy_hour_${organizationId}`;

  const [config, setConfig] = useState<HappyHourConfig>({
    enabled: false,
    startTime: "15:00",
    endTime: "18:00",
    discountPercent: 15,
    applicableCategories: [],
  });

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setConfig(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey]);

  // Save to localStorage on change
  const updateConfig = useCallback(
    (partial: Partial<HappyHourConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const toggleCategory = useCallback(
    (cat: string) => {
      setConfig((prev) => {
        const next = prev.applicableCategories.includes(cat)
          ? prev.applicableCategories.filter((c) => c !== cat)
          : [...prev.applicableCategories, cat];
        const updated = { ...prev, applicableCategories: next };
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
    },
    [storageKey]
  );

  const affectedProducts = useMemo(() => {
    if (!config.enabled) return [];
    if (config.applicableCategories.length === 0) return products;
    return products.filter((p) =>
      config.applicableCategories.includes(p.category)
    );
  }, [products, config.enabled, config.applicableCategories]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">{t("pricing.happyHour.title")}</CardTitle>
                <CardDescription className="text-xs">
                  {t("pricing.happyHour.description")}
                </CardDescription>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked: boolean) =>
                  updateConfig({ enabled: checked })
                }
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("pricing.happyHour.startTime")}</Label>
                <Input
                  type="time"
                  value={config.startTime}
                  onChange={(e) => updateConfig({ startTime: e.target.value })}
                  className="h-8 text-sm font-mono"
                  disabled={!config.enabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("pricing.happyHour.endTime")}</Label>
                <Input
                  type="time"
                  value={config.endTime}
                  onChange={(e) => updateConfig({ endTime: e.target.value })}
                  className="h-8 text-sm font-mono"
                  disabled={!config.enabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("pricing.happyHour.discount")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={config.discountPercent}
                  onChange={(e) =>
                    updateConfig({
                      discountPercent: Math.min(90, Math.max(1, Number(e.target.value))),
                    })
                  }
                  className="h-8 text-sm font-mono w-20"
                  disabled={!config.enabled}
                />
                <span className="text-sm text-muted-foreground">%</span>
                <input
                  type="range"
                  min={1}
                  max={90}
                  value={config.discountPercent}
                  onChange={(e) =>
                    updateConfig({ discountPercent: Number(e.target.value) })
                  }
                  className="flex-1 h-1.5 accent-foreground"
                  disabled={!config.enabled}
                />
              </div>
            </div>

            {categories.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">{t("pricing.happyHour.categories")}</Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("pricing.happyHour.categoriesHint")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <label
                      key={cat}
                      className="flex items-center gap-1.5 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={config.applicableCategories.includes(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                        disabled={!config.enabled}
                      />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("pricing.happyHour.preview")}</CardTitle>
            <CardDescription className="text-xs">
              {config.enabled
                ? t("pricing.happyHour.previewActive")
                    .replace("{count}", String(affectedProducts.length))
                    .replace("{discount}", String(config.discountPercent))
                : t("pricing.happyHour.previewDisabled")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!config.enabled ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("pricing.happyHour.enableHint")}
                </p>
              </div>
            ) : affectedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("pricing.emptyState")}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {affectedProducts.map((product) => {
                  const discounted =
                    Math.round(
                      product.price * (1 - config.discountPercent / 100) * 100
                    ) / 100;
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-[0.3rem] hover:bg-muted/50 text-sm"
                    >
                      <span className="truncate flex-1 mr-3">{product.name}</span>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                        <span className="line-through text-muted-foreground">
                          ${product.price.toFixed(2)}
                        </span>
                        <ArrowDownRight className="h-3 w-3 text-destructive" />
                        <span className="text-destructive font-medium">
                          ${discounted.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Competitor Analysis Tab ────────────────────────────────────────────────

function CompetitorTab() {
  const t = useT();
  const [placeId, setPlaceId] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[0.3rem] bg-muted">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm">
                {t("pricing.competitor.title")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("pricing.competitor.comingSoon")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("pricing.competitor.description")}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t("pricing.competitor.placeIdLabel")}
            </Label>
            <Input
              placeholder={t("pricing.competitor.placeIdPlaceholder")}
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          </div>
          <Button size="sm" variant="outline" disabled className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            {t("pricing.competitor.monitor")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { products, isReady } = useProducts(organizationId);
  const [search, setSearch] = useState("");

  if (!isReady) {
    return (
      <PermissionGuard section="products">
        <PageHeader title={t("pricing.title")} subtitle={t("pricing.subtitle")} />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard section="products">
      <PageHeader title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

      <div className="p-4 sm:p-6 space-y-4">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <BadgeDollarSign className="h-3.5 w-3.5" />
              {t("pricing.tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="happyhour" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t("pricing.tabs.happyHour")}
            </TabsTrigger>
            <TabsTrigger value="competitor" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              {t("pricing.tabs.competitor")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <PriceOverviewTab
              products={products}
              search={search}
              setSearch={setSearch}
            />
          </TabsContent>

          <TabsContent value="happyhour" className="mt-4">
            <HappyHourTab products={products} />
          </TabsContent>

          <TabsContent value="competitor" className="mt-4">
            <CompetitorTab />
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  );
}
