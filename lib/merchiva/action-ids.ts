/**
 * One normalization point for the ids in Mr. Merchiva's action blocks. Pure.
 *
 * The model is handed hyphenated ids now (rows.ts rowId, LIVE STORE DATA), but
 * a 32-hex id still arrives from chat history written before b44acf0 and from
 * the tools-off product list (useProducts maps ids with toHexString()). Most
 * reducers look a row up with `row.id.toString() === arg`, which only matches
 * the hyphenated form — so a bare-hex id failed with "not found" — and the
 * card, the undo snapshot and the executed action each compared ids their own
 * way. Every id parameter listed in ID_SOURCES is rewritten here, once, when
 * the block is parsed and again before it runs (restored history).
 */

import { ID_SOURCES } from "@/lib/merchiva/tools/id-sources";
import { canonicalUuid } from "@/lib/merchiva/tools/rows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A uuid in either form. Such a ref is looked up, never displayed. */
export function isUuidRef(ref: unknown): boolean {
  return UUID_RE.test(canonicalUuid(ref));
}

/**
 * A ref that is an id rather than a name, well-formed or not: a uuid in either
 * form, a truncated or padded one (a hex run of 8+ with a digit in it), or a
 * placeholder like "cashier-role-id" (a few-shot's). Such a ref is never shown.
 */
export function looksLikeId(ref: unknown): boolean {
  const s = ref == null ? "" : String(ref).trim();
  if (!s) return false;
  return isUuidRef(s) || /(?=[0-9a-f]*\d)[0-9a-f]{8,}/i.test(s) || /(^|[-_])id([-_]|$)/i.test(s);
}

/** Two ids name the same row, whichever form each was written in. */
export function sameId(a: unknown, b: unknown): boolean {
  const x = canonicalUuid(a);
  return x !== "" && x === canonicalUuid(b);
}

/**
 * An id as reference columns store it: hyphenated lowercase (role_task.roleId,
 * shift.memberId, …), and what the module's `r.id.toString() === arg` lookups
 * accept. Never toHexString(): rows written that way are invisible to every reader.
 */
export function storedId(id: unknown): string {
  return canonicalUuid(id);
}

/** The top-level id parameters; `inventoryItemId` sits inside `inventoryUsage[]`. */
export const ACTION_ID_PARAMS: ReadonlySet<string> = new Set(
  ID_SOURCES.map((s) => s.param).filter((p) => p !== "inventoryItemId"),
);

function canonicalString(v: unknown): unknown {
  return typeof v === "string" && v.trim() ? canonicalUuid(v) : v;
}

/** A copy of `action` with every id parameter in the hyphenated form. Non-uuid values are left as they are. */
export function normalizeActionIds(action: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...action };
  for (const param of ACTION_ID_PARAMS) {
    if (param in out) out[param] = canonicalString(out[param]);
  }
  if (Array.isArray(out.inventoryUsage)) {
    out.inventoryUsage = out.inventoryUsage.map((line: unknown) =>
      line && typeof line === "object" && "inventoryItemId" in line
        ? { ...(line as Record<string, unknown>), inventoryItemId: canonicalString((line as Record<string, unknown>).inventoryItemId) }
        : line,
    );
  }
  return out;
}

/** `true` / `"true"` only: the model sometimes writes booleans as strings, and Boolean("false") is true. */
export function boolParam(v: unknown): boolean {
  return v === true || (typeof v === "string" && v.trim().toLowerCase() === "true");
}
