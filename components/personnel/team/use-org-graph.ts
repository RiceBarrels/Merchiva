"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useOrgMembers,
  useStaffRoles,
  useOrgInvitations,
  useUsers,
  useSpacetimeDB,
} from "@/lib/spacetimedb/hooks";
import {
  addStaffRole,
  cancelInvitation,
  deleteStaffRole,
  updateMember,
  updateStaffRole,
} from "@/lib/spacetimedb/actions";
import { getConnection } from "@/lib/spacetimedb/client";
import { isOnline } from "@/lib/offline";
import { defaultPermissions, ownerPermissions } from "@/lib/db/team";
import { useT } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";
import type { Permissions } from "@/lib/types";
import {
  CARD_W,
  CARD_H,
  DEFAULT_VIEW,
  GROUP_HEADER_H,
  GROUP_KINDS,
  GROUP_PAD_X,
  GROUP_PAD_Y,
  ORG_PERMS_FLAT,
  builtinRoleName,
  computeLevels,
  emptyLayout,
  flatToPerms,
  fmt,
  groupDisplayName,
  groupSize,
  layeredLayout,
  layeredLayoutInGroup,
  layoutInGroup,
  loadLayout,
  nextId,
  permsToFlat,
  readRoleAppPerms,
  saveLayout,
  writeRoleAppPerms,
  type EdgeLayout,
  type GroupKind,
  type GroupNode,
  type GroupNodeLayout,
  type OrgLayout,
  type OrgNode,
  type PersonLayout,
  type PersonNode,
  type ViewLayout,
} from "./data";

export interface RoleRow {
  id: string;              // staff_role id, or `__builtin__<key>` for a placeholder
  key: string;             // lower-cased trimmed DB name — what org_member.role matches
  name: string;            // display name (built-ins translated)
  color: string;
  icon: string;
  description: string;
  perms: string[];         // default flat perm ids for this role
  rawPermissions: unknown; // stored JSON (other editors' keys must survive writes)
  isBuiltin: boolean;      // owner / manager / staff — can't be renamed or deleted
  isPlaceholder: boolean;  // built-in with no staff_role row yet
}

export type RoleFieldsPatch = Partial<Pick<RoleRow, "name" | "color" | "icon" | "description" | "perms">>;

// ─── SpacetimeDB row shapes (only the columns this hook reads) ─────────────

interface MemberRowLike {
  id: unknown;
  organizationId: string;
  userId: unknown;
  role: string;
  displayName: string;
  email: string;
  permissions: string;
  status: string;
  hasPunchCode?: boolean;
  joinedAt?: unknown;
}

interface StaffRoleRowLike {
  id: unknown;
  organizationId: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: unknown;
}

interface InvitationRowLike {
  id: unknown;
  organizationId: string;
  email: string;
  role: string;
  permissions: string;
  expiresAt: unknown;
  acceptedAt?: unknown;
  createdAt?: unknown;
}

interface RoleDbFields {
  name: string;
  color: string;
  icon: string;
  description: string;
  permissions: string;
}

/** The two org_member columns updateMemberPermissions overwrites together. */
interface MemberDbFields {
  role: string;
  permissions: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PLACEHOLDER_PREFIX = "__builtin__";
const BUILTIN_ROLES = ["owner", "manager", "staff"] as const;
type BuiltinRoleKey = (typeof BUILTIN_ROLES)[number];

const BUILTIN_ROLE_COLORS: Record<BuiltinRoleKey, string> = {
  owner: "#1c1917",
  manager: "#7c3aed",
  staff: "#78716c",
};

const BUILTIN_ROLE_DESC_KEYS: Record<BuiltinRoleKey, string> = {
  owner: "personnel.team.org.graph.roleDescOwner",
  manager: "personnel.team.org.graph.roleDescManager",
  staff: "personnel.team.org.graph.roleDescStaff",
};

const ROLE_PALETTE = ["#7c3aed", "#0891b2", "#0d9488", "#16a34a", "#ea580c", "#dc2626"];

/** How long to wait for a reducer's write (role or member) to show up in the subscription. */
const ROLE_SYNC_TIMEOUT_MS = 5000;

// Auto-placement strip for people who have never been positioned.
const STRIP_X = 60;
const STRIP_Y = 80;
const STRIP_GAP = 60;
const STRIP_COLS = 8;
const STRIP_COL_GAP = 16;
const STRIP_ROW_GAP = 40;

// ─── Pure helpers ──────────────────────────────────────────────────────────

function isBuiltinKey(key: string): key is BuiltinRoleKey {
  return (BUILTIN_ROLES as readonly string[]).includes(key);
}

function normKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function idOf(value: unknown): string {
  return String(value ?? "");
}

function inviteNodeId(i: InvitationRowLike): string {
  return `inv-${idOf(i.id)}`;
}

/** Persisted name for a materialised built-in — must lower-case to its key. */
function canonicalBuiltinName(key: BuiltinRoleKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function errorDescription(err: unknown): { description: string } | undefined {
  return err instanceof Error && err.message ? { description: err.message } : undefined;
}

function parseMaybeJSON(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * Merge a member's stored permissions JSON onto the base its role implies.
 * Owners get `ownerPermissions()` as the base — same as app/manager/layout.tsx
 * — so sections added after the row was written (training_grading, merchiva)
 * read as granted instead of falling back to the staff default. Without this
 * the inspector shows an owner missing permissions that `can()` grants them.
 */
function parsePermissions(raw: unknown, role?: unknown): Permissions {
  const base = normKey(role) === "owner" ? ownerPermissions() : defaultPermissions();
  const parsed = parseMaybeJSON(raw);
  if (parsed && typeof parsed === "object") {
    return { ...base, ...(parsed as Partial<Permissions>) } as Permissions;
  }
  return base;
}

/**
 * Apply the graph's flat catalog ids on top of a member's stored permissions.
 * Leaves the catalog doesn't cover (e.g. legacy sections) keep their stored
 * value, except edit/invite are dropped when the section's view is unticked.
 */
function mergeCatalogPerms(existing: Permissions, ids: string[]): Permissions {
  const catalog = new Set(ORG_PERMS_FLAT.map((leaf) => leaf.id));
  const out = flatToPerms(ids) as unknown as Record<string, Record<string, boolean | undefined>>;
  const prev = existing as unknown as Record<string, unknown>;
  for (const [section, value] of Object.entries(prev)) {
    if (!value || typeof value !== "object") continue;
    const target: Record<string, boolean | undefined> = { ...(out[section] ?? {}) };
    for (const [action, flag] of Object.entries(value as Record<string, unknown>)) {
      if (catalog.has(`${section}.${action}`) || typeof flag !== "boolean") continue;
      target[action] = flag;
    }
    if (catalog.has(`${section}.view`) && target.view !== true) {
      if (target.edit) target.edit = false;
      if (target.invite) target.invite = false;
    }
    out[section] = target;
  }
  return out as unknown as Permissions;
}

/** Milliseconds for a SpacetimeDB Timestamp (or anything Date can parse). */
function timestampMs(value: unknown): number | null {
  if (value == null) return null;
  const ts = value as { toDate?: () => Date; microsSinceUnixEpoch?: unknown };
  if (typeof ts.toDate === "function") {
    try {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof ts.microsSinceUnixEpoch === "bigint") {
    return Number(ts.microsSinceUnixEpoch / BigInt(1000));
  }
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function rowIdentityKey(value: unknown): string {
  if (value && typeof (value as { toHexString?: () => string }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }
  if (value && typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return String(value ?? "");
}

function avatarMapFromUsers(rawUsers: readonly unknown[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const user of rawUsers as Array<{ identity?: unknown; avatarUrl?: string | null }>) {
    if (!user.identity) continue;
    const avatarUrl = user.avatarUrl ?? null;
    const key = rowIdentityKey(user.identity);
    if (key) map.set(key, avatarUrl);
    const textKey = String(user.identity);
    if (textKey) map.set(textKey, avatarUrl);
  }
  return map;
}

function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (condition()) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** Run `fn` after every earlier task queued under the same key has settled. */
function runSerial<T>(queues: Map<string, Promise<unknown>>, key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(key, run);
  const clear = () => {
    if (queues.get(key) === run) queues.delete(key);
  };
  run.then(clear, clear);
  return run;
}

function sameRoleFields(a: RoleDbFields, b: RoleDbFields): boolean {
  return a.name === b.name && a.color === b.color && a.icon === b.icon
    && a.description === b.description && a.permissions === b.permissions;
}

/** The module stores both columns verbatim, so an echo matches what was sent exactly. */
function memberDbFields(row: MemberRowLike): MemberDbFields {
  return {
    role: String(row.role ?? ""),
    permissions: typeof row.permissions === "string" ? row.permissions : JSON.stringify(row.permissions ?? {}),
  };
}

/** Writes would be queued (or throw) instead of reaching the module right now. */
function connectionOffline(): boolean {
  return !isOnline() || !getConnection();
}

// ─── Layout helpers (operate on live person nodes) ─────────────────────────

interface LivePerson {
  id: string;
  x: number;
  y: number;
  groupId: string | null;
}

/** Live people with their latest position: saved layout entry, else rendered spot. */
function livePersonsFor(l: OrgLayout, persons: readonly PersonNode[]): LivePerson[] {
  const groupIds = new Set(l.groups.map((g) => g.id));
  return persons.map((p) => {
    const saved = l.positions[p.id];
    const groupId = saved?.groupId ?? null;
    return {
      id: p.id,
      x: saved?.x ?? p.x,
      y: saved?.y ?? p.y,
      groupId: groupId && groupIds.has(groupId) ? groupId : null,
    };
  });
}

function byReadingOrder(a: LivePerson, b: LivePerson): number {
  return a.y - b.y || a.x - b.x;
}

function cardCenterInGroup(g: GroupNodeLayout, x: number, y: number): boolean {
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  return cx >= g.x && cx <= g.x + g.w && cy >= g.y + GROUP_HEADER_H && cy <= g.y + g.h;
}

/** First grid slot inside `g` that none of `others` (every other live card) overlaps. */
function nextSlotInGroup(g: GroupNodeLayout, others: LivePerson[]): { x: number; y: number } {
  const cols = Math.max(1, Math.floor((g.w - GROUP_PAD_X * 2 + STRIP_COL_GAP) / (CARD_W + STRIP_COL_GAP)));
  // One card can cover at most 4 grid slots, so 4n+1 slots always hold a free one.
  const count = others.length * 4 + 1;
  const slots = layoutInGroup(g.x, g.y, Array.from({ length: count }, (_, i) => ({ id: String(i) })), cols);
  const free = slots.find((s) => !others.some((o) => Math.abs(o.x - s.x) < CARD_W && Math.abs(o.y - s.y) < CARD_H));
  return free ?? slots[slots.length - 1];
}

/**
 * Write a person's layout entry. A group assignment without explicit x/y drops
 * the card into the group's next free slot (growing the box) unless it already
 * sits inside; ungrouping keeps the current spot.
 */
function applyPersonLayout(
  l: OrgLayout,
  id: string,
  patch: { x?: number; y?: number; groupId?: string | null },
  persons: readonly PersonNode[],
): OrgLayout {
  const live = livePersonsFor(l, persons);
  const self = live.find((p) => p.id === id);
  const saved = l.positions[id];
  let x = patch.x ?? saved?.x ?? self?.x ?? STRIP_X;
  let y = patch.y ?? saved?.y ?? self?.y ?? STRIP_Y;
  const hasGroupPatch = "groupId" in patch;
  let groupId = hasGroupPatch ? (patch.groupId ?? null) : (saved?.groupId ?? null);
  let groups = l.groups;

  if (groupId) {
    const g = l.groups.find((n) => n.id === groupId);
    if (!g) {
      groupId = null;
    } else if (hasGroupPatch && patch.x == null && patch.y == null && !cardCenterInGroup(g, x, y)) {
      // Every other card counts: an ungrouped card can still sit inside the box.
      const others = live.filter((p) => p.id !== id);
      const slot = nextSlotInGroup(g, others);
      x = slot.x;
      y = slot.y;
      const w = Math.max(g.w, slot.x - g.x + CARD_W + GROUP_PAD_X);
      const h = Math.max(g.h, slot.y - g.y + CARD_H + GROUP_PAD_Y);
      if (w !== g.w || h !== g.h) {
        groups = l.groups.map((n) => (n.id === g.id ? { ...n, w, h } : n));
      }
    }
  }

  if (saved && saved.x === x && saved.y === y && (saved.groupId ?? null) === groupId && groups === l.groups) {
    return l;
  }
  return { ...l, groups, positions: { ...l.positions, [id]: { x, y, groupId } } };
}

function samePositions(a: Record<string, PersonLayout>, b: Record<string, PersonLayout>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    const p = a[k];
    const q = b[k];
    if (!q || p.x !== q.x || p.y !== q.y || (p.groupId ?? null) !== (q.groupId ?? null)) return false;
  }
  return true;
}

/**
 * Bring the stored layout in line with the live rows:
 *  1. migrate entries/edges of dead ids to their alias (accepted or re-sent invite → member / newest invite)
 *  2. drop entries and edges for ids that no longer exist, null groupIds of deleted groups
 *  3. persist the rendered spot of people who were never positioned
 */
function reconcileLayout(l: OrgLayout, persons: readonly PersonNode[], aliases: Map<string, string>): OrgLayout {
  const liveIds = new Set(persons.map((p) => p.id));
  const groupIds = new Set(l.groups.map((g) => g.id));

  const positions: Record<string, PersonLayout> = {};
  for (const [id, entry] of Object.entries(l.positions)) {
    if (liveIds.has(id)) positions[id] = entry;
  }
  for (const [id, entry] of Object.entries(l.positions)) {
    if (liveIds.has(id)) continue;
    const target = aliases.get(id);
    if (target && liveIds.has(target) && !positions[target]) positions[target] = entry;
  }
  for (const [id, entry] of Object.entries(positions)) {
    if (entry.groupId && !groupIds.has(entry.groupId)) positions[id] = { ...entry, groupId: null };
  }
  for (const p of persons) {
    if (!positions[p.id] && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      positions[p.id] = { x: p.x, y: p.y, groupId: null };
    }
  }

  const valid = new Set([...liveIds, ...groupIds]);
  const seen = new Set<string>();
  const edges: EdgeLayout[] = [];
  for (const e of l.edges) {
    const from = valid.has(e.from) ? e.from : aliases.get(e.from);
    const to = valid.has(e.to) ? e.to : aliases.get(e.to);
    if (!from || !to || from === to || !valid.has(from) || !valid.has(to)) continue;
    const k = `${from}>${to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push(from === e.from && to === e.to ? e : { ...e, from, to });
  }

  const edgesSame = edges.length === l.edges.length && edges.every((e, i) => e === l.edges[i]);
  if (edgesSame && samePositions(positions, l.positions)) return l;
  return { ...l, positions, edges: edgesSame ? l.edges : edges };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UseOrgGraphResult {
  nodes: OrgNode[];
  /** Only edges whose endpoints both exist in `nodes`. */
  edges: EdgeLayout[];
  roles: RoleRow[];
  view: ViewLayout;
  loaded: boolean;
  myMemberId: string | null;

  setView: (next: ViewLayout) => void;

  // Layout fields go to localStorage; role/perms go to SpacetimeDB.
  updateNode: (id: string, patch: Partial<PersonNode> & Partial<GroupNode> & { role?: string; perms?: string[] }) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveGroup: (id: string, gx: number, gy: number, memberSnapshots: Array<{ id: string; ox: number; oy: number }>, dx: number, dy: number) => void;
  resizeGroup: (id: string, w: number, h: number) => void;
  dropPersonInGroup: (personId: string, groupId: string | null) => void;
  /** Group: delete it (members ungrouped). Person: clear group, relationships and saved spot (member stays). */
  deleteNode: (id: string) => void;

  createEdge: (from: string, to: string) => void;
  deleteEdge: (id: string) => void;

  addGroup: () => string;
  duplicateGroup: (id: string) => string | null;
  tidyGroup: (groupId: string) => void;
  autoLayout: () => void;

  upsertRole: (id: string, next: RoleFieldsPatch) => Promise<boolean>;
  /** Resolves to the new role's key. */
  createRole: (defaults?: RoleFieldsPatch) => Promise<string | null>;
  deleteRole: (id: string) => Promise<boolean>;
  /** `nodeId` is `inv-<invitationId>`. Does not confirm. */
  cancelInvite: (nodeId: string) => Promise<boolean>;
}

export function useOrgGraph(orgId: string): UseOrgGraphResult {
  const t = useT();
  const { isOwner } = usePermissions();
  const [rawMembers, membersReady] = useOrgMembers() as unknown as [readonly MemberRowLike[], boolean];
  const [rawUsers] = useUsers() as unknown as [readonly unknown[], boolean];
  const [rawRoles] = useStaffRoles() as unknown as [readonly StaffRoleRowLike[], boolean];
  const [rawInvitations, invitationsReady] = useOrgInvitations() as unknown as [readonly InvitationRowLike[], boolean];
  const stdb = useSpacetimeDB();

  const [layout, setLayout] = useState<OrgLayout>(() => emptyLayout());
  const [layoutOrgId, setLayoutOrgId] = useState<string | null>(null);
  const layoutLoaded = layoutOrgId === orgId;

  // Clock for invitation expiry.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Reload layout when org changes.
  useEffect(() => {
    setLayout(loadLayout(orgId));
    setLayoutOrgId(orgId);
  }, [orgId]);

  // Persist on change (never write one org's layout under another org's key).
  useEffect(() => {
    if (!layoutLoaded) return;
    saveLayout(orgId, layout);
  }, [orgId, layout, layoutLoaded]);

  // ── Roles ────────────────────────────────────────────────────────────────
  const roleDb = useMemo(() => {
    const map = new Map<string, RoleDbFields>();
    for (const r of rawRoles || []) {
      if (r.organizationId !== orgId) continue;
      map.set(idOf(r.id), {
        name: String(r.name ?? ""),
        color: String(r.color ?? "#44403c"),
        icon: String(r.icon ?? "user"),
        description: String(r.description ?? ""),
        permissions: typeof r.permissions === "string" ? r.permissions : JSON.stringify(r.permissions ?? {}),
      });
    }
    return map;
  }, [rawRoles, orgId]);

  const roles = useMemo<RoleRow[]>(() => {
    const fromDb: RoleRow[] = [];
    for (const [id, f] of roleDb) {
      const key = normKey(f.name);
      const builtin = isBuiltinKey(key);
      fromDb.push({
        id,
        key,
        name: builtin ? (builtinRoleName(t, key) ?? f.name) : f.name,
        color: f.color,
        icon: f.icon,
        description: f.description || (builtin ? t(BUILTIN_ROLE_DESC_KEYS[key]) : ""),
        perms: readRoleAppPerms(f.permissions),
        rawPermissions: f.permissions,
        isBuiltin: builtin,
        isPlaceholder: false,
      });
    }
    // Built-ins are used by every member's `role` even when the org never
    // created a row for them — show placeholders (staff, manager, owner first).
    const have = new Set(fromDb.map((r) => r.key));
    const placeholders: RoleRow[] = BUILTIN_ROLES.filter((k) => !have.has(k)).reverse().map((k) => ({
      id: `${PLACEHOLDER_PREFIX}${k}`,
      key: k,
      name: builtinRoleName(t, k) ?? canonicalBuiltinName(k),
      color: BUILTIN_ROLE_COLORS[k],
      icon: "user",
      description: t(BUILTIN_ROLE_DESC_KEYS[k]),
      perms: [],
      rawPermissions: "",
      isBuiltin: true,
      isPlaceholder: true,
    }));
    return [...placeholders, ...fromDb];
  }, [roleDb, t]);

  // ── Members + invitations ────────────────────────────────────────────────
  const myUserId = stdb?.identity?.toString?.() ?? null;
  const myUserKey = rowIdentityKey(stdb?.identity ?? myUserId);
  const avatarByUserId = useMemo(() => avatarMapFromUsers(rawUsers), [rawUsers]);

  const rows = useMemo(() => {
    const members = (rawMembers || []).filter((m) => m.organizationId === orgId && m.status !== "removed");
    const memberIdByEmail = new Map<string, string>();
    for (const m of members) {
      const ek = normKey(m.email);
      if (ek && !memberIdByEmail.has(ek)) memberIdByEmail.set(ek, idOf(m.id));
    }

    // Pending = not accepted, not expired, not already a member; newest per email.
    const orgInvites = (rawInvitations || []).filter((i) => i.organizationId === orgId);
    const newestByEmail = new Map<string, InvitationRowLike>();
    for (const i of orgInvites) {
      if (i.acceptedAt != null) continue;
      const expires = timestampMs(i.expiresAt);
      if (expires != null && expires <= now) continue;
      const ek = normKey(i.email) || inviteNodeId(i);
      if (memberIdByEmail.has(ek)) continue;
      const current = newestByEmail.get(ek);
      if (!current || (timestampMs(i.createdAt) ?? 0) > (timestampMs(current.createdAt) ?? 0)) {
        newestByEmail.set(ek, i);
      }
    }
    const invites = [...newestByEmail.values()];

    // acceptInvitation writes member.joinedAt and invitation.acceptedAt from the
    // same transaction timestamp — that links them even when the invite was
    // accepted under a different account email.
    const memberIdsByJoinedMs = new Map<number, string[]>();
    for (const m of members) {
      const ms = timestampMs(m.joinedAt);
      if (ms == null) continue;
      const list = memberIdsByJoinedMs.get(ms);
      if (list) list.push(idOf(m.id));
      else memberIdsByJoinedMs.set(ms, [idOf(m.id)]);
    }

    // Hidden invitation ids → the node that now stands for that person.
    const liveInviteByEmail = new Map(invites.map((i) => [normKey(i.email), inviteNodeId(i)]));
    const aliases = new Map<string, string>();
    for (const i of orgInvites) {
      const nodeId = inviteNodeId(i);
      let target: string | undefined;
      if (i.acceptedAt != null) {
        const acceptedMs = timestampMs(i.acceptedAt);
        const joined = acceptedMs != null ? memberIdsByJoinedMs.get(acceptedMs) : undefined;
        if (joined && joined.length === 1) target = joined[0];
      }
      const ek = normKey(i.email);
      if (!target && ek) target = memberIdByEmail.get(ek) ?? liveInviteByEmail.get(ek);
      if (target && target !== nodeId) aliases.set(nodeId, target);
    }
    return { members, invites, aliases, orgInvites };
  }, [rawMembers, rawInvitations, orgId, now]);

  const allPersons = useMemo<PersonNode[]>(() => {
    const { members, invites } = rows;
    const positions = layout.positions;
    const groupIds = new Set(layout.groups.map((g) => g.id));
    const memberIds = members.map((m) => idOf(m.id));
    const inviteIds = invites.map(inviteNodeId);

    // Never-positioned people go in a strip below everything already placed.
    let maxBottom = -Infinity;
    for (const id of [...memberIds, ...inviteIds]) {
      const p = positions[id];
      if (p) maxBottom = Math.max(maxBottom, p.y + CARD_H);
    }
    for (const g of layout.groups) maxBottom = Math.max(maxBottom, g.y + g.h);
    const stripY = Number.isFinite(maxBottom) ? maxBottom + STRIP_GAP : STRIP_Y;
    const placed = new Map<string, { x: number; y: number; groupId: string | null }>();
    const unplaced = [...memberIds, ...inviteIds].filter((id) => !positions[id]);
    unplaced.forEach((id, slot) => {
      placed.set(id, {
        x: STRIP_X + (slot % STRIP_COLS) * (CARD_W + STRIP_COL_GAP),
        y: stripY + Math.floor(slot / STRIP_COLS) * (CARD_H + STRIP_ROW_GAP),
        groupId: null,
      });
    });
    const place = (id: string): { x: number; y: number; groupId: string | null } => {
      const saved = positions[id];
      if (saved) {
        return { x: saved.x, y: saved.y, groupId: saved.groupId && groupIds.has(saved.groupId) ? saved.groupId : null };
      }
      return placed.get(id) ?? { x: STRIP_X, y: stripY, groupId: null };
    };

    const out: PersonNode[] = members.map((m, idx) => {
      const id = memberIds[idx];
      const userId = rowIdentityKey(m.userId);
      const rawRole = String(m.role ?? "staff");
      const displayName = String(m.displayName ?? "").trim() ? String(m.displayName) : String(m.email || "—");
      const pos = place(id);
      return {
        id,
        kind: "person",
        name: displayName,
        en: displayName,
        email: String(m.email ?? ""),
        avatarUrl: avatarByUserId.get(userId) ?? null,
        role: normKey(rawRole),
        orgRole: rawRole,
        status: String(m.status ?? "active"),
        groupId: pos.groupId,
        x: pos.x,
        y: pos.y,
        perms: permsToFlat(parsePermissions(m.permissions, rawRole)),
        rawPermissions: m.permissions,
        hasPunchCode: m.hasPunchCode === true,
        isMe: !!myUserId && (userId === myUserId || userId === myUserKey || String(m.userId) === myUserId),
      };
    });

    // Pending invitations also appear as people so they can be placed before they join.
    invites.forEach((i, idx) => {
      const id = inviteIds[idx];
      const email = String(i.email ?? "");
      const local = email.split("@")[0] || "—";
      const rawRole = String(i.role ?? "staff");
      const pos = place(id);
      out.push({
        id,
        kind: "person",
        name: local,
        en: local,
        email,
        avatarUrl: null,
        role: normKey(rawRole),
        orgRole: rawRole,
        status: "invited",
        groupId: pos.groupId,
        x: pos.x,
        y: pos.y,
        perms: permsToFlat(parsePermissions(i.permissions, rawRole)),
        rawPermissions: i.permissions,
        hasPunchCode: false,
        isMe: false,
      });
    });
    return out;
  }, [rows, layout.positions, layout.groups, myUserId, myUserKey, avatarByUserId]);

  // ── Group nodes ─────────────────────────────────────────────────────────
  const groups = useMemo<GroupNode[]>(
    () =>
      layout.groups.map((g) => ({
        id: g.id,
        kind: "group" as const,
        name: g.name,
        groupKind: g.groupKind,
        desc: g.desc,
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        perms: [],
      })),
    [layout.groups],
  );

  const nodes = useMemo<OrgNode[]>(() => [...groups, ...allPersons], [groups, allPersons]);

  const edges = useMemo<EdgeLayout[]>(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const live = layout.edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));
    return live.length === layout.edges.length ? layout.edges : live;
  }, [layout.edges, nodes]);

  const myMemberId = useMemo(() => allPersons.find((p) => p.isMe)?.id ?? null, [allPersons]);

  const view = useMemo<ViewLayout>(() => layout.view ?? { ...DEFAULT_VIEW }, [layout.view]);

  // ── Latest values for async flows and setState updaters ─────────────────
  const layoutRef = useRef(layout);
  const personsRef = useRef<readonly PersonNode[]>(allPersons);
  const rolesRef = useRef<RoleRow[]>(roles);
  const roleDbRef = useRef(roleDb);
  const membersRef = useRef<readonly MemberRowLike[]>(rows.members);
  const invitationsRef = useRef<readonly InvitationRowLike[]>(rows.orgInvites);
  const isOwnerRef = useRef(isOwner);
  useEffect(() => {
    layoutRef.current = layout;
    personsRef.current = allPersons;
    rolesRef.current = roles;
    roleDbRef.current = roleDb;
    membersRef.current = rows.members;
    invitationsRef.current = rows.orgInvites;
    isOwnerRef.current = isOwner;
  });

  // Drop ghosts / migrate accepted invites — only once the rows have arrived,
  // so a still-loading subscription never wipes the saved layout.
  const rowsReady = membersReady && invitationsReady && rows.members.length > 0;
  useEffect(() => {
    if (!layoutLoaded || !rowsReady) return;
    setLayout((prev) => reconcileLayout(prev, allPersons, rows.aliases));
  }, [layoutLoaded, rowsReady, allPersons, rows.aliases, layout.groups]);

  // ── Layout mutations ────────────────────────────────────────────────────
  const patchLayout = useCallback((mut: (l: OrgLayout) => OrgLayout) => {
    setLayout((prev) => mut(prev));
  }, []);

  const setView = useCallback((next: ViewLayout) => {
    patchLayout((l) => ({ ...l, view: next }));
  }, [patchLayout]);

  const moveNode = useCallback((id: string, x: number, y: number) => {
    patchLayout((l) => {
      const prev = l.positions[id] ?? { x, y, groupId: null };
      return { ...l, positions: { ...l.positions, [id]: { ...prev, x, y } } };
    });
  }, [patchLayout]);

  const moveGroup = useCallback((id: string, gx: number, gy: number, memberSnapshots: Array<{ id: string; ox: number; oy: number }>, dx: number, dy: number) => {
    patchLayout((l) => {
      const positions = { ...l.positions };
      for (const m of memberSnapshots) {
        const prev = positions[m.id] ?? { x: m.ox, y: m.oy, groupId: id };
        positions[m.id] = { ...prev, x: m.ox + dx, y: m.oy + dy };
      }
      return {
        ...l,
        positions,
        groups: l.groups.map((g) => (g.id === id ? { ...g, x: gx, y: gy } : g)),
      };
    });
  }, [patchLayout]);

  const resizeGroup = useCallback((id: string, w: number, h: number) => {
    patchLayout((l) => ({
      ...l,
      groups: l.groups.map((g) => (g.id === id ? { ...g, w, h } : g)),
    }));
  }, [patchLayout]);

  const dropPersonInGroup = useCallback((personId: string, groupId: string | null) => {
    const before = personsRef.current.find((p) => p.id === personId)?.groupId ?? null;
    patchLayout((l) => applyPersonLayout(l, personId, { groupId }, personsRef.current));
    if (before === groupId) return;
    const g = groupId ? layoutRef.current.groups.find((x) => x.id === groupId) : null;
    if (g) toast.message(fmt(t("personnel.team.org.graph.joinedGroup"), { name: groupDisplayName(t, g) }));
    else if (groupId === null) toast.message(t("personnel.team.org.graph.leftGroup"));
  }, [patchLayout, t]);

  // ── Member writes (SpacetimeDB) ─────────────────────────────────────────
  // updateMemberPermissions overwrites role AND permissions. A write sent before
  // the previous one has echoed must build on what was sent, not on the stale
  // row — otherwise a permissions-only write reverts a just-sent role change
  // (and a role write drops just-sent permissions).
  const sentMemberFields = useRef(new Map<string, { fields: MemberDbFields; at: number }>());

  /** Latest known role/permissions: what we last sent while the row hasn't caught up. */
  const currentMemberFields = useCallback((row: MemberRowLike): MemberDbFields => {
    const id = idOf(row.id);
    const db = memberDbFields(row);
    const sent = sentMemberFields.current.get(id);
    if (!sent) return db;
    const caughtUp = sent.fields.role === db.role && sent.fields.permissions === db.permissions;
    if (caughtUp || Date.now() - sent.at > ROLE_SYNC_TIMEOUT_MS) {
      sentMemberFields.current.delete(id);
      return db;
    }
    return sent.fields;
  }, []);

  /** Send a member write, remembering it until the subscription echoes it. */
  const sendMemberFields = useCallback((id: string, fields: MemberDbFields): Promise<void> => {
    const entry = { fields, at: Date.now() };
    sentMemberFields.current.set(id, entry);
    return updateMember(id, fields).catch((err: unknown) => {
      if (sentMemberFields.current.get(id) === entry) sentMemberFields.current.delete(id);
      throw err;
    });
  }, []);

  const updateNode = useCallback<UseOrgGraphResult["updateNode"]>((id, patch) => {
    const isGroup = id.startsWith("g-") || layoutRef.current.groups.some((g) => g.id === id);
    if (isGroup) {
      patchLayout((l) => ({
        ...l,
        groups: l.groups.map((g) => (g.id === id ? {
          ...g,
          name: patch.name ?? g.name,
          groupKind: patch.groupKind && (GROUP_KINDS as readonly string[]).includes(patch.groupKind)
            ? (patch.groupKind as GroupKind)
            : g.groupKind,
          desc: patch.desc ?? g.desc,
        } : g)),
      }));
      return;
    }

    // Person — layout-only fields → localStorage.
    if (patch.x != null || patch.y != null || "groupId" in patch) {
      const layoutPatch: { x?: number; y?: number; groupId?: string | null } = {};
      if (patch.x != null) layoutPatch.x = patch.x;
      if (patch.y != null) layoutPatch.y = patch.y;
      if ("groupId" in patch) layoutPatch.groupId = patch.groupId ?? null;
      patchLayout((l) => applyPersonLayout(l, id, layoutPatch, personsRef.current));
    }

    // SpacetimeDB-backed fields. The reducer overwrites role AND permissions,
    // so always send both, resolved from the latest sent-or-subscribed values.
    if (patch.role == null && patch.perms == null) return;
    if (id.startsWith("inv-")) {
      toast.warning(t("personnel.team.org.lockedInvite"));
      return;
    }
    const row = membersRef.current.find((m) => idOf(m.id) === id);
    if (!row) {
      toast.error(t("personnel.team.toastUpdateFailed"));
      return;
    }
    if (normKey(row.role) === "owner") {
      toast.warning(t("personnel.team.org.lockedOwner"));
      return;
    }
    const base = currentMemberFields(row);
    const baseRole = base.role.trim();
    let role = patch.role != null ? patch.role.trim() : (baseRole || "staff");
    const roleKeyValue = normKey(role);
    if (isBuiltinKey(roleKeyValue)) {
      // Module gates compare exact lower-case names ("staff", "manager").
      role = roleKeyValue;
    } else if (patch.role != null) {
      // Callers pass the role key; store the role's own name so it matches staff_role.
      const match = rolesRef.current.find((r) => !r.isPlaceholder && r.key === roleKeyValue);
      const dbName = match ? roleDbRef.current.get(match.id)?.name.trim() : undefined;
      if (dbName) role = dbName;
    }
    if (!role) {
      toast.error(t("personnel.team.toastUpdateFailed"));
      return;
    }
    if (normKey(role) === "owner") {
      toast.warning(t("personnel.team.org.graph.ownerNotAssignable"));
      return;
    }
    const stored = parsePermissions(base.permissions, base.role);
    const permissions = JSON.stringify(patch.perms ? mergeCatalogPerms(stored, patch.perms) : stored);
    sendMemberFields(id, { role, permissions }).catch((err: unknown) => {
      toast.error(t("personnel.team.toastUpdateFailed"), errorDescription(err));
    });
  }, [currentMemberFields, patchLayout, sendMemberFields, t]);

  const deleteNode = useCallback((id: string) => {
    patchLayout((l) => {
      if (l.groups.some((g) => g.id === id)) {
        return {
          ...l,
          groups: l.groups.filter((g) => g.id !== id),
          edges: l.edges.filter((e) => e.from !== id && e.to !== id),
          positions: Object.fromEntries(
            Object.entries(l.positions).map(([k, v]) => [k, v.groupId === id ? { ...v, groupId: null } : v]),
          ),
        };
      }
      // Person: forget group, relationships and saved spot. Removing the
      // member itself is an explicit action elsewhere.
      if (!(id in l.positions) && !l.edges.some((e) => e.from === id || e.to === id)) return l;
      return {
        ...l,
        edges: l.edges.filter((e) => e.from !== id && e.to !== id),
        positions: Object.fromEntries(Object.entries(l.positions).filter(([k]) => k !== id)),
      };
    });
  }, [patchLayout]);

  const createEdge = useCallback((from: string, to: string) => {
    if (!from || !to || from === to) return;
    if (layoutRef.current.edges.some((e) => e.from === from && e.to === to)) {
      toast.message(t("personnel.team.org.graph.edgeExists"));
      return;
    }
    const edgeId = nextId("e");
    patchLayout((l) => (l.edges.some((e) => e.from === from && e.to === to)
      ? l
      : { ...l, edges: [...l.edges, { id: edgeId, from, to }] }));
    toast.success(t("personnel.team.org.graph.edgeCreated"));
  }, [patchLayout, t]);

  const deleteEdge = useCallback((id: string) => {
    patchLayout((l) => ({ ...l, edges: l.edges.filter((e) => e.id !== id) }));
  }, [patchLayout]);

  const addGroup = useCallback(() => {
    const id = nextId("g");
    const sz = groupSize(0, 2);
    const v = layoutRef.current.view ?? DEFAULT_VIEW;
    const x = -v.tx / v.zoom + 200;
    const y = -v.ty / v.zoom + 120;
    const name = t("personnel.team.org.graph.newGroup");
    const desc = t("personnel.team.org.graph.newGroupDesc");
    patchLayout((l) => ({
      ...l,
      groups: [...l.groups, {
        id,
        name,
        groupKind: "custom",
        desc,
        x,
        y,
        w: Math.max(sz.w, 340),
        h: 200,
      }],
    }));
    return id;
  }, [patchLayout, t]);

  const duplicateGroup = useCallback((id: string): string | null => {
    const src = layoutRef.current.groups.find((g) => g.id === id);
    if (!src) return null;
    const newId = nextId("g");
    const name = `${groupDisplayName(t, src)} ${t("personnel.team.org.graph.copySuffix")}`;
    patchLayout((l) => {
      const current = l.groups.find((g) => g.id === id) ?? src;
      return {
        ...l,
        groups: [...l.groups, {
          ...current,
          id: newId,
          name,
          x: current.x + current.w + 24,
          y: current.y,
        }],
      };
    });
    return newId;
  }, [patchLayout, t]);

  const tidyGroup = useCallback((groupId: string) => {
    patchLayout((l) => {
      const g = l.groups.find((n) => n.id === groupId);
      if (!g) return l;
      const memberIds = livePersonsFor(l, personsRef.current)
        .filter((p) => p.groupId === groupId)
        .sort(byReadingOrder)
        .map((p) => p.id);
      if (memberIds.length === 0) return l;
      // Layered: managers (edge.from) on top, reports (edge.to) below, peers
      // sharing a row. Only edges between this group's members count.
      const { positions: placed, w, h } = layeredLayoutInGroup(g.x, g.y, memberIds, l.edges);
      const nextPositions = { ...l.positions };
      for (const p of placed) nextPositions[p.id] = { x: p.x, y: p.y, groupId };
      return {
        ...l,
        positions: nextPositions,
        groups: l.groups.map((x) => (x.id === groupId
          ? { ...x, w: Math.max(x.w, w), h: Math.max(x.h, h) }
          : x)),
      };
    });
  }, [patchLayout]);

  const autoLayout = useCallback(() => {
    patchLayout((l) => {
      const ROW_Y = 80;
      const ROW_GAP = 60;
      const G_GAP = 40;
      const live = livePersonsFor(l, personsRef.current).sort(byReadingOrder);
      const membersOf = (gid: string | null) => live.filter((p) => p.groupId === gid).map((p) => p.id);
      const nextPositions: Record<string, PersonLayout> = {};

      // 1) Size each group to its hierarchically laid-out members first, so
      //    the group-level layout below knows each box's real size.
      const sizeOf = new Map<string, { w: number; h: number }>();
      for (const g of l.groups) {
        const { w, h } = layeredLayoutInGroup(0, 0, membersOf(g.id), l.edges);
        sizeOf.set(g.id, {
          w: Math.max(w, CARD_W + GROUP_PAD_X * 2),
          h: Math.max(h, GROUP_HEADER_H + GROUP_PAD_Y * 2 + CARD_H),
        });
      }

      // 2) Lay the group boxes out hierarchically: a group that manages
      //    another sits on the row above; peer groups share a row.
      const groupIds = l.groups.map((g) => g.id);
      const levels = computeLevels(groupIds, l.edges);
      const byLevel = new Map<number, string[]>();
      let maxLevel = 0;
      for (const id of groupIds) {
        const lv = levels.get(id) ?? 0;
        maxLevel = Math.max(maxLevel, lv);
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(id);
      }
      const groupPos = new Map<string, { x: number; y: number }>();
      let rowY = ROW_Y;
      for (let lv = 0; lv <= maxLevel; lv++) {
        const row = byLevel.get(lv) ?? [];
        if (row.length === 0) continue;
        let x = 60;
        let rowH = 0;
        for (const id of row) {
          const sz = sizeOf.get(id) ?? { w: CARD_W, h: CARD_H };
          groupPos.set(id, { x, y: rowY });
          x += sz.w + G_GAP;
          rowH = Math.max(rowH, sz.h);
        }
        rowY += rowH + ROW_GAP;
      }

      // 3) Apply group positions + lay members inside each placed box.
      const newGroups = l.groups.map((g) => {
        const pos = groupPos.get(g.id) ?? { x: g.x, y: g.y };
        const { positions, w, h } = layeredLayoutInGroup(pos.x, pos.y, membersOf(g.id), l.edges);
        for (const p of positions) nextPositions[p.id] = { x: p.x, y: p.y, groupId: g.id };
        return {
          ...g,
          x: pos.x,
          y: pos.y,
          w: Math.max(w, CARD_W + GROUP_PAD_X * 2),
          h: Math.max(h, GROUP_HEADER_H + GROUP_PAD_Y * 2 + CARD_H),
        };
      });

      // 4) Ungrouped people (including never-positioned ones): one
      //    hierarchical block below all the groups.
      const groupsBottom = newGroups.reduce((m, g) => Math.max(m, g.y + g.h), ROW_Y);
      const ungroupedY = (newGroups.length > 0 ? groupsBottom : ROW_Y) + ROW_GAP;
      const { positions: ungroupedPos } = layeredLayout(membersOf(null), l.edges, 60, ungroupedY);
      for (const p of ungroupedPos) nextPositions[p.id] = { x: p.x, y: p.y, groupId: null };

      // Entries without a live node (rows still loading) keep their spot.
      for (const [k, v] of Object.entries(l.positions)) {
        if (!(k in nextPositions)) nextPositions[k] = v;
      }
      return { ...l, groups: newGroups, positions: nextPositions };
    });
  }, [patchLayout]);

  // ── Roles catalog (SpacetimeDB-backed) ──────────────────────────────────
  const roleQueues = useRef(new Map<string, Promise<unknown>>());
  const materializing = useRef(new Map<string, { promise: Promise<boolean>; startedAt: number }>());
  const sentRoleFields = useRef(new Map<string, { fields: RoleDbFields; at: number }>());

  /** Latest known DB fields: what we last sent if the subscription hasn't caught up. */
  const currentRoleFields = useCallback((roleId: string): RoleDbFields | null => {
    const db = roleDbRef.current.get(roleId) ?? null;
    const sent = sentRoleFields.current.get(roleId);
    if (!sent) return db;
    if (!db || sameRoleFields(sent.fields, db) || Date.now() - sent.at > ROLE_SYNC_TIMEOUT_MS) {
      sentRoleFields.current.delete(roleId);
      return db;
    }
    return sent.fields;
  }, []);

  /**
   * Client fallback until the module cascades role changes itself: move owner-
   * editable members still holding `oldKey` to `nextRole`, keeping permissions.
   */
  /** Members holding `key` (custom role) that would be orphaned if role row `roleId` stopped matching it. */
  const roleHolders = useCallback((key: string, roleId: string): MemberRowLike[] => {
    if (!key || isBuiltinKey(key)) return [];
    // Another row with the same name still exists → members still resolve.
    if (rolesRef.current.some((r) => r.id !== roleId && !r.isPlaceholder && r.key === key)) return [];
    return membersRef.current.filter((m) => normKey(currentMemberFields(m).role) === key);
  }, [currentMemberFields]);

  const reassignMembers = useCallback(async (oldKey: string, nextRole: string, roleId: string): Promise<void> => {
    if (!isOwnerRef.current) return;
    const targets = roleHolders(oldKey, roleId);
    if (targets.length === 0) return;
    const results = await Promise.allSettled(targets.map((m) => {
      const base = currentMemberFields(m);
      return sendMemberFields(idOf(m.id), {
        role: nextRole,
        permissions: base.permissions.trim() ? base.permissions : JSON.stringify(parsePermissions(base.permissions, base.role)),
      });
    }));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ok < results.length) toast.error(t("personnel.team.org.graph.membersRoleUpdateFailed"));
    if (ok > 0) toast.message(fmt(t("personnel.team.org.graph.membersRoleUpdated"), { n: ok }));
  }, [currentMemberFields, roleHolders, sendMemberFields, t]);

  const materializeBuiltin = useCallback((placeholder: RoleRow, next: RoleFieldsPatch): Promise<boolean> => {
    const key = placeholder.key;
    if (!isBuiltinKey(key)) return Promise.resolve(false);
    const promise = (async () => {
      const description = next.description != null && next.description !== placeholder.description
        ? next.description
        : ""; // empty → the translated default keeps following the viewer's locale
      try {
        await addStaffRole({
          name: canonicalBuiltinName(key),
          color: next.color ?? placeholder.color,
          icon: next.icon ?? placeholder.icon,
          description,
          permissions: writeRoleAppPerms(null, next.perms ?? placeholder.perms),
        });
      } catch (err) {
        toast.error(t("personnel.team.org.graph.roleSaveFailed"), errorDescription(err));
        return false;
      }
      await waitUntil(() => rolesRef.current.some((r) => r.key === key && !r.isPlaceholder), ROLE_SYNC_TIMEOUT_MS);
      return true;
    })();
    materializing.current.set(key, { promise, startedAt: Date.now() });
    void promise.then((ok) => {
      if (!ok && materializing.current.get(key)?.promise === promise) materializing.current.delete(key);
    });
    return promise;
  }, [t]);

  const upsertRole = useCallback<UseOrgGraphResult["upsertRole"]>(async (id, next) => {
    const resolveRow = (): RoleRow | undefined => {
      const direct = rolesRef.current.find((r) => r.id === id);
      const key = direct?.key ?? (id.startsWith(PLACEHOLDER_PREFIX) ? id.slice(PLACEHOLDER_PREFIX.length) : null);
      if (direct && !direct.isPlaceholder) return direct;
      if (key && isBuiltinKey(key)) {
        return rolesRef.current.find((r) => r.key === key && !r.isPlaceholder) ?? direct;
      }
      return direct;
    };

    let row = resolveRow();
    if (!row) return false;

    if (row.isPlaceholder) {
      const pending = materializing.current.get(row.key);
      const fresh = pending && Date.now() - pending.startedAt < ROLE_SYNC_TIMEOUT_MS * 2;
      // First edit of a built-in: insert its row exactly once, with this patch.
      if (!fresh) return materializeBuiltin(row, next);
      const ok = await pending.promise;
      if (!ok) return false;
      row = resolveRow();
      if (!row || row.isPlaceholder) {
        toast.error(t("personnel.team.org.graph.roleSaveFailed"));
        return false;
      }
    }

    const roleId = row.id;
    const result = await runSerial(roleQueues.current, roleId, async () => {
      const current = rolesRef.current.find((r) => r.id === roleId);
      const db = currentRoleFields(roleId);
      if (!current || !db) {
        toast.error(t("personnel.team.org.graph.roleSaveFailed"));
        return null;
      }
      let name = db.name;
      if (next.name != null && !current.isBuiltin) {
        const trimmed = next.name.trim();
        if (!trimmed) {
          toast.error(t("personnel.team.org.graph.roleNameRequired"));
          return null;
        }
        const nextKey = normKey(trimmed);
        const prevKey = normKey(db.name);
        if (nextKey !== prevKey && rolesRef.current.some((r) => r.id !== roleId && r.key === nextKey)) {
          toast.error(t("personnel.team.org.graph.roleNameTaken"));
          return null;
        }
        // Until the module cascades renames to members, only the owner can move
        // holders along (updateMemberPermissions is owner-only).
        if (nextKey !== prevKey && !isOwnerRef.current && roleHolders(prevKey, roleId).length > 0) {
          toast.warning(t("personnel.team.org.graph.onlyOwnerRoleInUse"));
          return null;
        }
        name = trimmed;
      }
      const fields: RoleDbFields = {
        name,
        color: next.color ?? db.color,
        icon: next.icon ?? db.icon,
        // The displayed built-in default isn't stored — don't persist it back.
        description: next.description == null || next.description === current.description
          ? db.description
          : next.description,
        permissions: next.perms ? writeRoleAppPerms(db.permissions, next.perms) : db.permissions,
      };
      if (sameRoleFields(fields, db)) return { oldName: db.name, name, queued: false };
      const queued = connectionOffline();
      try {
        await updateStaffRole(roleId, fields);
      } catch (err) {
        toast.error(t("personnel.team.org.graph.roleSaveFailed"), errorDescription(err));
        return null;
      }
      sentRoleFields.current.set(roleId, { fields, at: Date.now() });
      return { oldName: db.name, name, queued };
    });
    if (!result) return false;

    const oldKey = normKey(result.oldName);
    const newKey = normKey(result.name);
    if (oldKey !== newKey && isOwnerRef.current) {
      if (result.queued) {
        // The rename is queued offline; member writes can't be sent now.
        if (roleHolders(oldKey, roleId).length > 0) {
          toast.warning(t("personnel.team.org.graph.roleMembersNotMovedOffline"));
        }
      } else {
        // Let the rename (and any server-side member cascade) reach the cache first.
        await waitUntil(() => rolesRef.current.some((r) => r.id === roleId && r.key === newKey), ROLE_SYNC_TIMEOUT_MS);
        await reassignMembers(oldKey, result.name, roleId);
      }
    }
    return true;
  }, [currentRoleFields, materializeBuiltin, reassignMembers, roleHolders, t]);

  const createRole = useCallback<UseOrgGraphResult["createRole"]>((defaults) => (
    runSerial(roleQueues.current, "__create__", async () => {
      const taken = new Set(rolesRef.current.map((r) => r.key));
      const explicit = defaults?.name?.trim();
      let name: string;
      if (explicit) {
        if (taken.has(normKey(explicit))) {
          toast.error(t("personnel.team.org.graph.roleNameTaken"));
          return null;
        }
        name = explicit;
      } else {
        const base = t("personnel.team.org.graph.newRole");
        name = base;
        for (let n = 2; taken.has(normKey(name)); n++) name = `${base} ${n}`;
      }
      const key = normKey(name);
      try {
        await addStaffRole({
          name,
          color: defaults?.color ?? ROLE_PALETTE[rolesRef.current.length % ROLE_PALETTE.length],
          icon: defaults?.icon ?? "user",
          description: defaults?.description ?? "",
          permissions: writeRoleAppPerms(null, defaults?.perms ?? []),
        });
      } catch (err) {
        toast.error(t("personnel.team.org.graph.roleCreateFailed"), errorDescription(err));
        return null;
      }
      toast.success(t("personnel.team.org.graph.roleCreated"));
      // Hold the queue until the row is visible so a second create picks "… 2".
      await waitUntil(() => rolesRef.current.some((r) => r.key === key && !r.isPlaceholder), ROLE_SYNC_TIMEOUT_MS);
      return key;
    })
  ), [t]);

  const deleteRole = useCallback<UseOrgGraphResult["deleteRole"]>(async (id) => {
    const row = rolesRef.current.find((r) => r.id === id);
    if (!row) return false;
    if (row.isBuiltin || row.isPlaceholder) {
      toast.warning(t("personnel.team.org.graph.builtinNoDelete"));
      return false;
    }
    const oldKey = normKey(roleDbRef.current.get(id)?.name ?? row.key);
    const inUse = roleHolders(oldKey, id).length > 0;
    // Until the module cascades deletes to members, only the owner can move
    // holders to Staff (updateMemberPermissions is owner-only).
    if (inUse && !isOwnerRef.current) {
      toast.warning(t("personnel.team.org.graph.onlyOwnerRoleInUse"));
      return false;
    }
    const queued = connectionOffline();
    try {
      await deleteStaffRole(id);
    } catch (err) {
      toast.error(t("personnel.team.org.graph.roleDeleteFailed"), errorDescription(err));
      return false;
    }
    sentRoleFields.current.delete(id);
    toast.success(t("personnel.team.org.graph.roleDeleted"));
    if (isOwnerRef.current) {
      if (queued) {
        // The delete is queued offline; member writes can't be sent now.
        if (inUse) toast.warning(t("personnel.team.org.graph.roleMembersNotMovedOffline"));
      } else {
        await waitUntil(() => !rolesRef.current.some((r) => r.id === id), ROLE_SYNC_TIMEOUT_MS);
        await reassignMembers(oldKey, "staff", id);
      }
    }
    return true;
  }, [reassignMembers, roleHolders, t]);

  // ── Invitations ─────────────────────────────────────────────────────────
  const cancelInvite = useCallback<UseOrgGraphResult["cancelInvite"]>(async (nodeId) => {
    if (!nodeId.startsWith("inv-")) return false;
    // The card stands for every pending invitation to its email (newest shown).
    // Cancel them all, or an older duplicate reappears and its link still works.
    const ownId = nodeId.slice(4);
    const own = invitationsRef.current.find((i) => idOf(i.id) === ownId);
    const email = normKey(own?.email);
    const ids = email
      ? invitationsRef.current.filter((i) => i.acceptedAt == null && normKey(i.email) === email).map((i) => idOf(i.id))
      : [];
    if (!ids.includes(ownId) && (!own || own.acceptedAt == null)) ids.push(ownId);
    if (ids.length === 0) return false;

    const results = await Promise.allSettled(ids.map((invitationId) => cancelInvitation(invitationId)));
    const cancelled = new Set(ids.filter((_, idx) => results[idx].status === "fulfilled").map((invitationId) => `inv-${invitationId}`));
    if (cancelled.size > 0) {
      patchLayout((l) => {
        const touches = Object.keys(l.positions).some((k) => cancelled.has(k))
          || l.edges.some((e) => cancelled.has(e.from) || cancelled.has(e.to));
        if (!touches) return l;
        return {
          ...l,
          edges: l.edges.filter((e) => !cancelled.has(e.from) && !cancelled.has(e.to)),
          positions: Object.fromEntries(Object.entries(l.positions).filter(([k]) => !cancelled.has(k))),
        };
      });
    }
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) {
      toast.error(t("personnel.team.org.graph.inviteCancelFailed"), errorDescription(failure.reason));
      return false;
    }
    toast.success(t("personnel.team.org.graph.inviteCancelled"));
    return true;
  }, [patchLayout, t]);

  return {
    nodes,
    edges,
    roles,
    view,
    loaded: layoutLoaded,
    myMemberId,
    setView,
    updateNode,
    moveNode,
    moveGroup,
    resizeGroup,
    dropPersonInGroup,
    deleteNode,
    createEdge,
    deleteEdge,
    addGroup,
    duplicateGroup,
    tidyGroup,
    autoLayout,
    upsertRole,
    createRole,
    deleteRole,
    cancelInvite,
  };
}

// Re-export for convenience.
export { CARD_W, CARD_H, GROUP_HEADER_H, GROUP_PAD_X, GROUP_PAD_Y };
