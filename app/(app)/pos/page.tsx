"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Search, Plus, Minus, X, Loader2, CreditCard, Banknote,
  MoreHorizontal, Printer, RotateCcw, Check, Tag, User,
  AlertCircle, Receipt, History, ShoppingCart, CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProducts } from "@/lib/db/products";
import { createPayment, refundPayment } from "@/lib/spacetimedb/actions";
import { getPaymentConfig, getRecentPayments } from "@/lib/db/payments";
import { getCached, setCache } from "@/lib/cache";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import type { Product, CartItem, Payment } from "@/lib/types";

// ─── Category color palette ───────────────────────────────────────────────────

const CAT_COLORS = [
  "#e11d48","#d97706","#16a34a","#2563eb",
  "#7c3aed","#db2777","#0891b2","#dc2626",
  "#059669","#9333ea","#c2410c","#0369a1",
];

function catColor(category: string, categories: string[]): string {
  const idx = categories.indexOf(category);
  return CAT_COLORS[idx % CAT_COLORS.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function fmt(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ─── Payment SDK loader ───────────────────────────────────────────────────────

function loadPaymentScript(errorMsg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(); return; }
    const existing = document.querySelector('script[data-pay-sdk]');
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://secure.helcim.app/helcim-pay/services/start.js";
    script.setAttribute("data-pay-sdk", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMsg));
    document.head.appendChild(script);
  });
}

// ─── Local types ─────────────────────────────────────────────────────────────

type ActiveTab = "register" | "orders";
type PmtMethod = "card" | "cash" | "other";
type DiscountType = "percent" | "dollar";

interface ReceiptData {
  payment: Payment;
  businessName: string;
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({ product, color, onTap }: {
  product: Product; color: string; onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex flex-col overflow-hidden rounded border border-border bg-card text-left transition-all active:scale-95 hover:border-stone-400 hover:shadow-sm"
      style={{ minHeight: 100 }}
    >
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col flex-1 justify-between p-2.5">
        <p className="text-xs font-semibold leading-snug line-clamp-2">{product.name}</p>
        <p className="mt-1 text-sm font-bold tabular-nums">{fmt(product.price)}</p>
      </div>
    </button>
  );
}

// ─── Cart row ─────────────────────────────────────────────────────────────────

function CartRow({ item, onQtyChange, onRemove }: {
  item: CartItem;
  onQtyChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{item.name}</p>
        <p className="text-[11px] text-muted-foreground">{fmt(item.price)} {t("pos.register.each")}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => { hapticLight(); if (item.quantity <= 1) onRemove(item.id); else onQtyChange(item.id, item.quantity - 1); }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted"
        ><Minus className="h-3 w-3" /></button>
        <span className="w-6 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
        <button
          type="button"
          onClick={() => { hapticLight(); onQtyChange(item.id, item.quantity + 1); }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted"
        ><Plus className="h-3 w-3" /></button>
      </div>
      <p className="w-16 text-right text-xs font-semibold tabular-nums shrink-0">
        {fmt(item.price * item.quantity)}
      </p>
      <button
        type="button"
        onClick={() => { hapticLight(); onRemove(item.id); }}
        className="text-muted-foreground hover:text-destructive ml-1"
      ><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── Receipt screen ───────────────────────────────────────────────────────────

function ReceiptScreen({ data, onNewOrder }: { data: ReceiptData; onNewOrder: () => void }) {
  const t = useT();
  const { payment, businessName } = data;
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6">
      <div
        id="receipt-content"
        className="w-full max-w-xs border border-border rounded bg-white p-5 space-y-3 font-mono text-sm"
      >
        <div className="text-center space-y-0.5">
          <p className="font-bold text-base">{businessName || t("pos.receipt.fallbackName")}</p>
          <p className="text-xs text-muted-foreground">{fmtDate(payment.createdAt)}</p>
        </div>
        <div className="border-t border-dashed border-border" />
        {payment.items?.map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span>{item.quantity}× {item.name}</span>
            <span>{fmt(item.price * item.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-border" />
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>{t("pos.receipt.subtotal")}</span>
            <span>{fmt(payment.amount + payment.discountAmount - payment.taxAmount)}</span>
          </div>
          {payment.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>{t("pos.receipt.discount")}</span><span>−{fmt(payment.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t("pos.receipt.tax")}</span><span>{fmt(payment.taxAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t border-border pt-1 mt-1">
            <span>{t("pos.receipt.total")}</span><span>{fmt(payment.amount)}</span>
          </div>
        </div>
        <div className="border-t border-dashed border-border" />
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>{t("pos.receipt.payment")}</span><span className="capitalize">{payment.method}</span>
          </div>
          {payment.processorId && (
            <div className="flex justify-between">
              <span>{t("pos.receipt.txnId")}</span>
              <span className="truncate ml-2 text-[10px]">{payment.processorId}</span>
            </div>
          )}
          {payment.customerName && (
            <div className="flex justify-between">
              <span>{t("pos.receipt.customer")}</span><span>{payment.customerName}</span>
            </div>
          )}
        </div>
        <div className="text-center text-[10px] text-muted-foreground pt-1">{t("pos.receipt.thankYou")}</div>
      </div>
      <div className="flex gap-2 mt-4 w-full max-w-xs">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded border border-border py-2 text-sm hover:bg-muted transition-colors"
        >
          <Printer className="h-4 w-4" />{t("pos.receipt.print")}
        </button>
        <button
          type="button"
          onClick={() => { hapticSuccess(); onNewOrder(); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded bg-stone-900 text-white py-2 text-sm hover:bg-stone-800 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />{t("pos.receipt.newOrder")}
        </button>
      </div>
    </div>
  );
}

// ─── Refund dialog ────────────────────────────────────────────────────────────

function RefundDialog({
  payment,
  onClose,
  onSuccess,
}: {
  payment: Payment;
  onClose: () => void;
  onSuccess: (updated: Payment) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundAmt = mode === "full"
    ? payment.amount
    : Math.min(parseFloat(partialAmount) || 0, payment.amount);

  const canSubmit = mode === "full"
    ? true
    : (parseFloat(partialAmount) > 0 && parseFloat(partialAmount) <= payment.amount);

  const handleRefund = async () => {
    setProcessing(true);
    try {
      await refundPayment(
        payment.id,
        mode === "partial" ? refundAmt : undefined,
        reason.trim() || undefined
      );
    } catch (err) {
      setProcessing(false);
      toast.error(t("pos.refund.failed"), { description: err instanceof Error ? err.message : String(err) });
      return;
    }
    setProcessing(false);
    hapticSuccess();
    // Reconstruct updated payment from result or patch locally
    const updated: Payment = {
      ...payment,
      status: "refunded",
      refundAmount: refundAmt,
      refundReason: reason.trim() || null,
      refundedAt: new Date().toISOString(),
    };
    onSuccess(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm rounded-t-xl sm:rounded-xl border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t("pos.refund.title")}</p>
          <button type="button" onClick={onClose} disabled={processing}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Order summary */}
          <div className="rounded border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1">
            <div className="flex justify-between font-semibold">
              <span>{t("pos.refund.originalTotal")}</span>
              <span>{fmt(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span className="capitalize">{payment.method} · {fmtDate(payment.createdAt)}</span>
              {payment.customerName && <span>{payment.customerName}</span>}
            </div>
          </div>

          {/* Refund type */}
          <div>
            <p className="text-xs font-medium mb-1.5">{t("pos.refund.refundAmount")}</p>
            <div className="flex rounded border border-border overflow-hidden">
              {(["full", "partial"] as const).map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium capitalize transition-colors",
                    i > 0 ? "border-l border-border" : "",
                    mode === m ? "bg-stone-900 text-white" : "hover:bg-muted"
                  )}
                >
                  {m === "full" ? `${t("pos.refund.full")} — ${fmt(payment.amount)}` : t("pos.refund.partial")}
                </button>
              ))}
            </div>
            {mode === "partial" && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">$</span>
                <input
                  autoFocus
                  type="number"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  max={payment.amount}
                  step="0.01"
                  className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-medium">{t("pos.refund.reason")}</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("pos.refund.reasonPlaceholder")}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleRefund}
            disabled={processing || !canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded bg-destructive py-3 text-sm font-bold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
            {processing ? t("pos.refund.processing") : `${t("pos.refund.refundButton")} ${fmt(refundAmt)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order row (in Orders tab) ────────────────────────────────────────────────

function OrderRow({
  payment,
  onRefund,
}: {
  payment: Payment;
  onRefund: (p: Payment) => void;
}) {
  const t = useT();
  const isRefunded = payment.status === "refunded";
  const isNegative = payment.amount < 0; // audit-trail refund record

  if (isNegative) return null; // don't show negative audit records

  return (
    <div className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isRefunded ? "bg-red-50 text-red-500" : "bg-stone-100 text-stone-600"
        )}>
          {payment.method === "card" && <CreditCard className="h-4 w-4" />}
          {payment.method === "cash" && <Banknote className="h-4 w-4" />}
          {payment.method === "other" && <MoreHorizontal className="h-4 w-4" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold tabular-nums">{fmt(payment.amount)}</span>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isRefunded
                ? "bg-red-100 text-red-600"
                : "bg-emerald-100 text-emerald-700"
            )}>
              {isRefunded ? t("pos.orders.refunded") : t("pos.orders.completed")}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {fmtDate(payment.createdAt)}
            {payment.customerName && ` · ${payment.customerName}`}
          </p>
          {payment.items && payment.items.length > 0 && (
            <p className="text-[11px] text-muted-foreground truncate">
              {payment.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
            </p>
          )}
          {/* Refund details */}
          {isRefunded && payment.refundAmount != null && (
            <div className="mt-1 text-[11px] text-red-500 space-y-0.5">
              <p>{t("pos.orders.refunded")} {fmt(payment.refundAmount)}{payment.refundedAt ? ` ${t("pos.orders.onDate")} ${fmtDate(payment.refundedAt)}` : ""}</p>
              {payment.refundReason && <p className="text-muted-foreground">{t("pos.orders.reason")} {payment.refundReason}</p>}
            </div>
          )}
        </div>

        {/* Refund button */}
        {!isRefunded && (
          <button
            type="button"
            onClick={() => { hapticLight(); onRefund(payment); }}
            className="shrink-0 rounded border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
          >
            {t("pos.orders.refundAction")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────────────

const ORDERS_PAGE_SIZE = 30;
const ORDERS_NEXT_SIZE = 10;
const ORDERS_CACHE_KEY = "pos_orders_first_page";

function OrdersTab({
  organizationId,
  onPaymentUpdated,
}: {
  organizationId: string;
  onPaymentUpdated: (p: Payment) => void;
}) {
  const t = useT();
  const [orders, setOrders] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search input → searchQuery
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(searchInput), 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchInput]);

  // Initial / search-triggered load
  useEffect(() => {
    setLoading(true);
    setOrders([]);
    setOffset(0);
    setHasMore(true);

    // Show cached first page immediately (only for no-search case)
    if (!searchQuery) {
      const cached = getCached<Payment[]>(ORDERS_CACHE_KEY);
      if (cached) {
        setOrders(cached);
        setLoading(false);
      }
    }

    getRecentPayments(organizationId, ORDERS_PAGE_SIZE, 0, searchQuery || undefined)
      .then((data) => {
        setOrders(data);
        setOffset(data.length);
        setHasMore(data.length === ORDERS_PAGE_SIZE);
        if (!searchQuery) setCache(ORDERS_CACHE_KEY, data);
      })
      .catch((err) => console.error("Orders: failed to load:", err))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, searchQuery]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await getRecentPayments(
        organizationId, ORDERS_NEXT_SIZE, offset, searchQuery || undefined
      );
      setOrders((prev) => [...prev, ...data]);
      setOffset((o) => o + data.length);
      setHasMore(data.length === ORDERS_NEXT_SIZE);
    } catch (err) {
      console.error("Orders: failed to load more:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [organizationId, offset, hasMore, loadingMore, searchQuery]);

  // IntersectionObserver on sentinel (placed 10 from bottom)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore, orders.length]);

  const handleRefundSuccess = (updated: Payment) => {
    setOrders((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setRefundTarget(null);
    onPaymentUpdated(updated);
  };

  // Sentinel index: 10 from the end
  const sentinelIndex = useMemo(
    () => Math.max(0, orders.length - 10),
    [orders.length]
  );

  return (
    <>
      {/* Search bar */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("pos.orders.searchPlaceholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <History className="h-8 w-8 opacity-30" />
            <p className="text-sm">{searchQuery ? t("pos.orders.noMatch") : t("pos.orders.empty")}</p>
          </div>
        ) : (
          <>
            {orders.map((p, idx) => (
              <div key={p.id}>
                {idx === sentinelIndex && <div ref={sentinelRef} />}
                <OrderRow payment={p} onRefund={setRefundTarget} />
              </div>
            ))}

            {/* Bottom indicator */}
            <div className="py-4 text-center">
              {loadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
              ) : !hasMore ? (
                <p className="text-xs text-muted-foreground">{t("pos.orders.noMore")}</p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {refundTarget && (
        <RefundDialog
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={handleRefundSuccess}
        />
      )}
    </>
  );
}

// ─── Main POS page ────────────────────────────────────────────────────────────

export default function POSPage() {
  const t = useT();
  const { organizationId } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("register");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [businessName, setBusinessName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Payment flow
  const [cardAvailable, setCardAvailable] = useState(true);
  const [chargeDialog, setChargeDialog] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PmtMethod | null>(null);
  const [cashEntered, setCashEntered] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Custom item dialog
  const [customDialog, setCustomDialog] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // Discount dialog
  const [discountDialog, setDiscountDialog] = useState(false);

  // Receipt
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // Orders tab refresh trigger
  const [ordersKey, setOrdersKey] = useState(0);

  const paymentListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (token) setUserId(token.slice(0, 36));

    getProducts()
      .then(setProducts)
      .catch((err) => console.error("POS: failed to load products:", err))
      .finally(() => setLoading(false));

    getPaymentConfig()
      .then(({ taxRate: tr, currency: cur }) => { setTaxRate(tr); setCurrency(cur); })
      .catch(() => {});

    fetch("/api/payments/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 0.01, currency: "USD" }),
    })
      .then((r) => { if (r.status === 503) setCardAvailable(false); })
      .catch(() => setCardAvailable(false));

    // Business name loaded via SpacetimeDB useSettings hook elsewhere
  }, []);

  useEffect(() => {
    return () => {
      if (paymentListenerRef.current) {
        window.removeEventListener("message", paymentListenerRef.current);
      }
    };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  const catList = categories.filter((c) => c !== "All");

  const filteredProducts = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    return matchSearch && matchCat;
  });

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountNum = parseFloat(discountValue) || 0;
  const discountAmount = discountType === "percent"
    ? Math.min(subtotal * (discountNum / 100), subtotal)
    : Math.min(discountNum, subtotal);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRate / 100);
  const total = taxableAmount + taxAmount;

  // ── Cart actions ──────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product) => {
    hapticLight();
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price: product.price || 0, quantity: 1, category: product.category }];
    });
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: qty } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setDiscountValue("");
    setCashEntered("");
    setOtherNote("");
    setSelectedMethod(null);
  }, []);

  // ── Custom item ───────────────────────────────────────────────────────────

  const addCustomItem = () => {
    const price = parseFloat(customPrice);
    if (!customName.trim() || isNaN(price) || price <= 0) return;
    hapticLight();
    setCart((prev) => [...prev, { id: `custom-${uid()}`, name: customName.trim(), price, quantity: 1 }]);
    setCustomName(""); setCustomPrice(""); setCustomDialog(false);
  };

  // ── Payment ───────────────────────────────────────────────────────────────

  const completePayment = async (
    method: PmtMethod,
    opts: { processorId?: string; processorResponse?: Record<string, unknown>; notes?: string } = {}
  ) => {
    if (!organizationId || !userId) return;
    setProcessing(true);
    setPaymentError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const optimisticPayment: Payment = {
        id: crypto.randomUUID(), organizationId, userId,
        amount: parseFloat(total.toFixed(2)),
        currency, method, status: "completed",
        processorId: opts.processorId ?? null,
        processorResponse: opts.processorResponse ? JSON.stringify(opts.processorResponse) : null,
        customerName: customerName.trim() || null,
        notes: opts.notes ?? null,
        items: cart.map((c) => ({
          name: c.name,
          price: c.price,
          quantity: c.quantity,
        })),
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        refundAmount: null, refundReason: null,
        createdAt: new Date().toISOString(),
      } as any;
      const itemsForDb = cart.map((c) => ({
        name: c.name,
        price: c.price,
        quantity: c.quantity,
      }));
      await createPayment({
        organizationId, userId,
        amount: optimisticPayment.amount,
        currency, method, status: "completed",
        processorId: opts.processorId ?? null,
        processorResponse: opts.processorResponse
          ? JSON.stringify(opts.processorResponse)
          : null,
        customerName: customerName.trim() || null,
        notes: opts.notes ?? null,
        items: JSON.stringify(itemsForDb),
        taxAmount: optimisticPayment.taxAmount,
        discountAmount: optimisticPayment.discountAmount,
      });
      hapticSuccess();
      setChargeDialog(false);
      setOrdersKey((k) => k + 1); // trigger orders tab refresh
      setReceipt({ payment: optimisticPayment, businessName });
    } catch (err) {
      console.error("POS: payment record failed:", err);
      setPaymentError(t("pos.errors.recordFailed"));
    } finally {
      setProcessing(false);
    }
  };

  const handleCardPayment = async () => {
    setProcessing(true);
    setPaymentError(null);
    try {
      const sessionRes = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(total.toFixed(2)), currency }),
      });
      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        throw new Error(err.error ?? t("pos.errors.initFailed"));
      }
      const { checkoutToken, testMode } = await sessionRes.json();

      await loadPaymentScript(t("pos.errors.moduleUnavailable"));

      const listener = async (event: MessageEvent) => {
        if (event.origin !== "https://secure.helcim.app") return;
        const { eventType, data: evData } = event.data ?? {};

        if (eventType === "PURCHASE") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setProcessing(true);
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ checkoutToken, transactionId: evData?.transaction?.transactionId }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.verified) throw new Error(t("pos.errors.verificationFailed"));
            await completePayment("card", {
              processorId: String(verifyData.transactionId ?? ""),
              processorResponse: verifyData.responseData,
            });
          } catch (err) {
            console.error("POS: card verify error:", err);
            setPaymentError(t("pos.errors.verifyFailed"));
            setProcessing(false);
          }
        } else if (eventType === "FAILED_PURCHASE") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setPaymentError(t("pos.errors.cardDeclined"));
          setProcessing(false);
        } else if (eventType === "CANCEL_TRANSACTION" || eventType === "CLOSE_IFRAME") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setProcessing(false);
        }
      };

      window.addEventListener("message", listener);
      paymentListenerRef.current = listener;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).appendHelcimIframe?.(checkoutToken, testMode ? 1 : 0);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : t("pos.errors.paymentFailed"));
      setProcessing(false);
    }
  };

  // ── Receipt / loading guards ──────────────────────────────────────────────

  if (receipt) {
    return (
      <ReceiptScreen
        data={receipt}
        onNewOrder={() => { clearCart(); setReceipt(null); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cashChange = (parseFloat(cashEntered) || 0) - total;

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border bg-background">
        <button
          type="button"
          onClick={() => setActiveTab("register")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "register"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {t("pos.tabs.register")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "orders"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <History className="h-3.5 w-3.5" />
          {t("pos.tabs.orders")}
        </button>
      </div>

      {/* Orders tab */}
      {activeTab === "orders" && organizationId && (
        <OrdersTab
          key={ordersKey}
          organizationId={organizationId}
          onPaymentUpdated={() => {}}
        />
      )}

      {/* Register tab */}
      {activeTab === "register" && (
        <div className="flex flex-1 overflow-hidden h-full">
          {/* ── Left: Product grid ────────────────────────────────────────── */}
          <div className="flex flex-col flex-1 overflow-hidden border-r border-border">
            <div className="shrink-0 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("pos.register.searchProducts")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <div className="flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { hapticLight(); setActiveCategory(cat); }}
                    className={cn(
                      "shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      activeCategory === cat
                        ? "bg-stone-900 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >{cat === "All" ? t("pos.register.all") : cat}</button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {filteredProducts.length === 0 && !search ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <p className="text-sm">{t("pos.register.noProducts")}</p>
                  <p className="text-xs">{t("pos.register.addInProducts")}</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">{t("pos.register.noResults")}</p>
              ) : (
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
                  {filteredProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      color={catColor(p.category, catList)}
                      onTap={() => addToCart(p)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomDialog(true)}
                    className="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-stone-400 transition-colors"
                    style={{ minHeight: 100 }}
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px]">{t("pos.register.custom")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Cart ──────────────────────────────────────────────── */}
          <div className="w-72 lg:w-80 flex flex-col shrink-0 bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t("pos.register.customerPlaceholder")}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5">
                  <Receipt className="h-8 w-8 opacity-30" />
                  <p className="text-xs">{t("pos.register.tapToAdd")}</p>
                </div>
              ) : (
                cart.map((item) => (
                  <CartRow key={item.id} item={item} onQtyChange={updateQty} onRemove={removeItem} />
                ))
              )}
            </div>

            <div className="border-t border-border">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => setDiscountDialog(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Tag className="h-3.5 w-3.5" />
                  {discountAmount > 0
                    ? <span className="text-emerald-600 font-medium">{t("pos.register.discount")}: −{fmt(discountAmount)}</span>
                    : <span>{t("pos.register.addDiscount")}</span>
                  }
                </button>
                {discountAmount > 0 && (
                  <button type="button" onClick={() => setDiscountValue("")} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="px-3 py-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("pos.register.subtotal")}</span><span>{fmt(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>{t("pos.register.discount")}</span><span>−{fmt(discountAmount)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("pos.register.tax").replace("{rate}", String(taxRate))}</span><span>{fmt(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>{t("pos.register.total")}</span><span>{fmt(total)}</span>
                </div>
              </div>

              <div className="px-3 pb-4">
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => { hapticLight(); setSelectedMethod(null); setPaymentError(null); setChargeDialog(true); }}
                  className={cn(
                    "w-full rounded py-3.5 text-sm font-bold transition-colors",
                    cart.length === 0
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-stone-900 text-white hover:bg-stone-800 active:scale-98"
                  )}
                >
                  {cart.length === 0 ? t("pos.register.addItems") : `${t("pos.register.charge")} ${fmt(total)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom item dialog ──────────────────────────────────────────────── */}
      {customDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{t("pos.customItem.title")}</p>
              <button type="button" onClick={() => setCustomDialog(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("pos.customItem.itemName")}</label>
                <input autoFocus type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t("pos.customItem.itemPlaceholder")}
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("pos.customItem.price")}</label>
                <input type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0.00" min="0" step="0.01"
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <button type="button" onClick={addCustomItem} disabled={!customName.trim() || !customPrice}
                className="w-full rounded bg-stone-900 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-40 transition-colors">
                {t("pos.customItem.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discount dialog ─────────────────────────────────────────────────── */}
      {discountDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{t("pos.discountDialog.title")}</p>
              <button type="button" onClick={() => setDiscountDialog(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex rounded border border-border overflow-hidden">
                {(["percent", "dollar"] as const).map((dt, i) => (
                  <button key={dt} type="button" onClick={() => setDiscountType(dt)}
                    className={cn("flex-1 py-1.5 text-xs font-medium transition-colors",
                      i > 0 ? "border-l border-border" : "",
                      discountType === dt ? "bg-stone-900 text-white" : "hover:bg-muted"
                    )}>
                    {dt === "percent" ? t("pos.discountDialog.percent") : t("pos.discountDialog.dollar")}
                  </button>
                ))}
              </div>
              <input autoFocus type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? t("pos.discountDialog.percentPlaceholder") : t("pos.discountDialog.dollarPlaceholder")}
                min="0" step={discountType === "percent" ? "1" : "0.01"}
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              {discountAmount > 0 && (
                <p className="text-xs text-muted-foreground">{t("pos.discountDialog.saves").replace("{amount}", fmt(discountAmount))}</p>
              )}
              <button type="button" onClick={() => { hapticLight(); setDiscountDialog(false); }}
                className="w-full rounded bg-stone-900 py-2 text-sm text-white hover:bg-stone-800 transition-colors">
                {t("pos.discountDialog.apply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Charge / payment dialog ──────────────────────────────────────────── */}
      {chargeDialog && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm rounded-t-xl sm:rounded-xl border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{t("pos.charge.title")} {fmt(total)}</p>
              <button type="button" onClick={() => { if (!processing) setChargeDialog(false); }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {!selectedMethod && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{t("pos.charge.selectMethod")}</p>
                  <button type="button" disabled={!cardAvailable} onClick={() => setSelectedMethod("card")}
                    className={cn("flex w-full items-center gap-3 rounded border px-4 py-3 text-left transition-colors",
                      cardAvailable ? "border-border hover:bg-muted" : "border-border opacity-50 cursor-not-allowed")}>
                    <CreditCard className="h-5 w-5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t("pos.charge.card")}</p>
                      <p className="text-xs text-muted-foreground">{cardAvailable ? t("pos.charge.cardDescription") : t("pos.charge.cashOnly")}</p>
                    </div>
                    {!cardAvailable && <AlertCircle className="h-4 w-4 text-amber-500" />}
                  </button>
                  <button type="button" onClick={() => setSelectedMethod("cash")}
                    className="flex w-full items-center gap-3 rounded border border-border px-4 py-3 text-left hover:bg-muted transition-colors">
                    <Banknote className="h-5 w-5 shrink-0" />
                    <div><p className="text-sm font-medium">{t("pos.charge.cash")}</p><p className="text-xs text-muted-foreground">{t("pos.charge.cashDescription")}</p></div>
                  </button>
                  <button type="button" onClick={() => setSelectedMethod("other")}
                    className="flex w-full items-center gap-3 rounded border border-border px-4 py-3 text-left hover:bg-muted transition-colors">
                    <MoreHorizontal className="h-5 w-5 shrink-0" />
                    <div><p className="text-sm font-medium">{t("pos.charge.other")}</p><p className="text-xs text-muted-foreground">{t("pos.charge.otherDescription")}</p></div>
                  </button>
                </div>
              )}

              {selectedMethod === "card" && (
                <div className="space-y-3">
                  <button type="button" onClick={() => setSelectedMethod(null)} className="text-xs text-muted-foreground hover:text-foreground">{t("pos.charge.back")}</button>
                  {paymentError && (
                    <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{paymentError}
                    </div>
                  )}
                  <button type="button" onClick={handleCardPayment} disabled={processing}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors">
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {processing ? t("pos.charge.processing") : `${t("pos.charge.pay")} ${fmt(total)}`}
                  </button>
                </div>
              )}

              {selectedMethod === "cash" && (
                <div className="space-y-3">
                  <button type="button" onClick={() => setSelectedMethod(null)} className="text-xs text-muted-foreground hover:text-foreground">{t("pos.charge.back")}</button>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("pos.charge.amountTendered")}</label>
                    <input autoFocus type="number" value={cashEntered} onChange={(e) => setCashEntered(e.target.value)}
                      placeholder={fmt(total).replace("$", "")} min={total} step="0.01"
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  {cashEntered && parseFloat(cashEntered) >= total && (
                    <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                      <span className="text-muted-foreground text-xs">{t("pos.charge.changeDue")} </span>
                      <span className="font-bold text-emerald-700">{fmt(cashChange)}</span>
                    </div>
                  )}
                  {paymentError && <p className="text-xs text-destructive">{paymentError}</p>}
                  <button type="button" onClick={() => completePayment("cash")}
                    disabled={processing || !cashEntered || parseFloat(cashEntered) < total}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors">
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {processing ? t("pos.charge.recording") : t("pos.charge.completeSale")}
                  </button>
                </div>
              )}

              {selectedMethod === "other" && (
                <div className="space-y-3">
                  <button type="button" onClick={() => setSelectedMethod(null)} className="text-xs text-muted-foreground hover:text-foreground">{t("pos.charge.back")}</button>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t("pos.charge.noteLabel")}</label>
                    <input autoFocus type="text" value={otherNote} onChange={(e) => setOtherNote(e.target.value)}
                      placeholder={t("pos.charge.notePlaceholder")}
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  {paymentError && <p className="text-xs text-destructive">{paymentError}</p>}
                  <button type="button" onClick={() => completePayment("other", { notes: otherNote.trim() || undefined })}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors">
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {processing ? t("pos.charge.recording") : t("pos.charge.completeSale")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
