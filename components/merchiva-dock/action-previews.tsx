"use client";

// Rich previews on Mr. Merchiva's approval cards (action-card.tsx): the shift,
// the role and the supplier order a card is about, named by what the store
// calls them. An id in the action is resolved through RefIndex; one that names
// nothing shows a neutral label, never the uuid.

import { Calendar, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import { RoleIcon } from "@/components/merchiva-dock/role-icon";
import type { RefIndex } from "@/lib/merchiva/ref-labels";
import { resolveShiftRoles } from "@/lib/merchiva/shift-refs";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function ShiftPreviewStrip({ action, refs }: {
  action: Record<string, unknown>;
  // The store's rows: staffRoles entries (role names or ids) are shown by
  // name, and one that names no role is flagged before the user approves.
  refs: RefIndex;
}) {
  const t = useT();
  const formatDate = useDateFormat();
  // updateShift names its shift by id and carries only what changes: show the
  // shift as it will be — the proposed fields over its current ones.
  const isUpdate = action.action === "updateShift";
  const current = isUpdate ? refs.shift(action.shiftId) : undefined;
  const pick = (key: string) => str(action[key]) || str(current?.[key]);
  const name = pick("staffName") || (action.memberId ? refs.personName(action.memberId) ?? "" : "")
    || (isUpdate ? t("merchiva.refs.unknown") : "");
  const date = pick("date");
  const start = pick("startTime");
  const end = pick("endTime");
  const type = pick("shiftType");
  const { entries } = resolveShiftRoles(action.staffRoles ?? current?.staffRoles, refs.rows.roles ?? []);
  const typeColors: Record<string, string> = {
    morning: STATUS_TONE_CLASSES.warning,
    afternoon: STATUS_TONE_CLASSES.info,
    evening: STATUS_TONE_CLASSES.neutral,
    closing: STATUS_TONE_CLASSES.neutral,
  };
  const dayLabel = date ? formatDate(`${date}T00:00:00`, { weekday: "short", month: "numeric", day: "numeric" }) || date : "";
  return (
    <div className="flex items-center gap-2 mt-1 mb-1 flex-wrap">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-[12.5px] font-medium">{name}</span>
      <span className="text-[11px] text-muted-foreground font-mono">{dayLabel}</span>
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{start}–{end}</span>
      {type && (
        <span className={cn("text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded border", typeColors[type] ?? STATUS_TONE_CLASSES.neutral)}>
          {type}
        </span>
      )}
      {entries.map((entry, i) => {
        // A name the store has no role for, or an id that names none: approval
        // would be refused, so it shows struck out — as the name, or as
        // "unknown role" for an id.
        const isInvalid = entry.name == null;
        return (
          <span
            key={`${i}-${entry.shown ?? ""}`}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border",
              isInvalid
                ? cn(STATUS_TONE_CLASSES.danger, entry.shown != null && "line-through")
                : STATUS_TONE_CLASSES.neutral,
            )}
            title={isInvalid ? t("merchiva.shift.invalidRole") : t("merchiva.shift.jobRole")}
          >
            {entry.name ?? entry.shown ?? t("merchiva.refs.unknownRole")}
          </span>
        );
      })}
    </div>
  );
}

export function RolePreviewStrip({ action, refs }: { action: Record<string, unknown>; refs: RefIndex }) {
  const t = useT();
  // updateRole carries only what changes (a recolor has no name): merge the
  // proposed fields over the role it names.
  const isUpdate = action.action === "updateRole";
  const current = isUpdate ? refs.role(action.roleId) : undefined;
  const pick = (...keys: string[]) => keys.map((k) => str(action[k])).find(Boolean) ?? "";
  const name = pick("name", "title") || str(current?.name) || (isUpdate ? t("merchiva.refs.unknownRole") : "");
  const icon = pick("icon") || str(current?.icon) || "user";
  const color = pick("color") || str(current?.color) || "#44403c";
  const desc = pick("description", "des") || str(current?.description);
  return (
    <div className="flex items-center gap-2.5 mt-1 mb-1">
      <span className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ background: color }}>
        <RoleIcon name={icon} className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">{name}</div>
        {desc && <div className="text-[10.5px] text-muted-foreground truncate">{desc}</div>}
      </div>
    </div>
  );
}

// Rich preview for orderFromSupplier / createPurchaseOrder cards. The generic
// field grid truncated the `items` array to one cut-off line; this lays the
// order out line-by-line (item × qty, unit cost) with a resolved supplier name
// and totals so the user can actually review what they're approving.
function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function supplierOrderItemName(it: Record<string, unknown>, notes = ""): string {
  const direct = [it.name, it.itemName, it.productName, it.inventoryItemName, it.item]
    .map((v) => (v == null ? "" : String(v).trim()))
    .find((v) => v && v !== "—");
  if (direct) return direct;

  const fromZhNote = notes.match(/^([^，,。.\n]+?)\s*(?:补货|補貨|restock|reorder|order)/i)?.[1]?.trim();
  if (fromZhNote) return fromZhNote;
  return "—";
}

function supplierOrderQuantityLabel(it: Record<string, unknown>): string | null {
  const qty = numOrNull(it.quantity ?? it.qty);
  if (qty == null) return null;
  const unitsPerCase = numOrNull(it.unitsPerCase);
  const caseCount = numOrNull(it.caseCount) ?? (unitsPerCase && unitsPerCase > 0 ? Math.ceil(qty / unitsPerCase) : null);
  if (caseCount && unitsPerCase && unitsPerCase > 0) {
    return `${caseCount}*箱 - ${qty}个`;
  }
  const unit = it.unit ? String(it.unit) : "";
  return `× ${qty}${unit && ` ${unit}`}`;
}

export function SupplierOrderPreview({ action, refs }: {
  action: Record<string, unknown>;
  refs: RefIndex;
}) {
  const t = useT();
  // The supplier row by id in either form; a supplierId that names no supplier
  // shows the neutral label, never the id.
  const supplierName =
    (action.supplierName as string | undefined) ||
    str(refs.supplier(action.supplierId)?.name) ||
    t("merchiva.ui.unknownSupplier");
  const items = Array.isArray(action.items)
    ? (action.items as Array<Record<string, unknown>>)
    : [];
  const subtotal = numOrNull(action.subtotal);
  const tax = numOrNull(action.tax);
  // Fall back to summing unitCost × quantity when no explicit total was given.
  const computed = items.reduce((s, it) => {
    const q = numOrNull(it.quantity) ?? 0;
    const c = numOrNull(it.unitCost) ?? 0;
    return s + q * c;
  }, 0);
  const total = numOrNull(action.total) ?? (subtotal != null ? subtotal + (tax ?? 0) : computed || null);
  const notes = action.notes ? String(action.notes) : "";
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="mt-1 mb-2 rounded border border-border bg-background/60">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border">
        <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[12px] font-semibold truncate">{supplierName}</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
          {(items.length === 1 ? t("merchiva.order.itemCount") : t("merchiva.order.itemCountPlural")).replace("{count}", String(items.length))}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-border/60">
          {items.map((it, i) => {
            const name = supplierOrderItemName(it, notes);
            const qtyLabel = supplierOrderQuantityLabel(it);
            const unitCost = numOrNull(it.unitCost);
            return (
              <div key={i} className="flex items-baseline gap-2 px-2.5 py-1.5">
                <span className="text-[12.5px] font-medium truncate flex-1">{name}</span>
                {qtyLabel && (
                  <span className="text-[12px] font-mono tabular-nums text-muted-foreground shrink-0">
                    {qtyLabel}
                  </span>
                )}
                {unitCost != null && (
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-16 text-right">
                    {money(unitCost)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground italic">
          {t("merchiva.ui.noItems")}
        </div>
      )}
      {(subtotal != null || tax != null || total != null) && (
        <div className="flex flex-col gap-0.5 px-2.5 py-1.5 border-t border-border">
          {subtotal != null && (
            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
              <span>{t("merchiva.fields.subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>
          )}
          {tax != null && (
            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
              <span>{t("merchiva.fields.tax")}</span>
              <span>{money(tax)}</span>
            </div>
          )}
          {total != null && (
            <div className="flex justify-between text-[12.5px] font-semibold font-mono">
              <span>{t("merchiva.fields.total").startsWith("merchiva.") ? "Total" : t("merchiva.fields.total")}</span>
              <span>{money(total)}</span>
            </div>
          )}
        </div>
      )}
      {notes && (
        <div className="px-2.5 py-1.5 border-t border-border text-[11.5px] text-muted-foreground">
          {notes}
        </div>
      )}
    </div>
  );
}
