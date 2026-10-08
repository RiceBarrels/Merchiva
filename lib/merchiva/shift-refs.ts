/**
 * Who and which roles an addShift block names. Pure.
 *
 * The approval used to match staffName only and overwrite the model's memberId:
 * a valid memberId (viewTeam / proposeSchedule) was blocked by a slightly
 * different name, a duplicate display name put the shift on the wrong person,
 * and placeholder staff — which the addShift reducer accepts — were refused.
 * Roles were checked by name only, so a role id in staffRoles rendered as a
 * struck-out uuid and failed approval.
 */

import { isUuidRef, sameId, storedId } from "@/lib/merchiva/action-ids";
import { resolveRoleRef, type RoleLike } from "@/lib/merchiva/role-ref";

interface PersonRow {
  id?: unknown;
  /** org_member */
  displayName?: unknown;
  /** staff_member placeholder */
  name?: unknown;
}

function lower(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase();
}

/**
 * The person a shift is for: the memberId first (team, then placeholders),
 * then the name. `memberId` comes back in the stored (hyphenated) form, which
 * is what shift.memberId holds.
 */
export function resolveShiftStaff(
  action: { memberId?: unknown; staffName?: unknown },
  members: readonly PersonRow[],
  placeholders: readonly PersonRow[] = [],
): { memberId: string; name: string } | null {
  const hit = (row: PersonRow | undefined, name: unknown) =>
    row ? { memberId: storedId(row.id), name: String(name ?? "").trim() } : null;
  const id = action.memberId;
  if (id != null && String(id).trim()) {
    const m = members.find((r) => sameId(r.id, id));
    if (m) return hit(m, m.displayName);
    const p = placeholders.find((r) => sameId(r.id, id));
    if (p) return hit(p, p.name);
  }
  const wanted = lower(action.staffName);
  if (!wanted) return null;
  const m = members.find((r) => lower(r.displayName) === wanted);
  if (m) return hit(m, m.displayName);
  const p = placeholders.find((r) => lower(r.name) === wanted);
  return hit(p, p?.name);
}

/** addShift.staffRoles as the model sent it: an array, a JSON string, or one bare name. */
export function shiftRoleEntries(raw: unknown): string[] {
  const list = (v: unknown[]) => v.map((r) => String(r ?? "").trim()).filter(Boolean);
  if (Array.isArray(raw)) return list(raw);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? list(parsed) : [raw.trim()];
  } catch {
    return [raw.trim()];
  }
}

export interface ShiftRoleEntry {
  /** The role's name, or null when the entry names no role of the store. */
  name: string | null;
  /** What the model sent when it names no role, unless that is a uuid (never shown). */
  shown: string | null;
}

/**
 * Each staffRoles entry — a role name or a role id — resolved to the role's
 * name. shift.staffRoles stores names, so `names` is what the shift is written with.
 */
export function resolveShiftRoles(raw: unknown, roles: readonly RoleLike[]): { entries: ShiftRoleEntry[]; names: string[] } {
  const entries = shiftRoleEntries(raw).map((ref): ShiftRoleEntry => {
    const role = resolveRoleRef(roles, ref);
    const name = role ? String(role.name ?? "").trim() || null : null;
    return { name, shown: name ?? (isUuidRef(ref) ? null : ref) };
  });
  const names = [...new Set(entries.map((e) => e.name).filter((n): n is string => !!n))];
  return { entries, names };
}
