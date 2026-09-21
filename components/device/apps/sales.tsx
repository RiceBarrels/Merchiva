"use client";

// "Sales" lite app: one big number (money sold), the number of orders, and the
// few best-selling items — today, yesterday or this week. No charts, tables or
// date pickers; those live in /manager/sales.

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { CalendarDays, Coins, Receipt, ShoppingBag, Sun, Sunset } from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { useSales } from "@/lib/spacetimedb/hooks/useSales";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n/context";
import type { LiteAppProps } from "./types";
import { LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import { dateKey } from "@/lib/date-key";

type Range = "today" | "yesterday" | "week";

/** Subset of the `payment` row we read (same fields useSales / item-forecast use). */
interface PaymentRow {
  organizationId: string;
  status: string;
  amount: number;
  refundAmount?: number | null;
  items?: string | null;
  createdAt: unknown;
}

// Same timestamp handling as useSales: SpacetimeDB timestamps arrive as
// { microsSinceUnixEpoch: bigint }, sometimes with .toDate(), sometimes as a
// string.
function timestampToMs(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object") {
    const obj = v as { microsSinceUnixEpoch?: bigint | number; toDate?: () => Date };
    if (typeof obj.toDate === "function") return obj.toDate().getTime();
    const micros = obj.microsSinceUnixEpoch;
    if (typeof micros === "bigint") return Number(micros / 1000n);
    if (typeof micros === "number") return micros / 1000;
  }
  return NaN;
}

/** Local calendar day, matching the `date` keys useSales produces. */
function isoDay(ms: number): string {
  return dateKey(new Date(ms));
}

/** Inclusive [from, to] ISO-day window for a range. */
function rangeDays(range: Range, now: Date): { from: string; to: string } {
  const DAY = 86_400_000;
  const today = isoDay(now.getTime());
  if (range === "today") return { from: today, to: today };
  if (range === "yesterday") {
    const y = isoDay(now.getTime() - DAY);
    return { from: y, to: y };
  }
  // This week: Monday → today.
  const dow = now.getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  return { from: isoDay(now.getTime() - sinceMonday * DAY), to: today };
}

function parseItems(raw: string | null | undefined): Array<{ name: string; quantity: number }> {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it) => {
        const o = (it ?? {}) as { name?: unknown; quantity?: unknown };
        return { name: typeof o.name === "string" ? o.name : "", quantity: Number(o.quantity ?? 0) || 0 };
      })
      .filter((it) => it.name && it.quantity > 0);
  } catch {
    return [];
  }
}

export function SalesLite({ organizationId }: LiteAppProps) {
  const t = useT();
  const { format } = useCurrency();
  const { history, isReady } = useSales();
  const [rawPayments, paymentsReady] = useTable(tables.payment);
  const [range, setRange] = useState<Range>("today");

  const window = useMemo(() => rangeDays(range, new Date()), [range]);

  // Money sold: daily totals already merged from sales_record + POS payments
  // by useSales, so Square / Clover stores and built-in POS stores both work.
  const revenue = useMemo(
    () =>
      history
        .filter((r) => r.date >= window.from && r.date <= window.to)
        .reduce((sum, r) => sum + r.actual, 0),
    [history, window],
  );

  // Orders + best sellers come from POS payments (the only source that
  // carries per-order line items). Refunded payments are skipped.
  const { orders, topItems, anyPayments } = useMemo(() => {
    const payments = rawPayments as unknown as PaymentRow[];
    const qtyByName = new Map<string, number>();
    let count = 0;
    let any = false;
    for (const p of payments) {
      if (p.organizationId !== organizationId) continue;
      any = true;
      if (p.status === "refunded") continue;
      const ms = timestampToMs(p.createdAt);
      if (!Number.isFinite(ms)) continue;
      const day = isoDay(ms);
      if (day < window.from || day > window.to) continue;
      count += 1;
      for (const it of parseItems(p.items)) {
        qtyByName.set(it.name, (qtyByName.get(it.name) ?? 0) + it.quantity);
      }
    }
    const top = Array.from(qtyByName, ([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    return { orders: count, topItems: top, anyPayments: any };
  }, [rawPayments, organizationId, window]);

  if (!isReady || !paymentsReady) return <LiteLoading />;

  const nothingEver = history.length === 0 && !anyPayments;

  return (
    <LiteScreen>
      <LiteChoice<Range>
        value={range}
        onChange={setRange}
        options={[
          { value: "today", label: t("device.lite.sales.today"), icon: Sun },
          { value: "yesterday", label: t("device.lite.sales.yesterday"), icon: Sunset },
          { value: "week", label: t("device.lite.sales.thisWeek"), icon: CalendarDays },
        ]}
      />

      {nothingEver ? (
        <LiteEmpty
          icon={Coins}
          title={t("device.lite.sales.noSales")}
          description={t("device.lite.sales.noSalesSub")}
        />
      ) : (
        <>
          <LiteStat
            icon={Coins}
            label={t("device.lite.sales.soldLabel")}
            value={<span className="font-mono tabular-nums">{format(revenue, { decimals: 0 })}</span>}
            tone={revenue > 0 ? "success" : "default"}
          />
          <LiteStat
            icon={Receipt}
            label={t("device.lite.sales.ordersLabel")}
            value={<span className="font-mono tabular-nums">{orders > 0 || revenue === 0 ? orders : "—"}</span>}
          />

          <LiteSection title={t("device.lite.sales.topItems")}>
            {topItems.length === 0 ? (
              <LiteRow icon={ShoppingBag} title={t("device.lite.sales.noItems")} />
            ) : (
              <div className="space-y-2">
                {topItems.map((it, i) => (
                  <LiteRow
                    key={it.name}
                    icon={ShoppingBag}
                    iconTone={i === 0 ? "primary" : "muted"}
                    title={it.name}
                    right={t("device.lite.sales.soldQty").replace("{n}", String(it.qty))}
                  />
                ))}
              </div>
            )}
          </LiteSection>
        </>
      )}
    </LiteScreen>
  );
}
