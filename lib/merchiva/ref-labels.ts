/**
 * What Mr. Merchiva's cards and toasts show for the ids in an action. Pure.
 *
 * An action block names its rows by id (shiftId, roleId, supplierId, …). The
 * cards printed those verbatim, so a person approving a change read a uuid —
 * "→ 95c5ca9c-…" on every task card, a bare shiftId on "Delete shift". Every
 * id is resolved here against the store's cached rows, in either id form, into
 * the name a person knows the row by. An id that resolves to nothing gives
 * null: the caller shows a neutral "not found" label, never the id.
 */

import { isUuidRef, sameId } from "@/lib/merchiva/action-ids";
import { canonicalUuid } from "@/lib/merchiva/tools/rows";

/** A row as the chat has it: an id plus the columns a label needs. */
type Row = { id?: unknown } & Record<string, unknown>;

export interface RefRows {
  /** org_member rows (the team): id, displayName, userId. */
  members?: readonly Row[];
  /** staff_member placeholders: id, name. */
  placeholders?: readonly Row[];
  /** shift: id, staffName, date, startTime, endTime, staffRoles, shiftType. */
  shifts?: readonly Row[];
  /** time_off_request: id, userId (identity hex), startDate, endDate. */
  timeOff?: readonly Row[];
  /** shift_trade: id, requesterId (org_member id). */
  trades?: readonly Row[];
  /** staff_role: id, name, color, icon, description. */
  roles?: readonly Row[];
  /** role_task: id, roleId, title. */
  tasks?: readonly Row[];
  /** training_day: id, dayNumber, title. */
  trainingDays?: readonly Row[];
  /** training_objective: id, text. */
  objectives?: readonly Row[];
  /** inventory_item (products are its retail rows): id, name, retailPrice. */
  items?: readonly Row[];
  /** supplier: id, name. */
  suppliers?: readonly Row[];
  /** coupon: id, code. */
  coupons?: readonly Row[];
}

/** The words a label needs that are not data — translated by the caller. */
export interface RefWords {
  /** "Day 3" in the viewer's language. */
  day: (n: number) => string;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function byId(rows: readonly Row[] | undefined, id: unknown): Row | undefined {
  return str(id) ? rows?.find((r) => sameId(r.id, id)) : undefined;
}

function plain(html: unknown, max = 60): string {
  const text = str(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function span(a: unknown, b: unknown): string {
  const from = str(a);
  const to = str(b);
  return to && to !== from ? `${from}–${to}` : from;
}

/** Resolves ids to the rows and names a person knows them by. */
export class RefIndex {
  constructor(readonly rows: RefRows = {}) {}

  member(id: unknown): Row | undefined { return byId(this.rows.members, id); }
  placeholder(id: unknown): Row | undefined { return byId(this.rows.placeholders, id); }
  shift(id: unknown): Row | undefined { return byId(this.rows.shifts, id); }
  role(id: unknown): Row | undefined { return byId(this.rows.roles, id); }
  task(id: unknown): Row | undefined { return byId(this.rows.tasks, id); }
  item(id: unknown): Row | undefined { return byId(this.rows.items, id); }
  supplier(id: unknown): Row | undefined { return byId(this.rows.suppliers, id); }
  trainingDay(id: unknown): Row | undefined { return byId(this.rows.trainingDays, id); }

  /** A person on the team or a placeholder, by either id. */
  personName(id: unknown): string | null {
    return str(this.member(id)?.displayName) || str(this.placeholder(id)?.name) || null;
  }

  /** The product's current price — the baseline for the autonomy price cap. */
  retailPrice(productId: unknown): number | null {
    const price = Number(this.item(productId)?.retailPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  /**
   * The label for id parameter `param` holding `value`, or null when it names
   * no row (the caller shows its "not found" label). Never returns an id.
   */
  label(param: string, value: unknown, words: RefWords): string | null {
    if (!str(value)) return null;
    const rows = this.rows;
    switch (param) {
      case "memberId":
      case "staffMemberId":
        return this.personName(value);
      case "shiftId": {
        const s = this.shift(value);
        return s ? [str(s.staffName), str(s.date), span(s.startTime, s.endTime)].filter(Boolean).join(" · ") || null : null;
      }
      case "requestId": {
        const r = byId(rows.timeOff, value);
        if (!r) return null;
        const who = rows.members?.find((m) => str(m.userId) !== "" && str(m.userId) === str(r.userId));
        return [str(who?.displayName), span(r.startDate, r.endDate)].filter(Boolean).join(" · ") || null;
      }
      case "tradeId": {
        const tr = byId(rows.trades, value);
        return tr ? this.personName(tr.requesterId) : null;
      }
      case "roleId":
        return str(this.role(value)?.name) || null;
      case "taskId": {
        const task = this.task(value);
        if (!task) return null;
        const role = str(this.role(task.roleId)?.name);
        return [str(task.title), role].filter(Boolean).join(" · ") || null;
      }
      case "dayId": {
        const d = this.trainingDay(value);
        if (!d) return null;
        const n = Number(d.dayNumber);
        return [Number.isFinite(n) && n > 0 ? words.day(n) : "", str(d.title)].filter(Boolean).join(" · ") || null;
      }
      case "objectiveId":
        return plain(byId(rows.objectives, value)?.text) || null;
      case "itemId":
      case "productId":
      case "inventoryItemId":
        return str(this.item(value)?.name) || null;
      case "supplierId":
        return str(this.supplier(value)?.name) || null;
      case "couponId":
        return str(byId(rows.coupons, value)?.code) || null;
      default:
        // An id parameter this index doesn't know: never echo a uuid.
        return isUuidRef(value) ? null : str(value);
    }
  }
}

/** The id parameters `label` resolves; a card shows these through it. */
export const REF_PARAMS: ReadonlySet<string> = new Set([
  "memberId", "staffMemberId", "shiftId", "requestId", "tradeId", "roleId", "taskId",
  "dayId", "objectiveId", "itemId", "productId", "inventoryItemId", "supplierId", "couponId",
]);

/**
 * The label of every id `action` carries (canonical id → label), taken when the
 * reply arrives. The card shows it once the live lookup no longer resolves: a
 * delete removes its row, and a restored reply would otherwise read "not found"
 * next to "executed". Ids that name nothing now are left out.
 */
export function captureRefLabels(action: Record<string, unknown>, refs: RefIndex, words: RefWords): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (value: unknown, depth: number): void => {
    if (depth > 3 || value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const v of value) walk(v, depth + 1);
      return;
    }
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (REF_PARAMS.has(key) && str(v)) {
        const label = refs.label(key, v, words);
        if (label) out[canonicalUuid(v)] = label;
      } else {
        walk(v, depth + 1);
      }
    }
  };
  walk(action, 0);
  return out;
}

/** The label `captureRefLabels` kept for `id`, if any. */
export function savedRefLabel(saved: Record<string, string> | undefined, id: unknown): string | null {
  return (str(id) && saved?.[canonicalUuid(id)]) || null;
}

/**
 * What an action is about, for its success toast: the row its id names,
 * resolved BEFORE the action runs (a delete removes it), else the name-like
 * field the action carries. Null when there is nothing to name.
 */
export function actionTarget(action: Record<string, unknown>, refs: RefIndex, words: RefWords): string | null {
  for (const param of ["shiftId", "requestId", "tradeId", "staffMemberId", "memberId", "taskId", "roleId", "objectiveId", "dayId", "productId", "itemId", "supplierId", "couponId"]) {
    if (str(action[param])) {
      const label = refs.label(param, action[param], words);
      if (label) return label;
    }
  }
  if (action.dayNumber != null && Number.isFinite(Number(action.dayNumber))) return words.day(Number(action.dayNumber));
  // setPunchInCode's `code` is the member's PIN — never shown.
  const keys = action.action === "setPunchInCode"
    ? ["staffName", "name"]
    : ["staffName", "name", "title", "productName", "itemName", "code", "email"];
  for (const key of keys) {
    const v = str(action[key]);
    if (v && !isUuidRef(v)) return v;
  }
  return null;
}
