"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Plus, Minus, X, Loader2, CreditCard, Banknote,
  MoreHorizontal, Printer, RotateCcw, Check, Tag, User,
  ChevronDown, AlertCircle, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProducts } from "@/lib/db/products";
import { createPayment, getPaymentConfig } from "@/lib/db/payments";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { createClient } from "@/lib/supabase/client";
import type { Product, CartItem, Payment } from "@/lib/types";

// ─── Category color palette (deterministic by index) ─────────────────────────

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
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ─── HelcimPay.js loader ──────────────────────────────────────────────────────

function loadPaymentScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(); return; }
    const existing = document.querySelector('script[data-pay-sdk]');
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://secure.helcim.app/helcim-pay/services/start.js";
    script.setAttribute("data-pay-sdk", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Payment module unavailable"));
    document.head.appendChild(script);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = "card" | "cash" | "other";
type DiscountType = "percent" | "dollar";

interface ReceiptData {
  payment: Payment;
  businessName: string;
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  color,
  onTap,
}: {
  product: Product;
  color: string;
  onTap: () => void;
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

function CartRow({
  item,
  onQtyChange,
  onRemove,
}: {
  item: CartItem;
  onQtyChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{item.name}</p>
        <p className="text-[11px] text-muted-foreground">{fmt(item.price)} each</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            hapticLight();
            if (item.quantity <= 1) onRemove(item.id);
            else onQtyChange(item.id, item.quantity - 1);
          }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-6 text-center text-xs font-semibold tabular-nums">{item.quantity}</span>
        <button
          type="button"
          onClick={() => { hapticLight(); onQtyChange(item.id, item.quantity + 1); }}
          className="flex h-6 w-6 items-center justify-center rounded border border-border hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <p className="w-16 text-right text-xs font-semibold tabular-nums shrink-0">
        {fmt(item.price * item.quantity)}
      </p>
      <button
        type="button"
        onClick={() => { hapticLight(); onRemove(item.id); }}
        className="text-muted-foreground hover:text-destructive ml-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Receipt screen ───────────────────────────────────────────────────────────

function ReceiptScreen({
  data,
  onNewOrder,
}: {
  data: ReceiptData;
  onNewOrder: () => void;
}) {
  const { payment, businessName } = data;
  const dateStr = new Date(payment.createdAt).toLocaleString();

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6">
      <div
        id="receipt-content"
        className="w-full max-w-xs border border-border rounded bg-white p-5 space-y-3 font-mono text-sm"
      >
        {/* Header */}
        <div className="text-center space-y-0.5">
          <p className="font-bold text-base">{businessName || "Receipt"}</p>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>
        <div className="border-t border-dashed border-border" />

        {/* Items */}
        {payment.items?.map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span>{item.quantity}× {item.name}</span>
            <span>{fmt(item.price * item.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-border" />

        {/* Totals */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{fmt(payment.amount + payment.discountAmount - payment.taxAmount)}</span>
          </div>
          {payment.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>−{fmt(payment.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{fmt(payment.taxAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t border-border pt-1 mt-1">
            <span>TOTAL</span>
            <span>{fmt(payment.amount)}</span>
          </div>
        </div>
        <div className="border-t border-dashed border-border" />

        {/* Payment info */}
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between">
            <span>Payment</span>
            <span className="capitalize">{payment.method}</span>
          </div>
          {payment.processorId && (
            <div className="flex justify-between">
              <span>Txn ID</span>
              <span className="truncate ml-2 text-[10px]">{payment.processorId}</span>
            </div>
          )}
          {payment.customerName && (
            <div className="flex justify-between">
              <span>Customer</span>
              <span>{payment.customerName}</span>
            </div>
          )}
        </div>

        <div className="text-center text-[10px] text-muted-foreground pt-1">
          Thank you!
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 w-full max-w-xs">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded border border-border py-2 text-sm hover:bg-muted transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button
          type="button"
          onClick={() => { hapticSuccess(); onNewOrder(); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded bg-stone-900 text-white py-2 text-sm hover:bg-stone-800 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          New Order
        </button>
      </div>
    </div>
  );
}

// ─── Main POS page ────────────────────────────────────────────────────────────

export default function POSPage() {
  const { organizationId } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
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

  const paymentListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });

    getProducts()
      .then(setProducts)
      .catch((err) => console.error("POS: failed to load products:", err))
      .finally(() => setLoading(false));

    getPaymentConfig()
      .then(({ taxRate: tr, currency: cur }) => {
        setTaxRate(tr);
        setCurrency(cur);
      })
      .catch(() => {});

    // Check card availability
    fetch("/api/payments/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 0.01, currency: "USD" }),
    })
      .then((r) => { if (r.status === 503) setCardAvailable(false); })
      .catch(() => setCardAvailable(false));

    // Business name from settings
    supabase
      .from("settings")
      .select("business_name")
      .maybeSingle()
      .then(({ data }) => { if (data?.business_name) setBusinessName(data.business_name); });
  }, []);

  // Cleanup payment event listener on unmount
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
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        category: product.category,
      }];
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
    setCart((prev) => [...prev, {
      id: `custom-${uid()}`,
      name: customName.trim(),
      price,
      quantity: 1,
    }]);
    setCustomName("");
    setCustomPrice("");
    setCustomDialog(false);
  };

  // ── Payment ───────────────────────────────────────────────────────────────

  const completePayment = async (
    method: PaymentMethod,
    opts: {
      processorId?: string;
      processorResponse?: Record<string, unknown>;
      notes?: string;
    } = {}
  ) => {
    if (!organizationId || !userId) return;
    setProcessing(true);
    setPaymentError(null);
    try {
      const payment = await createPayment({
        organizationId,
        userId,
        amount: parseFloat(total.toFixed(2)),
        currency,
        method,
        status: "completed",
        processorId: opts.processorId ?? null,
        processorResponse: opts.processorResponse ?? null,
        customerName: customerName.trim() || null,
        notes: opts.notes ?? null,
        items: cart,
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
      });
      hapticSuccess();
      setChargeDialog(false);
      setReceipt({ payment, businessName });
    } catch (err) {
      console.error("POS: payment record failed:", err);
      setPaymentError("Failed to record payment. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCardPayment = async () => {
    setProcessing(true);
    setPaymentError(null);
    try {
      // 1. Create session server-side
      const sessionRes = await fetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(total.toFixed(2)), currency }),
      });
      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        throw new Error(err.error ?? "Failed to initialize payment");
      }
      const { checkoutToken, testMode } = await sessionRes.json();

      // 2. Load SDK
      await loadPaymentScript();

      // 3. Listen for result before opening iframe
      const listener = async (event: MessageEvent) => {
        if (event.origin !== "https://secure.helcim.app") return;
        const { eventType, data: evData } = event.data ?? {};

        if (eventType === "PURCHASE") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setProcessing(true);
          try {
            // 4. Verify server-side
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                checkoutToken,
                transactionId: evData?.transaction?.transactionId,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.verified) throw new Error("Payment verification failed");

            await completePayment("card", {
              processorId: String(verifyData.transactionId ?? ""),
              processorResponse: verifyData.responseData,
            });
          } catch (err) {
            console.error("POS: card verify error:", err);
            setPaymentError("Payment could not be verified. Please check with your payment provider.");
            setProcessing(false);
          }
        } else if (eventType === "FAILED_PURCHASE") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setPaymentError("Card payment was declined.");
          setProcessing(false);
        } else if (eventType === "CANCEL_TRANSACTION" || eventType === "CLOSE_IFRAME") {
          window.removeEventListener("message", listener);
          paymentListenerRef.current = null;
          setProcessing(false);
        }
      };

      window.addEventListener("message", listener);
      paymentListenerRef.current = listener;

      // 5. Open hosted payment form
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).appendHelcimIframe?.(checkoutToken, testMode ? 1 : 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      setPaymentError(msg);
      setProcessing(false);
    }
  };

  const handleCashPayment = async () => {
    await completePayment("cash");
  };

  const handleOtherPayment = async () => {
    await completePayment("other", { notes: otherNote.trim() || undefined });
  };

  // ── If showing receipt ────────────────────────────────────────────────────

  if (receipt) {
    return (
      <ReceiptScreen
        data={receipt}
        onNewOrder={() => {
          clearCart();
          setReceipt(null);
        }}
      />
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

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
      <div className="flex flex-1 overflow-hidden h-full">
        {/* ── Left: Product grid ──────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-border">
          {/* Search + category bar */}
          <div className="shrink-0 border-b border-border">
            <div className="flex items-center gap-2 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            {/* Category tabs */}
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
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredProducts.length === 0 && !search ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <p className="text-sm">No products yet</p>
                <p className="text-xs">Add products in the Products page</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No results</p>
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
                {/* Custom item tile */}
                <button
                  type="button"
                  onClick={() => setCustomDialog(true)}
                  className="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-stone-400 transition-colors"
                  style={{ minHeight: 100 }}
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px]">Custom</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Cart ─────────────────────────────────────────────────── */}
        <div className="w-72 lg:w-80 flex flex-col shrink-0 bg-background">
          {/* Customer name */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5">
                <Receipt className="h-8 w-8 opacity-30" />
                <p className="text-xs">Tap products to add</p>
              </div>
            ) : (
              cart.map((item) => (
                <CartRow
                  key={item.id}
                  item={item}
                  onQtyChange={updateQty}
                  onRemove={removeItem}
                />
              ))
            )}
          </div>

          {/* Totals */}
          <div className="border-t border-border">
            {/* Discount row */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <button
                type="button"
                onClick={() => setDiscountDialog(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Tag className="h-3.5 w-3.5" />
                {discountAmount > 0 ? (
                  <span className="text-emerald-600 font-medium">
                    Discount: −{fmt(discountAmount)}
                  </span>
                ) : (
                  <span>Add discount</span>
                )}
              </button>
              {discountAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setDiscountValue("")}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Summary */}
            <div className="px-3 py-2.5 space-y-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>−{fmt(discountAmount)}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({taxRate}%)</span>
                  <span>{fmt(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>

            {/* Charge button */}
            <div className="px-3 pb-4">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  hapticLight();
                  setSelectedMethod(null);
                  setPaymentError(null);
                  setChargeDialog(true);
                }}
                className={cn(
                  "w-full rounded py-3.5 text-sm font-bold transition-colors",
                  cart.length === 0
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-stone-900 text-white hover:bg-stone-800 active:scale-98"
                )}
              >
                {cart.length === 0 ? "Add items to charge" : `Charge ${fmt(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Custom item dialog ─────────────────────────────────────────────── */}
      {customDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Custom Item</p>
              <button type="button" onClick={() => setCustomDialog(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Item name</label>
                <input
                  autoFocus
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Special order"
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Price ($)</label>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={addCustomItem}
                disabled={!customName.trim() || !customPrice}
                className="w-full rounded bg-stone-900 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-40 transition-colors"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discount dialog ────────────────────────────────────────────────── */}
      {discountDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Apply Discount</p>
              <button type="button" onClick={() => setDiscountDialog(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex rounded border border-border overflow-hidden">
                {(["percent", "dollar"] as const).map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium transition-colors",
                      i > 0 ? "border-l border-border" : "",
                      discountType === t ? "bg-stone-900 text-white" : "hover:bg-muted"
                    )}
                  >
                    {t === "percent" ? "Percent %" : "Dollar $"}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 5.00"}
                min="0"
                step={discountType === "percent" ? "1" : "0.01"}
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              {discountAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saves {fmt(discountAmount)} on this order
                </p>
              )}
              <button
                type="button"
                onClick={() => { hapticLight(); setDiscountDialog(false); }}
                className="w-full rounded bg-stone-900 py-2 text-sm text-white hover:bg-stone-800 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Charge / payment dialog ────────────────────────────────────────── */}
      {chargeDialog && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm rounded-t-xl sm:rounded-xl border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Charge {fmt(total)}</p>
              <button type="button" onClick={() => { if (!processing) setChargeDialog(false); }}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Method selector */}
              {!selectedMethod && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Select payment method</p>

                  {/* Card */}
                  <button
                    type="button"
                    disabled={!cardAvailable}
                    onClick={() => setSelectedMethod("card")}
                    className={cn(
                      "flex w-full items-center gap-3 rounded border px-4 py-3 text-left transition-colors",
                      cardAvailable
                        ? "border-border hover:bg-muted"
                        : "border-border opacity-50 cursor-not-allowed"
                    )}
                  >
                    <CreditCard className="h-5 w-5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Card Payment</p>
                      <p className="text-xs text-muted-foreground">
                        {cardAvailable ? "Credit or debit card" : "Cash only mode"}
                      </p>
                    </div>
                    {!cardAvailable && <AlertCircle className="h-4 w-4 text-amber-500" />}
                  </button>

                  {/* Cash */}
                  <button
                    type="button"
                    onClick={() => setSelectedMethod("cash")}
                    className="flex w-full items-center gap-3 rounded border border-border px-4 py-3 text-left hover:bg-muted transition-colors"
                  >
                    <Banknote className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Cash</p>
                      <p className="text-xs text-muted-foreground">Record cash payment</p>
                    </div>
                  </button>

                  {/* Other */}
                  <button
                    type="button"
                    onClick={() => setSelectedMethod("other")}
                    className="flex w-full items-center gap-3 rounded border border-border px-4 py-3 text-left hover:bg-muted transition-colors"
                  >
                    <MoreHorizontal className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Other</p>
                      <p className="text-xs text-muted-foreground">Check, transfer, gift card…</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Card flow */}
              {selectedMethod === "card" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                  {paymentError && (
                    <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {paymentError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleCardPayment}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {processing ? "Processing…" : `Pay ${fmt(total)}`}
                  </button>
                </div>
              )}

              {/* Cash flow */}
              {selectedMethod === "cash" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Amount tendered</label>
                    <input
                      autoFocus
                      type="number"
                      value={cashEntered}
                      onChange={(e) => setCashEntered(e.target.value)}
                      placeholder={fmt(total).replace("$", "")}
                      min={total}
                      step="0.01"
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {cashEntered && parseFloat(cashEntered) >= total && (
                    <div className="rounded bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                      <span className="text-muted-foreground text-xs">Change due: </span>
                      <span className="font-bold text-emerald-700">{fmt(cashChange)}</span>
                    </div>
                  )}
                  {paymentError && (
                    <p className="text-xs text-destructive">{paymentError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleCashPayment}
                    disabled={processing || !cashEntered || parseFloat(cashEntered) < total}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {processing ? "Recording…" : "Complete Sale"}
                  </button>
                </div>
              )}

              {/* Other flow */}
              {selectedMethod === "other" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Note (optional)</label>
                    <input
                      autoFocus
                      type="text"
                      value={otherNote}
                      onChange={(e) => setOtherNote(e.target.value)}
                      placeholder="e.g. Check #1234, Zelle transfer…"
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {paymentError && (
                    <p className="text-xs text-destructive">{paymentError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleOtherPayment}
                    disabled={processing}
                    className="w-full flex items-center justify-center gap-2 rounded bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-800 disabled:opacity-60 transition-colors"
                  >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {processing ? "Recording…" : "Complete Sale"}
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
