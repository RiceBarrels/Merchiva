"use client";

import { useState, useMemo } from "react";
import { Truck, Plus, Search, Star, Pencil, Trash2, ShoppingCart, Send, CheckCircle2, XCircle, FileText, Download } from "lucide-react";
import {
  Card,
  CardContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useSuppliers as useSupplierRows, usePurchaseOrders as usePORows } from "@/lib/spacetimedb/hooks";
import {
  addSupplier as stdbAddSupplier,
  updateSupplier as stdbUpdateSupplier,
  deleteSupplier as stdbDeleteSupplier,
  createPurchaseOrder as stdbCreatePurchaseOrder,
  updatePurchaseOrderStatus as stdbUpdatePurchaseOrderStatus,
} from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/export";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { PageTabs } from "@/components/page-tabs";
import { Spinner } from "@/components/ui/loaders/geometric";

// ─── Types ──────────────────────────────────────────────────────────────────

type PaymentTerms = "net30" | "net60" | "cod" | "prepaid";

interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: PaymentTerms;
  notes: string;
  rating: number; // 1-5
  createdAt: string;
}

type POStatus = "draft" | "sent" | "received" | "cancelled";

interface POItem {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface PurchaseOrder {
  id: string;
  organizationId: string;
  supplierId: string;
  status: POStatus;
  items: string; // JSON string of POItem[]
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

// ─── SpacetimeDB-backed data + actions ──────────────────────────────────────

// SpacetimeDB timestamps arrive as { microsSinceUnixEpoch: bigint }; normalize
// to an ISO string (or null for absent optional timestamps).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsToIso(ts: any): string {
  if (!ts) return "";
  if (typeof ts === "object" && "microsSinceUnixEpoch" in ts) {
    try {
      return new Date(Number(BigInt(ts.microsSinceUnixEpoch) / 1000n)).toISOString();
    } catch {
      return "";
    }
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupplier(r: any): Supplier {
  return {
    id: r.id?.toString?.() ?? String(r.id),
    organizationId: String(r.organizationId),
    name: r.name ?? "",
    contactName: r.contactName ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
    paymentTerms: (r.paymentTerms ?? "net30") as PaymentTerms,
    notes: r.notes ?? "",
    rating: Number(r.rating ?? 0),
    createdAt: tsToIso(r.createdAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPurchaseOrder(r: any): PurchaseOrder {
  return {
    id: r.id?.toString?.() ?? String(r.id),
    organizationId: String(r.organizationId),
    supplierId: String(r.supplierId),
    status: (r.status ?? "draft") as POStatus,
    items: r.items ?? "[]",
    subtotal: Number(r.subtotal ?? 0),
    tax: Number(r.tax ?? 0),
    total: Number(r.total ?? 0),
    notes: r.notes ?? "",
    sentAt: r.sentAt ? tsToIso(r.sentAt) : null,
    receivedAt: r.receivedAt ? tsToIso(r.receivedAt) : null,
    createdAt: tsToIso(r.createdAt),
  };
}

function useSuppliers(organizationId: string | null): { suppliers: Supplier[]; loading: boolean } {
  const [rows, ready] = useSupplierRows() as [unknown[], boolean];
  const suppliers = useMemo(
    () =>
      (rows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r && r.organizationId === organizationId)
        .map(mapSupplier)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, organizationId],
  );
  return { suppliers, loading: !ready };
}

function usePurchaseOrders(organizationId: string | null): { orders: PurchaseOrder[]; loading: boolean } {
  const [rows, ready] = usePORows() as [unknown[], boolean];
  const orders = useMemo(
    () =>
      (rows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r && r.organizationId === organizationId)
        .map(mapPurchaseOrder)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, organizationId],
  );
  return { orders, loading: !ready };
}

// Thin wrappers over the real reducer actions. They normalize the form payload
// to exactly the fields each reducer declares (extra keys like `rating` on add
// or `status` on PO are NOT reducer args) and keep the success toasts the
// handlers rely on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addSupplier(data: any): Promise<void> {
  await stdbAddSupplier({
    name: data.name ?? "",
    contactName: data.contactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    paymentTerms: data.paymentTerms ?? null,
    notes: data.notes ?? null,
  });
  toast.success("Supplier added");
}

// updateSupplier requires name + rating, so callers must pass the full record.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateSupplier(id: string, data: any): Promise<void> {
  await stdbUpdateSupplier(id, {
    name: data.name ?? "",
    contactName: data.contactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    paymentTerms: data.paymentTerms ?? null,
    notes: data.notes ?? null,
    rating: Number(data.rating ?? 0),
  });
  toast.success("Supplier updated");
}

async function deleteSupplier(id: string): Promise<void> {
  await stdbDeleteSupplier(id);
  toast.success("Supplier deleted");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPurchaseOrder(data: any): Promise<void> {
  await stdbCreatePurchaseOrder({
    supplierId: data.supplierId,
    items: data.items, // already a JSON string of POItem[]
    subtotal: Number(data.subtotal ?? 0),
    tax: Number(data.tax ?? 0),
    total: Number(data.total ?? 0),
    notes: data.notes ?? null,
  });
  toast.success("Purchase order created");
}

async function updatePurchaseOrderStatus(id: string, status: POStatus): Promise<void> {
  await stdbUpdatePurchaseOrderStatus(id, status);
  toast.success("Status updated");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  net30: "Net 30",
  net60: "Net 60",
  cod: "COD",
  prepaid: "Prepaid",
};

const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700",
  sent: "bg-blue-50 text-blue-700 border-blue-300",
  received: "bg-emerald-50 text-emerald-700 border-emerald-300",
  cancelled: "bg-red-50 text-red-700 border-red-300",
};

function parseDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Star Rating Component ──────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly && !onChange}
          onClick={() => onChange?.(star)}
          className={cn(
            "transition-colors",
            readonly && !onChange ? "cursor-default" : "cursor-pointer hover:scale-110"
          )}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-stone-300 dark:text-stone-700"
            )}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-[0.3rem]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[0.3rem] bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-semibold font-mono leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { organizationId, can } = usePermissions();
  const t = useT();
  const { format } = useCurrency();
  const canEdit = can("inventory", "edit");

  // Data
  const { suppliers, loading: suppliersLoading } = useSuppliers(organizationId);
  const { orders, loading: ordersLoading } = usePurchaseOrders(organizationId);

  // Supplier dialog state
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);

  // PO dialog state
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [poForm, setPoForm] = useState<{
    supplierId: string;
    items: POItem[];
    notes: string;
  }>({ supplierId: "", items: [{ name: "", quantity: 1, unit: "units", unitCost: 0 }], notes: "" });

  // Search
  const [search, setSearch] = useState("");

  // Filtered suppliers
  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.contactName.toLowerCase().includes(search.toLowerCase()) ||
          s.email.toLowerCase().includes(search.toLowerCase())
      ),
    [suppliers, search]
  );

  // Stats
  const totalSuppliers = suppliers.length;
  const activeOrders = orders.filter(
    (o) => o.status !== "received" && o.status !== "cancelled"
  ).length;
  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return orders
      .filter((o) => new Date(o.createdAt) >= startOfMonth)
      .reduce((sum, o) => sum + o.total, 0);
  }, [orders]);

  // Get last PO date for a supplier
  const getLastPODate = (supplierId: string): string | null => {
    const supplierOrders = orders
      .filter((o) => o.supplierId === supplierId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return supplierOrders.length > 0 ? supplierOrders[0].createdAt : null;
  };

  // Get PO count for a supplier
  const getPOCount = (supplierId: string): number => {
    return orders.filter((o) => o.supplierId === supplierId).length;
  };

  // ─── Supplier CRUD ──────────────────────────────────────────────────────────

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({
      paymentTerms: "net30",
      rating: 3,
    });
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({ ...supplier });
    setSupplierDialogOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name?.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, supplierForm);
      } else {
        await addSupplier({
          name: supplierForm.name ?? "",
          contactName: supplierForm.contactName ?? "",
          email: supplierForm.email ?? "",
          phone: supplierForm.phone ?? "",
          address: supplierForm.address ?? "",
          paymentTerms: supplierForm.paymentTerms ?? "net30",
          notes: supplierForm.notes ?? "",
          rating: supplierForm.rating ?? 3,
        });
      }
      setSupplierDialogOpen(false);
    } catch (err) {
      console.error("Failed to save supplier:", err);
      toast.error("Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    try {
      await deleteSupplier(id);
    } catch (err) {
      console.error("Failed to delete supplier:", err);
      toast.error("Failed to delete supplier");
    }
  };

  const handleUpdateRating = async (supplierId: string, rating: number) => {
    const current = suppliers.find((s) => s.id === supplierId);
    if (!current) return;
    try {
      // updateSupplier requires the full record (name + rating), so merge the
      // new rating onto the existing supplier rather than sending it alone.
      await updateSupplier(supplierId, { ...current, rating });
    } catch (err) {
      console.error("Failed to update rating:", err);
    }
  };

  // ─── Purchase Order ─────────────────────────────────────────────────────────

  const openCreatePO = (supplierId?: string) => {
    setPoForm({
      supplierId: supplierId ?? "",
      items: [{ name: "", quantity: 1, unit: "units", unitCost: 0 }],
      notes: "",
    });
    setPoDialogOpen(true);
  };

  const addPORow = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { name: "", quantity: 1, unit: "units", unitCost: 0 }],
    }));
  };

  const updatePORow = (index: number, field: keyof POItem, value: string | number) => {
    setPoForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const removePORow = (index: number) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const poSubtotal = poForm.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );
  const poTax = poSubtotal * 0.1; // Default 10% tax, can be from settings
  const poTotal = poSubtotal + poTax;

  const handleCreatePO = async () => {
    if (!poForm.supplierId) {
      toast.error("Please select a supplier");
      return;
    }
    if (poForm.items.length === 0 || !poForm.items[0].name) {
      toast.error("Please add at least one item");
      return;
    }
    setSaving(true);
    try {
      await createPurchaseOrder({
        supplierId: poForm.supplierId,
        items: JSON.stringify(poForm.items),
        subtotal: poSubtotal,
        tax: poTax,
        total: poTotal,
        notes: poForm.notes,
        status: "draft",
      });
      setPoDialogOpen(false);
    } catch (err) {
      console.error("Failed to create PO:", err);
      toast.error("Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePOStatus = async (orderId: string, status: POStatus) => {
    try {
      await updatePurchaseOrderStatus(orderId, status);
    } catch (err) {
      console.error("Failed to update PO status:", err);
      toast.error("Failed to update status");
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExportSuppliers = () => {
    const headers = ["Name", "Contact", "Email", "Phone", "Payment Terms", "Rating"];
    const rows = suppliers.map((s) => [
      s.name,
      s.contactName,
      s.email,
      s.phone,
      PAYMENT_TERMS_LABELS[s.paymentTerms],
      String(s.rating),
    ]);
    downloadCSV("suppliers", headers, rows);
  };

  // Loading state
  if (suppliersLoading || ordersLoading) {
    return (
      <PermissionGuard section="inventory">
        <PageHeader title={t("nav.suppliers")} />
        <PageTabs tabs={[
          { label: t("nav.inventory"), href: "/~/inventory" },
          { label: t("nav.suppliers"), href: "/~/suppliers" },
          { label: t("nav.wasteLog"), href: "/~/inventory/waste" },
        ]} />
        <div className="flex h-[60vh] items-center justify-center">
          <Spinner size={24} className="text-muted-foreground" />
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard section="inventory">
      <div className="">
        <PageHeader
          title={t("nav.suppliers")}
          right={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSuppliers}
                className="gap-1.5 hidden sm:flex"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              {canEdit && (
                <Button onClick={openAddSupplier} className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Supplier</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              )}
            </div>
          }
        />
        <PageTabs tabs={[
          { label: t("nav.inventory"), href: "/~/inventory" },
          { label: t("nav.suppliers"), href: "/~/suppliers" },
          { label: t("nav.wasteLog"), href: "/~/inventory/waste" },
        ]} />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 px-4 sm:px-6">
          <SummaryCard
            icon={Truck}
            label="Total Suppliers"
            value={String(totalSuppliers)}
          />
          <SummaryCard
            icon={ShoppingCart}
            label="Active Purchase Orders"
            value={String(activeOrders)}
          />
          <SummaryCard
            icon={FileText}
            label="PO Value This Month"
            value={format(thisMonthTotal)}
          />
        </div>

        {/* Tabs: Suppliers / Purchase Orders */}
        <div className="px-4 sm:px-6">
          <Tabs defaultValue="suppliers">
            <TabsList>
              <TabsTrigger value="suppliers" className="gap-2">
                <Truck className="h-3.5 w-3.5" /> Suppliers
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-2">
                <FileText className="h-3.5 w-3.5" /> Purchase Orders
              </TabsTrigger>
            </TabsList>

            {/* ─── Suppliers Tab ──────────────────────────────────────────────── */}
            <TabsContent value="suppliers" className="space-y-4 mt-4">
              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* Empty state */}
              {filteredSuppliers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Truck className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {suppliers.length === 0
                      ? "No suppliers yet. Add your first supplier to get started."
                      : "No suppliers match your search."}
                  </p>
                  {suppliers.length === 0 && canEdit && (
                    <Button
                      onClick={openAddSupplier}
                      variant="outline"
                      className="mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" /> Add Supplier
                    </Button>
                  )}
                </div>
              )}

              {/* Supplier cards */}
              <div className="space-y-2">
                {filteredSuppliers.map((supplier) => {
                  const lastPO = getLastPODate(supplier.id);
                  const poCount = getPOCount(supplier.id);
                  return (
                    <Card
                      key={supplier.id}
                      className="rounded-[0.3rem] border border-border"
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          {/* Left: Info */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold truncate">
                                {supplier.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] rounded-[0.3rem] font-mono"
                              >
                                {PAYMENT_TERMS_LABELS[supplier.paymentTerms]}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {supplier.contactName && (
                                <span>{supplier.contactName}</span>
                              )}
                              {supplier.email && <span>{supplier.email}</span>}
                              {supplier.phone && <span>{supplier.phone}</span>}
                            </div>
                            <div className="flex items-center gap-4 pt-1">
                              <StarRating
                                value={supplier.rating}
                                onChange={
                                  canEdit
                                    ? (r) => handleUpdateRating(supplier.id, r)
                                    : undefined
                                }
                              />
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {poCount} POs
                              </span>
                              {lastPO && (
                                <span className="text-[11px] text-muted-foreground">
                                  Last: {parseDate(lastPO)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions */}
                          {canEdit && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCreatePO(supplier.id)}
                                className="gap-1.5 text-xs h-7"
                              >
                                <ShoppingCart className="h-3 w-3" />
                                Create PO
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditSupplier(supplier)}
                                className="h-7 w-7 p-0"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSupplier(supplier.id)}
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* ─── Purchase Orders Tab ───────────────────────────────────────── */}
            <TabsContent value="orders" className="space-y-4 mt-4">
              {/* Empty state */}
              {orders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No purchase orders yet.
                  </p>
                  {canEdit && (
                    <Button
                      onClick={() => openCreatePO()}
                      variant="outline"
                      className="mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" /> Create Purchase Order
                    </Button>
                  )}
                </div>
              )}

              {orders.length > 0 && (
                <div className="rounded-[0.3rem] border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">PO #</TableHead>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Items</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        {canEdit && (
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* orders already arrive newest-first from usePurchaseOrders */}
                      {orders
                        .map((order) => {
                          const supplier = suppliers.find(
                            (s) => s.id === order.supplierId
                          );
                          let parsedItems: POItem[] = [];
                          try {
                            parsedItems = JSON.parse(order.items);
                          } catch {
                            // ignore parse errors
                          }
                          return (
                            <TableRow key={order.id}>
                              <TableCell className="text-xs font-mono">
                                {order.id.slice(0, 8).toUpperCase()}
                              </TableCell>
                              <TableCell className="text-xs">
                                {supplier?.name ?? "Unknown"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {parseDate(order.createdAt)}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {parsedItems.length}
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {format(order.total)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] rounded-[0.3rem] capitalize",
                                    PO_STATUS_COLORS[order.status]
                                  )}
                                >
                                  {order.status}
                                </Badge>
                              </TableCell>
                              {canEdit && (
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {order.status === "draft" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleUpdatePOStatus(order.id, "sent")
                                        }
                                        className="h-6 px-2 text-[11px] gap-1"
                                      >
                                        <Send className="h-3 w-3" /> Send
                                      </Button>
                                    )}
                                    {order.status === "sent" && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleUpdatePOStatus(order.id, "received")
                                        }
                                        className="h-6 px-2 text-[11px] gap-1"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Received
                                      </Button>
                                    )}
                                    {(order.status === "draft" ||
                                      order.status === "sent") && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleUpdatePOStatus(order.id, "cancelled")
                                        }
                                        className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                                      >
                                        <XCircle className="h-3 w-3" /> Cancel
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ─── Add/Edit Supplier Dialog ──────────────────────────────────────── */}
        <DynamicUIElement open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
          <DynamicUIElementContent className="max-w-md">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle
                mobileTitle={editingSupplier ? "Edit Supplier" : "Add Supplier"}
              >
                {editingSupplier ? "Edit Supplier" : "Add Supplier"}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {editingSupplier
                  ? "Update supplier information."
                  : "Add a new supplier to your organization."}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs">Name *</Label>
                <Input
                  value={supplierForm.name ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Supplier name"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Contact Name</Label>
                  <Input
                    value={supplierForm.contactName ?? ""}
                    onChange={(e) =>
                      setSupplierForm((f) => ({ ...f, contactName: e.target.value }))
                    }
                    placeholder="John Doe"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={supplierForm.phone ?? ""}
                    onChange={(e) =>
                      setSupplierForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    placeholder="+1 555-0123"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={supplierForm.email ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="supplier@example.com"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Address</Label>
                <Input
                  value={supplierForm.address ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="123 Main St, City, State"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Payment Terms</Label>
                  <Select
                    value={supplierForm.paymentTerms ?? "net30"}
                    onValueChange={(v) =>
                      setSupplierForm((f) => ({
                        ...f,
                        paymentTerms: v as PaymentTerms,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="net30">Net 30</SelectItem>
                      <SelectItem value="net60">Net 60</SelectItem>
                      <SelectItem value="cod">COD</SelectItem>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Rating</Label>
                  <div className="pt-1">
                    <StarRating
                      value={supplierForm.rating ?? 3}
                      onChange={(r) => setSupplierForm((f) => ({ ...f, rating: r }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <textarea
                  value={supplierForm.notes ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Additional notes about this supplier..."
                  rows={3}
                  className="w-full rounded-[0.3rem] border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>

              <Separator />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSupplierDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSupplier}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving && <Spinner size={12} />}
                  {editingSupplier ? "Update" : "Add Supplier"}
                </Button>
              </div>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Create PO Dialog ──────────────────────────────────────────────── */}
        <DynamicUIElement open={poDialogOpen} onOpenChange={setPoDialogOpen}>
          <DynamicUIElementContent className="max-w-lg">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle="Create Purchase Order">
                Create Purchase Order
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                Create a new draft purchase order.
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>

            <div className="space-y-4 py-4">
              {/* Supplier select */}
              <div className="space-y-2">
                <Label className="text-xs">Supplier *</Label>
                <Select
                  value={poForm.supplierId}
                  onValueChange={(v) =>
                    setPoForm((f) => ({ ...f, supplierId: v ?? "" }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <Label className="text-xs">Items</Label>
                <div className="rounded-[0.3rem] border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1">Item</TableHead>
                        <TableHead className="text-[10px] py-1 w-16">Qty</TableHead>
                        <TableHead className="text-[10px] py-1 w-16">Unit</TableHead>
                        <TableHead className="text-[10px] py-1 w-20">Cost</TableHead>
                        <TableHead className="text-[10px] py-1 w-20 text-right">
                          Total
                        </TableHead>
                        <TableHead className="text-[10px] py-1 w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poForm.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="py-1 px-2">
                            <Input
                              value={item.name}
                              onChange={(e) =>
                                updatePORow(idx, "name", e.target.value)
                              }
                              placeholder="Item name"
                              className="h-7 text-xs border-0 shadow-none p-0 focus-visible:ring-0"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                updatePORow(idx, "quantity", Number(e.target.value))
                              }
                              className="h-7 text-xs border-0 shadow-none p-0 text-center font-mono focus-visible:ring-0"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            <Input
                              value={item.unit}
                              onChange={(e) =>
                                updatePORow(idx, "unit", e.target.value)
                              }
                              className="h-7 text-xs border-0 shadow-none p-0 focus-visible:ring-0"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.unitCost}
                              onChange={(e) =>
                                updatePORow(idx, "unitCost", Number(e.target.value))
                              }
                              className="h-7 text-xs border-0 shadow-none p-0 font-mono focus-visible:ring-0"
                            />
                          </TableCell>
                          <TableCell className="py-1 px-1 text-right font-mono text-xs">
                            {format(item.quantity * item.unitCost)}
                          </TableCell>
                          <TableCell className="py-1 px-1">
                            {poForm.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePORow(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPORow}
                  className="gap-1.5 text-xs h-7"
                >
                  <Plus className="h-3 w-3" /> Add Row
                </Button>
              </div>

              {/* Totals */}
              <div className="rounded-[0.3rem] bg-muted/50 border border-border p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">{format(poSubtotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tax (10%)</span>
                  <span className="font-mono">{format(poTax)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{format(poTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <textarea
                  value={poForm.notes}
                  onChange={(e) =>
                    setPoForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full rounded-[0.3rem] border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>

              <Separator />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPoDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreatePO}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving && <Spinner size={12} />}
                  Create Draft
                </Button>
              </div>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>
      </div>
    </PermissionGuard>
  );
}
