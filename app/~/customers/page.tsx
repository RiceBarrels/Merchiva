"use client";

import { useMemo, useState } from "react";
import { Search, Download, FileText, Users, UserPlus, DollarSign, TrendingUp, ArrowUpDown, Mail, Phone, Calendar, ShoppingBag, X } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { usePermissions } from "@/lib/context/permissions";
import { useCurrency } from "@/lib/currency";
import { useSiteCustomers, useSiteOrders, useSites } from "@/lib/spacetimedb/hooks";
import { downloadCSV, downloadPDF } from "@/lib/export";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

// ─── Types ──────────────────────────────────────────────────────────────────

type CustomerTag = "vip" | "regular" | "new" | "at-risk";

type SortKey = "totalSpent" | "orderCount" | "lastOrder" | "name";

interface EnrichedCustomer {
  id: string;
  siteId: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number | null;
  tags: CustomerTag[];
  status: "active" | "inactive";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function computeTags(customer: {
  totalSpent: number;
  orderCount: number;
  createdAt: Date;
  daysSinceLastOrder: number | null;
}): CustomerTag[] {
  const tags: CustomerTag[] = [];
  const now = new Date();
  const daysSinceCreation = daysBetween(customer.createdAt, now);

  if (customer.totalSpent > 500 || customer.orderCount > 10) {
    tags.push("vip");
  }
  if (customer.orderCount >= 3 && !tags.includes("vip")) {
    tags.push("regular");
  }
  if (daysSinceCreation <= 30) {
    tags.push("new");
  }
  if (
    customer.daysSinceLastOrder !== null &&
    customer.daysSinceLastOrder > 60 &&
    customer.orderCount >= 2
  ) {
    tags.push("at-risk");
  }

  return tags;
}

const TAG_STYLES: Record<CustomerTag, string> = {
  vip: "bg-stone-800 text-stone-100 border-stone-700 dark:bg-stone-200 dark:text-stone-800 dark:border-stone-300",
  regular: "bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:border-stone-600",
  new: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  "at-risk": "bg-stone-50 text-stone-500 border-stone-200 border-dashed dark:bg-stone-900 dark:text-stone-400 dark:border-stone-700",
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  completed: "bg-stone-800 text-stone-100 border-stone-700 dark:bg-stone-200 dark:text-stone-800 dark:border-stone-300",
  confirmed: "bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:border-stone-600",
  pending: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  cancelled: "bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:border-stone-700",
};

// ─── Page Component ─────────────────────────────────────────────────────────

export default function CustomersPage() {
  return (
    <PermissionGuard section="sales">
      <CustomersContent />
    </PermissionGuard>
  );
}

function CustomersContent() {
  const t = useT();
  const { format } = useCurrency();
  const { organizationId } = usePermissions();
  const [allCustomers, customersReady] = useSiteCustomers();
  const [allOrders, ordersReady] = useSiteOrders();
  const [allSites] = useSites();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | CustomerTag>("all");
  const [sortKey, setSortKey] = useState<SortKey>("totalSpent");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const ready = customersReady && ordersReady;

  const tagLabel = (tag: CustomerTag): string => {
    switch (tag) {
      case "vip":
        return t("customers.tags.vip");
      case "regular":
        return t("customers.tags.regular");
      case "new":
        return t("customers.tags.new");
      case "at-risk":
        return t("customers.tags.atRisk");
    }
  };

  // Filter sites by current organization
  // SpacetimeDB Uuid fields need .toString() for comparison
  const orgSiteIds = useMemo(() => {
    if (!organizationId) return new Set<string>();
    return new Set(
      allSites
        .filter((s) => String(s.organizationId) === organizationId)
        .map((s) => String(s.id))
    );
  }, [allSites, organizationId]);

  // Normalised orders with string IDs for easy lookup
  type NormOrder = {
    id: string;
    customerId: string | null;
    items: string;
    total: number;
    status: string;
    createdAt: number; // epoch ms
  };

  const normOrders = useMemo<NormOrder[]>(
    () =>
      allOrders
        .filter((o) => orgSiteIds.has(String(o.siteId)))
        .map((o) => ({
          id: String(o.id),
          customerId: o.customerId ? String(o.customerId) : null,
          items: typeof o.items === "string" ? o.items : JSON.stringify(o.items),
          total: o.total ?? 0,
          status: o.status,
          createdAt: new Date(o.createdAt as unknown as string | number).getTime(),
        })),
    [allOrders, orgSiteIds]
  );

  // Build order index by customerId
  const ordersByCustomer = useMemo(() => {
    const map = new Map<string, NormOrder[]>();
    for (const order of normOrders) {
      const cid = order.customerId;
      if (!cid) continue;
      const list = map.get(cid);
      if (list) list.push(order);
      else map.set(cid, [order]);
    }
    return map;
  }, [normOrders]);

  // Enrich customers with computed metrics
  const enrichedCustomers: EnrichedCustomer[] = useMemo(() => {
    const now = new Date();
    return allCustomers
      .filter((c) => orgSiteIds.has(String(c.siteId)))
      .map((c) => {
        const cid = String(c.id);
        const custOrders = ordersByCustomer.get(cid) ?? [];
        const orderCount = custOrders.length;
        const totalSpent = custOrders.reduce((sum, o) => sum + o.total, 0);
        const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;

        let lastOrderDate: Date | null = null;
        if (custOrders.length > 0) {
          lastOrderDate = new Date(Math.max(...custOrders.map((o) => o.createdAt)));
        }

        const daysSinceLastOrder = lastOrderDate ? daysBetween(lastOrderDate, now) : null;
        const createdAt = new Date(c.createdAt as unknown as string | number);

        const tags = computeTags({ totalSpent, orderCount, createdAt, daysSinceLastOrder });

        const isActive = daysSinceLastOrder === null ? true : daysSinceLastOrder <= 90;

        return {
          id: cid,
          siteId: String(c.siteId),
          email: c.email,
          name: c.name ?? null,
          phone: c.phone ?? null,
          createdAt,
          orderCount,
          totalSpent,
          avgOrderValue,
          lastOrderDate,
          daysSinceLastOrder,
          tags,
          status: isActive ? ("active" as const) : ("inactive" as const),
        };
      });
  }, [allCustomers, orgSiteIds, ordersByCustomer]);

  // Summary metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = enrichedCustomers.filter(
      (c) => c.createdAt >= monthStart
    ).length;

    const totalRevenue = enrichedCustomers.reduce((s, c) => s + c.totalSpent, 0);
    const totalOrders = enrichedCustomers.reduce((s, c) => s + c.orderCount, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      total: enrichedCustomers.length,
      newThisMonth,
      avgOrderValue,
      totalRevenue,
    };
  }, [enrichedCustomers]);

  // Filtering and sorting
  const filteredCustomers = useMemo(() => {
    let list = enrichedCustomers;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (tagFilter !== "all") {
      list = list.filter((c) => c.tags.includes(tagFilter));
    }

    // Sort
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "totalSpent":
          return b.totalSpent - a.totalSpent;
        case "orderCount":
          return b.orderCount - a.orderCount;
        case "lastOrder": {
          const aTime = a.lastOrderDate?.getTime() ?? 0;
          const bTime = b.lastOrderDate?.getTime() ?? 0;
          return bTime - aTime;
        }
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "");
        default:
          return 0;
      }
    });

    return sorted;
  }, [enrichedCustomers, search, tagFilter, sortKey]);

  // Selected customer details
  const selectedCustomer = useMemo(
    () => enrichedCustomers.find((c) => c.id === selectedCustomerId) ?? null,
    [enrichedCustomers, selectedCustomerId]
  );

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomerId) return [];
    const custOrders = ordersByCustomer.get(selectedCustomerId) ?? [];
    return [...custOrders].sort((a, b) => b.createdAt - a.createdAt);
  }, [selectedCustomerId, ordersByCustomer]);

  // ─── Export ─────────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const headers = [
      t("common.name"),
      t("common.email"),
      t("customers.col.phone"),
      t("customers.col.orders"),
      t("customers.col.totalSpent"),
      t("customers.col.avgOrder"),
      t("customers.col.lastOrder"),
      t("customers.col.tags"),
      t("customers.col.status"),
    ];
    const rows = filteredCustomers.map((c) => [
      c.name ?? "-",
      c.email,
      c.phone ?? "-",
      String(c.orderCount),
      format(c.totalSpent),
      format(c.avgOrderValue),
      c.lastOrderDate ? formatDate(c.lastOrderDate) : "-",
      c.tags.map((tag) => tagLabel(tag)).join(", ") || "-",
      c.status,
    ]);
    downloadCSV("customers-export", headers, rows);
  }

  function handleExportPDF() {
    const headers = [
      t("common.name"),
      t("common.email"),
      t("customers.col.phone"),
      t("customers.col.orders"),
      t("customers.col.totalSpent"),
      t("customers.col.avgOrder"),
      t("customers.col.lastOrder"),
      t("customers.col.tags"),
    ];
    const rows = filteredCustomers.map((c) => [
      c.name ?? "-",
      c.email,
      c.phone ?? "-",
      String(c.orderCount),
      format(c.totalSpent),
      format(c.avgOrderValue),
      c.lastOrderDate ? formatDate(c.lastOrderDate) : "-",
      c.tags.map((tag) => tagLabel(tag)).join(", ") || "-",
    ]);
    downloadPDF(t("customers.export.pdfTitle"), headers, rows, {
      subtitle: t("customers.export.pdfSubtitle").replace("{count}", String(filteredCustomers.length)),
      landscape: true,
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="flex flex-col">
        <PageHeader title={t("nav.customers")} />
        <PageTabs tabs={[
          { label: t("nav.customers"), href: "/~/customers" },
          { label: t("nav.marketing"), href: "/~/marketing" },
        ]} />
        <div className="flex h-[60vh] items-center justify-center">
          <Spinner size={20} className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title={t("nav.customers")}
        right={
          <Badge variant="outline" className="font-mono text-xs">
            {metrics.total}
          </Badge>
        }
      />
      <PageTabs tabs={[
        { label: t("nav.customers"), href: "/~/customers" },
        { label: t("nav.marketing"), href: "/~/marketing" },
      ]} />

      <div className="p-4 lg:p-6 space-y-5">
        {/* ── Summary Cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label={t("customers.summary.totalCustomers")}
            value={String(metrics.total)}
            icon={<Users className="h-4 w-4" />}
          />
          <SummaryCard
            label={t("customers.summary.newThisMonth")}
            value={String(metrics.newThisMonth)}
            icon={<UserPlus className="h-4 w-4" />}
          />
          <SummaryCard
            label={t("customers.summary.avgOrderValue")}
            value={format(metrics.avgOrderValue)}
            icon={<TrendingUp className="h-4 w-4" />}
            mono
          />
          <SummaryCard
            label={t("customers.summary.totalRevenue")}
            value={format(metrics.totalRevenue)}
            icon={<DollarSign className="h-4 w-4" />}
            mono
          />
        </div>

        {/* ── Search + Filter + Sort + Export ─────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customers.searchPlaceholder")}
              className="pl-8 h-8 text-[13px] rounded-[0.3rem]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Select value={tagFilter} onValueChange={(v) => setTagFilter(v as typeof tagFilter)}>
            <SelectTrigger className="w-[130px] h-8 text-[13px] rounded-[0.3rem]">
              <SelectValue placeholder={t("customers.filterPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("customers.tagFilter.all")}</SelectItem>
              <SelectItem value="vip">{t("customers.tags.vip")}</SelectItem>
              <SelectItem value="regular">{t("customers.tags.regular")}</SelectItem>
              <SelectItem value="new">{t("customers.tags.new")}</SelectItem>
              <SelectItem value="at-risk">{t("customers.tags.atRisk")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-[150px] h-8 text-[13px] rounded-[0.3rem]">
              <ArrowUpDown className="h-3 w-3 mr-1.5 shrink-0" />
              <SelectValue placeholder={t("customers.sortPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="totalSpent">{t("customers.sort.totalSpent")}</SelectItem>
              <SelectItem value="orderCount">{t("customers.sort.orders")}</SelectItem>
              <SelectItem value="lastOrder">{t("customers.sort.lastOrder")}</SelectItem>
              <SelectItem value="name">{t("common.name")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1.5 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-8 text-[13px] rounded-[0.3rem]"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="h-8 text-[13px] rounded-[0.3rem]"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </Button>
          </div>
        </div>

        {/* ── Customer Table ──────────────────────────────────────── */}
        {filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || tagFilter !== "all"
                ? t("customers.emptyFiltered")
                : t("customers.empty")}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-[0.3rem] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">{t("common.name")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider hidden md:table-cell">{t("common.email")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider hidden lg:table-cell">{t("customers.col.phone")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right">{t("customers.col.orders")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right">{t("customers.col.totalSpent")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right hidden md:table-cell">{t("customers.col.avgOrder")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider hidden lg:table-cell">{t("customers.col.lastOrder")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">{t("customers.col.tags")}</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider hidden sm:table-cell">{t("customers.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setDetailOpen(true);
                    }}
                  >
                    <TableCell className="text-[13px] font-medium">
                      {c.name || <span className="text-muted-foreground italic">{t("customers.noName")}</span>}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground hidden md:table-cell font-mono">
                      {c.email}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground hidden lg:table-cell font-mono">
                      {c.phone || "-"}
                    </TableCell>
                    <TableCell className="text-[13px] text-right font-mono">{c.orderCount}</TableCell>
                    <TableCell className="text-[13px] text-right font-mono">{format(c.totalSpent)}</TableCell>
                    <TableCell className="text-[13px] text-right font-mono hidden md:table-cell">{format(c.avgOrderValue)}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground hidden lg:table-cell">
                      {c.lastOrderDate ? formatDate(c.lastOrderDate) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length > 0
                          ? c.tags.map((tag) => (
                              <span
                                key={tag}
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-[0.3rem] border",
                                  TAG_STYLES[tag]
                                )}
                              >
                                {tagLabel(tag)}
                              </span>
                            ))
                          : <span className="text-[11px] text-muted-foreground">-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-[0.3rem] border",
                          c.status === "active"
                            ? "bg-foreground/10 text-foreground border-border"
                            : "bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                        )}
                      >
                        {c.status === "active" ? t("customers.status.active") : t("customers.status.inactive")}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Customer Detail Panel ─────────────────────────────────── */}
      <DynamicUIElement open={detailOpen} onOpenChange={setDetailOpen}>
        <DynamicUIElementContent className="max-w-lg">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={selectedCustomer?.name ?? t("customers.detail.customer")}>
              {selectedCustomer?.name ?? t("customers.detail.title")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("customers.detail.srDescription")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>

          {selectedCustomer && (
            <div className="space-y-5 px-1">
              {/* Customer info */}
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("customers.detail.customerInfo")}
                </h3>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono">{selectedCustomer.email}</span>
                  </div>
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono">{selectedCustomer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[13px]">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      {t("customers.detail.memberSince").replace("{date}", formatDate(selectedCustomer.createdAt))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {selectedCustomer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomer.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-[0.3rem] border",
                        TAG_STYLES[tag]
                      )}
                    >
                      {tagLabel(tag)}
                    </span>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-border rounded-[0.3rem] p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("customers.col.orders")}
                  </p>
                  <p className="text-lg font-semibold font-mono leading-tight mt-0.5">
                    {selectedCustomer.orderCount}
                  </p>
                </div>
                <div className="border border-border rounded-[0.3rem] p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("customers.col.totalSpent")}
                  </p>
                  <p className="text-lg font-semibold font-mono leading-tight mt-0.5">
                    {format(selectedCustomer.totalSpent)}
                  </p>
                </div>
                <div className="border border-border rounded-[0.3rem] p-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("customers.col.avgOrder")}
                  </p>
                  <p className="text-lg font-semibold font-mono leading-tight mt-0.5">
                    {format(selectedCustomer.avgOrderValue)}
                  </p>
                </div>
              </div>

              {/* Order History */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShoppingBag className="h-3 w-3" />
                  {t("customers.detail.orderHistory")}
                </h3>
                {selectedCustomerOrders.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground py-3">
                    {t("customers.detail.noOrders")}
                  </p>
                ) : (
                  <div className="border border-border rounded-[0.3rem] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("customers.orderCol.date")}</TableHead>
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("customers.orderCol.items")}</TableHead>
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-right">{t("customers.orderCol.total")}</TableHead>
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wider">{t("customers.col.status")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCustomerOrders.map((order) => {
                          let itemsSummary = "-";
                          try {
                            const parsed = JSON.parse(order.items);
                            if (Array.isArray(parsed)) {
                              itemsSummary = parsed
                                .map((it: { name: string; quantity: number }) =>
                                  `${it.name} x${it.quantity}`
                                )
                                .join(", ");
                            }
                          } catch {
                            itemsSummary = order.items || "-";
                          }

                          const statusStyle =
                            ORDER_STATUS_STYLES[order.status] ??
                            ORDER_STATUS_STYLES.pending;

                          return (
                            <TableRow key={order.id}>
                              <TableCell className="text-[12px] text-muted-foreground whitespace-nowrap">
                                {formatDate(new Date(order.createdAt))}
                              </TableCell>
                              <TableCell className="text-[12px] max-w-[180px] truncate">
                                {itemsSummary}
                              </TableCell>
                              <TableCell className="text-[12px] text-right font-mono">
                                {format(order.total)}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-[0.3rem] border capitalize",
                                    statusStyle
                                  )}
                                >
                                  {order.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DynamicUIElementContent>
      </DynamicUIElement>
    </div>
  );
}

// ─── Summary Card Component ─────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="rounded-[0.3rem] border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className={cn("text-xl font-semibold leading-tight mt-1", mono && "font-mono")}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
