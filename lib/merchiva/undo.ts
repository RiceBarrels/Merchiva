/**
 * Real undo for auto-executed / approved Mr. Merchiva actions.
 *
 * The legacy "Undo" button was cosmetic — it flipped the card to a struck-out
 * state without reversing the write. This module builds a genuine inverse for
 * the reversible actions:
 *
 *   • add*    → delete the row that was just created (found by diffing the
 *               table's id-set captured before execution against the live cache).
 *   • update* → restore the fields the action changed to their prior values
 *               (snapshotted from the cache before execution).
 *
 * Actions that can't be cleanly reversed (sent notifications, emailed supplier
 * orders, refunds, builder-canvas events, deletes) return null — the UI shows
 * "can't undo" rather than a button that lies.
 *
 * Flow: call {@link captureUndoSnapshot} BEFORE executing, stash the result in a
 * ref keyed by the action id, then call {@link buildInverse} when the user
 * clicks Undo. Building lazily (not at execution time) lets the SpacetimeDB
 * subscription catch up so an add's new row is visible for the id-diff.
 */

import { getConnection } from "@/lib/spacetimedb/client";
import { sameId } from "@/lib/merchiva/action-ids";
import {
  deleteRoleTask,
  deleteInventoryItem,
  deleteShift,
  deleteStaffMember,
  deleteStaffRole,
  deleteSupplier,
  deleteCoupon,
  deleteTrainingDay,
  deleteTrainingObjective,
  updateInventoryItem,
  updateShift,
  updateStaffMember,
  updateStaffRole,
  updateRoleTask,
  updateSupplier,
  updateCoupon,
} from "@/lib/spacetimedb/actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AddEntity {
  kind: "add";
  /** Accessor on conn.db for the table the row lands in. */
  table: string;
  /** Inverse: delete the newly created row by id. */
  del: (id: string) => Promise<void>;
}

interface UpdateEntity {
  kind: "update";
  table: string;
  /** Param on the action holding the target row id. */
  idParam: string;
  /** Inverse: re-apply an update restoring the prior field values. */
  upd: (id: string, data: Record<string, unknown>) => Promise<void>;
  /** Row fields to snapshot and restore (camelCase, matching the cache row). */
  fields: string[];
}

type Entity = AddEntity | UpdateEntity;

/**
 * Map of reversible action name → how to invert it. Anything absent is treated
 * as non-undoable. `updatePrice` and `addRole`/`updateRole` are aliases that map
 * onto the inventory-item / staff-role entities.
 *
 * Products are inventory_item rows (retailEnabled); there is no product table in
 * the client cache, so the product entries point at `inventoryItem` and restore
 * its retail columns. Every update reducer replaces the whole row, so `fields`
 * lists every column the inverse must carry, not only the ones the action changed.
 */
const ENTITY: Record<string, Entity> = {
  // ── add → delete ──
  addRoleTask: { kind: "add", table: "roleTask", del: deleteRoleTask },
  addProduct: { kind: "add", table: "inventoryItem", del: deleteInventoryItem },
  addInventoryItem: { kind: "add", table: "inventoryItem", del: deleteInventoryItem },
  addShift: { kind: "add", table: "shift", del: deleteShift },
  addStaffMember: { kind: "add", table: "staffMember", del: deleteStaffMember },
  addStaffRole: { kind: "add", table: "staffRole", del: deleteStaffRole },
  addRole: { kind: "add", table: "staffRole", del: deleteStaffRole },
  addSupplier: { kind: "add", table: "supplier", del: deleteSupplier },
  addCoupon: { kind: "add", table: "coupon", del: deleteCoupon },
  addTrainingDay: { kind: "add", table: "trainingDay", del: deleteTrainingDay },
  addTrainingObjective: {
    kind: "add",
    table: "trainingObjective",
    del: deleteTrainingObjective,
  },

  // ── update → restore prior fields ──
  updateProduct: {
    kind: "update",
    table: "inventoryItem",
    idParam: "productId",
    upd: updateInventoryItem,
    fields: ["name", "category", "retailEnabled", "retailPrice", "retailDescription", "retailImageUrl", "retailUsageQty"],
  },
  updatePrice: {
    kind: "update",
    table: "inventoryItem",
    idParam: "productId",
    upd: updateInventoryItem,
    fields: ["retailEnabled", "retailPrice"],
  },
  updateInventoryItem: {
    kind: "update",
    table: "inventoryItem",
    idParam: "itemId",
    upd: updateInventoryItem,
    fields: ["name", "minStock", "maxStock", "unit", "costPerUnit"],
  },
  updateShift: {
    kind: "update",
    table: "shift",
    idParam: "shiftId",
    upd: updateShift,
    fields: ["memberId", "staffName", "staffRole", "staffRoles", "date", "startTime", "endTime", "shiftType", "predictedDemand"],
  },
  updateStaffMember: {
    kind: "update",
    table: "staffMember",
    idParam: "staffMemberId",
    upd: updateStaffMember,
    fields: ["name", "role", "hourlyRate"],
  },
  updateStaffRole: {
    kind: "update",
    table: "staffRole",
    idParam: "roleId",
    upd: updateStaffRole,
    fields: ["name", "description", "color", "icon", "permissions"],
  },
  updateRole: {
    kind: "update",
    table: "staffRole",
    idParam: "roleId",
    upd: updateStaffRole,
    fields: ["name", "description", "color", "icon", "permissions"],
  },
  updateRoleTask: {
    kind: "update",
    table: "roleTask",
    idParam: "taskId",
    upd: updateRoleTask,
    fields: ["title", "description", "startTime", "endTime", "sortOrder", "requiresEvidence", "notifyChats"],
  },
  updateSupplier: {
    kind: "update",
    table: "supplier",
    idParam: "supplierId",
    upd: updateSupplier,
    fields: ["name", "contactName", "email", "phone", "address", "paymentTerms", "notes", "rating", "language"],
  },
  updateCoupon: {
    kind: "update",
    table: "coupon",
    idParam: "couponId",
    upd: updateCoupon,
    fields: ["code", "discountValue", "expiresAt", "active"],
  },
};

export interface UndoSnapshot {
  actionName: string;
  /** add: ids present in the table before execution. */
  idsBefore?: string[];
  /** update: id of the row + its prior field values. */
  rowId?: string;
  priorFields?: Record<string, unknown>;
}

export interface Inverse {
  run: () => Promise<void>;
}

/** Is this action reversible at all? Drives whether the UI shows an Undo button. */
export function isUndoable(actionName: string): boolean {
  return actionName in ENTITY;
}

function tableRows(table: string): any[] {
  const c = getConnection();
  if (!c) return [];
  try {
    const iter = (c.db as any)[table]?.iter?.();
    return iter ? Array.from(iter as Iterable<any>) : [];
  } catch {
    return [];
  }
}

function rowIdStr(r: any): string {
  return r?.id?.toString?.() ?? String(r?.id);
}

/**
 * Snapshot the state needed to invert an action, taken immediately BEFORE the
 * action executes. Returns null for non-undoable actions.
 */
export function captureUndoSnapshot(
  actionName: string,
  params: Record<string, unknown>,
): UndoSnapshot | null {
  const entity = ENTITY[actionName];
  if (!entity) return null;

  if (entity.kind === "add") {
    return { actionName, idsBefore: tableRows(entity.table).map(rowIdStr) };
  }

  // update: capture the target row's prior values for the fields we may restore.
  // The id may be in either form; the inverse gets the row's own (hyphenated) id.
  const id = String(params[entity.idParam] ?? "");
  if (!id) return null;
  const row = tableRows(entity.table).find((r) => sameId(r?.id, id));
  if (!row) return null;
  const priorFields: Record<string, unknown> = {};
  for (const f of entity.fields) priorFields[f] = (row as any)[f];
  return { actionName, rowId: rowIdStr(row), priorFields };
}

/**
 * Build the runnable inverse from a snapshot, computed at Undo-click time so the
 * subscription has caught up. Returns null when the inverse can't be determined
 * (e.g. an add whose new row can't be uniquely identified).
 */
export function buildInverse(
  params: Record<string, unknown>,
  snapshot: UndoSnapshot,
): Inverse | null {
  const entity = ENTITY[snapshot.actionName];
  if (!entity) return null;

  if (entity.kind === "add") {
    const before = new Set(snapshot.idsBefore ?? []);
    const fresh = tableRows(entity.table)
      .map(rowIdStr)
      .filter((id) => !before.has(id));
    // Only undo when exactly one new row is attributable to this action.
    if (fresh.length !== 1) return null;
    const newId = fresh[0];
    return { run: () => entity.del(newId) };
  }

  // update: restore the snapshotted prior field values.
  if (!snapshot.rowId || !snapshot.priorFields) return null;
  const restore = snapshot.priorFields;
  return { run: () => entity.upd(snapshot.rowId!, restore) };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
