"use client";

// Mr. Merchiva's approval card for one action block: what the action will do,
// the autonomy gate's decision, and Approve / Cancel / Undo. Every id in the
// action is shown by the name the store knows the row by (RefIndex); an id
// that names nothing shows a neutral "not found", never the uuid.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, ArrowRight, Bell, BookOpen, Calendar, CalendarX, Check, CheckCircle2,
  KeyRound, ListChecks, Mail, Package, Pencil, Plus, Tag, Ticket, Trash2, Truck, UserMinus, UserPlus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import { GateReasonNote } from "@/components/merchiva-dock/gate-reason-note";
import { ApproveBar, GateBadge } from "@/components/merchiva-dock/gate-controls";
import { RolePreviewStrip, ShiftPreviewStrip, SupplierOrderPreview } from "@/components/merchiva-dock/action-previews";
import type { GateDecision } from "@/lib/merchiva/autonomy";
import { isUndoable } from "@/lib/merchiva/undo";
import { isUuidRef } from "@/lib/merchiva/action-ids";
import { REF_PARAMS, savedRefLabel, type RefIndex, type RefWords } from "@/lib/merchiva/ref-labels";
import type { PendingAction } from "@/lib/merchiva/skills/types";

// Action-meta entries reference a translation key under `merchiva.actions.*` —
// the visible label is resolved at render time via useT().
const ACTION_META: Record<string, { icon: ReactNode; fields: string[]; risk?: "low" | "medium" | "high" }> = {
  // Scheduling
  addShift:            { icon: <Calendar className="h-3 w-3" />, fields: ["staffName", "date", "startTime", "endTime", "shiftType", "staffRoles"] },
  updateShift:         { icon: <Pencil className="h-3 w-3" />, fields: ["shiftId", "date", "startTime", "endTime", "shiftType"] },
  deleteShift:         { icon: <CalendarX className="h-3 w-3" />, fields: ["shiftId"], risk: "high" },
  approveTimeOff:      { icon: <CheckCircle2 className="h-3 w-3" />, fields: ["requestId", "approved", "reason"] },
  approveShiftTrade:   { icon: <ArrowLeftRight className="h-3 w-3" />, fields: ["tradeId", "approved"] },
  // Staff
  addStaffMember:      { icon: <UserPlus className="h-3 w-3" />, fields: ["name", "role", "hourlyRate"] },
  inviteTeamMember:    { icon: <Mail className="h-3 w-3" />, fields: ["email", "role", "orgName"] },
  updateStaffMember:   { icon: <Pencil className="h-3 w-3" />, fields: ["staffMemberId", "name", "role", "hourlyRate"] },
  deleteStaffMember:   { icon: <UserMinus className="h-3 w-3" />, fields: ["staffMemberId"], risk: "high" },
  // The code is the member's clock-in PIN: shown masked (MASKED below).
  setPunchInCode:      { icon: <KeyRound className="h-3 w-3" />, fields: ["memberId", "code"] },
  // Roles
  addRole:             { icon: <Plus className="h-3 w-3" />, fields: ["name", "description", "icon", "color"] },
  updateRole:          { icon: <Pencil className="h-3 w-3" />, fields: ["roleId", "name", "description", "icon", "color"] },
  deleteRole:          { icon: <Trash2 className="h-3 w-3" />, fields: ["roleId"], risk: "high" },
  // Role Tasks
  addRoleTask:         { icon: <ListChecks className="h-3 w-3" />, fields: ["roleId", "title", "description", "startTime", "endTime", "requiresEvidence"] },
  updateRoleTask:      { icon: <Pencil className="h-3 w-3" />, fields: ["taskId", "title", "description", "startTime", "endTime", "requiresEvidence"] },
  deleteRoleTask:      { icon: <Trash2 className="h-3 w-3" />, fields: ["taskId"], risk: "high" },
  // Products
  addProduct:          { icon: <Plus className="h-3 w-3" />, fields: ["name", "category", "price", "cost", "description"] },
  createProduct:       { icon: <Plus className="h-3 w-3" />, fields: ["name", "category", "price", "cost", "description"] },
  updateProduct:       { icon: <Pencil className="h-3 w-3" />, fields: ["productId", "name", "category", "price"] },
  deleteProduct:       { icon: <Trash2 className="h-3 w-3" />, fields: ["productId"], risk: "high" },
  // Inventory
  addInventoryItem:    { icon: <Package className="h-3 w-3" />, fields: ["name", "category", "currentStock", "unit", "supplier"] },
  createInventoryItem: { icon: <Package className="h-3 w-3" />, fields: ["name", "category", "currentStock", "unit", "supplier"] },
  updateInventory:     { icon: <Package className="h-3 w-3" />, fields: ["itemId", "itemName", "quantity", "type"] },
  updateInventoryItem: { icon: <Pencil className="h-3 w-3" />, fields: ["itemId", "name", "minStock", "maxStock"] },
  deleteInventoryItem: { icon: <Trash2 className="h-3 w-3" />, fields: ["itemId"], risk: "high" },
  // Pricing
  updatePrice:         { icon: <Tag className="h-3 w-3" />, fields: ["productId", "productName", "newPrice"] },
  addCoupon:           { icon: <Ticket className="h-3 w-3" />, fields: ["code", "discountType", "discountValue", "expiresAt"] },
  updateCoupon:        { icon: <Pencil className="h-3 w-3" />, fields: ["couponId", "code", "discountValue"] },
  deleteCoupon:        { icon: <Trash2 className="h-3 w-3" />, fields: ["couponId"], risk: "high" },
  // Suppliers
  addSupplier:         { icon: <Truck className="h-3 w-3" />, fields: ["name", "contactName", "email", "phone"] },
  createSupplier:      { icon: <Truck className="h-3 w-3" />, fields: ["name", "contactName", "email", "phone"] },
  updateSupplier:      { icon: <Pencil className="h-3 w-3" />, fields: ["supplierId", "name", "contactName"] },
  deleteSupplier:      { icon: <Trash2 className="h-3 w-3" />, fields: ["supplierId"], risk: "high" },
  createPurchaseOrder: { icon: <Truck className="h-3 w-3" />, fields: ["supplierId", "items", "total"] },
  orderFromSupplier:   { icon: <Mail className="h-3 w-3" />, fields: ["supplierId", "items", "total", "notes"], risk: "high" },
  // Notifications
  createNotification:  { icon: <Bell className="h-3 w-3" />, fields: ["title", "body", "type"] },
  sendNotification:    { icon: <Bell className="h-3 w-3" />, fields: ["title", "body", "type"] },
  // Training curriculum
  addTrainingDay:          { icon: <BookOpen className="h-3 w-3" />, fields: ["dayNumber", "title"] },
  updateTrainingDay:       { icon: <Pencil className="h-3 w-3" />, fields: ["dayId", "dayNumber", "title"] },
  deleteTrainingDay:       { icon: <Trash2 className="h-3 w-3" />, fields: ["dayId", "dayNumber"], risk: "high" },
  addTrainingObjective:    { icon: <Plus className="h-3 w-3" />, fields: ["dayId", "dayNumber", "text"] },
  updateTrainingObjective: { icon: <Pencil className="h-3 w-3" />, fields: ["objectiveId", "text"] },
  deleteTrainingObjective: { icon: <Trash2 className="h-3 w-3" />, fields: ["objectiveId"], risk: "high" },
};

/** Fields never shown in the clear: `code` on setPunchInCode is a member's PIN. */
const MASKED: Record<string, readonly string[]> = { setPunchInCode: ["code"] };

/** A name field the card leaves out when the id beside it names the row. */
const NAME_BESIDE_ID: Record<string, string> = { itemName: "itemId", productName: "productId" };

type Label = (key: string, value: unknown) => string;

function formatActionValue(val: unknown, label: Label, depth = 0): string {
  if (val == null) return "";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  // A uuid in a field that isn't an id parameter still means nothing to a person.
  if (typeof val === "string") return isUuidRef(val) ? label("", val) : val.replace(/<[^>]+>/g, " ").trim();
  if (depth > 3) return "…";
  if (Array.isArray(val)) {
    return val.map((v) => formatActionValue(v, label, depth + 1)).join(" · ");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, fv]) => `${k}: ${REF_PARAMS.has(k) ? label(k, fv) : formatActionValue(fv, label, depth + 1)}`)
      .join(", ");
  }
  return String(val);
}

export function ActionApprovalCard({ action, onApprove, onReject, status, alreadyExecuted, decision, reason, why, refs, savedLabels }: {
  action: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  status: "pending" | "approved" | "rejected";
  alreadyExecuted?: boolean;
  // Autonomy gate decision. Absent ⇒ "auto" (legacy persisted actions).
  decision?: GateDecision;
  // Why the action was proposed/denied: `why` translated, else legacy English `reason`.
  reason?: string;
  why?: PendingAction["why"];
  // The store's rows: every id the action carries is shown by name, and an
  // addShift role that names no role is flagged before the user approves.
  refs: RefIndex;
  // What the ids named when the reply arrived (PendingAction.refLabels): shown
  // once a live lookup fails — after a delete ran, or in a restored reply.
  savedLabels?: PendingAction["refLabels"];
}) {
  const t = useT();
  const actionName = String(action.action ?? "unknown");
  const meta = ACTION_META[actionName];
  const actionLabel = t(`merchiva.actions.${actionName}`);
  // When the lookup returns the path itself (missing key), fall back to the
  // raw action identifier so users see something readable.
  const displayLabel = actionLabel.startsWith("merchiva.actions.") ? actionName : actionLabel;
  const [executing, setExecuting] = useState(false);
  const autoRan = useRef(!!alreadyExecuted);
  const dec: GateDecision = decision ?? "auto";
  const isHighRisk = meta?.risk === "high";
  const needsApproval = dec === "propose";
  const denied = dec === "deny";
  const canUndo = isUndoable(actionName);
  const isShiftAction = actionName === "addShift" || actionName === "updateShift";
  const isRoleAction = actionName === "addRole" || actionName === "updateRole";
  const isSupplierOrder = actionName === "orderFromSupplier" || actionName === "createPurchaseOrder";

  useEffect(() => {
    // Only "auto" decisions self-execute. "propose" waits for a click; "deny"
    // never runs.
    if (status !== "pending" || autoRan.current || dec !== "auto") return;
    autoRan.current = true;
    queueMicrotask(() => {
      setExecuting(true);
      Promise.resolve(onApprove()).finally(() => setExecuting(false));
    });
  }, [status, onApprove, dec]);

  const words: RefWords = { day: (n) => t("merchiva.refs.day").replace("{n}", String(n)) };
  const masked = MASKED[actionName] ?? [];
  const label: Label = (key, value) =>
    (REF_PARAMS.has(key) ? refs.label(key, value, words) : null)
    ?? savedRefLabel(savedLabels, value)
    ?? t("merchiva.refs.unknown");
  const displayFields = (meta?.fields ?? Object.keys(action).filter((k) => k !== "action" && !k.startsWith("__")))
    .filter((k) => action[k] != null && action[k] !== "")
    .filter((k) => !(NAME_BESIDE_ID[k] && action[NAME_BESIDE_ID[k]] != null));
  const fieldText = (key: string): string => {
    const val = action[key];
    if (masked.includes(key)) return "••••";
    if (REF_PARAMS.has(key)) return label(key, val);
    return formatActionValue(val, label);
  };

  const borderColor = status === "approved"
    ? "border-emerald-200 bg-emerald-50/50"
    : status === "rejected"
    ? "border-destructive/30 bg-destructive/5"
    : denied
    ? "border-border bg-muted/60 opacity-75"
    : isHighRisk
    ? "border-amber-200 bg-amber-50/30"
    : "border-border bg-muted/40";

  // Graceful i18n fallback for the autonomy strings: a missing merchiva.* key
  // resolves to the path itself (starts with "merchiva."), so fall back to English.
  const tx = (key: string, fallback: string) => {
    const v = t(key);
    return v.startsWith("merchiva.") ? fallback : v;
  };

  return (
    <div className={cn("rounded-lg border p-3 mt-2", borderColor)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "h-6 px-2 rounded inline-flex items-center gap-1.5",
          "border",
          status === "approved" ? STATUS_TONE_CLASSES.success :
          status === "rejected" ? STATUS_TONE_CLASSES.danger :
          denied ? cn(STATUS_TONE_CLASSES.neutral, "opacity-60") :
          isHighRisk ? STATUS_TONE_CLASSES.warning :
          STATUS_TONE_CLASSES.neutral
        )}>
          {meta?.icon ?? <ArrowRight className="h-3 w-3" />}
          <span className="font-mono text-[10px] tracking-[0.06em] uppercase font-semibold">
            {displayLabel}
          </span>
        </span>
        {denied && <GateBadge decision="deny" />}
        {needsApproval && status === "pending" && <GateBadge decision="propose" warn={isHighRisk} />}
        {executing && (
          <span className="text-[10.5px] font-mono text-muted-foreground inline-flex items-center gap-1 ml-auto">
            <Spinner size={12} /> {t("merchiva.ui.executing")}
          </span>
        )}
        {status === "approved" && !executing && (
          <span className="text-[10.5px] font-mono text-emerald-600 inline-flex items-center gap-1 ml-auto">
            <Check className="h-3 w-3" /> {t("merchiva.ui.executed")}
          </span>
        )}
        {status === "rejected" && (
          <span className="text-[10.5px] font-mono text-destructive inline-flex items-center gap-1 ml-auto">
            <X className="h-3 w-3" /> {t("merchiva.ui.undone")}
          </span>
        )}
      </div>

      {/* Rich preview for specific action types */}
      {isShiftAction && status !== "rejected" && <ShiftPreviewStrip action={action} refs={refs} />}
      {isRoleAction && status !== "rejected" && <RolePreviewStrip action={action} refs={refs} />}
      {isSupplierOrder && status !== "rejected" && <SupplierOrderPreview action={action} refs={refs} />}

      {/* Field grid (skip fields already shown in rich preview) */}
      {!isShiftAction && !isRoleAction && !isSupplierOrder && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
          {displayFields.map((key) => {
            const val = action[key];
            return (
              <div key={key} className={cn("flex items-baseline gap-1.5", Array.isArray(val) && typeof val[0] === "object" && "col-span-2")}>
                <span className="text-[10.5px] text-muted-foreground font-mono shrink-0">
                  {(() => {
                    const fl = t(`merchiva.fields.${key}`);
                    return fl.startsWith("merchiva.fields.") ? key : fl;
                  })()}
                </span>
                <span className="text-[12.5px] font-medium truncate">{fieldText(key)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Why this needs approval (reason from the autonomy gate) */}
      {needsApproval && status === "pending" && <GateReasonNote why={why} reason={reason} />}

      {/* Approve / Reject buttons — shown for any "propose" decision (medium or
          high risk), not just high-risk as before. */}
      {status === "pending" && !executing && needsApproval && (
        <ApproveBar
          onApprove={() => { setExecuting(true); Promise.resolve(onApprove()).finally(() => setExecuting(false)); }}
          onReject={onReject}
        />
      )}
      {/* Executed: real Undo when the action is reversible, otherwise a note. */}
      {status === "approved" && !executing && (
        canUndo ? (
          <Button variant="outline" size="sm" onClick={onReject}
            className="px-3 mt-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            {t("merchiva.ui.undo")}
          </Button>
        ) : (
          <p className="text-[10.5px] text-muted-foreground/70 mt-1 italic">
            {tx("merchiva.ui.cannotUndo", "Can't be undone")}
          </p>
        )
      )}
    </div>
  );
}
