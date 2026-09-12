"use client";

import { createElement, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Search, Plus, Minus, X, CreditCard, Banknote, MoreHorizontal, Printer, Check, User, AlertCircle, History, ShoppingCart, CornerDownLeft, Smartphone, Gift, ScanLine, Percent, Pencil, Trash2, MessageSquare, ArrowLeft, CheckCircle, ChevronRight, Mail, ShoppingBag, Coffee, Leaf, Snowflake, Sandwich, Package as PackageIcon, Star, WifiOff } from "lucide-react";
import { cn, uuid } from "@/lib/utils";
import { getProducts } from "@/lib/db/products";
import { createPayment, refundPayment } from "@/lib/spacetimedb/actions";
import { getPaymentConfig, getRecentPayments } from "@/lib/db/payments";
import { getCached, setCache } from "@/lib/cache";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { usePermissions } from "@/lib/context/permissions";
import { useT, useI18n } from "@/lib/i18n/context";
import { useCurrency } from "@/lib/currency";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import type { Product, CartItem, Payment } from "@/lib/types";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { Callout } from "@/components/ui/callout";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge, STATUS_TONE_TEXT } from "@/components/ui/status-badge";

/** Two-line touch tiles (tip %, cash, split) built on SegmentedControl chips. */
const TILE_SEGMENT = "[&>button]:h-auto [&>button]:flex-col [&>button]:gap-0.5";

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

/**
 * WARNING: Storing card numbers locally is NOT PCI-compliant.
 * This is for demo/MVP purposes only. In production, use a
 * PCI-compliant tokenization service (e.g. Stripe, Square, Helcim).
 */
interface PendingCardPayment {
  id: string;
  cardNumberLast4: string;
  cardNumberFull: string; // PCI non-compliant — demo only
  amount: number;
  items: { name: string; price: number; quantity: number; category?: string }[];
  customerName: string | null;
  tipPct: number;
  tipAmount: number;
  taxAmount: number;
  createdAt: string;
}

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
  { value: "", labelKey: "pos.discountReasons.none" },
  { value: "staff", labelKey: "pos.discountReasons.staff" },
  { value: "loyalty", labelKey: "pos.discountReasons.loyalty" },
  { value: "comp", labelKey: "pos.discountReasons.comp" },
  { value: "damaged", labelKey: "pos.discountReasons.damaged" },
  { value: "manager", labelKey: "pos.discountReasons.manager" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }
// Currency-aware money formatter. Call at the top level of a component (hook rules)
// to get a `money(n)` function bound to the org's active currency.
function useMoney() {
  const { format } = useCurrency();
  return (n: number) => format(Number.isFinite(n) ? n : 0);
}
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

function getLocalizedName(product: Product, locale: string): string {
  if (product.nameI18n) {
    try {
      const translations = typeof product.nameI18n === "string"
        ? JSON.parse(product.nameI18n)
        : product.nameI18n;
      if (translations[locale]) return translations[locale];
    } catch { /* fallback to default name */ }
  }
  return product.name;
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

function ProductCard({ product, onTap, locale }: { product: Product; onTap: () => void; locale: string }) {
  const money = useMoney();
  const displayName = getLocalizedName(product, locale);
  const initial = displayName.charAt(0).toUpperCase();
  return (
    <button
      type="button"
      onClick={onTap}
      className="group bg-card border border-border rounded-lg text-left hover:border-muted-foreground transition-all flex flex-col relative p-2.5"
    >
      <div className="flex items-start gap-2 mb-2">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={displayName}
            className="h-12 w-12 rounded-lg object-cover shrink-0 bg-muted"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0 bg-muted">
            <span className="text-[16px] font-semibold text-muted-foreground">{initial}</span>
          </div>
        )}
        <div className="h-6 w-6 rounded-lg flex items-center justify-center bg-muted/60 ml-auto shrink-0">
          {createElement(catIcon(product.category), { className: "h-3 w-3 text-muted-foreground" })}
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight">{displayName}</div>
      {product.description && (
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {product.description}
        </div>
      )}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className="font-mono text-[12.5px] font-semibold tabular-nums">
          {money(product.price)}
        </span>
        <span className="h-6 w-6 rounded-lg border border-border bg-card group-hover:bg-foreground group-hover:text-background group-hover:border-foreground flex items-center justify-center transition-colors">
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
  const t = useT();
  const money = useMoney();
  return (
    <aside className="hidden md:flex w-72 lg:w-80 flex-col shrink-0 border-l border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <Eyebrow as="span">
          {t("pos.cart.ticket")}
        </Eyebrow>
        <span className="text-[10.5px] text-muted-foreground ml-auto">{t("pos.cart.itemsCount").replace("{count}", String(cart.length))}</span>
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
          placeholder={t("pos.cart.walkInPlaceholder")}
          className="flex-1 bg-transparent text-[12.5px] font-medium outline-none placeholder:text-muted-foreground min-w-0 border-0 p-0"
        />
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <EmptyState
            compact
            className="h-full p-6"
            icon={ShoppingBag}
            title={t("pos.cart.empty")}
            description={t("pos.cart.tapToStart")}
          />
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
                            {l.discount.pct ? t("pos.cart.pctOff").replace("{pct}", String(l.discount.pct)) : t("pos.cart.amountOff").replace("{amount}", money(l.discount.amount ?? 0))}
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
                    <Button type="button" variant="outline" size="icon-xs" onClick={() => onSetQty(l.uid, l.qty - 1)}>
                      <Minus className="size-[11px]" />
                    </Button>
                    <span className="text-[11.5px] font-semibold tabular-nums w-6 text-center">{l.qty}</span>
                    <Button type="button" variant="outline" size="icon-xs" onClick={() => onSetQty(l.uid, l.qty + 1)}>
                      <Plus className="size-[11px]" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onEditLine(l.uid)}
                      className="ml-auto px-1.5 text-[10px] text-muted-foreground"
                    >
                      <Pencil className="size-[10px]" /> {t("common.edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveLine(l.uid)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-[11px]" />
                    </Button>
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
          <TotalsRow label={t("pos.register.subtotal")} value={money(subtotal)} />
          <TotalsRow label={t("pos.cart.tipLabel").replace("{pct}", String(tipPct))} value={money(tip)} />
          <TotalsRow label={t("pos.register.taxShort")} value={money(tax)} />
        </div>
        <Button
          type="button"
          onClick={onCharge}
          disabled={cart.length === 0}
          className="h-12 w-full justify-between rounded-none px-4 text-[13px] font-semibold"
        >
          <span>{t("pos.register.charge")}</span>
          <span className="font-mono tabular-nums text-[15px]">{money(total)}</span>
        </Button>
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

function LineEditorPanel({
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
  const t = useT();
  const money = useMoney();
  const { symbol } = useCurrency();
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
    <>
      <DynamicUIElementHeader>
        <DynamicUIElementTitle mobileTitle={t("pos.lineEditor.mobileTitle").replace("{name}", line.name)}>
          {t("pos.lineEditor.title")}
        </DynamicUIElementTitle>
        <DynamicUIElementDescription>
          {line.name} · {t("pos.lineEditor.perEach").replace("{price}", money(line.price))}
        </DynamicUIElementDescription>
      </DynamicUIElementHeader>

      <div className="space-y-4 mt-2">
        {/* Quantity */}
        <FieldGroup label={t("pos.lineEditor.quantity")}>
          <div className="inline-flex items-center border border-border rounded-lg">
            <Button type="button" variant="ghost" size="icon" className="rounded-none" onClick={() => setQty(q => Math.max(1, q - 1))}>
              <Minus className="size-[13px]" />
            </Button>
            <span className="w-10 text-center text-[13px] font-mono font-semibold tabular-nums">{qty}</span>
            <Button type="button" variant="ghost" size="icon" className="rounded-none" onClick={() => setQty(q => q + 1)}>
              <Plus className="size-[13px]" />
            </Button>
          </div>
        </FieldGroup>

        {/* Notes */}
        <div>
          <Eyebrow size="xs" className="mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="h-[11px] w-[11px]" /> {t("pos.lineEditor.notesLabel")}
          </Eyebrow>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t("pos.lineEditor.notesPlaceholder")}
            rows={2}
            className="text-[13px] resize-none"
          />
        </div>

        {/* Discount */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted border-b border-border flex items-center gap-2">
            <Percent className="h-3 w-3 text-muted-foreground" />
            <Eyebrow as="span" size="xs">{t("pos.lineEditor.lineDiscount")}</Eyebrow>
            {discKind !== "none" && (
              <span className="ml-auto text-[11px] font-mono tabular-nums text-emerald-700 font-semibold">
                &minus; {money(discountAmt)}
              </span>
            )}
          </div>
          <div className="p-3 space-y-2.5">
            <SegmentedControl<"none" | "pct" | "amount">
              fullWidth
              aria-label={t("pos.lineEditor.lineDiscount")}
              options={[
                { value: "none", label: t("pos.lineEditor.discNone") },
                { value: "pct", label: t("pos.lineEditor.discPct") },
                { value: "amount", label: t("pos.lineEditor.discAmount").replace("{symbol}", symbol) },
              ]}
              value={discKind}
              onChange={(k) => {
                setDiscKind(k);
                if (k === "pct" && discValue === 0) setDiscValue(10);
                if (k === "amount" && discValue === 0) setDiscValue(1);
              }}
            />
            {discKind !== "none" && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex-1 min-w-[100px] inline-flex items-center border border-border rounded h-8 overflow-hidden bg-card">
                    <span className="px-2 text-muted-foreground text-[12px] font-mono">
                      {discKind === "pct" ? "%" : symbol}
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
                    <SegmentedControl
                      aria-label={t("pos.lineEditor.discPct")}
                      className="font-mono tabular-nums [&>button]:px-2 [&>button]:text-[11.5px]"
                      options={DISCOUNT_PRESETS.map((p) => ({ value: String(p), label: `${p}%` }))}
                      value={String(discValue)}
                      onChange={(v) => setDiscValue(Number(v))}
                    />
                  )}
                </div>
                <select
                  value={discReason}
                  onChange={e => setDiscReason(e.target.value)}
                  className="w-full text-[12.5px] py-1.5 px-2 rounded border border-border bg-background outline-none"
                >
                  {DISCOUNT_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => { onRemove(); onClose(); }}
            className="text-[12px] hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3" /> {t("pos.lineEditor.remove")}
          </Button>
          <div className="ml-auto text-right">
            <Eyebrow size="xs">{t("pos.lineEditor.lineTotal")}</Eyebrow>
            <p className="text-[15px] font-mono font-semibold tabular-nums">
              {discKind !== "none" && (
                <span className="text-muted-foreground line-through font-normal mr-1.5 text-[12px]">{money(grossLine)}</span>
              )}
              {money(finalLine)}
            </p>
          </div>
          <Button type="button" onClick={handleSave} className="text-[12px] font-semibold">
            <Check className="size-[13px]" /> {t("common.save")}
          </Button>
        </div>
      </div>
    </>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow size="xs" className="mb-2">{label}</Eyebrow>
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
  isOnline,
  onOfflineCard,
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
  isOnline: boolean;
  onOfflineCard: (cardNumber: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const { symbol } = useCurrency();
  const [cashTaken, setCashTaken] = useState<number | null>(null);
  const [customCash, setCustomCash] = useState("");
  const [showCustomCash, setShowCustomCash] = useState(false);
  const [splits, setSplits] = useState(1);
  const [offlineCardNumber, setOfflineCardNumber] = useState("");

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOfflineCardNumber(formatCardNumber(e.target.value));
  };

  const offlineCardValid = offlineCardNumber.replace(/\s/g, "").length >= 13;

  const cashOptions = useMemo(() => {
    const exact = parseFloat(total.toFixed(2));
    const bills = [1, 5, 10, 20].map(b => Math.ceil(total / b) * b);
    return [exact, ...bills].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 5);
  }, [total]);

  const showOfflineCardInput = payMethod === "card" && !isOnline;

  const methods: { id: PmtMethod; label: string; icon: typeof CreditCard; sub: string }[] = [
    { id: "card", label: t("pos.pay.methods.card"), icon: CreditCard, sub: !isOnline ? t("pos.pay.cardSubOffline") : cardAvailable ? t("pos.pay.cardSubAvailable") : t("pos.pay.cardSubNotConfigured") },
    { id: "cash", label: t("pos.pay.methods.cash"), icon: Banknote, sub: t("pos.pay.cashSub") },
    { id: "mobile", label: t("pos.pay.methods.mobilePay"), icon: Smartphone, sub: t("pos.pay.mobileSub") },
    { id: "gift", label: t("pos.pay.methods.giftCard"), icon: Gift, sub: t("pos.pay.giftSub") },
  ];

  const canCharge =
    payMethod === "cash" ? (cashTaken != null && cashTaken >= total) :
    payMethod === "card" ? (isOnline ? cardAvailable : offlineCardValid) :
    true;

  const handleCharge = () => {
    if (payMethod === "card") {
      if (!isOnline && offlineCardValid) {
        onOfflineCard(offlineCardNumber);
      } else {
        onCardPayment();
      }
    } else {
      onComplete();
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-muted flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center px-6 gap-4 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          className="h-10 px-3 text-[13px]"
        >
          <ArrowLeft className="size-[15px]" /> {t("pos.pay.backToOrder")}
        </Button>
        <div className="flex-1 min-w-0">
          <Eyebrow>{t("pos.pay.checkout")}</Eyebrow>
          <p className="text-[15px] font-semibold truncate">{t("pos.cart.itemsCount").replace("{count}", String(cart.length))}{customerName ? ` · ${customerName}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <Eyebrow>{t("pos.register.total")}</Eyebrow>
          <p className="text-[22px] font-semibold font-mono tabular-nums">{money(total)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-[1fr_380px] min-h-0">
        {/* Left: method + tip + split */}
        <div className="p-8 overflow-auto">
          <div className="max-w-[640px] mx-auto space-y-8">
            <section>
              <SectionLabel>{t("pos.pay.tender")}</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {methods.map(m => {
                  // Card is always selectable when offline (for queueing), only disabled when online and not configured
                  const disabled = m.id === "card" && isOnline && !cardAvailable;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => !disabled && setPayMethod(m.id)}
                      disabled={disabled}
                      className={cn(
                        "p-5 rounded-lg border-2 text-left transition-colors",
                        payMethod === m.id
                          ? "border-foreground bg-foreground text-background"
                          : disabled
                            ? "border-border bg-card opacity-50 cursor-not-allowed"
                            : "border-border bg-card hover:border-muted-foreground"
                      )}
                    >
                      <m.icon className="h-[22px] w-[22px]" />
                      <p className="text-[15px] font-semibold mt-3">{m.label}</p>
                      <p className={cn("text-[11.5px] mt-0.5", payMethod === m.id ? "text-background/70" : "text-muted-foreground")}>
                        {m.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
              {paymentError && (
                <Callout tone="danger" icon={AlertCircle} className="mt-3">
                  {paymentError}
                </Callout>
              )}
            </section>

            {/* Offline card number input */}
            {showOfflineCardInput && (
              <section>
                <SectionLabel>{t("pos.pay.cardNumberQueued")}</SectionLabel>
                <div className="rounded-lg border border-border bg-card p-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={offlineCardNumber}
                    onChange={handleCardInput}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    className="w-full text-[22px] font-mono tracking-wider tabular-nums bg-transparent outline-none placeholder:text-muted-foreground/40 border-0 p-0"
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">
                    {t("pos.pay.queuedHint")}
                  </p>
                </div>
                {/* PCI compliance warning */}
                <Callout tone="warning" icon={AlertCircle} className="mt-2">
                  {t("pos.pay.pciWarning")}
                </Callout>
              </section>
            )}

            <section>
              <SectionLabel>{t("pos.pay.tip")}</SectionLabel>
              <SegmentedControl
                variant="chips"
                fullWidth
                aria-label={t("pos.pay.tip")}
                className={cn("grid grid-cols-5 gap-2 [&>button]:py-4", TILE_SEGMENT)}
                options={[0, 10, 15, 20, 25].map(p => ({
                  value: String(p),
                  label: (
                    <>
                      <span className="text-[13px] font-semibold">{p === 0 ? t("pos.pay.tipNone") : `${p}%`}</span>
                      {p > 0 && (
                        <span className="text-[11px] tabular-nums opacity-70">{money(subtotal * p / 100)}</span>
                      )}
                    </>
                  ),
                }))}
                value={String(tipPct)}
                onChange={(v) => setTipPct(Number(v))}
              />
            </section>

            {payMethod === "cash" && (
              <section>
                <SectionLabel>{t("pos.pay.cashTendered")}</SectionLabel>
                <SegmentedControl
                  variant="chips"
                  fullWidth
                  aria-label={t("pos.pay.cashTendered")}
                  className="grid grid-cols-3 sm:grid-cols-4 gap-2 [&>button]:h-auto [&>button]:py-4"
                  options={[
                    ...cashOptions.map(v => ({
                      value: String(v),
                      label: <span className="text-[13px] font-semibold tabular-nums">{money(v)}</span>,
                    })),
                    { value: "other", label: <span className="text-[13px] font-semibold">{t("pos.pay.other")}</span> },
                  ]}
                  value={showCustomCash ? "other" : cashTaken != null ? String(cashTaken) : ""}
                  onChange={(v) => {
                    if (v === "other") { setShowCustomCash(true); setCashTaken(null); }
                    else { setCashTaken(Number(v)); setShowCustomCash(false); }
                  }}
                />
                {showCustomCash && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-mono">{symbol}</span>
                    <Input
                      type="number"
                      value={customCash}
                      onChange={e => {
                        setCustomCash(e.target.value);
                        const v = parseFloat(e.target.value);
                        setCashTaken(v > 0 ? v : null);
                      }}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="flex-1 text-[13px] font-mono tabular-nums"
                    />
                  </div>
                )}
                {cashTaken != null && cashTaken >= total && (
                  <div className="mt-3 rounded-lg bg-muted border border-border p-4 flex items-center gap-3">
                    <Banknote className={cn("h-5 w-5", STATUS_TONE_TEXT.success)} />
                    <div>
                      <p className={cn("text-[12px] font-semibold uppercase tracking-wide", STATUS_TONE_TEXT.success)}>{t("pos.pay.changeOwed")}</p>
                      <p className={cn("text-[22px] font-bold font-mono tabular-nums", STATUS_TONE_TEXT.success)}>{money(cashTaken - total)}</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <SectionLabel>{t("pos.pay.split")}</SectionLabel>
              <SegmentedControl
                variant="chips"
                fullWidth
                aria-label={t("pos.pay.split")}
                className={cn("gap-2 [&>button]:py-2.5", TILE_SEGMENT)}
                options={[1, 2, 3, 4].map(n => ({
                  value: String(n),
                  label: (
                    <>
                      <span className="text-[12px] font-semibold">{n === 1 ? t("pos.pay.splitSingle") : t("pos.pay.splitWays").replace("{n}", String(n))}</span>
                      {n > 1 && (
                        <span className="text-[11px] tabular-nums opacity-70">{t("pos.pay.splitEach").replace("{amount}", money(total / n))}</span>
                      )}
                    </>
                  ),
                }))}
                value={String(splits)}
                onChange={(v) => setSplits(Number(v))}
              />
            </section>

            {/* Mobile totals + charge */}
            <div className="md:hidden space-y-3 mt-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 text-[13px]">
                <TotalsRow label={t("pos.register.subtotal")} value={money(subtotal)} />
                <TotalsRow label={t("pos.cart.tipLabel").replace("{pct}", String(tipPct))} value={money(tip)} />
                <TotalsRow label={t("pos.register.taxShort")} value={money(tax)} />
                <div className="h-px bg-border my-2" />
                <TotalsRow label={t("pos.register.total")} value={money(total)} bold big />
              </div>
              <Button
                type="button"
                size="lg"
                onClick={handleCharge}
                disabled={!canCharge || processing}
                className="h-11 w-full text-[13px] font-semibold"
              >
                {processing ? (
                  <Spinner size={16} />
                ) : (
                  <CheckCircle className="size-[18px]" />
                )}
                {processing ? t("pos.charge.processing") : showOfflineCardInput ? t("pos.pay.queueCardAmount").replace("{amount}", money(total)) : t("pos.pay.chargeAmount").replace("{amount}", money(total))}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: summary — hidden on mobile */}
        <aside className="hidden md:flex border-l border-border bg-card flex-col overflow-hidden">
          <div className="p-5 border-b border-border">
            <Eyebrow>{t("pos.pay.orderSummary")}</Eyebrow>
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
            <TotalsRow label={t("pos.register.subtotal")} value={money(subtotal)} />
            <TotalsRow label={t("pos.cart.tipLabel").replace("{pct}", String(tipPct))} value={money(tip)} />
            <TotalsRow label={t("pos.register.taxShort")} value={money(tax)} />
            <div className="h-px bg-border my-2" />
            <TotalsRow label={t("pos.register.total")} value={money(total)} bold big />
          </div>
          <Button
            type="button"
            onClick={handleCharge}
            disabled={!canCharge || processing}
            className="h-12 w-full rounded-none text-[13px] font-semibold"
          >
            {processing ? (
              <Spinner size={16} />
            ) : (
              <CheckCircle className="size-[18px]" />
            )}
            {processing ? t("pos.charge.processing") : showOfflineCardInput ? t("pos.pay.queueCardAmount").replace("{amount}", money(total)) : t("pos.pay.chargeAmount").replace("{amount}", money(total))}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Eyebrow className="mb-3">{children}</Eyebrow>;
}

// ─── Mobile Checkout Panel ──────────────────────────────────────────────────

function MobileCheckoutPanel({
  cart,
  subtotal,
  tax,
  tip,
  tipPct,
  setTipPct,
  total,
  payMethod,
  setPayMethod,
  cardAvailable,
  processing,
  paymentError,
  onCharge,
  onCardPayment,
  isOnline,
  onOfflineCard,
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
  cardAvailable: boolean;
  processing: boolean;
  paymentError: string | null;
  onCharge: () => void;
  onCardPayment: () => void;
  isOnline: boolean;
  onOfflineCard: (cardNumber: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const { symbol } = useCurrency();
  const [cashTaken, setCashTaken] = useState<number | null>(null);
  const [customCash, setCustomCash] = useState("");
  const [showCustomCash, setShowCustomCash] = useState(false);
  const [offlineCardNumber, setOfflineCardNumber] = useState("");

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOfflineCardNumber(formatCardNumber(e.target.value));
  };

  const offlineCardValid = offlineCardNumber.replace(/\s/g, "").length >= 13;
  const showOfflineCardInput = payMethod === "card" && !isOnline;

  const cashOptions = useMemo(() => {
    const exact = parseFloat(total.toFixed(2));
    const bills = [1, 5, 10, 20].map(b => Math.ceil(total / b) * b);
    return [exact, ...bills].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 5);
  }, [total]);

  const methods: { id: PmtMethod; label: string; icon: typeof CreditCard }[] = [
    { id: "card", label: t("pos.pay.methods.card"), icon: CreditCard },
    { id: "cash", label: t("pos.pay.methods.cash"), icon: Banknote },
    { id: "mobile", label: t("pos.pay.methods.mobile"), icon: Smartphone },
    { id: "gift", label: t("pos.pay.methods.gift"), icon: Gift },
  ];

  const canCharge =
    payMethod === "cash" ? (cashTaken != null && cashTaken >= total) :
    payMethod === "card" ? (isOnline ? cardAvailable : offlineCardValid) :
    true;

  const handleCharge = () => {
    if (payMethod === "card") {
      if (!isOnline && offlineCardValid) {
        onOfflineCard(offlineCardNumber);
      } else {
        onCardPayment();
      }
    } else {
      onCharge();
    }
  };

  return (
    <div className="px-4 space-y-6 pb-8">
      <DynamicUIElementHeader>
        <DynamicUIElementTitle mobileTitle={t("pos.pay.checkout")}>{t("pos.pay.checkout")}</DynamicUIElementTitle>
        <DynamicUIElementDescription>
          {t("pos.cart.itemsCount").replace("{count}", String(cart.length))} · {money(total)}
        </DynamicUIElementDescription>
      </DynamicUIElementHeader>

      {/* Payment method */}
      <section>
        <SectionLabel>{t("pos.pay.tender")}</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {methods.map(m => {
            const disabled = m.id === "card" && isOnline && !cardAvailable;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => !disabled && setPayMethod(m.id)}
                disabled={disabled}
                className={cn(
                  "py-2.5 rounded-lg border-2 text-center transition-colors",
                  payMethod === m.id
                    ? "border-foreground bg-foreground text-background"
                    : disabled
                      ? "border-border bg-card opacity-40"
                      : "border-border bg-card active:bg-muted"
                )}
              >
                <m.icon className="h-5 w-5 mx-auto" />
                <p className="text-[11px] font-semibold mt-1.5">{m.label}</p>
              </button>
            );
          })}
        </div>
        {paymentError && (
          <Callout tone="danger" icon={AlertCircle} className="mt-3">
            {paymentError}
          </Callout>
        )}
      </section>

      {/* Offline card number input */}
      {showOfflineCardInput && (
        <section>
          <SectionLabel>{t("pos.pay.cardNumberQueued")}</SectionLabel>
          <div className="rounded-lg border border-border bg-card p-3">
            <input
              type="text"
              inputMode="numeric"
              value={offlineCardNumber}
              onChange={handleCardInput}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="w-full text-[20px] font-mono tracking-wider tabular-nums bg-transparent outline-none placeholder:text-muted-foreground/40 border-0 p-0"
            />
            <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">
              {t("pos.pay.queuedHintShort")}
            </p>
          </div>
        </section>
      )}

      {/* Tip */}
      <section>
        <SectionLabel>{t("pos.pay.tip")}</SectionLabel>
        <SegmentedControl
          variant="chips"
          fullWidth
          aria-label={t("pos.pay.tip")}
          className={cn("grid grid-cols-5 gap-1.5 [&>button]:py-2.5", TILE_SEGMENT)}
          options={[0, 10, 15, 20, 25].map(p => ({
            value: String(p),
            label: (
              <>
                <span className="text-[13px] font-semibold">{p === 0 ? "—" : `${p}%`}</span>
                {p > 0 && (
                  <span className="text-[10px] tabular-nums font-mono opacity-70">{money(subtotal * p / 100)}</span>
                )}
              </>
            ),
          }))}
          value={String(tipPct)}
          onChange={(v) => setTipPct(Number(v))}
        />
      </section>

      {/* Cash options */}
      {payMethod === "cash" && (
        <section>
          <SectionLabel>{t("pos.pay.cashTendered")}</SectionLabel>
          <SegmentedControl
            variant="chips"
            fullWidth
            aria-label={t("pos.pay.cashTendered")}
            className="grid grid-cols-3 gap-2 [&>button]:h-auto [&>button]:py-2.5"
            options={[
              ...cashOptions.map(v => ({
                value: String(v),
                label: <span className="text-[13px] font-semibold tabular-nums">{money(v)}</span>,
              })),
              { value: "other", label: <span className="text-[13px] font-semibold">{t("pos.pay.other")}</span> },
            ]}
            value={showCustomCash ? "other" : cashTaken != null ? String(cashTaken) : ""}
            onChange={(v) => {
              if (v === "other") { setShowCustomCash(true); setCashTaken(null); }
              else { setCashTaken(Number(v)); setShowCustomCash(false); }
            }}
          />
          {showCustomCash && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono">{symbol}</span>
              <Input
                type="number"
                value={customCash}
                onChange={e => {
                  setCustomCash(e.target.value);
                  const v = parseFloat(e.target.value);
                  setCashTaken(v > 0 ? v : null);
                }}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="flex-1 text-[13px] font-mono tabular-nums"
              />
            </div>
          )}
          {cashTaken != null && cashTaken >= total && (
            <div className="mt-3 rounded-lg bg-muted border border-border p-3 flex items-center gap-3">
              <Banknote className={cn("h-5 w-5", STATUS_TONE_TEXT.success)} />
              <div>
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide", STATUS_TONE_TEXT.success)}>{t("pos.pay.change")}</p>
                <p className={cn("text-[20px] font-bold font-mono tabular-nums", STATUS_TONE_TEXT.success)}>{money(cashTaken - total)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Totals */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 text-[13px]">
        <TotalsRow label={t("pos.register.subtotal")} value={money(subtotal)} />
        <TotalsRow label={t("pos.cart.tipLabel").replace("{pct}", String(tipPct))} value={money(tip)} />
        <TotalsRow label={t("pos.register.taxShort")} value={money(tax)} />
        <div className="h-px bg-border my-2" />
        <TotalsRow label={t("pos.register.total")} value={money(total)} bold big />
      </div>

      {/* Charge */}
      <Button
        type="button"
        size="lg"
        onClick={handleCharge}
        disabled={!canCharge || processing}
        className="h-11 w-full text-[13px] font-semibold"
      >
        {processing ? (
          <Spinner size={16} />
        ) : (
          <CheckCircle className="size-[18px]" />
        )}
        {processing ? t("pos.charge.processing") : showOfflineCardInput ? t("pos.pay.queueCardAmount").replace("{amount}", money(total)) : t("pos.pay.chargeAmount").replace("{amount}", money(total))}
      </Button>
    </div>
  );
}

// ─── Receipt Overlay ─────────────────────────────────────────────────────────

function ReceiptOverlay({ data, onNewOrder }: { data: ReceiptData; onNewOrder: () => void }) {
  const t = useT();
  const money = useMoney();
  const { payment, businessName, tipAmount, tipPct } = data;
  const now = new Date(payment.createdAt);
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const methodLabel: Record<string, string> = { card: t("pos.pay.methods.card"), cash: t("pos.pay.methods.cash"), other: t("pos.pay.other") };

  return (
    <div className="absolute inset-0 z-30 bg-muted flex flex-col items-center justify-center p-8 overflow-auto">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-5">
          <Check className="h-9 w-9 text-emerald-700" strokeWidth={2.4} />
        </div>
        <p className="text-[24px] font-semibold">{t("pos.receipt.paidAmount").replace("{amount}", money(payment.amount))}</p>
        <p className="text-[14px] text-muted-foreground mt-1">
          {payment.customerName ? `${payment.customerName} · ` : ""}
          {dateStr}
        </p>

        {/* Receipt card */}
        <div className="bg-card border border-border rounded-lg w-full mt-6 p-5 font-mono text-[12px] tabular-nums">
          <div className="text-center border-b border-dashed border-muted-foreground/30 pb-3 mb-3">
            <p className="font-sans text-[14px] font-semibold">{businessName || t("pos.receipt.yourBusiness")}</p>
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
              <span>{t("pos.receipt.subtotal")}</span>
              <span className="tabular-nums">
                {money(payment.amount - payment.taxAmount - tipAmount + payment.discountAmount)}
              </span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between">
                <span>{t("pos.receipt.tipPct").replace("{pct}", String(tipPct))}</span>
                <span className="tabular-nums">{money(tipAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{t("pos.receipt.tax")}</span>
              <span className="tabular-nums">{money(payment.taxAmount)}</span>
            </div>
            {payment.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>{t("pos.receipt.discount")}</span>
                <span className="tabular-nums">&minus;{money(payment.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-[13px] mt-1 pt-1 border-t border-muted-foreground/30">
              <span>{t("pos.receipt.total")}</span>
              <span className="tabular-nums">{money(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t("pos.receipt.paid")}</span>
              <span className="capitalize">{methodLabel[payment.method] ?? payment.method}</span>
            </div>
          </div>
          <p className="text-center text-[10.5px] text-muted-foreground mt-3 font-sans">{t("pos.receipt.thankYou")}</p>
        </div>

        <div className="flex gap-2 mt-6 w-full">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => window.print()}
            className="h-10 flex-1 gap-2 text-[13px]"
          >
            <Printer className="size-[15px]" /> {t("pos.receipt.print")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 flex-1 gap-2 text-[13px]"
          >
            <Mail className="size-[15px]" /> {t("pos.receipt.email")}
          </Button>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() => { hapticSuccess(); onNewOrder(); }}
          className="mt-3 h-11 w-full gap-2 text-[13px] font-semibold"
        >
          <Plus className="h-4 w-4" /> {t("pos.receipt.newOrder")}
        </Button>
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
            <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={() => setSearchInput("")}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Spinner size={20} className="text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={History}
            description={searchQuery ? t("pos.orders.noMatch") : t("pos.orders.empty")}
          />
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
                <Spinner size={16} className="text-muted-foreground mx-auto" />
              ) : !hasMore ? (
                <p className="text-xs text-muted-foreground">{t("pos.orders.noMore")}</p>
              ) : null}
            </div>
          </>
        )}
      </div>
      <DynamicUIElement open={!!refundTarget} onOpenChange={v => { if (!v) setRefundTarget(null); }}>
        <DynamicUIElementContent className="sm:max-w-sm">
          {refundTarget && (
            <RefundPanel
              payment={refundTarget}
              onClose={() => setRefundTarget(null)}
              onSuccess={handleRefundSuccess}
            />
          )}
        </DynamicUIElementContent>
      </DynamicUIElement>
    </>
  );
}

function OrderRow({ payment, onRefund }: { payment: Payment; onRefund: (p: Payment) => void }) {
  const t = useT();
  const money = useMoney();
  const isRefunded = payment.status === "refunded";
  if (payment.amount < 0) return null;

  return (
    <div className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isRefunded ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        )}>
          {payment.method === "card" && <CreditCard className="h-4 w-4" />}
          {payment.method === "cash" && <Banknote className="h-4 w-4" />}
          {payment.method === "other" && <MoreHorizontal className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold font-mono tabular-nums">{money(payment.amount)}</span>
            <StatusBadge size="xs" tone={isRefunded ? "neutral" : "success"} className={cn(isRefunded && "line-through")}>
              {isRefunded ? t("pos.orders.refunded") : t("pos.orders.completed")}
            </StatusBadge>
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
            <div className="mt-1 text-[11px] text-destructive space-y-0.5">
              <p>{t("pos.orders.refunded")} {money(payment.refundAmount)}{payment.refundedAt ? ` ${t("pos.orders.onDate")} ${fmtDate(payment.refundedAt)}` : ""}</p>
              {payment.refundReason && <p className="text-muted-foreground">{t("pos.orders.reason")} {payment.refundReason}</p>}
            </div>
          )}
        </div>
        {!isRefunded && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRefund(payment)}
            className="shrink-0"
          >
            {t("pos.orders.refundAction")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Refund Dialog (preserved) ───────────────────────────────────────────────

function RefundPanel({
  payment,
  onClose,
  onSuccess,
}: {
  payment: Payment;
  onClose: () => void;
  onSuccess: (updated: Payment) => void;
}) {
  const t = useT();
  const money = useMoney();
  const { symbol } = useCurrency();
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
    <>
      <DynamicUIElementHeader>
        <DynamicUIElementTitle mobileTitle={t("pos.refund.title")}>
          {t("pos.refund.title")}
        </DynamicUIElementTitle>
      </DynamicUIElementHeader>
      <div className="space-y-4 mt-2">
        <div className="rounded border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1">
          <div className="flex justify-between font-semibold">
            <span>{t("pos.refund.originalTotal")}</span>
            <span className="font-mono tabular-nums">{money(payment.amount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span className="capitalize">{payment.method} &middot; {fmtDate(payment.createdAt)}</span>
            {payment.customerName && <span>{payment.customerName}</span>}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium mb-1.5">{t("pos.refund.refundAmount")}</p>
          <SegmentedControl<"full" | "partial">
            fullWidth
            size="sm"
            aria-label={t("pos.refund.refundAmount")}
            className="capitalize"
            options={[
              { value: "full", label: `${t("pos.refund.full")} — ${money(payment.amount)}` },
              { value: "partial", label: t("pos.refund.partial") },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === "partial" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{symbol}</span>
              <Input
                type="number"
                value={partialAmount}
                onChange={e => setPartialAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                max={payment.amount}
                step="0.01"
                className="flex-1 font-mono tabular-nums"
              />
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">{t("pos.refund.reason")}</Label>
          <Input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t("pos.refund.reasonPlaceholder")}
            className="mt-1"
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={handleRefund}
          disabled={processing || !canSubmit}
          className="h-11 w-full gap-2 font-bold"
        >
          {processing ? <Spinner size={16} /> : <CornerDownLeft className="h-4 w-4" />}
          {processing ? t("pos.refund.processing") : `${t("pos.refund.refundButton")} ${money(refundAmt)}`}
        </Button>
      </div>
    </>
  );
}

// ─── Main POS Page ───────────────────────────────────────────────────────────

type ActiveTab = "register" | "orders";

export default function POSPage() {
  const { locale } = useI18n();
  const t = useT();
  const money = useMoney();
  const { organizationId } = usePermissions();

  // Data loading
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [businessName, setBusinessName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [cardAvailable, setCardAvailable] = useState(true);

  // Offline state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCards, setPendingCards] = useState<PendingCardPayment[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>("register");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [customerName, setCustomerName] = useState("");
  const [tipPct, setTipPct] = useState(15);

  // Cart
  const [cart, setCart] = useState<POSLine[]>([]);
  const [editLineUid, setEditLineUid] = useState<string | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [mobilePayOpen, setMobilePayOpen] = useState(false);
  const lastEditLineRef = useRef<POSLine | null>(null);

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

  // ── Offline detection ───────────────────────────────────────────────────────

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Product localStorage cache ──────────────────────────────────────────────

  useEffect(() => {
    if (products.length > 0 && organizationId) {
      try {
        localStorage.setItem(`pos_products_${organizationId}`, JSON.stringify(products));
      } catch { /* localStorage full — skip silently */ }
    }
  }, [products, organizationId]);

  const cachedProducts = useMemo(() => {
    if (products.length > 0) return products;
    if (!organizationId) return [];
    try {
      const cached = localStorage.getItem(`pos_products_${organizationId}`);
      return cached ? (JSON.parse(cached) as Product[]) : [];
    } catch { return []; }
  }, [products, organizationId]);

  // ── Pending card payments (offline queue) ───────────────────────────────────

  useEffect(() => {
    if (!organizationId) return;
    try {
      const stored = localStorage.getItem(`pos_pending_cards_${organizationId}`);
      if (stored) setPendingCards(JSON.parse(stored));
    } catch { /* ignore parse errors */ }
  }, [organizationId]);

  const savePendingCards = useCallback((updated: PendingCardPayment[]) => {
    setPendingCards(updated);
    if (organizationId) {
      try {
        localStorage.setItem(`pos_pending_cards_${organizationId}`, JSON.stringify(updated));
      } catch { /* localStorage full */ }
    }
  }, [organizationId]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = Array.from(new Set(cachedProducts.map(p => p.category).filter(Boolean)));
    return ["All", ...cats];
  }, [cachedProducts]);

  const filteredProducts = useMemo(() => {
    return cachedProducts.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === "All" || p.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [cachedProducts, search, activeCategory]);

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
        name: getLocalizedName(product, locale),
        basePrice: product.price,
        price: product.price,
        qty: 1,
        category: product.category,
        notes: null,
        discount: null,
      }];
    });
  }, [locale]);

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

  // ── Pending card payment actions ────────────────────────────────────────────

  const addPendingCardPayment = useCallback((cardNumber: string) => {
    const entry: PendingCardPayment = {
      id: uuid(),
      cardNumberLast4: cardNumber.replace(/\s/g, "").slice(-4),
      cardNumberFull: cardNumber.replace(/\s/g, ""),
      amount: parseFloat(total.toFixed(2)),
      items: linesToCartItems(cart),
      customerName: customerName.trim() || null,
      tipPct,
      tipAmount: tip,
      taxAmount: parseFloat(tax.toFixed(2)),
      createdAt: new Date().toISOString(),
    };
    const updated = [...pendingCards, entry];
    savePendingCards(updated);
    hapticSuccess();
    toast.success(t("pos.toast.paymentQueued"), { description: t("pos.toast.paymentQueuedDesc").replace("{last4}", entry.cardNumberLast4) });
    clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCards, savePendingCards, cart, customerName, tipPct, tip, tax, total, clearCart]);

  const clearPendingCards = useCallback(() => {
    savePendingCards([]);
    toast.success(t("pos.toast.pendingCardsCleared"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savePendingCards]);

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
        id: uuid(),
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
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  // ── Editing line ────────────────────────────────────────────────────────────

  const editingLine = editLineUid ? cart.find(l => l.uid === editLineUid) ?? null : null;
  if (editingLine) lastEditLineRef.current = editingLine;
  const displayEditLine = editingLine ?? lastEditLineRef.current;

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

      {/* Offline banner */}
      {!isOnline && (
        <Callout tone="warning" icon={WifiOff} className="shrink-0 items-center rounded-none border-x-0 border-t-0 px-4 py-1.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide">
            {t("pos.offline.banner")}
          </span>
        </Callout>
      )}

      {/* Pending cards badge */}
      {isOnline && pendingCards.length > 0 && (
        <Callout
          tone="neutral"
          icon={CreditCard}
          className="shrink-0 items-center rounded-none border-x-0 border-t-0 px-4 py-1.5"
          action={
            <Button type="button" variant="outline" size="xs" onClick={clearPendingCards}>
              {(pendingCards.length === 1 ? t("pos.pending.processOne") : t("pos.pending.processOther")).replace("{count}", String(pendingCards.length))}
            </Button>
          }
        >
          <span className="text-[11.5px] font-medium">
            {(pendingCards.length === 1 ? t("pos.pending.queuedOne") : t("pos.pending.queuedOther")).replace("{count}", String(pendingCards.length))}
          </span>
        </Callout>
      )}

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
                <p className="text-[15px] font-semibold leading-tight">{t("pos.register.newOrder")}</p>
                <p className="text-[11.5px] text-muted-foreground leading-tight">{t("pos.tabs.register")}</p>
              </div>
              <div className="relative flex-1 max-w-[360px] ml-6">
                <Search className="h-[14px] w-[14px] absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t("pos.register.searchMenu")}
                  className="pl-8 pr-8 text-[13px]"
                />
                {search && (
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setSearch("")} className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <Button type="button" variant="outline" size="icon" className="text-muted-foreground" title={t("pos.register.scan")}>
                  <ScanLine className="size-[15px]" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="text-muted-foreground" title={t("common.more")}>
                  <MoreHorizontal className="size-[15px]" />
                </Button>
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
                    {cat === "All" ? t("pos.register.all") : cat}
                  </button>
                );
              })}
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-auto bg-muted/50 p-5">
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-[13px] font-semibold">
                  {search ? t("pos.register.matchesFor").replace("{query}", search) : activeCategory === "All" ? t("pos.register.all") : activeCategory}
                </h2>
                <span className="text-[11.5px] text-muted-foreground">{t("pos.cart.itemsCount").replace("{count}", String(filteredProducts.length))}</span>
              </div>
              {filteredProducts.length === 0 ? (
                <EmptyState
                  className="py-16"
                  icon={ShoppingBag}
                  description={search ? t("pos.register.noResultsFound") : t("pos.register.noProductsInCategory")}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filteredProducts.map(p => (
                    <ProductCard key={p.id} product={p} onTap={() => addToCart(p)} locale={locale} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart sidebar — desktop only */}
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

          {/* Mobile cart floating button */}
          {cart.length > 0 && stage === "order" && (
            <div className="md:hidden fixed bottom-0 inset-x-0 z-20 p-3">
              <Button
                type="button"
                onClick={() => setCartDrawerOpen(true)}
                className="h-11 w-full justify-between px-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <ShoppingCart className="h-4.5 w-4.5" />
                    <span className="absolute -top-1.5 -right-2 h-4 min-w-4 rounded-full bg-background text-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {cart.reduce((s, l) => s + l.qty, 0)}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold">{t("pos.cart.viewCart")}</span>
                </div>
                <span className="font-mono tabular-nums text-[13px] font-semibold">{money(total)}</span>
              </Button>
            </div>
          )}

          {/* Mobile cart drawer */}
          <Drawer open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
            <DrawerContent>
              <DrawerHeader className="border-b border-border">
                <DrawerTitle className="text-sm">
                  {t("pos.cart.drawerTitle").replace("{count}", String(cart.length))}
                </DrawerTitle>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto max-h-[50vh] divide-y divide-border">
                {cart.length === 0 ? (
                  <EmptyState compact className="py-8" icon={ShoppingBag} description={t("pos.cart.empty")} />
                ) : (
                  cart.map(l => {
                    const lt = lineTotal(l);
                    return (
                      <div
                        key={l.uid}
                        onClick={() => { setCartDrawerOpen(false); setTimeout(() => setEditLineUid(l.uid), 300); }}
                        className="px-4 py-3 active:bg-muted/50"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold">{l.name}</p>
                            {l.notes && (
                              <p className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                                <MessageSquare className="h-[10px] w-[10px] shrink-0" />
                                {l.notes}
                              </p>
                            )}
                            {l.discount && (
                              <p className="text-[11px] text-emerald-700 mt-0.5 font-mono">
                                {l.discount.pct ? t("pos.cart.pctOff").replace("{pct}", String(l.discount.pct)) : t("pos.cart.amountOff").replace("{amount}", money(l.discount.amount ?? 0))}
                              </p>
                            )}
                          </div>
                          <span className="font-mono text-[13px] font-semibold tabular-nums shrink-0">{money(lt)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2" onClick={e => e.stopPropagation()}>
                          <Button type="button" variant="outline" size="icon" onClick={() => setQty(l.uid, l.qty - 1)}>
                            <Minus className="size-[11px]" />
                          </Button>
                          <span className="text-[12px] font-semibold tabular-nums w-7 text-center">{l.qty}</span>
                          <Button type="button" variant="outline" size="icon" onClick={() => setQty(l.uid, l.qty + 1)}>
                            <Plus className="size-[11px]" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLine(l.uid)}
                            className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-[12px]" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {cart.length > 0 && (
                <>
                  <div className="px-4 py-3 space-y-1 text-[12px] font-mono border-t border-border">
                    <TotalsRow label={t("pos.register.subtotal")} value={money(subtotal)} />
                    <TotalsRow label={t("pos.cart.tipLabel").replace("{pct}", String(tipPct))} value={money(tip)} />
                    <TotalsRow label={t("pos.register.taxShort")} value={money(tax)} />
                  </div>
                  <div className="p-3 pt-0">
                    <Button
                      type="button"
                      onClick={() => { setCartDrawerOpen(false); setTimeout(() => setMobilePayOpen(true), 300); }}
                      className="h-10 w-full justify-between px-4 text-[12px] font-semibold"
                    >
                      <span>{t("pos.register.charge")}</span>
                      <span className="font-mono tabular-nums text-[13px]">{money(total)}</span>
                    </Button>
                  </div>
                </>
              )}
            </DrawerContent>
          </Drawer>

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
              isOnline={isOnline}
              onOfflineCard={addPendingCardPayment}
            />
          )}

          {/* Receipt overlay */}
          {stage === "receipt" && receipt && (
            <ReceiptOverlay
              data={receipt}
              onNewOrder={() => { clearCart(); setReceipt(null); }}
            />
          )}

          {/* Line editor — DynamicUIElement */}
          <DynamicUIElement open={!!editLineUid} onOpenChange={v => { if (!v) setEditLineUid(null); }}>
            <DynamicUIElementContent className="sm:max-w-[560px]">
              {displayEditLine && (
                <LineEditorPanel
                  line={displayEditLine}
                  onClose={() => setEditLineUid(null)}
                  onSave={patch => { if (editingLine) updateLine(editingLine.uid, patch); }}
                  onRemove={() => { if (editingLine) removeLine(editingLine.uid); }}
                />
              )}
            </DynamicUIElementContent>
          </DynamicUIElement>

          {/* Mobile checkout — DynamicUIElement */}
          <DynamicUIElement open={mobilePayOpen} onOpenChange={v => { if (!v) setMobilePayOpen(false); }}>
            <DynamicUIElementContent noPadding>
              <MobileCheckoutPanel
                cart={cart}
                subtotal={subtotal}
                tax={tax}
                tip={tip}
                tipPct={tipPct}
                setTipPct={setTipPct}
                total={total}
                payMethod={payMethod}
                setPayMethod={setPayMethod}
                cardAvailable={cardAvailable}
                processing={processing}
                paymentError={paymentError}
                onCharge={() => {
                  setMobilePayOpen(false);
                  handlePayComplete();
                }}
                onCardPayment={() => {
                  setMobilePayOpen(false);
                  handleCardPayment();
                }}
                isOnline={isOnline}
                onOfflineCard={(cardNum) => {
                  setMobilePayOpen(false);
                  addPendingCardPayment(cardNum);
                }}
              />
            </DynamicUIElementContent>
          </DynamicUIElement>
        </div>
      )}
    </div>
  );
}
