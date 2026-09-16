"use client";

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Inbox,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, STATUS_TONE_TEXT, type StatusTone } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Money, NumCell } from "@/components/ui/num";
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
import {
  usePurchaseOrders as usePORows,
  useSupplierMessages as useSupplierMessageRows,
  useSuppliers as useSupplierRows,
} from "@/lib/spacetimedb/hooks";
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
import { SectionNav } from "@/components/section-nav";
import { Spinner } from "@/components/ui/loaders/geometric";

// ─── Types ──────────────────────────────────────────────────────────────────

type PaymentTerms = "net30" | "net60" | "cod" | "prepaid";
const SUPPLIER_LANGUAGES = [
  { value: "en", fallback: "English" },
  { value: "zh", fallback: "中文" },
  { value: "es", fallback: "Español" },
  { value: "fr", fallback: "Français" },
  { value: "ar", fallback: "العربية" },
  { value: "hi", fallback: "हिन्दी" },
] as const;
type SupplierLanguage = (typeof SUPPLIER_LANGUAGES)[number]["value"];

function normalizeSupplierLanguage(value: unknown): SupplierLanguage {
  const key = String(value ?? "en").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPLIER_LANGUAGES.some((l) => l.value === key) ? (key as SupplierLanguage) : "en";
}

function supplierLanguageLabel(t: (key: string) => string, value: unknown): string {
  const language = normalizeSupplierLanguage(value);
  const translated = t(`suppliers.languages.${language}`);
  if (!translated.startsWith("suppliers.languages.")) return translated;
  return SUPPLIER_LANGUAGES.find((l) => l.value === language)?.fallback ?? "English";
}

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
  language: SupplierLanguage;
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

type SupplierMessageDirection = "outbound" | "inbound" | "system";

interface SupplierMessage {
  id: string;
  organizationId: string;
  supplierId: string;
  poId: string | null;
  direction: SupplierMessageDirection;
  channel: string;
  subject: string;
  body: string;
  status: string;
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
    language: normalizeSupplierLanguage(r.language),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSupplierMessage(r: any): SupplierMessage {
  const direction = String(r.direction ?? "system");
  return {
    id: r.id?.toString?.() ?? String(r.id),
    organizationId: String(r.organizationId),
    supplierId: String(r.supplierId),
    poId: r.poId ? String(r.poId) : null,
    direction: direction === "inbound" || direction === "outbound" ? direction : "system",
    channel: r.channel ?? "",
    subject: r.subject ?? "",
    body: r.body ?? "",
    status: r.status ?? "",
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

function useSupplierMessages(organizationId: string | null): { messages: SupplierMessage[]; loading: boolean } {
  const [rows, ready] = useSupplierMessageRows() as [unknown[], boolean];
  const messages = useMemo(
    () =>
      (rows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r && r.organizationId === organizationId)
        .map(mapSupplierMessage)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, organizationId],
  );
  return { messages, loading: !ready };
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
    language: normalizeSupplierLanguage(data.language),
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
    language: normalizeSupplierLanguage(data.language),
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

const PO_STATUS_TONES: Record<POStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  received: "success",
  cancelled: "danger",
};

const MESSAGE_STATUS_TONES: Record<string, StatusTone> = {
  sent: "success",
  received: "neutral",
  failed: "danger",
  needs_review: "warning",
};

function parseDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function parseDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageStatusLabel(t: (key: string) => string, status: string): string {
  const key = status || "unknown";
  const translated = t(`suppliers.messageStatus.${key}`);
  return translated.startsWith("suppliers.messageStatus.") ? key : translated;
}

function messageSubject(t: (key: string) => string, message: SupplierMessage): string {
  return message.subject || t("suppliers.aiEmailSubjectFallback");
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
                : "fill-none text-border"
            )}
          />
        </button>
      ))}
    </div>
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
  const { messages: supplierMessages, loading: messagesLoading } = useSupplierMessages(organizationId);

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
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const aiSentEmails = useMemo(
    () => supplierMessages.filter((m) => m.channel === "email" && m.direction === "outbound"),
    [supplierMessages],
  );
  const needsReviewMessages = useMemo(
    () =>
      supplierMessages.filter(
        (m) =>
          m.channel === "email" &&
          (m.status === "needs_review" || (m.direction === "inbound" && m.body.includes("[Flagged:"))),
      ),
    [supplierMessages],
  );
  const failedAiEmails = useMemo(
    () => aiSentEmails.filter((m) => m.status === "failed").length,
    [aiSentEmails],
  );

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
      language: "en",
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
      toast.error(t("suppliers.toastNameRequired"));
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
          language: supplierForm.language ?? "en",
        });
      }
      setSupplierDialogOpen(false);
    } catch (err) {
      console.error("Failed to save supplier:", err);
      toast.error(t("suppliers.toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    try {
      await deleteSupplier(id);
    } catch (err) {
      console.error("Failed to delete supplier:", err);
      toast.error(t("suppliers.toastDeleteFailed"));
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
      toast.error(t("suppliers.toastSelectSupplier"));
      return;
    }
    if (poForm.items.length === 0 || !poForm.items[0].name) {
      toast.error(t("suppliers.toastAddItem"));
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
      toast.error(t("suppliers.toastCreatePOFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePOStatus = async (orderId: string, status: POStatus) => {
    try {
      await updatePurchaseOrderStatus(orderId, status);
    } catch (err) {
      console.error("Failed to update PO status:", err);
      toast.error(t("suppliers.toastUpdateStatusFailed"));
    }
  };

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExportSuppliers = () => {
    const headers = [
      t("suppliers.csvName"),
      t("suppliers.csvContact"),
      t("suppliers.labelEmail"),
      t("suppliers.labelPhone"),
      t("suppliers.labelLanguage"),
      t("suppliers.labelPaymentTerms"),
      t("suppliers.labelRating"),
    ];
    const rows = suppliers.map((s) => [
      s.name,
      s.contactName,
      s.email,
      s.phone,
      supplierLanguageLabel(t, s.language),
      t(`suppliers.terms.${s.paymentTerms}`),
      String(s.rating),
    ]);
    downloadCSV("suppliers", headers, rows);
  };

  // Loading state
  if (suppliersLoading || ordersLoading || messagesLoading) {
    return (
      <PermissionGuard section="inventory">
        <PageHeader title={t("suppliers.title")} subtitle={t("suppliers.subtitle")} />
        <SectionNav section="inventory" />
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
          title={t("suppliers.title")}
          subtitle={t("suppliers.subtitle")}
          right={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSuppliers}
                className="gap-1.5 hidden sm:flex"
              >
                <Download className="h-3.5 w-3.5" />
                {t("suppliers.export")}
              </Button>
              {canEdit && (
                <Button onClick={openAddSupplier} className="gap-2">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("suppliers.addSupplier")}</span>
                  <span className="sm:hidden">{t("suppliers.add")}</span>
                </Button>
              )}
            </div>
          }
        />
        <SectionNav section="inventory" />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 px-4 sm:px-6">
          <StatTile
            icon={Truck}
            label={t("suppliers.totalSuppliers")}
            value={String(totalSuppliers)}
          />
          <StatTile
            icon={ShoppingCart}
            label={t("suppliers.activePurchaseOrders")}
            value={String(activeOrders)}
          />
          <StatTile
            icon={FileText}
            label={t("suppliers.poValueThisMonth")}
            value={format(thisMonthTotal)}
          />
        </div>

        {/* Tabs: Suppliers / Purchase Orders / AI Emails */}
        <div className="px-4 sm:px-6">
          <Tabs defaultValue="suppliers">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="suppliers" className="gap-2">
                <Truck className="h-3.5 w-3.5" /> {t("suppliers.tabSuppliers")}
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-2">
                <FileText className="h-3.5 w-3.5" /> {t("suppliers.tabPurchaseOrders")}
              </TabsTrigger>
              <TabsTrigger value="ai-emails" className="gap-2">
                <Bot className="h-3.5 w-3.5" /> {t("suppliers.tabAiEmails")}
                {needsReviewMessages.length > 0 && (
                  <StatusBadge tone="warning" size="xs" className="ml-1 font-mono tabular-nums">
                    {needsReviewMessages.length}
                  </StatusBadge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ─── Suppliers Tab ──────────────────────────────────────────────── */}
            <TabsContent value="suppliers" className="space-y-4 mt-4">
              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("suppliers.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* Empty state */}
              {filteredSuppliers.length === 0 && (
                <EmptyState
                  className="py-16"
                  icon={Truck}
                  description={suppliers.length === 0
                    ? t("suppliers.emptyNoSuppliers")
                    : t("suppliers.emptyNoMatch")}
                  action={suppliers.length === 0 && canEdit ? (
                    <Button
                      onClick={openAddSupplier}
                      variant="outline"
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" /> {t("suppliers.addSupplier")}
                    </Button>
                  ) : undefined}
                />
              )}

              {/* Supplier cards */}
              <div className="space-y-2">
                {filteredSuppliers.map((supplier) => {
                  const lastPO = getLastPODate(supplier.id);
                  const poCount = getPOCount(supplier.id);
                  return (
                    <Card key={supplier.id}>
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
                                className="text-[10px] font-mono"
                              >
                                {t(`suppliers.terms.${supplier.paymentTerms}`)}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono"
                              >
                                {supplierLanguageLabel(t, supplier.language)}
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
                              <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                                {t("suppliers.poCount").replace("{count}", String(poCount))}
                              </span>
                              {lastPO && (
                                <span className="text-[11px] text-muted-foreground">
                                  {t("suppliers.lastPo").replace("{date}", parseDate(lastPO))}
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
                                {t("suppliers.createPo")}
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
                <EmptyState
                  className="py-16"
                  icon={FileText}
                  description={t("suppliers.emptyNoOrders")}
                  action={canEdit ? (
                    <Button
                      onClick={() => openCreatePO()}
                      variant="outline"
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" /> {t("suppliers.createPurchaseOrder")}
                    </Button>
                  ) : undefined}
                />
              )}

              {orders.length > 0 && (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("suppliers.colPoNumber")}</TableHead>
                        <TableHead className="text-xs">{t("suppliers.colSupplier")}</TableHead>
                        <TableHead className="text-xs">{t("suppliers.colDate")}</TableHead>
                        <TableHead className="text-xs text-right">{t("suppliers.colItems")}</TableHead>
                        <TableHead className="text-xs text-right">{t("suppliers.colTotal")}</TableHead>
                        <TableHead className="text-xs">{t("suppliers.colStatus")}</TableHead>
                        {canEdit && (
                          <TableHead className="text-xs text-right">{t("suppliers.colActions")}</TableHead>
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
                              <TableCell className="text-xs font-mono tabular-nums">
                                {order.id.slice(0, 8).toUpperCase()}
                              </TableCell>
                              <TableCell className="text-xs">
                                {supplier?.name ?? t("suppliers.unknownSupplier")}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {parseDate(order.createdAt)}
                              </TableCell>
                              <NumCell className="text-xs">
                                {parsedItems.length}
                              </NumCell>
                              <NumCell className="text-xs">
                                {format(order.total)}
                              </NumCell>
                              <TableCell>
                                <StatusBadge size="xs" tone={PO_STATUS_TONES[order.status]} className="capitalize">
                                  {t(`suppliers.status.${order.status}`)}
                                </StatusBadge>
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
                                        <Send className="h-3 w-3" /> {t("suppliers.actionSend")}
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
                                        <CheckCircle2 className="h-3 w-3" /> {t("suppliers.actionReceived")}
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
                                        <XCircle className="h-3 w-3" /> {t("common.cancel")}
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

            {/* ─── AI Supplier Emails Tab ───────────────────────────────────── */}
            <TabsContent value="ai-emails" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile icon={Mail} label={t("suppliers.aiEmailsSent")} value={aiSentEmails.length} />
                <StatTile icon={AlertTriangle} tone="warning" label={t("suppliers.aiEmailsNeedReview")} value={needsReviewMessages.length} />
                <StatTile icon={XCircle} tone="danger" label={t("suppliers.aiEmailsFailed")} value={failedAiEmails} />
              </div>

              {aiSentEmails.length === 0 && needsReviewMessages.length === 0 && (
                <Card>
                  <EmptyState className="py-16" icon={Inbox} description={t("suppliers.aiEmailsEmpty")} />
                </Card>
              )}

              {needsReviewMessages.length > 0 && (
                <div className="rounded-lg border border-border">
                  <div className="flex items-start gap-3 border-b border-border px-3 py-3">
                    <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_TONE_TEXT.warning)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t("suppliers.needsReviewTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("suppliers.needsReviewDesc")}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {needsReviewMessages.map((message) => {
                      const supplier = supplierById.get(message.supplierId);
                      return (
                        <div key={message.id} className="px-3 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {supplier?.name ?? t("suppliers.unknownSupplier")}
                                </span>
                                <StatusBadge size="xs" tone={MESSAGE_STATUS_TONES[message.status] ?? MESSAGE_STATUS_TONES.received}>
                                  {messageStatusLabel(t, message.status)}
                                </StatusBadge>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {messageSubject(t, message)}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                              {parseDateTime(message.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-foreground">
                            {message.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {aiSentEmails.length > 0 && (
                <div className="rounded-lg border border-border">
                  <div className="flex items-start gap-3 border-b border-border px-3 py-3">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t("suppliers.aiSentTitle")}</p>
                      <p className="text-xs text-muted-foreground">{t("suppliers.aiSentDesc")}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {aiSentEmails.map((message) => {
                      const supplier = supplierById.get(message.supplierId);
                      return (
                        <div key={message.id} className="px-3 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {supplier?.name ?? t("suppliers.unknownSupplier")}
                                </span>
                                <StatusBadge size="xs" tone={MESSAGE_STATUS_TONES[message.status] ?? MESSAGE_STATUS_TONES.received}>
                                  {messageStatusLabel(t, message.status)}
                                </StatusBadge>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {messageSubject(t, message)}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                              {parseDateTime(message.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-foreground">
                            {message.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
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
                mobileTitle={editingSupplier ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}
              >
                {editingSupplier ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {editingSupplier
                  ? t("suppliers.editSupplierDesc")
                  : t("suppliers.addSupplierDesc")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs">{t("suppliers.labelName")}</Label>
                <Input
                  value={supplierForm.name ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={t("suppliers.placeholderName")}
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t("suppliers.labelContactName")}</Label>
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
                  <Label className="text-xs">{t("suppliers.labelPhone")}</Label>
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
                <Label className="text-xs">{t("suppliers.labelEmail")}</Label>
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
                <Label className="text-xs">{t("suppliers.labelLanguage")}</Label>
                <Select
                  value={supplierForm.language ?? "en"}
                  onValueChange={(v) =>
                    setSupplierForm((f) => ({ ...f, language: normalizeSupplierLanguage(v) }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_LANGUAGES.map((language) => (
                      <SelectItem key={language.value} value={language.value}>
                        {supplierLanguageLabel(t, language.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t("suppliers.labelAddress")}</Label>
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
                  <Label className="text-xs">{t("suppliers.labelPaymentTerms")}</Label>
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
                      <SelectItem value="net30">{t("suppliers.terms.net30")}</SelectItem>
                      <SelectItem value="net60">{t("suppliers.terms.net60")}</SelectItem>
                      <SelectItem value="cod">{t("suppliers.terms.cod")}</SelectItem>
                      <SelectItem value="prepaid">{t("suppliers.terms.prepaid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("suppliers.labelRating")}</Label>
                  <div className="pt-1">
                    <StarRating
                      value={supplierForm.rating ?? 3}
                      onChange={(r) => setSupplierForm((f) => ({ ...f, rating: r }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t("suppliers.labelNotes")}</Label>
                <Textarea
                  value={supplierForm.notes ?? ""}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder={t("suppliers.placeholderSupplierNotes")}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <DialogActions
                onCancel={() => setSupplierDialogOpen(false)}
                onConfirm={handleSaveSupplier}
                saving={saving}
                confirmLabel={editingSupplier ? t("suppliers.update") : t("suppliers.addSupplier")}
              />
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Create PO Dialog ──────────────────────────────────────────────── */}
        <DynamicUIElement open={poDialogOpen} onOpenChange={setPoDialogOpen}>
          <DynamicUIElementContent className="max-w-lg">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("suppliers.createPurchaseOrder")}>
                {t("suppliers.createPurchaseOrder")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {t("suppliers.createPoDesc")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>

            <div className="space-y-4 py-4">
              {/* Supplier select */}
              <div className="space-y-2">
                <Label className="text-xs">{t("suppliers.labelSupplier")}</Label>
                <Select
                  value={poForm.supplierId}
                  onValueChange={(v) =>
                    setPoForm((f) => ({ ...f, supplierId: v ?? "" }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={t("suppliers.selectSupplier")} />
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
                <Label className="text-xs">{t("suppliers.labelItems")}</Label>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1">{t("suppliers.poColItem")}</TableHead>
                        <TableHead className="py-1 w-16">{t("suppliers.poColQty")}</TableHead>
                        <TableHead className="py-1 w-16">{t("suppliers.poColUnit")}</TableHead>
                        <TableHead className="py-1 w-20">{t("suppliers.poColCost")}</TableHead>
                        <TableHead className="py-1 w-20 text-right">
                          {t("suppliers.poColTotal")}
                        </TableHead>
                        <TableHead className="py-1 w-8" />
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
                              placeholder={t("suppliers.placeholderItemName")}
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
                              className="h-7 text-xs border-0 shadow-none p-0 text-center font-mono tabular-nums focus-visible:ring-0"
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
                              className="h-7 text-xs border-0 shadow-none p-0 font-mono tabular-nums focus-visible:ring-0"
                            />
                          </TableCell>
                          <NumCell className="py-1 px-1 text-xs">
                            {format(item.quantity * item.unitCost)}
                          </NumCell>
                          <TableCell className="py-1 px-1">
                            {poForm.items.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => removePORow(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
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
                  <Plus className="h-3 w-3" /> {t("suppliers.addRow")}
                </Button>
              </div>

              {/* Totals */}
              <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("suppliers.subtotal")}</span>
                  <Money value={poSubtotal} size="xs" />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("suppliers.taxPercent").replace("{percent}", "10")}</span>
                  <Money value={poTax} size="xs" />
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>{t("suppliers.totalLabel")}</span>
                  <Money value={poTotal} className="font-semibold" />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs">{t("suppliers.labelNotes")}</Label>
                <Textarea
                  value={poForm.notes}
                  onChange={(e) =>
                    setPoForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder={t("suppliers.placeholderPoNotes")}
                  rows={2}
                  className="resize-none"
                />
              </div>

              <DialogActions
                onCancel={() => setPoDialogOpen(false)}
                onConfirm={handleCreatePO}
                saving={saving}
                confirmLabel={t("suppliers.createDraft")}
              />
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>
      </div>
    </PermissionGuard>
  );
}
