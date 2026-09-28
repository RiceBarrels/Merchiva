/**
 * Row look-ups and shared wording for the actions in action-registry.ts. Reads
 * the client cache; ids compare canonically (either form, action-ids.ts).
 */

import { getActiveOrgId, getConnection } from "@/lib/spacetimedb/client";
import { sameId } from "@/lib/merchiva/action-ids";

/**
 * The cached row of `table` whose id is `id`, in either id form. Reducers match
 * `r.id.toString()` (hyphenated) only, so callers pass `storedId(row.id)` on.
 */
export function cachedRow(table: string, id: unknown): unknown {
  const conn = getConnection();
  if (!conn || id == null || String(id).trim() === "") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (conn.db as any)[table]?.iter?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows ? [...(rows as Iterable<any>)].find((r) => sameId(r?.id, id)) : undefined;
}

/** This org's inventory item named by id (either form), else by trimmed, case-insensitive name. */
export function findInventoryItem(id: unknown, name: unknown): { id: unknown; name?: unknown } | undefined {
  const byId = cachedRow("inventoryItem", id) as { id: unknown; name?: unknown } | undefined;
  if (byId) return byId;
  const wanted = String(name ?? "").trim().toLowerCase();
  const conn = getConnection();
  if (!wanted || !conn) return undefined;
  const organizationId = getActiveOrgId();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = [...((conn.db as any).inventoryItem?.iter?.() ?? [])] as any[];
  return rows.find((r) => r?.organizationId === organizationId && String(r?.name ?? "").trim().toLowerCase() === wanted);
}

/** How many entries a JSON string[] column holds (0 when it doesn't parse). */
export function jsonStringCount(raw: unknown): number {
  try {
    const parsed: unknown = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

// A task with photo proof can't be finished on /store or /personal without a
// photo, and the manager then has to pick the group channel that receives it.
// The model must never guess this flag (the report: a closing task flagged
// unasked, stuck on a store with no group channel).
export const EVIDENCE_RULE =
  "Set requiresEvidence only when the user asks for photo proof of this task (photo, picture, proof, evidence, 拍照, 照片, 凭证); otherwise leave it out. Staff must take a photo to finish such a task, and the app asks the manager which group channel receives the photos — never ask about channels yourself.";
export const EVIDENCE_PARAM = "Photo proof required to finish the task. Only when the user asks for it";
