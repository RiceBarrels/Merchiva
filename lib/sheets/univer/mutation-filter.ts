// Which Univer mutations become op-log entries, and which received ops may run (sheets.md §4.3).
//
// Capture (holder) and receive (every other client) apply the same rules, in order:
//   1. options.onlyLocal / fromCollab / fromChangeset → ignore (syncOnly is synced);
//   2. params.unitId is a string other than ours → ignore (cell-editor doc units, the version preview);
//   3. an ignored id (bookkeeping, the protection mutations, formula engine traffic) → ignore;
//   4. a persisted prefix, or a persisted formula id → sync when params is a plain object with our unitId,
//      else snapshot (a persisted mutation we cannot address is carried by the next compaction instead);
//   5. anything else → snapshot.
// Commands and operations are never synced: the prefixes only name `*.mutation.*` ids, so a received
// `sheet.command.*` or `*.operation.*` is refused before Univer sees it.
//
// Pure: no Univer runtime (the ids are literal strings).

import { sanitizeOpParams } from "@/lib/sheets/sanitize";
import type { SheetOp } from "@/lib/sheets/types";

export type MutationDisposition = "sync" | "ignore" | "snapshot";

/** The flags of Univer's IExecutionOptions that decide capture. */
export interface IExecutionOptionsLike {
  readonly onlyLocal?: boolean;
  readonly fromCollab?: boolean;
  readonly fromChangeset?: boolean;
  readonly syncOnly?: boolean;
}

export const SHEET_SYNCED_MUTATION_PREFIXES: readonly string[] = ["sheet.mutation.", "sheets.mutation.", "data-validation.mutation."];

/** The only formula-engine mutations that change the document (defined names); the rest is engine traffic. */
export const FORMULA_PERSISTED_MUTATION_IDS: ReadonlySet<string> = new Set([
  "formula.mutation.set-defined-name",
  "formula.mutation.remove-defined-name",
]);

/**
 * The protection mutations. Their UI is hidden (menu-config.ts) and the lease is the access model, so a
 * captured one is dropped and a received one refused: it could lock every viewer out of a sheet.
 */
export const PROTECTION_MUTATION_IDS: ReadonlySet<string> = new Set([
  "sheet.mutation.add-range-protection",
  "sheet.mutation.delete-range-protection",
  "sheet.mutation.set-range-protection",
  "sheet.mutation.add-worksheet-protection",
  "sheet.mutation.delete-worksheet-protection",
  "sheet.mutation.set-worksheet-protection",
  "sheet.mutation.set-worksheet-permission-points",
]);

/**
 * Ids never synced. Every `formula.mutation.*` outside FORMULA_PERSISTED_MUTATION_IDS is ignored as well.
 * `sheet.operation.clear-drawing-transformer` is registered as a mutation (sheets-drawing 1.0.2) but only
 * clears the drawing selection frame of the local render unit; it runs after every drawing command.
 */
export const SHEET_IGNORED_MUTATION_IDS: ReadonlySet<string> = new Set([
  "sheet.mutation.mark-dirty-filter-change",
  "sheet.mutation.data-validation-formula-mark-dirty",
  "sheet.mutation.toggle-note-popup",
  "sheet.mutation.empty",
  "docs-formula.mutation.set-last-values",
  "sheet.operation.clear-drawing-transformer",
  ...PROTECTION_MUTATION_IDS,
]);

const FORMULA_MUTATION_PREFIX = "formula.mutation.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isIgnoredId(id: string): boolean {
  if (SHEET_IGNORED_MUTATION_IDS.has(id)) return true;
  return id.startsWith(FORMULA_MUTATION_PREFIX) && !FORMULA_PERSISTED_MUTATION_IDS.has(id);
}

function isPersistedId(id: string): boolean {
  return FORMULA_PERSISTED_MUTATION_IDS.has(id) || SHEET_SYNCED_MUTATION_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** §4.3 rules 1–5 for one executed (or received) mutation. */
export function classifyMutation(
  info: { id: string; params?: unknown },
  options: IExecutionOptionsLike | undefined,
  unitId: string,
): MutationDisposition {
  if (options?.onlyLocal || options?.fromCollab || options?.fromChangeset) return "ignore";
  const params = info.params;
  const paramsUnit = typeof params === "object" && params !== null ? (params as { unitId?: unknown }).unitId : undefined;
  if (typeof paramsUnit === "string" && paramsUnit !== unitId) return "ignore";
  if (isIgnoredId(info.id)) return "ignore";
  if (isPersistedId(info.id)) return isPlainObject(params) && params.unitId === unitId ? "sync" : "snapshot";
  return "snapshot";
}

/** Receive side: a plain `{ mutationId, params }` whose mutation classifies as "sync" for `unitId`. */
export function acceptRemoteOp(op: unknown, unitId: string): op is SheetOp {
  if (!isPlainObject(op)) return false;
  const { mutationId, params } = op;
  if (typeof mutationId !== "string" || !isPlainObject(params)) return false;
  return classifyMutation({ id: mutationId, params }, undefined, unitId) === "sync";
}

export type CapturedMutation =
  | { kind: "op"; op: SheetOp }
  | { kind: "snapshot"; mutationId: string }
  | { kind: "ignore" };

/**
 * JSON copy that refuses what JSON would silently change into something else: functions, symbols, bigints and
 * non-plain objects (a Date or a class instance would not replay as the same value). Non-finite numbers pass
 * and become null, exactly as they do in a snapshot (rich-text cells carry an Infinity page size).
 */
function strictJsonClone(value: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(value, function (this: Record<string, unknown>, key: string, current: unknown) {
    const original = key === "" ? current : this[key];
    const type = typeof original;
    if (type === "function" || type === "symbol" || type === "bigint") throw new TypeError(`Unserializable ${type}`);
    if (type === "object" && original !== null && !Array.isArray(original) && !isPlainObject(original)) {
      throw new TypeError("Non-plain object");
    }
    return current;
  });
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Capture (holder side) of one executed mutation: the op to queue, or a compaction request, or nothing.
 * The params are copied (Univer mutates them after execution) and sanitized, so an unsafe URL typed by the
 * holder is saved neutralized. A copy or sanitize failure (the sanitizer refuses some drawing edits and
 * anything past its caps) cannot be sent as an op: the next compaction carries the change instead.
 */
export function captureMutation(
  info: { id: string; params?: unknown },
  options: IExecutionOptionsLike | undefined,
  unitId: string,
): CapturedMutation {
  const disposition = classifyMutation(info, options, unitId);
  if (disposition === "ignore") return { kind: "ignore" };
  if (disposition === "snapshot") return { kind: "snapshot", mutationId: info.id };
  try {
    const params = strictJsonClone(info.params as Record<string, unknown>);
    sanitizeOpParams(info.id, params);
    return { kind: "op", op: { mutationId: info.id, params } };
  } catch {
    return { kind: "snapshot", mutationId: info.id };
  }
}
