"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Search, Plus, Minus, X, Loader2, CreditCard, Banknote,
  MoreHorizontal, Printer, Check, User, AlertCircle, History,
  ShoppingCart, CornerDownLeft, Smartphone, Gift, ScanLine,
  Percent, Pencil, Trash2, MessageSquare, ArrowLeft,
  CheckCircle, ChevronRight, Mail, ShoppingBag, Coffee, Leaf,
  Snowflake, Sandwich, Package as PackageIcon, Star,
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

// ─── Local types ─────────────────────────────────────────────────────────────

interface POSLine {
  uid: string;
  productId: string;
  name: string;
  basePrice: number;
  price: number;
  qty: number;
  category?: string;
  notes: string | null;
  discount: { pct?: number; amount?: number; reason?: string } | null;
}

type Stage = "order" | "pay" | "receipt";
type PmtMethod = "card" | "cash" | "mobile" | "gift";

interface ReceiptData {
  payment: Payment;
  businessName: string;
  tipAmount: number;
  tipPct: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CAT_ICON_MAP: Record<string, typeof Coffee> = {
  coffee: Coffee, espresso: Coffee, brewed: Coffee, drinks: Coffee,
  tea: Leaf, teas: Leaf,
  cold: Snowflake, iced: Snowflake, frozen: Snowflake,
  food: Sandwich, meals: Sandwich, lunch: Sandwich, breakfast: Sandwich,
  retail: PackageIcon, merchandise: PackageIcon, goods: PackageIcon,
};

const DISCOUNT_PRESETS = [10, 15, 20, 50];
const DISCOUNT_REASONS = [
  { value: "", label: "Reason (optional)…" },
  { value: "staff", label: "Staff discount" },
  { value: "loyalty", label: "Loyalty reward" },
  { value: "comp", label: "Comp / on the house" },
  { value: "damaged", label: "Made incorrectly" },
  { value: "manager", label: "Manager override" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
function money(n: number) { return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function lineTotal(l: POSLine): number {
  const gross = l.price * l.qty;
  if (!l.discount) return gross;
  if (l.discount.pct) return Math.max(0, gross * (1 - l.discount.pct / 100));
  if (l.discount.amount) return Math.max(0, gross - l.discount.amount);
  return gross;
}

function catIcon(category: string) {
  const key = category.toLowerCase().trim();
  for (const [pattern, Icon] of Object.entries(CAT_ICON_MAP)) {
    if (key.includes(pattern)) return Icon;
  }
  return ShoppingBag;
}

function linesToCartItems(lines: POSLine[]): CartItem[] {
  return lines.map(l => ({
    id: l.productId,
    name: l.name + (l.notes ? ` (${l.notes})` : ""),
    price: l.price,
    quantity: l.qty,
    category: l.category,
  }));
}

// ─── Payment SDK loader ──────────────────────────────────────────────────────

function loadPaymentScript(errorMsg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject(); return; }
    const existing = document.querySelector("script[data-pay-sdk]");
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://secure.helcim.app/helcim-pay/services/start.js";
    script.setAttribute("data-pay-sdk", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(errorMsg));
    document.head.appendChild(script);
  });
}

// ─── Product Card ────────────────────────────────────────────────────────────

function ProductCard({ product, onTap }: { product: Product; onTap: () => void }) {
  const CatIcon = catIcon(product.category);
  return (
    <button
      type="button"
      onClick={onTap}
      className="group bg-card border border-border rounded text-left hover:border-stone-400 hover:shadow-sm transition-all flex flex-col relative p-2.5"
    >
      <div className="h-9 w-9 rounded flex items-center justify-center mb-2 bg-muted">
        <CatIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-[13px] font-semibold leading-tight">{product.name}</div>
      {product.description && (
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {product.description}
        </div>
      )}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className="font-mono text-[12.5px] font-semibold tabular-nums">
          {money(product.price)}
        </span>
        <span className="h-6 w-6 rounded border border-border bg-card group-hover:bg-stone-900 group-hover:text-white group-hover:border-stone-900 flex items-center justify-center transition-colors">
          <Plus className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

// ─── Cart Sidebar ────────────────────────────────────────────────────────────

function CartSidebar({
  cart,
  subtotal,
  tax,
  tip,
  tipPct,
  total,
  customerName,
  onSetCustomerName,
  onSetQty,
  onRemoveLine,
  onEditLine,
  onCharge,
}: {
  cart: POSLine[];
  subtotal: number;
  tax: number;
  tip: number;
  tipPct: number;
  total: number;
  customerName: string;
  onSetCustomerName: (v: string) => void;
  onSetQty: (uid: string, q: number) => void;
  onRemoveLine: (uid: string) => void;
  onEditLine: (uid: string) => void;
  onCharge: () => void;
}) {
  return (
    <aside className="w-72 lg:w-80 flex flex-col shrink-0 border-l border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ticket
        </span>
        <span className="text-[10.5px] text-muted-foreground ml-auto">{cart.length} items</span>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={customerName}
          onChange={e => onSetCustomerName(e.target.value)}
          placeholder="Walk-in (tap to name)"
          className="flex-1 bg-transparent text-[12.5px] font-medium outline-none placeholder:text-muted-foreground min-w-0 border-0 p-0"
        />
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center mb-2">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <p className="text-[12px] font-medium">Cart is empty</p>
            <p className="text-[11px] mt-0.5">Tap an item to start</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cart.map(l => {
              const gross = l.price * l.qty;
              const lt = lineTotal(l);
              const discAmt = gross - lt;
              return (
                <div
                  key={l.uid}
                  onClick={() => onEditLine(l.uid)}
                  className="px-3 py-2 hover:bg-muted/50 group cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold leading-tight">{l.name}</p>
                      {l.notes && (
                        <div className="text-[10.5px] text-amber-700 mt-1 leading-snug flex items-start gap-1">
                          <MessageSquare className="h-[10px] w-[10px] mt-[1px] shrink-0" />
                          <span className="break-words">{l.notes}</span>
                        </div>
                      )}
                      {l.discount && (
                        <div className="text-[10.5px] text-emerald-700 mt-1 leading-snug flex items-start gap-1 font-mono tabular-nums">
                          <Percent className="h-[10px] w-[10px] mt-[1px] shrink-0" />
                          <span>
                            {l.discount.pct ? `${l.discount.pct}% off` : `${money(l.discount.amount ?? 0)} off`}
                            {l.discount.reason && (
                              <span className="text-muted-foreground font-sans"> &middot; {l.discount.reason}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {discAmt > 0.005 && (
                        <span className="text-muted-foreground text-[10.5px] line-through font-mono tabular-nums block">
                          {money(gross)}
                        </span>
                      )}
                      <span className="font-mono text-[12.5px] font-semibold tabular-nums">{money(lt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => { hapticLight(); onSetQty(l.uid, l.qty - 1); }}
                      className="h-6 w-6 rounded border border-border hover:bg-muted flex items-center justify-center"
                    >
                      <Minus className="h-[11px] w-[11px]" />
                    </button>
                    <span className="text-[11.5px] font-semibold tabular-nums w-6 text-center">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => { hapticLight(); onSetQty(l.uid, l.qty + 1); }}
                      className="h-6 w-6 rounded border border-border hover:bg-muted flex items-center justify-center"
                    >
                      <Plus className="h-[11px] w-[11px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditLine(l.uid)}
                      className="ml-auto h-6 px-1.5 rounded border border-border bg-card hover:bg-muted text-[10px] font-medium inline-flex items-center gap-1 text-muted-foreground"
                    >
                      <Pencil className="h-[10px] w-[10px]" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { hapticLight(); onRemoveLine(l.uid); }}
                      className="h-6 w-6 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"
                    >
                      <Trash2 className="h-[11px] w-[11px]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="shrink-0 flex flex-col border-t border-border">
        <div className="px-4 py-2.5 space-y-1 text-[12px] font-mono">
          <TotalsRow label="Subtotal" value={money(subtotal)} />
          <TotalsRow label={`Tip (${tipPct}%)`} value={money(tip)} />
          <TotalsRow label="Tax" value={money(tax)} />
        </div>
        <button
          type="button"
          onClick={() => { hapticLight(); onCharge(); }}
          disabled={cart.length === 0}
          className="h-12 bg-stone-900 hover:bg-stone-800 disabled:bg-muted disabled:text-muted-foreground text-white text-[13px] font-semibold inline-flex items-center justify-between px-4 transition-colors"
        >
          <span>Charge</span>
          <span className="font-mono tabular-nums text-[15px]">{money(total)}</span>
        </button>
      </div>
    </aside>
  );
}

function TotalsRow({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(bold ? "font-semibold" : "text-muted-foreground", big && "text-[15px]")}>{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", big && "text-[18px]")}>{value}</span>
    </div>
  );
}

// ─── Line Editor Modal ───────────────────────────────────────────────────────

function LineEditorModal({
  line,
  onClose,
  onSave,
  onRemove,
}: {
  line: POSLine;
  onClose: () => void;
  onSave: (patch: Partial<POSLine>) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState(line.qty);
  const [notes, setNotes] = useState(line.notes ?? "");
  const [discKind, setDiscKind] = useState<"none" | "pct" | "amount">(
    line.discount?.pct ? "pct" : line.discount?.amount ? "amount" : "none"
  );
  const [discValue, setDiscValue] = useState(
    line.discount?.pct ?? line.discount?.amount ?? 0
  );
  const [discReason, setDiscReason] = useState(line.discount?.reason ?? "");

  const grossLine = line.price * qty;
  const discountAmt =
    discKind === "pct" ? grossLine * (discValue / 100) :
    discKind === "amount" ? Math.min(discValue, grossLine) : 0;
  const finalLine = Math.max(0, grossLine - discountAmt);

  const handleSave = () => {
    const patch: Partial<POSLine> = { qty, notes: notes.trim() || null };
    if (discKind === "pct") patch.discount = { pct: discValue, reason: discReason || undefined };
    else if (discKind === "amount") patch.discount = { amount: discValue, reason: discReason || undefined };
    else patch.discount = null;
    onSave(patch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-8" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-2xl border border-border w-[560px] max-w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-border">
          <div className="h-11 w-11 rounded flex items-center justify-center text-[20px] shrink-0 border border-border bg-muted">
            {(() => { const I = catIcon(line.category ?? ""); return <I className="h-5 w-5 text-muted-foreground" />; })()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Edit line</p>
            <p className="text-[15px] font-semibold leading-tight">{line.name}</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 font-mono tabular-nums">
              {money(line.price)}/ea
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center">
            <X className="h-[15px] w-[15px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Quantity */}
          <FieldGroup label="Quantity">
            <div className="inline-flex items-center border border-border rounded">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="h-8 w-8 hover:bg-muted flex items-center justify-center">
                <Minus className="h-[13px] w-[13px]" />
              </button>
              <span className="w-10 text-center text-[13px] font-mono font-semibold tabular-nums">{qty}</span>
              <button type="button" onClick={() => setQty(q => q + 1)} className="h-8 w-8 hover:bg-muted flex items-center justify-center">
                <Plus className="h-[13px] w-[13px]" />
              </button>
            </div>
          </FieldGroup>

          {/* Notes */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="h-[11px] w-[11px]" /> Notes for kitchen / bar
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Allergies, prep instructions, name on cup, for here vs to-go..."
              rows={2}
              className="w-full text-[13px] py-2 px-2.5 resize-none rounded border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Discount */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted border-b border-border flex items-center gap-2">
              <Percent className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Line discount</span>
              {discKind !== "none" && (
                <span className="ml-auto text-[11px] font-mono tabular-nums text-emerald-700 font-semibold">
                  &minus; {money(discountAmt)}
                </span>
              )}
            </div>
            <div className="p-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {(["none", "pct", "amount"] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setDiscKind(k);
                      if (k === "pct" && discValue === 0) setDiscValue(10);
                      if (k === "amount" && discValue === 0) setDiscValue(1);
                    }}
                    className={cn(
                      "px-3 py-2 rounded border text-[12.5px] leading-tight transition-colors min-w-[66px]",
                      discKind === k
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-card border-border hover:border-stone-400 text-foreground"
                    )}
                  >
                    {k === "none" ? "None" : k === "pct" ? "% off" : "$ off"}
                  </button>
                ))}
              </div>
              {discKind !== "none" && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 inline-flex items-center border border-border rounded h-8 overflow-hidden bg-card">
                      <span className="px-2 text-muted-foreground text-[12px] font-mono">
                        {discKind === "pct" ? "%" : "$"}
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={discValue}
                        onChange={e => setDiscValue(parseFloat(e.target.value) || 0)}
                        className="border-0 rounded-none py-0 px-1 flex-1 text-[13px] font-mono tabular-nums bg-transparent outline-none"
                      />
                    </div>
                    {discKind === "pct" && (
                      <div className="inline-flex border border-border rounded overflow-hidden">
                        {DISCOUNT_PRESETS.map((p, i) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setDiscValue(p)}
                            className={cn(
                              "h-8 px-2 text-[11.5px] font-mono tabular-nums",
                              discValue === p ? "bg-stone-900 text-white" : "bg-card hover:bg-muted",
                              i < DISCOUNT_PRESETS.length - 1 && "border-r border-border"
                            )}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={discReason}
                    onChange={e => setDiscReason(e.target.value)}
                    className="w-full text-[12.5px] py-1.5 px-2 rounded border border-border bg-background outline-none"
                  >
                    {DISCOUNT_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted flex items-center gap-2">
          <button
            type="button"
            onClick={() => { onRemove(); onClose(); }}
            className="h-8 px-2.5 rounded border border-border bg-card hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-[12px] font-medium inline-flex items-center gap-1.5"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Line total</p>
            <p className="text-[15px] font-mono font-semibold tabular-nums">
              {discKind !== "none" && (
                <span className="text-muted-foreground line-through font-normal mr-1.5 text-[12px]">{money(grossLine)}</span>
              )}
              {money(finalLine)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="h-8 px-3 rounded bg-stone-900 hover:bg-stone-800 text-white text-[12px] font-semibold inline-flex items-center gap-1.5"
          >
            <Check className="h-[13px] w-[13px]" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// ─── Pay Overlay ─────────────────────────────────────────────────────────────

function PayOverlay({
  cart,
  subtotal,
  tax,
  tip,
  tipPct,
  setTipPct,
  total,
  payMethod,
  setPayMethod,
  customerName,
  onBack,
  onComplete,
  cardAvailable,
  processing,
  paymentError,
  onCardPayment,
}: {
  cart: POSLine[];
  subtotal: number;
  tax: number;
  tip: number;
  tipPct: number;
  setTipPct: (v: number) => void;
  total: number;
  payMethod: PmtMethod;
  setPayMethod: (v: PmtMethod) => void;
  customerName: string;
  onBack: () => void;
  onComplete: () => void;
  cardAvailable: boolean;
  processing: boolean;
  paymentError: string | null;
  onCardPayment: () => void;
}) {
  const [cashTaken, setCashTaken] = useState<number | null>(null);
  const [splits, setSplits] = useState(1);

  const cashOptions = useMemo(() => {
    return [
      Math.ceil(total),
      Math.ceil(total / 5) * 5,
      Math.ceil(total / 10) * 10,
      Math.ceil(total / 20) * 20,
    ].filter((v, i, a) => a.indexOf(v) === i && v >= total);
  }, [total]);

  const methods: { id: PmtMethod; label: string; icon: typeof CreditCard; sub: string }[] = [
    { id: "card", label: "Card", icon: CreditCard, sub: cardAvailable ? "Tap, insert, or swipe" : "Not configured" },
    { id: "cash", label: "Cash", icon: Banknote, sub: "Open drawer" },
    { id: "mobile", label: "Mobile Pay", icon: Smartphone, sub: "Apple / Google Pay" },
    { id: "gift", label: "Gift Card", icon: Gift, sub: "Scan or enter code" },
  ];

  const canCharge =
    payMethod === "cash" ? (cashTaken != null && cashTaken >= total) :
    payMethod === "card" ? cardAvailable :
    true;

  const handleCharge = () => {
    if (payMethod === "card") {
      onCardPayment();
    } else {
      onComplete();
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-muted flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center px-6 gap-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="h-10 px-3 rounded border border-border hover:bg-muted inline-flex items-center gap-2 text-[13px] font-medium"
        >
          <ArrowLeft className="h-[15px] w-[15px]" /> Back to order
        </button>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Checkout</p>
          <p className="text-[15px] font-semibold">{cart.length} items{customerName ? ` · ${customerName}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Total</p>
          <p className="text-[22px] font-semibold tabular-nums">{money(total)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto grid grid-cols-[1fr_380px] min-h-0">
        {/* Left: method + tip + split */}
        <div className="p-8 overflow-auto">
          <div className="max-w-[640px] mx-auto space-y-8">
            <section>
              <SectionLabel>Tender</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {methods.map(m => {
                  const disabled = m.id === "card" && !cardAvailable;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => !disabled && setPayMethod(m.id)}
                      disabled={disabled}
                      className={cn(
                        "p-5 rounded-lg border-2 text-left transition-colors",
                        payMethod === m.id
                          ? "border-stone-900 bg-stone-900 text-white"
                          : disabled
                            ? "border-border bg-card opacity-50 cursor-not-allowed"
                            : "border-border bg-card hover:border-stone-400"
                      )}
                    >
                      <m.icon className="h-[22px] w-[22px]" />
                      <p className="text-[15px] font-semibold mt-3">{m.label}</p>
                      <p className={cn("text-[11.5px] mt-0.5", payMethod === m.id ? "text-white/70" : "text-muted-foreground")}>
                        {m.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
              {paymentError && (
                <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive mt-3">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{paymentError}
                </div>
              )}
            </section>

            <section>
              <SectionLabel>Tip</SectionLabel>
              <div className="grid grid-cols-5 gap-2">
                {[0, 10, 15, 20, 25].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTipPct(p)}
                    className={cn(
                      "py-4 rounded-lg border text-center transition-colors",
                      tipPct === p
                        ? "bg-stone-900 border-stone-900 text-white"
                        : "bg-card border-border hover:border-stone-400"
                    )}
                  >
                    <p className="text-[16px] font-semibold">{p === 0 ? "None" : `${p}%`}</p>
                    {p > 0 && (
                      <p className={cn("text-[11px] mt-0.5 tabular-nums", tipPct === p ? "text-white/70" : "text-muted-foreground")}>
                        {money(subtotal * p / 100)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {payMethod === "cash" && (
              <section>
                <SectionLabel>Cash tendered</SectionLabel>
                <div className="grid grid-cols-4 gap-2">
                  {cashOptions.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCashTaken(v)}
                      className={cn(
                        "py-4 rounded-lg border text-center transition-colors",
                        cashTaken === v
                          ? "bg-stone-900 border-stone-900 text-white"
                          : "bg-card border-border hover:border-stone-400"
                      )}
                    >
                      <p className="text-[16px] font-semibold tabular-nums">{money(v)}</p>
                    </button>
                  ))}
                </div>
                {cashTaken != null && cashTaken >= total && (
                  <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
                    <Banknote className="h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="text-[12px] text-emerald-700 font-semibold uppercase tracking-wide">Change owed</p>
                      <p className="text-[22px] font-bold text-emerald-900 tabular-nums">{money(cashTaken - total)}</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <SectionLabel>Split</SectionLabel>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSplits(n)}
                    className={cn(
                      "flex-1 py-3 rounded-lg border text-center",
                      splits === n
                        ? "bg-stone-900 border-stone-900 text-white"
                        : "bg-card border-border hover:border-stone-400"
                    )}
                  >
                    <p className="text-[14px] font-semibold">{n === 1 ? "Single" : `${n} ways`}</p>
                    {n > 1 && (
                      <p className="text-[11px] tabular-nums mt-0.5 opacity-70">{money(total / n)} each</p>
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Right: summary */}
        <aside className="border-l border-border bg-card flex flex-col overflow-hidden">
          <div className="p-5 border-b border-border">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Order summary</p>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {cart.map(l => (
              <div key={l.uid} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium">{l.name}</p>
                  {l.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{l.notes}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">&times; {l.qty}</p>
                </div>
                <span className="text-[13px] font-semibold tabular-nums">{money(l.price * l.qty)}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 space-y-1.5 text-[13px] border-t border-border bg-muted">
            <TotalsRow label="Subtotal" value={money(subtotal)} />
            <TotalsRow label={`Tip (${tipPct}%)`} value={money(tip)} />
            <TotalsRow label="Tax (8.75%)" value={money(tax)} />
            <div className="h-px bg-border my-2" />
            <TotalsRow label="Total" value={money(total)} bold big />
          </div>
          <button
            type="button"
            onClick={handleCharge}
            disabled={!canCharge || processing}
            className="h-16 bg-stone-900 hover:bg-stone-800 disabled:bg-muted disabled:text-muted-foreground text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            {processing ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <CheckCircle className="h-[18px] w-[18px]" />
            )}
            {processing ? "Processing…" : `Charge ${money(total)}`}
          </button>
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3">{children}</p>;
}

// ─── Receipt Overlay ─────────────────────────────────────────────────────────

function ReceiptOverlay({ data, onNewOrder }: { data: ReceiptData; onNewOrder: () => void }) {
  const { payment, businessName, tipAmount, tipPct } = data;
  const now = new Date(payment.createdAt);
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const methodLabel: Record<string, string> = { card: "Card", cash: "Cash", other: "Other" };

  return (
    <div className="absolute inset-0 z-30 bg-muted flex flex-col items-center justify-center p-8 overflow-auto">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <Check className="h-9 w-9 text-emerald-700" strokeWidth={2.4} />
        </div>
        <p className="text-[24px] font-semibold">Paid {money(payment.amount)}</p>
        <p className="text-[14px] text-muted-foreground mt-1">
          {payment.customerName ? `${payment.customerName} · ` : ""}
          {dateStr}
        </p>

        {/* Receipt card */}
        <div className="bg-card border border-border rounded-lg shadow-sm w-full mt-6 p-5 font-mono text-[12px]">
          <div className="text-center border-b border-dashed border-muted-foreground/30 pb-3 mb-3">
            <p className="font-sans text-[14px] font-semibold">{businessName || "Your Business"}</p>
            <p className="text-[11px] text-muted-foreground">{dateStr} &middot; {timeStr}</p>
            {payment.customerName && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{payment.customerName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            {payment.items?.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="truncate">{item.quantity}&times; {item.name}</span>
                  <span className="tabular-nums">{money(item.price * item.quantity)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-muted-foreground/30 my-3" />
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {money(payment.amount - payment.taxAmount - tipAmount + payment.discountAmount)}
              </span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between">
                <span>Tip {tipPct}%</span>
                <span className="tabular-nums">{money(tipAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax</span>
              <span className="tabular-nums">{money(payment.taxAmount)}</span>
            </div>
            {payment.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span className="tabular-nums">&minus;{money(payment.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-[13px] mt-1 pt-1 border-t border-muted-foreground/30">
              <span>Total</span>
              <span className="tabular-nums">{money(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span className="capitalize">{methodLabel[payment.method] ?? payment.method}</span>
            </div>
          </div>
          <p className="text-center text-[10.5px] text-muted-foreground mt-3 font-sans">Thank you!</p>
        </div>

        <div className="flex gap-2 mt-6 w-full">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 h-12 rounded-lg border border-border bg-card hover:bg-muted text-[13px] font-medium inline-flex items-center justify-center gap-2"
          >
            <Printer className="h-[15px] w-[15px]" /> Print
          </button>
          <button
            type="button"
            className="flex-1 h-12 rounded-lg border border-border bg-card hover:bg-muted text-[13px] font-medium inline-flex items-center justify-center gap-2"
          >
            <Mail className="h-[15px] w-[15px]" /> Email
          </button>
        </div>
        <button
          type="button"
          onClick={() => { hapticSuccess(); onNewOrder(); }}
          className="mt-3 w-full h-14 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" /> New order
        </button>
      </div>
    </div>
  );
}

// ─── Orders Tab (preserved) ──────────────────────────────────────────────────

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
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(searchInput), 500);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    setOrders([]);
    setOffset(0);
    setHasMore(true);
    if (!searchQuery) {
      const cached = getCached<Payment[]>(ORDERS_CACHE_KEY);
      if (cached) { setOrders(cached); setLoading(false); }
    }
    getRecentPayments(organizationId, ORDERS_PAGE_SIZE, 0, searchQuery || undefined)
      .then(data => {
        setOrders(data);
        setOffset(data.length);
        setHasMore(data.length === ORDERS_PAGE_SIZE);
        if (!searchQuery) setCache(ORDERS_CACHE_KEY, data);
      })
      .catch(err => console.error("Orders: failed to load:", err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, searchQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await getRecentPayments(organizationId, ORDERS_NEXT_SIZE, offset, searchQuery || undefined);
      setOrders(prev => [...prev, ...data]);
      setOffset(o => o + data.length);
      setHasMore(data.length === ORDERS_NEXT_SIZE);
    } catch (err) {
      console.error("Orders: failed to load more:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [organizationId, offset, hasMore, loadingMore, searchQuery]);

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
    setOrders(prev => prev.map(p => p.id === updated.id ? updated : p));
    setRefundTarget(null);
    onPaymentUpdated(updated);
  };

  const sentinelIndex = useMemo(() => Math.max(0, orders.length - 10), [orders.length]);

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
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

function OrderRow({ payment, onRefund }: { payment: Payment; onRefund: (p: Payment) => void }) {
  const t = useT();
  const isRefunded = payment.status === "refunded";
  if (payment.amount < 0) return null;

  return (
    <div className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isRefunded ? "bg-red-50 text-red-500" : "bg-muted text-muted-foreground"
        )}>
          {payment.method === "card" && <CreditCard className="h-4 w-4" />}
          {payment.method === "cash" && <Banknote className="h-4 w-4" />}
          {payment.method === "other" && <MoreHorizontal className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold tabular-nums">{money(payment.amount)}</span>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              isRefunded ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
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
              {payment.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}
            </p>
          )}
          {isRefunded && payment.refundAmount != null && (
            <div className="mt-1 text-[11px] text-red-500 space-y-0.5">
              <p>{t("pos.orders.refunded")} {money(payment.refundAmount)}{payment.refundedAt ? ` ${t("pos.orders.onDate")} ${fmtDate(payment.refundedAt)}` : ""}</p>
              {payment.refundReason && <p className="text-muted-foreground">{t("pos.orders.reason")} {payment.refundReason}</p>}
            </div>
          )}
        </div>
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

// ─── Refund Dialog (preserved) ───────────────────────────────────────────────

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

  const refundAmt = mode === "full"
    ? payment.amount
    : Math.min(parseFloat(partialAmount) || 0, payment.amount);

  const canSubmit = mode === "full"
    ? true
    : (parseFloat(partialAmount) > 0 && parseFloat(partialAmount) <= payment.amount);

  const handleRefund = async () => {
    setProcessing(true);
    try {
      await refundPayment(payment.id, mode === "partial" ? refundAmt : undefined, reason.trim() || undefined);
    } catch (err) {
      setProcessing(false);
      toast.error(t("pos.refund.failed"), { description: err instanceof Error ? err.message : String(err) });
      return;
    }
    setProcessing(false);
    hapticSuccess();
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
          <div className="rounded border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1">
            <div className="flex justify-between font-semibold">
              <span>{t("pos.refund.originalTotal")}</span>
              <span>{money(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span className="capitalize">{payment.method} &middot; {fmtDate(payment.createdAt)}</span>
              {payment.customerName && <span>{payment.customerName}</span>}
            </div>
          </div>
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
                  {m === "full" ? `${t("pos.refund.full")} — ${money(payment.amount)}` : t("pos.refund.partial")}
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
                  onChange={e => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  max={payment.amount}
                  step="0.01"
                  className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium">{t("pos.refund.reason")}</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t("pos.refund.reasonPlaceholder")}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={handleRefund}
            disabled={processing || !canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded bg-destructive py-3 text-sm font-bold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
            {processing ? t("pos.refund.processing") : `${t("pos.refund.refundButton")} ${money(refundAmt)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main POS Page ───────────────────────────────────────────────────────────

type ActiveTab = "register" | "orders";

export default function POSPage() {
  const t = useT();
  const { organizationId } = usePermissions();

  // Data loading
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [businessName, setBusinessName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cardAvailable, setCardAvailable] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>("register");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [customerName, setCustomerName] = useState("");
  const [tipPct, setTipPct] = useState(15);

  // Cart
  const [cart, setCart] = useState<POSLine[]>([]);
  const [editLineUid, setEditLineUid] = useState<string | null>(null);

  // Payment flow
  const [stage, setStage] = useState<Stage>("order");
  const [payMethod, setPayMethod] = useState<PmtMethod>("card");
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Receipt
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // Orders tab refresh
  const [ordersKey, setOrdersKey] = useState(0);

  const paymentListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (token) setUserId(token.slice(0, 36));

    getProducts()
      .then(setProducts)
      .catch(err => console.error("POS: failed to load products:", err))
      .finally(() => setLoading(false));

    getPaymentConfig()
      .then(({ taxRate: tr, currency: cur }) => { setTaxRate(tr); setCurrency(cur); })
      .catch(() => {});

    fetch("/api/payments/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 0.01, currency: "USD" }),
    })
      .then(r => { if (r.status === 503) setCardAvailable(false); })
      .catch(() => setCardAvailable(false));
  }, []);

  useEffect(() => {
    return () => {
      if (paymentListenerRef.current) {
        window.removeEventListener("message", paymentListenerRef.current);
      }
    };
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
    return ["All", ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === "All" || p.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [products, search, activeCategory]);

  const subtotal = cart.reduce((s, l) => s + lineTotal(l), 0);
  const tax = subtotal * (taxRate / 100 || 0.0875);
  const tip = subtotal * (tipPct / 100);
  const total = subtotal + tax + tip;

  // ── Cart actions ────────────────────────────────────────────────────────────

  const addToCart = useCallback((product: Product) => {
    hapticLight();
    setCart(prev => {
      const existing = prev.find(l => l.productId === product.id && !l.notes && !l.discount);
      if (existing) {
        return prev.map(l => l.uid === existing.uid ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...prev, {
        uid: uid(),
        productId: product.id,
        name: product.name,
        basePrice: product.price,
        price: product.price,
        qty: 1,
        category: product.category,
        notes: null,
        discount: null,
      }];
    });
  }, []);

  const setQty = useCallback((lineUid: string, q: number) => {
    setCart(prev => q <= 0 ? prev.filter(l => l.uid !== lineUid) : prev.map(l => l.uid === lineUid ? { ...l, qty: q } : l));
  }, []);

  const removeLine = useCallback((lineUid: string) => {
    setCart(prev => prev.filter(l => l.uid !== lineUid));
  }, []);

  const updateLine = useCallback((lineUid: string, patch: Partial<POSLine>) => {
    setCart(prev => prev.map(l => l.uid === lineUid ? { ...l, ...patch } : l));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setTipPct(15);
    setStage("order");
  }, []);

  // ── Payment ─────────────────────────────────────────────────────────────────

  const completePayment = async (
    method: "card" | "cash" | "other",
    opts: { processorId?: string; processorResponse?: Record<string, unknown>; notes?: string } = {}
  ) => {
    if (!organizationId || !userId) return;
    setProcessing(true);
    setPaymentError(null);
    try {
      const discountAmount = cart.reduce((s, l) => {
        const gross = l.price * l.qty;
        return s + (gross - lineTotal(l));
      }, 0);

      const itemsForDb = linesToCartItems(cart);
      const paymentAmount = parseFloat(total.toFixed(2));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const optimisticPayment: Payment = {
        id: crypto.randomUUID(),
        organizationId,
        userId,
        amount: paymentAmount,
        currency,
        method,
        status: "completed",
        processorId: opts.processorId ?? null,
        processorResponse: opts.processorResponse ? JSON.stringify(opts.processorResponse) : null,
        customerName: customerName.trim() || null,
        notes: tip > 0 ? `Tip: ${money(tip)} (${tipPct}%)${opts.notes ? ` | ${opts.notes}` : ""}` : (opts.notes ?? null),
        items: itemsForDb,
        taxAmount: parseFloat(tax.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        refundAmount: null,
        refundReason: null,
        createdAt: new Date().toISOString(),
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      await createPayment({
        organizationId,
        userId,
        amount: optimisticPayment.amount,
        currency,
        method,
        status: "completed",
        processorId: opts.processorId ?? null,
        processorResponse: opts.processorResponse ? JSON.stringify(opts.processorResponse) : null,
        customerName: customerName.trim() || null,
        notes: optimisticPayment.notes,
        items: JSON.stringify(itemsForDb),
        taxAmount: optimisticPayment.taxAmount,
        discountAmount: optimisticPayment.discountAmount,
      });

      hapticSuccess();
      setOrdersKey(k => k + 1);
      setReceipt({ payment: optimisticPayment, businessName, tipAmount: tip, tipPct });
      setStage("receipt");
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

  const handlePayComplete = () => {
    const methodMap: Record<PmtMethod, "card" | "cash" | "other"> = {
      card: "card", cash: "cash", mobile: "other", gift: "other",
    };
    completePayment(methodMap[payMethod]);
  };

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Editing line ────────────────────────────────────────────────────────────

  const editingLine = editLineUid ? cart.find(l => l.uid === editLineUid) ?? null : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
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
        <OrdersTab key={ordersKey} organizationId={organizationId} onPaymentUpdated={() => {}} />
      )}

      {/* Register tab */}
      {activeTab === "register" && (
        <div className="flex flex-1 overflow-hidden h-full relative">
          {/* Main content area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Top bar */}
            <div className="h-14 bg-card border-b border-border px-5 flex items-center gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-tight">New order</p>
                <p className="text-[11.5px] text-muted-foreground leading-tight">Register</p>
              </div>
              <div className="relative flex-1 max-w-[360px] ml-6">
                <Search className="h-[14px] w-[14px] absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search menu or scan..."
                  className="w-full pl-8 pr-3 py-1.5 text-[13px] rounded border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" className="h-8 w-8 rounded border border-border bg-card hover:bg-muted inline-flex items-center justify-center text-muted-foreground" title="Scan">
                  <ScanLine className="h-[15px] w-[15px]" />
                </button>
                <button type="button" className="h-8 w-8 rounded border border-border bg-card hover:bg-muted inline-flex items-center justify-center text-muted-foreground" title="More">
                  <MoreHorizontal className="h-[15px] w-[15px]" />
                </button>
              </div>
            </div>

            {/* Category tabs */}
            <div className="bg-card border-b border-border px-5 flex items-center gap-0 overflow-x-auto shrink-0">
              {categories.map(cat => {
                const active = cat === activeCategory && !search;
                const CIcon = cat === "All" ? ShoppingBag : catIcon(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { hapticLight(); setActiveCategory(cat); setSearch(""); }}
                    className={cn(
                      "h-10 px-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium shrink-0 transition-colors border-b-2",
                      active
                        ? "text-foreground border-foreground"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    )}
                  >
                    <CIcon className="h-[13px] w-[13px]" />
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-auto bg-muted/50 p-5">
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-[13px] font-semibold">
                  {search ? `Matches for "${search}"` : activeCategory}
                </h2>
                <span className="text-[11.5px] text-muted-foreground">{filteredProducts.length} items</span>
              </div>
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <ShoppingBag className="h-8 w-8 opacity-30" />
                  <p className="text-sm">{search ? "No results found" : "No products in this category"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filteredProducts.map(p => (
                    <ProductCard key={p.id} product={p} onTap={() => addToCart(p)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart sidebar */}
          <CartSidebar
            cart={cart}
            subtotal={subtotal}
            tax={tax}
            tip={tip}
            tipPct={tipPct}
            total={total}
            customerName={customerName}
            onSetCustomerName={setCustomerName}
            onSetQty={setQty}
            onRemoveLine={removeLine}
            onEditLine={setEditLineUid}
            onCharge={() => { if (cart.length) setStage("pay"); }}
          />

          {/* Pay overlay */}
          {stage === "pay" && (
            <PayOverlay
              cart={cart}
              subtotal={subtotal}
              tax={tax}
              tip={tip}
              tipPct={tipPct}
              setTipPct={setTipPct}
              total={total}
              payMethod={payMethod}
              setPayMethod={setPayMethod}
              customerName={customerName}
              onBack={() => { setStage("order"); setPaymentError(null); }}
              onComplete={handlePayComplete}
              cardAvailable={cardAvailable}
              processing={processing}
              paymentError={paymentError}
              onCardPayment={handleCardPayment}
            />
          )}

          {/* Receipt overlay */}
          {stage === "receipt" && receipt && (
            <ReceiptOverlay
              data={receipt}
              onNewOrder={() => { clearCart(); setReceipt(null); }}
            />
          )}

          {/* Line editor modal */}
          {editingLine && (
            <LineEditorModal
              line={editingLine}
              onClose={() => setEditLineUid(null)}
              onSave={patch => updateLine(editingLine.uid, patch)}
              onRemove={() => removeLine(editingLine.uid)}
            />
          )}
        </div>
      )}
    </div>
  );
}
