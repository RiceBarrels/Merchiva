"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Ticket,
  TrendingUp,
  Users,
  Mail,
  RefreshCw,
  Tag,
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementFooter,
  DynamicUIElementClose,
} from "@/components/ui/dynamic-ui-element";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useCoupons, useSiteCustomers, useSiteOrders } from "@/lib/spacetimedb/hooks";
import { addCoupon, updateCoupon, deleteCoupon } from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// ─── Types ──────────────────────────────────────────────────────────────────

type DiscountType = "percent" | "fixed";
type CouponFilter = "all" | "active" | "expired";

interface CouponFormData {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minPurchase: number;
  maxUses: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  description: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isExpired(validUntil: string): boolean {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
}

function isMaxedOut(usedCount: number, maxUses: number): boolean {
  return maxUses > 0 && usedCount >= maxUses;
}

function getCouponStatus(
  coupon: { active: boolean; validUntil: string; usedCount: number; maxUses: number },
  t: (key: string) => string,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (isExpired(coupon.validUntil)) return { label: t("marketing.coupons.expired"), variant: "destructive" };
  if (isMaxedOut(coupon.usedCount, coupon.maxUses)) return { label: t("marketing.coupons.maxedOut"), variant: "secondary" };
  if (!coupon.active) return { label: t("marketing.coupons.inactive"), variant: "outline" };
  return { label: t("marketing.coupons.active"), variant: "default" };
}

function getDefaultFormData(): CouponFormData {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    code: generateCode(),
    discountType: "percent",
    discountValue: 10,
    minPurchase: 0,
    maxUses: 0,
    validFrom: today,
    validUntil: nextMonth,
    active: true,
    description: "",
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const t = useT();
  const { currentOrg } = usePermissions();
  const organizationId = currentOrg?.id ?? "";

  // Data hooks
  const allCoupons = useCoupons();
  const allCustomers = useSiteCustomers();
  const allOrders = useSiteOrders();

  // Filter coupons by organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coupons = useMemo(() => {
    if (!organizationId) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return allCoupons.filter((c: any) => c.organizationId === organizationId);
  }, [allCoupons, organizationId]);

  // State
  const [activeTab, setActiveTab] = useState("coupons");
  const [couponFilter, setCouponFilter] = useState<CouponFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CouponFormData>(getDefaultFormData);
  const [saving, setSaving] = useState(false);

  // Filtered coupons
  const filteredCoupons = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return coupons.filter((c: any) => {
      if (couponFilter === "active") {
        return c.active && !isExpired(c.validUntil) && !isMaxedOut(c.usedCount, c.maxUses);
      }
      if (couponFilter === "expired") {
        return isExpired(c.validUntil) || isMaxedOut(c.usedCount, c.maxUses);
      }
      return true;
    });
  }, [coupons, couponFilter]);

  // Stats
  const stats = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeCoupons = coupons.filter((c: any) => c.active && !isExpired(c.validUntil) && !isMaxedOut(c.usedCount, c.maxUses));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalRedeemed = coupons.reduce((sum: number, c: any) => sum + (c.usedCount ?? 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalDiscountGiven = coupons.reduce((sum: number, c: any) => {
      if (c.discountType === "fixed") return sum + c.discountValue * (c.usedCount ?? 0);
      // For percent, we estimate based on minPurchase as a rough lower bound
      return sum + (c.minPurchase || 10) * (c.discountValue / 100) * (c.usedCount ?? 0);
    }, 0);
    return {
      totalActive: activeCoupons.length,
      totalRedeemed,
      totalDiscountGiven,
    };
  }, [coupons]);

  // Chart data for analytics
  const couponUsageData = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...coupons]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => (b.usedCount ?? 0) - (a.usedCount ?? 0))
      .slice(0, 10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({
        code: c.code,
        redemptions: c.usedCount ?? 0,
        discount: c.discountType === "percent" ? `${c.discountValue}%` : formatCurrency(c.discountValue),
      }));
  }, [coupons]);

  // New customers this month
  const newCustomersThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return allCustomers.filter((c: any) => {
      try {
        return new Date(c.createdAt) >= monthStart;
      } catch {
        return false;
      }
    }).length;
  }, [allCustomers]);

  // Open create dialog
  const handleCreate = () => {
    setEditingCoupon(null);
    setFormData(getDefaultFormData());
    setDialogOpen(true);
  };

  // Open edit dialog
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEdit = (coupon: any) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType as DiscountType,
      discountValue: coupon.discountValue,
      minPurchase: coupon.minPurchase,
      maxUses: coupon.maxUses,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      active: coupon.active,
      description: coupon.description ?? "",
    });
    setDialogOpen(true);
  };

  // Toggle active status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleToggleActive = async (coupon: any) => {
    try {
      await updateCoupon(coupon.id.toHexString ? coupon.id.toHexString() : String(coupon.id), {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase,
        maxUses: coupon.maxUses,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        active: !coupon.active,
        description: coupon.description ?? undefined,
      });
    } catch (err) {
      console.error("Failed to toggle coupon:", err);
    }
  };

  // Save (create or update)
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        minPurchase: formData.minPurchase,
        maxUses: formData.maxUses,
        validFrom: formData.validFrom,
        validUntil: formData.validUntil,
        active: formData.active,
        description: formData.description || undefined,
      };
      if (editingCoupon) {
        const couponId = editingCoupon.id.toHexString ? editingCoupon.id.toHexString() : String(editingCoupon.id);
        await updateCoupon(couponId, payload);
      } else {
        await addCoupon(payload);
      }
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to save coupon:", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deletingCouponId) return;
    try {
      await deleteCoupon(deletingCouponId);
      setDeleteDialogOpen(false);
      setDeletingCouponId(null);
    } catch (err) {
      console.error("Failed to delete coupon:", err);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const confirmDelete = (coupon: any) => {
    const couponId = coupon.id.toHexString ? coupon.id.toHexString() : String(coupon.id);
    setDeletingCouponId(couponId);
    setDeleteDialogOpen(true);
  };

  return (
    <PermissionGuard section="sales">
      <PageHeader title={t("marketing.title")} subtitle={t("marketing.subtitle")} />

      <div className="p-4 lg:p-6 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="coupons">{t("marketing.tabs.coupons")}</TabsTrigger>
            <TabsTrigger value="campaigns">{t("marketing.tabs.campaigns")}</TabsTrigger>
            <TabsTrigger value="analytics">{t("marketing.tabs.analytics")}</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Coupons ──────────────────────────────────────────── */}
          <TabsContent value="coupons" className="mt-4 space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-[0.3rem] bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Ticket className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.coupons.totalActive")}</p>
                    <p className="text-lg font-bold">{stats.totalActive}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-[0.3rem] bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.coupons.redeemedThisMonth")}</p>
                    <p className="text-lg font-bold">{stats.totalRedeemed}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-[0.3rem] bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Tag className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.coupons.totalDiscountGiven")}</p>
                    <p className="text-lg font-bold">{formatCurrency(stats.totalDiscountGiven)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <Select value={couponFilter} onValueChange={(v) => setCouponFilter(v as CouponFilter)}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("marketing.coupons.filterAll")}</SelectItem>
                  <SelectItem value="active">{t("marketing.coupons.filterActive")}</SelectItem>
                  <SelectItem value="expired">{t("marketing.coupons.filterExpired")}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleCreate} className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t("marketing.coupons.create")}
              </Button>
            </div>

            {/* Coupon table */}
            {filteredCoupons.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Ticket className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {coupons.length === 0
                      ? t("marketing.coupons.empty")
                      : t("marketing.coupons.emptyFiltered")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block border border-border rounded-[0.3rem] overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("marketing.coupons.code")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.discount")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.minPurchase")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.usage")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.validFrom")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.validUntil")}</TableHead>
                        <TableHead className="text-xs">{t("marketing.coupons.status")}</TableHead>
                        <TableHead className="text-xs text-right">{t("marketing.coupons.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {filteredCoupons.map((coupon: any) => {
                        const status = getCouponStatus(coupon, t);
                        const isInactive = !coupon.active || isExpired(coupon.validUntil) || isMaxedOut(coupon.usedCount, coupon.maxUses);
                        return (
                          <TableRow
                            key={String(coupon.id)}
                            className={cn(isInactive && "opacity-60")}
                          >
                            <TableCell>
                              <span className="font-mono text-sm font-semibold tracking-wider">{coupon.code}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-xs font-medium",
                                  coupon.discountType === "percent"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                                )}
                              >
                                {coupon.discountType === "percent"
                                  ? `${coupon.discountValue}% ${t("marketing.coupons.percentOff")}`
                                  : `${formatCurrency(coupon.discountValue)} ${t("marketing.coupons.percentOff")}`}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {coupon.minPurchase > 0 ? formatCurrency(coupon.minPurchase) : "-"}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {coupon.usedCount}/{coupon.maxUses > 0 ? coupon.maxUses : t("marketing.coupons.unlimited")}
                            </TableCell>
                            <TableCell className="text-xs">{formatDate(coupon.validFrom)}</TableCell>
                            <TableCell className="text-xs">{formatDate(coupon.validUntil)}</TableCell>
                            <TableCell>
                              <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleToggleActive(coupon)}
                                  title={coupon.active ? t("marketing.coupons.inactive") : t("marketing.coupons.active")}
                                >
                                  {coupon.active
                                    ? <ToggleRight className="h-3.5 w-3.5 text-emerald-600" />
                                    : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(coupon)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => confirmDelete(coupon)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {filteredCoupons.map((coupon: any) => {
                    const status = getCouponStatus(coupon, t);
                    const isInactive = !coupon.active || isExpired(coupon.validUntil) || isMaxedOut(coupon.usedCount, coupon.maxUses);
                    return (
                      <Card
                        key={String(coupon.id)}
                        className={cn(
                          "transition-opacity",
                          isInactive ? "opacity-60 border-dashed" : "border-solid",
                        )}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-lg font-bold tracking-wider">{coupon.code}</span>
                            <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                coupon.discountType === "percent"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                              )}
                            >
                              {coupon.discountType === "percent"
                                ? `${coupon.discountValue}% ${t("marketing.coupons.percentOff")}`
                                : `${formatCurrency(coupon.discountValue)} ${t("marketing.coupons.percentOff")}`}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {coupon.usedCount}/{coupon.maxUses > 0 ? coupon.maxUses : t("marketing.coupons.unlimited")}
                            </span>
                          </div>
                          {coupon.description && (
                            <p className="text-xs text-muted-foreground">{coupon.description}</p>
                          )}
                          <div className="text-[11px] text-muted-foreground">
                            {formatDate(coupon.validFrom)} - {formatDate(coupon.validUntil)}
                            {coupon.minPurchase > 0 && (
                              <span className="ml-2">{t("marketing.coupons.minPurchase")}: {formatCurrency(coupon.minPurchase)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 pt-1 border-t border-border">
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleToggleActive(coupon)}>
                              {coupon.active
                                ? <ToggleRight className="h-3.5 w-3.5 text-emerald-600" />
                                : <ToggleLeft className="h-3.5 w-3.5" />}
                              {coupon.active ? t("marketing.coupons.active") : t("marketing.coupons.inactive")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleEdit(coupon)}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("common.edit")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive ml-auto" onClick={() => confirmDelete(coupon)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Tab 2: Campaigns (placeholder) ─────────────────────────── */}
          <TabsContent value="campaigns" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{t("marketing.campaigns.title")}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{t("marketing.campaigns.comingSoon")}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("marketing.campaigns.description")}</p>
                <div className="flex items-center gap-3 p-3 rounded-[0.3rem] bg-muted/50 border border-border">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm">
                    <strong>{allCustomers.length}</strong> {t("marketing.campaigns.customerCount")}
                  </span>
                </div>
                <Button disabled className="gap-1.5">
                  <Mail className="h-4 w-4" />
                  {t("marketing.campaigns.composeEmail")}
                  <Badge variant="outline" className="text-[9px] ml-1">{t("marketing.campaigns.comingSoon")}</Badge>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: Analytics ────────────────────────────────────────── */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            {coupons.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">{t("marketing.analytics.noData")}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.analytics.totalDiscountMonth")}</p>
                      <p className="text-xl font-bold mt-1">{formatCurrency(stats.totalDiscountGiven)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.analytics.newCustomers")}</p>
                      <p className="text-xl font-bold mt-1">{newCustomersThisMonth}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[11px] text-muted-foreground font-medium">{t("marketing.analytics.couponOrders")}</p>
                      <p className="text-xl font-bold mt-1">{stats.totalRedeemed}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Bar chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t("marketing.analytics.couponUsage")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {couponUsageData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={couponUsageData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="code"
                            tick={{ fontSize: 11, fontFamily: "monospace" }}
                            className="text-muted-foreground"
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                            allowDecimals={false}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "0.3rem",
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="redemptions" fill="hsl(var(--foreground))" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        {t("marketing.analytics.noData")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create/Edit Coupon Dialog ──────────────────────────────────── */}
      <DynamicUIElement open={dialogOpen} onOpenChange={setDialogOpen}>
        <DynamicUIElementContent className="max-w-md">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={editingCoupon ? t("marketing.coupons.edit") : t("marketing.coupons.create")}>
              {editingCoupon ? t("marketing.coupons.edit") : t("marketing.coupons.create")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">
              {editingCoupon ? t("marketing.coupons.edit") : t("marketing.coupons.create")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>

          <div className="space-y-4 p-4 pt-0 lg:p-0">
            {/* Code */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("marketing.coupons.code")}</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="font-mono tracking-wider text-sm h-8"
                  placeholder="SAVE20"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 shrink-0"
                  onClick={() => setFormData((p) => ({ ...p, code: generateCode() }))}
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("marketing.coupons.generateCode")}
                </Button>
              </div>
            </div>

            {/* Discount type + value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("marketing.coupons.discountType")}</Label>
                <Select
                  value={formData.discountType}
                  onValueChange={(v) => setFormData((p) => ({ ...p, discountType: v as DiscountType }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{t("marketing.coupons.percentage")}</SelectItem>
                    <SelectItem value="fixed">{t("marketing.coupons.fixedAmount")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("marketing.coupons.discountValue")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={formData.discountType === "percent" ? 1 : 0.01}
                  value={formData.discountValue}
                  onChange={(e) => setFormData((p) => ({ ...p, discountValue: parseFloat(e.target.value) || 0 }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Min purchase + Max uses */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("marketing.coupons.minPurchase")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.minPurchase}
                  onChange={(e) => setFormData((p) => ({ ...p, minPurchase: parseFloat(e.target.value) || 0 }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t("marketing.coupons.maxUses")}
                  <span className="text-muted-foreground ml-1">({t("marketing.coupons.maxUsesHint")})</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.maxUses}
                  onChange={(e) => setFormData((p) => ({ ...p, maxUses: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Valid dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("marketing.coupons.validFrom")}</Label>
                <Input
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => setFormData((p) => ({ ...p, validFrom: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("marketing.coupons.validUntil")}</Label>
                <Input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData((p) => ({ ...p, validUntil: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("marketing.coupons.description")}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder={t("marketing.coupons.descriptionPlaceholder")}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DynamicUIElementFooter>
            <DynamicUIElementClose>
              <Button variant="outline" size="sm" className="text-xs">{t("common.cancel")}</Button>
            </DynamicUIElementClose>
            <Button size="sm" className="text-xs" onClick={handleSave} disabled={saving || !formData.code.trim()}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DynamicUIElementFooter>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ── Delete Confirmation Dialog ─────────────────────────────────── */}
      <DynamicUIElement open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DynamicUIElementContent className="max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("common.delete")}>{t("common.delete")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("marketing.coupons.deleteConfirm")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <DynamicUIElementFooter>
            <DynamicUIElementClose>
              <Button variant="outline" size="sm" className="text-xs">{t("common.cancel")}</Button>
            </DynamicUIElementClose>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleDelete}>
              {t("common.delete")}
            </Button>
          </DynamicUIElementFooter>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </PermissionGuard>
  );
}
