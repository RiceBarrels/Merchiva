"use client";

// "Stock" lite app for /store + /personal. One task per screen:
//   home  → find an item (low-stock first)
//   item  → see the count, then "Received +" / "Used / wasted −" / "Count is wrong"
//   sheet → big stepper (+ reason for waste) and one confirm button
// On /personal the item and the sheet open as pages over home (lite-page.tsx).
// Writes mirror the manager UI: receive / recount go through updateInventoryItem
// (the reducer logs the inventory_transaction itself), waste goes through
// addWasteLog (the reducer deducts stock and logs a loss transaction itself).

import { useMemo, useState, type ReactNode } from "react";
import { useTable } from "spacetimedb/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Droplets,
  HelpCircle,
  Minus,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { addWasteLog, updateInventoryItem } from "@/lib/spacetimedb/actions";
import { hapticError, hapticLight, hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { LitePage, LiteSubPage } from "./lite-page";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  LiteButton,
  LiteChoice,
  LiteEmpty,
  LiteLoading,
  LiteRow,
  LiteScreen,
  LiteSearch,
  LiteSection,
  LiteStat,
} from "./lite";
import type { LiteAppProps } from "./types";
import { todayKey } from "@/lib/date-key";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
  id: string;
  name: string;
  category: string;
  qty: number;
  unit: string;
  minStock: number;
  costPerUnit: number;
  lastRestocked: string;
}

type StockStatus = "ok" | "low" | "out";
type AdjustMode = "receive" | "waste" | "set";
type WasteReason = "expired" | "damaged" | "spilled" | "other";

const K = "device.lite.inventory.";

function statusOf(item: StockItem): StockStatus {
  if (item.qty <= 0) return "out";
  if (item.qty <= item.minStock) return "low";
  return "ok";
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
function fmt(n: number): string {
  return numberFormat.format(n);
}

function today(): string {
  return todayKey();
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function InventoryLite({ organizationId, member, surface }: LiteAppProps) {
  const t = useT();
  const [rawItems, itemsReady] = useTable(tables.inventoryItem);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<AdjustMode | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<WasteReason>("expired");
  const [busy, setBusy] = useState(false);

  const items = useMemo<StockItem[]>(
    () =>
      rawItems
        .filter((r) => r.organizationId === organizationId)
        .map((r) => ({
          id: r.id.toString(),
          name: r.name,
          category: r.category,
          qty: r.currentStock,
          unit: r.unit,
          minStock: r.minStock,
          costPerUnit: r.costPerUnit,
          lastRestocked: r.lastRestocked,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rawItems, organizationId],
  );

  const lowItems = useMemo(
    () => items.filter((i) => statusOf(i) !== "ok").sort((a, b) => a.qty - b.qty),
    [items],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)) : []),
    [items, q],
  );

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  const openAdjust = (next: AdjustMode) => {
    setAmount(next === "set" && selected ? String(selected.qty) : "");
    setReason("expired");
    setMode(next);
  };

  const closeAdjust = () => {
    if (busy) return;
    setMode(null);
  };

  const confirm = async () => {
    if (!selected || !mode) return;
    const value = Number(amount);
    const validAmount = Number.isFinite(value) && (mode === "set" ? value >= 0 : value > 0);
    if (!validAmount) {
      hapticError();
      toast.error(t(K + "invalidAmount"));
      return;
    }
    if (mode === "waste" && value > selected.qty) {
      hapticError();
      toast.error(t(K + "tooMany"));
      return;
    }

    setBusy(true);
    try {
      if (mode === "receive") {
        await updateInventoryItem(selected.id, {
          currentStock: selected.qty + value,
          lastRestocked: today(),
          stockNote: `${t(K + "noteReceived")} — ${member.displayName}`,
        });
        toast.success(t(K + "receivedToast"));
      } else if (mode === "set") {
        await updateInventoryItem(selected.id, {
          currentStock: value,
          lastRestocked: selected.lastRestocked,
          stockNote: `${t(K + "noteRecount")} — ${member.displayName}`,
        });
        toast.success(t(K + "recountToast"));
      } else {
        await addWasteLog({
          itemId: selected.id,
          itemName: selected.name,
          quantity: value,
          unit: selected.unit,
          reason,
          costPerUnit: selected.costPerUnit,
          totalCost: value * selected.costPerUnit,
          date: today(),
          notes: undefined,
          operatorMemberId: member.id,
          operatorName: member.displayName,
        });
        toast.success(t(K + "usedToast"));
      }
      hapticSuccess();
      setMode(null);
    } catch (err) {
      console.error("[InventoryLite] save failed:", err);
      hapticError();
      toast.error(t(K + "failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!itemsReady) return <LiteLoading />;

  // ── Item screen ─────────────────────────────────────────────────────────────
  let itemBody: ReactNode = null;
  if (selected) {
    const status = statusOf(selected);
    const tone = status === "out" ? "destructive" : status === "low" ? "warning" : "default";
    const value = Number(amount);
    const nextQty =
      !Number.isFinite(value) || amount.trim() === ""
        ? null
        : mode === "receive"
          ? selected.qty + value
          : mode === "waste"
            ? Math.max(0, selected.qty - value)
            : value;

    const drawerTitle =
      mode === "receive" ? t(K + "howManyReceived") : mode === "waste" ? t(K + "howManyUsed") : t(K + "newCount");

    itemBody = (
      <>
        <div>
          <h2 className="text-[20px] font-semibold leading-tight">{selected.name}</h2>
          {selected.category && <p className="mt-0.5 text-[13px] text-muted-foreground">{selected.category}</p>}
        </div>

        <LiteStat
          icon={Package}
          label={t(K + "inStock")}
          tone={tone}
          value={
            <span className="font-mono tabular-nums">
              {fmt(selected.qty)} <span className="text-[16px] font-medium text-muted-foreground">{selected.unit}</span>
            </span>
          }
          sub={<StatusLabel status={status} t={t} />}
        />

        <LiteSection title={t(K + "whatHappened")}>
          <div className="space-y-2">
            <LiteButton icon={PackagePlus} label={t(K + "received")} onClick={() => openAdjust("receive")} />
            <LiteButton icon={PackageMinus} label={t(K + "used")} tone="outline" onClick={() => openAdjust("waste")} />
            <LiteButton icon={Pencil} label={t(K + "recount")} tone="outline" onClick={() => openAdjust("set")} />
          </div>
        </LiteSection>

        <LiteSubPage
          surface={surface}
          open={mode !== null}
          onClose={closeAdjust}
          onPageClose={() => setMode(null)}
          title={drawerTitle}
        >
          <div className="space-y-4 pb-1">
            <Stepper value={amount} onChange={setAmount} unit={selected.unit} disabled={busy} />

            {mode === "waste" && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(K + "why")}</p>
                <LiteChoice<WasteReason>
                  value={reason}
                  onChange={setReason}
                  options={[
                    { value: "expired", label: t(K + "reasonExpired"), icon: Clock },
                    { value: "damaged", label: t(K + "reasonDamaged"), icon: AlertTriangle },
                    { value: "spilled", label: t(K + "reasonSpilled"), icon: Droplets },
                    { value: "other", label: t(K + "reasonOther"), icon: HelpCircle },
                  ]}
                />
              </div>
            )}

            <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-[15px] tabular-nums">
              <span className="text-muted-foreground">{t(K + "now")}</span>
              <span className="font-semibold">{fmt(selected.qty)}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t(K + "after")}</span>
              <span className="font-semibold">{nextQty === null ? "—" : fmt(nextQty)}</span>
            </div>

            <LiteButton
              icon={mode === "waste" ? PackageMinus : mode === "receive" ? PackagePlus : Pencil}
              label={t(K + "confirm")}
              tone={mode === "waste" ? "danger" : "primary"}
              busy={busy}
              disabled={amount.trim() === ""}
              onClick={() => { void confirm(); }}
            />
          </div>
        </LiteSubPage>
      </>
    );
  }

  // The tablet swaps the list for the item; the phone pushes the item as a page over the list.
  if (selected && surface === "store") {
    return (
      <LiteScreen>
        <LiteButton icon={ArrowLeft} label={t(K + "back")} tone="outline" onClick={() => setSelectedId(null)} />
        {itemBody}
      </LiteScreen>
    );
  }
  const itemPage = surface === "personal" && selected && (
    <LitePage open onClose={() => { setMode(null); setSelectedId(null); }} title={selected.name}>
      {itemBody}
    </LitePage>
  );

  // ── Home ────────────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <LiteScreen>
        <LiteEmpty icon={Package} title={t(K + "noItems")} description={t(K + "noItemsHint")} />
      </LiteScreen>
    );
  }

  const row = (item: StockItem) => {
    const status = statusOf(item);
    return (
      <LiteRow
        key={item.id}
        icon={Package}
        iconTone={status === "out" ? "destructive" : status === "low" ? "warning" : "muted"}
        title={item.name}
        sub={<StatusLabel status={status} t={t} unit={item.unit} />}
        right={
          <span className={cn("text-[18px] font-semibold", status === "out" && "text-destructive", status === "low" && "text-amber-700 dark:text-amber-300")}>
            {fmt(item.qty)}
          </span>
        }
        chevron
        onClick={() => setSelectedId(item.id)}
      />
    );
  };

  return (
    <LiteScreen>
      <LiteSearch value={query} onChange={setQuery} placeholder={t(K + "search")} />

      {q ? (
        results.length === 0 ? (
          <LiteEmpty icon={Search} title={t(K + "noMatch")} description={t(K + "noMatchHint")} />
        ) : (
          <LiteSection title={t(K + "results")}>
            <div className="space-y-2">{results.map(row)}</div>
          </LiteSection>
        )
      ) : (
        <>
          {lowItems.length > 0 && (
            <LiteSection
              title={t(K + "lowStock")}
              right={<StatusBadge tone="warning" dot>{lowItems.length}</StatusBadge>}
            >
              <div className="space-y-2">{lowItems.map(row)}</div>
            </LiteSection>
          )}
          <LiteSection title={t(K + "allItems")}>
            <div className="space-y-2">{items.map(row)}</div>
          </LiteSection>
        </>
      )}
      {itemPage}
    </LiteScreen>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function StatusLabel({ status, unit, t }: { status: StockStatus; unit?: string; t: (path: string) => string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {status === "out" ? (
        <StatusBadge tone="danger" size="xs">{t(K + "out")}</StatusBadge>
      ) : status === "low" ? (
        <StatusBadge tone="warning" size="xs">{t(K + "low")}</StatusBadge>
      ) : (
        <StatusBadge tone="success" size="xs">{t(K + "ok")}</StatusBadge>
      )}
      {unit && <span>{unit}</span>}
    </span>
  );
}

/** Big −/+ stepper (56px buttons) around a numeric input. */
function Stepper({ value, onChange, unit, disabled }: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  disabled?: boolean;
}) {
  const current = Number(value);
  const step = (delta: number) => {
    hapticLight();
    const base = Number.isFinite(current) && value.trim() !== "" ? current : 0;
    onChange(String(Math.max(0, Math.round((base + delta) * 100) / 100)));
  };
  const btn =
    "grid h-14 w-14 flex-none place-items-center rounded-lg border border-border bg-background text-foreground active:bg-muted disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="-1" className={btn} disabled={disabled || !(current > 0)} onClick={() => step(-1)}>
        <Minus className="h-6 w-6" />
      </button>
      <label className="flex h-14 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3">
        <input
          inputMode="numeric"
          pattern="[0-9]*[.,]?[0-9]*"
          value={value}
          disabled={disabled}
          placeholder="0"
          onChange={(e) => onChange(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
          className="h-full min-w-0 flex-1 bg-transparent text-center font-mono text-[32px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50"
        />
        <span className="flex-none text-[14px] text-muted-foreground">{unit}</span>
      </label>
      <button type="button" aria-label="+1" className={btn} disabled={disabled} onClick={() => step(1)}>
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
