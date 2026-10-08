// ─── Team / Org Graph · types, constants, layout helpers ───────────────────
//
// Source-of-truth:
//   • Members & roles live in SpacetimeDB (useOrgMembers / useStaffRoles).
//   • Graph layout (group nodes, edges, x/y positions, groupId, w/h) lives in
//     localStorage under `bz_org_layout_<orgId>` — there are no SpacetimeDB
//     tables for these yet, and adding them is out of scope for this task.
//
// The hook in use-org-graph.ts merges these two sources into a single
// `nodes` + `edges` graph the canvas and list can render.

export const CARD_W = 220;
export const CARD_H = 78;
export const GROUP_HEADER_H = 52;
export const GROUP_PAD_X = 18;
export const GROUP_PAD_Y = 14;

export const LAYOUT_STORAGE_PREFIX = "bz_org_layout_";

// ─── Permissions catalog (graph-side display names) ────────────────────────
// The 10 sections come from lib/types.ts → Permissions. The catalog below
// mirrors that shape but groups them for the inspector's permission editor.
export type PermSectionKey =
  | "dashboard"
  | "inventory"
  | "sales"
  | "staffing"
  | "products"
  | "settings"
  | "team"
  | "training_grading"
  | "merchiva"
  | "drive";

export type PermAction = "view" | "edit" | "invite";

export interface PermLeaf {
  id: string;          // `${section}.${action}` e.g. "team.invite"
  section: PermSectionKey;
  action: PermAction;
  i18nKey: string;     // resolved via t() — falls back to readable label
  sensitive?: boolean;
}

export interface PermGroup {
  group: "people" | "store" | "ops" | "site";
  i18nKey: string;
  items: PermLeaf[];
}

export const ORG_PERMS: PermGroup[] = [
  {
    group: "people",
    i18nKey: "groupPeople",
    items: [
      { id: "team.view",   section: "team",   action: "view",   i18nKey: "team.view" },
      { id: "team.edit",   section: "team",   action: "edit",   i18nKey: "team.edit",   sensitive: true },
      { id: "team.invite", section: "team",   action: "invite", i18nKey: "team.invite", sensitive: true },
      { id: "staffing.view", section: "staffing", action: "view", i18nKey: "staffing.view" },
      { id: "staffing.edit", section: "staffing", action: "edit", i18nKey: "staffing.edit" },
      { id: "training_grading.view", section: "training_grading", action: "view", i18nKey: "trainingGrading.view" },
      { id: "training_grading.edit", section: "training_grading", action: "edit", i18nKey: "trainingGrading.edit", sensitive: true },
      { id: "drive.view", section: "drive", action: "view", i18nKey: "drive.view", sensitive: true },
      { id: "drive.edit", section: "drive", action: "edit", i18nKey: "drive.edit", sensitive: true },
    ],
  },
  {
    group: "store",
    i18nKey: "groupStore",
    items: [
      { id: "sales.view",      section: "sales",     action: "view", i18nKey: "sales.view" },
      { id: "inventory.view",  section: "inventory", action: "view", i18nKey: "inventory.view" },
      { id: "inventory.edit",  section: "inventory", action: "edit", i18nKey: "inventory.edit" },
    ],
  },
  {
    group: "ops",
    i18nKey: "groupOps",
    items: [
      { id: "dashboard.view", section: "dashboard", action: "view", i18nKey: "dashboard.view" },
      { id: "products.view",  section: "products",  action: "view", i18nKey: "products.view" },
      { id: "products.edit",  section: "products",  action: "edit", i18nKey: "products.edit" },
      { id: "settings.view",  section: "settings",  action: "view", i18nKey: "settings.view", sensitive: true },
      { id: "merchiva.view",  section: "merchiva",  action: "view", i18nKey: "merchiva.view" },
    ],
  },
];

export const ORG_PERMS_FLAT: PermLeaf[] = ORG_PERMS.flatMap((g) => g.items);

// ─── Group presets ─────────────────────────────────────────────────────────

export type GroupKind = "store" | "region" | "ops" | "custom";

export interface GroupPreset {
  i18nKey: string;
  icon: string;
  color: string;
}

export const GROUP_KINDS: readonly GroupKind[] = ["store", "region", "ops", "custom"];

export const ORG_GROUP_PRESETS: Record<GroupKind, GroupPreset> = {
  store:  { i18nKey: "presetStore",  icon: "store",       color: "#0891b2" },
  region: { i18nKey: "presetRegion", icon: "map",         color: "#7c3aed" },
  ops:    { i18nKey: "presetOps",    icon: "building",    color: "#44403c" },
  custom: { i18nKey: "presetCustom", icon: "users-round", color: "#78716c" },
};

// ─── Layout (persisted to localStorage per org) ────────────────────────────

export interface PersonLayout {
  x: number;
  y: number;
  groupId: string | null;
}

export interface GroupNodeLayout {
  id: string;
  name: string;
  groupKind: GroupKind;
  desc: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeLayout {
  id: string;
  from: string;
  to: string;
}

export interface ViewLayout {
  zoom: number;
  tx: number;
  ty: number;
}

/** Initial canvas view. Always spread it (`{ ...DEFAULT_VIEW }`) — never mutate. */
export const DEFAULT_VIEW: Readonly<ViewLayout> = { zoom: 0.7, tx: 40, ty: 70 };
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export interface OrgLayout {
  positions: Record<string, PersonLayout>;
  groups: GroupNodeLayout[];
  edges: EdgeLayout[];
  view?: ViewLayout;
}

export function emptyLayout(): OrgLayout {
  return { positions: {}, groups: [], edges: [], view: { ...DEFAULT_VIEW } };
}

export function loadLayout(orgId: string): OrgLayout {
  if (typeof window === "undefined") return emptyLayout();
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_PREFIX + orgId);
    if (!raw) return emptyLayout();
    const parsed = JSON.parse(raw) as Partial<OrgLayout>;
    return {
      positions: parsed.positions ?? {},
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      view: parsed.view ?? { ...DEFAULT_VIEW },
    };
  } catch {
    return emptyLayout();
  }
}

export function saveLayout(orgId: string, layout: OrgLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_PREFIX + orgId, JSON.stringify(layout));
  } catch {}
}

// ─── Merged node types (used by canvas + list + inspector) ─────────────────

export interface PersonNode {
  id: string;             // org_member id
  kind: "person";
  name: string;           // displayName
  en: string;             // best-effort latinised initials source
  email: string;
  avatarUrl?: string | null;
  role: string;           // matches a staffRole.name (case-insensitive) or "owner"|"manager"|"staff"
  orgRole: string;        // raw org_member.role
  status: string;         // active|disabled|invited|removed
  groupId: string | null;
  x: number;
  y: number;
  perms: string[];        // flat permission ids derived from member.permissions JSON
  rawPermissions: unknown;
  /** Whether a punch-in code exists (`org_member.hasPunchCode`). The digits
   *  themselves are readable only by their owner — see punch-code.tsx. */
  hasPunchCode: boolean;
  isMe: boolean;
}

export interface GroupNode {
  id: string;
  kind: "group";
  name: string;
  groupKind: GroupKind;
  desc: string;
  x: number;
  y: number;
  w: number;
  h: number;
  perms: string[];
}

export type OrgNode = PersonNode | GroupNode;

// ─── Permissions <-> flat-ids conversion ───────────────────────────────────
// Members store Permissions (nested object). The graph UI manipulates flat
// string ids ("team.invite"). These helpers convert between the two.

import type { Permissions, PermissionSection } from "@/lib/types";
import { defaultPermissions } from "@/lib/db/team";

export function permsToFlat(p: Permissions | undefined | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  for (const leaf of ORG_PERMS_FLAT) {
    const sec = p[leaf.section] as PermissionSection | undefined;
    if (!sec) continue;
    if (sec[leaf.action] === true) out.push(leaf.id);
  }
  return out;
}

export function flatToPerms(ids: string[]): Permissions {
  const next = defaultPermissions();
  // Reset all to false first so the flat list is authoritative.
  for (const key of Object.keys(next) as PermSectionKey[]) {
    const sec = next[key] as PermissionSection;
    sec.view = false;
    if ("edit" in sec) sec.edit = false;
    if ("invite" in sec) (sec as { invite?: boolean }).invite = false;
  }
  for (const id of ids) {
    const [section, action] = id.split(".") as [PermSectionKey, PermAction];
    const sec = next[section] as PermissionSection | undefined;
    if (!sec) continue;
    (sec as unknown as Record<string, boolean>)[action] = true;
  }
  // Enforce: edit/invite ⇒ view
  for (const key of Object.keys(next) as PermSectionKey[]) {
    const sec = next[key] as PermissionSection;
    if (sec.edit || (sec as { invite?: boolean }).invite) sec.view = true;
  }
  return next;
}

// ─── Canvas math: anchors, edge paths, hit-tests ───────────────────────────

export function topAnchor(node: OrgNode): { x: number; y: number } {
  if (node.kind === "group") return { x: node.x + node.w / 2, y: node.y };
  return { x: node.x + CARD_W / 2, y: node.y };
}

export function bottomAnchor(node: OrgNode): { x: number; y: number } {
  if (node.kind === "group") return { x: node.x + node.w / 2, y: node.y + node.h };
  return { x: node.x + CARD_W / 2, y: node.y + CARD_H };
}

export function edgePath(from: OrgNode, to: OrgNode): string {
  const a = bottomAnchor(from);
  const b = topAnchor(to);
  const dy = Math.max(36, Math.abs(b.y - a.y) * 0.4);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`;
}

export function edgeMid(from: OrgNode, to: OrgNode): { x: number; y: number } {
  const a = bottomAnchor(from);
  const b = topAnchor(to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function pointInGroupInterior(g: GroupNode, x: number, y: number): boolean {
  return (
    x >= g.x &&
    x <= g.x + g.w &&
    y >= g.y + GROUP_HEADER_H &&
    y <= g.y + g.h
  );
}

// ─── Reachability for focus mode ───────────────────────────────────────────

export function downstreamIds(rootId: string, edges: EdgeLayout[]): Set<string> {
  const out = new Set<string>([rootId]);
  const adj: Record<string, string[]> = {};
  for (const e of edges) (adj[e.from] = adj[e.from] || []).push(e.to);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const nx of adj[id] || []) if (!out.has(nx)) { out.add(nx); queue.push(nx); }
  }
  return out;
}

export function upstreamIds(rootId: string, edges: EdgeLayout[]): Set<string> {
  const out = new Set<string>([rootId]);
  const adj: Record<string, string[]> = {};
  for (const e of edges) (adj[e.to] = adj[e.to] || []).push(e.from);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const pv of adj[id] || []) if (!out.has(pv)) { out.add(pv); queue.push(pv); }
  }
  return out;
}

// ─── Layout math used by "auto-tidy" actions ───────────────────────────────

export function layoutInGroup<T extends { id: string }>(
  groupX: number,
  groupY: number,
  members: T[],
  cols = 2,
): Array<T & { x: number; y: number }> {
  const COL_GAP = 16;
  const ROW_GAP = 16;
  return members.map((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...m,
      x: groupX + GROUP_PAD_X + col * (CARD_W + COL_GAP),
      y: groupY + GROUP_HEADER_H + GROUP_PAD_Y + row * (CARD_H + ROW_GAP),
    };
  });
}

export function groupSize(memberCount: number, cols = 2): { w: number; h: number } {
  const COL_GAP = 16;
  const ROW_GAP = 16;
  const rows = Math.max(1, Math.ceil(memberCount / cols));
  return {
    w: GROUP_PAD_X * 2 + cols * CARD_W + (cols - 1) * COL_GAP,
    h: GROUP_HEADER_H + GROUP_PAD_Y * 2 + rows * CARD_H + (rows - 1) * ROW_GAP,
  };
}

// ─── Hierarchical (layered) auto-layout ─────────────────────────────────────
//
// An edge means `from` MANAGES `to` — so `from` (the connector) sits ABOVE
// `to` (the connected). Each node's level = longest chain of managers above it.
// Roots (nobody points at them) are level 0 at the top; everyone at the same
// level shares one row. Only edges between the given id set are considered, so
// the same routine works for the whole canvas and within a single group.

const LAYER_COL_GAP = 16;
const LAYER_ROW_GAP = 40;

// Assign a depth to each id. Bellman-Ford-style relaxation capped at N rounds
// so a cycle (A manages B manages A) can't loop forever — levels just stop
// growing. from→to means level(to) ≥ level(from) + 1.
export function computeLevels(ids: string[], edges: EdgeLayout[]): Map<string, number> {
  const set = new Set(ids);
  const rel = edges.filter((e) => set.has(e.from) && set.has(e.to) && e.from !== e.to);
  const level = new Map<string, number>();
  for (const id of ids) level.set(id, 0);
  for (let round = 0; round < ids.length; round++) {
    let changed = false;
    for (const e of rel) {
      const want = (level.get(e.from) ?? 0) + 1;
      if (want > (level.get(e.to) ?? 0)) {
        level.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return level;
}

// Lay `ids` out in rows by level, each row centered, top-down. Returns the
// per-node positions plus the bounding box (w/h) of the laid-out block.
export function layeredLayout(
  ids: string[],
  edges: EdgeLayout[],
  originX: number,
  originY: number,
): { positions: Array<{ id: string; x: number; y: number }>; w: number; h: number } {
  if (ids.length === 0) return { positions: [], w: 0, h: 0 };
  const level = computeLevels(ids, edges);
  const byLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const id of ids) {
    const lv = level.get(id) ?? 0;
    maxLevel = Math.max(maxLevel, lv);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  }
  let maxCols = 1;
  for (const arr of byLevel.values()) maxCols = Math.max(maxCols, arr.length);
  const totalW = maxCols * CARD_W + (maxCols - 1) * LAYER_COL_GAP;
  const positions: Array<{ id: string; x: number; y: number }> = [];
  for (let lv = 0; lv <= maxLevel; lv++) {
    const arr = byLevel.get(lv) ?? [];
    if (arr.length === 0) continue;
    const rowW = arr.length * CARD_W + (arr.length - 1) * LAYER_COL_GAP;
    const startX = originX + (totalW - rowW) / 2; // center the row in the block
    const y = originY + lv * (CARD_H + LAYER_ROW_GAP);
    arr.forEach((id, i) => {
      positions.push({ id, x: startX + i * (CARD_W + LAYER_COL_GAP), y });
    });
  }
  const h = (maxLevel + 1) * CARD_H + maxLevel * LAYER_ROW_GAP;
  return { positions, w: totalW, h };
}

// Same layered layout, but offset inside a group's content area and returning
// the group box size needed to contain it.
export function layeredLayoutInGroup(
  groupX: number,
  groupY: number,
  ids: string[],
  edges: EdgeLayout[],
): { positions: Array<{ id: string; x: number; y: number }>; w: number; h: number } {
  const innerX = groupX + GROUP_PAD_X;
  const innerY = groupY + GROUP_HEADER_H + GROUP_PAD_Y;
  const { positions, w, h } = layeredLayout(ids, edges, innerX, innerY);
  return {
    positions,
    w: GROUP_PAD_X * 2 + Math.max(w, CARD_W),
    h: GROUP_HEADER_H + GROUP_PAD_Y * 2 + Math.max(h, CARD_H),
  };
}

// ─── Display helpers ───────────────────────────────────────────────────────

export function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── i18n helpers (shared by toolbar / list / inspector / role manager / canvas)
//
// Keys live under personnel.team.* in messages/*.json. `t` is the useT() fn.

type TFn = (key: string) => string;

/** Fill `{name}`-style placeholders. Uses a function replacer so user text
 *  containing `$&`, `$$`, … is inserted literally. Replaces every occurrence. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** A group's display name; falls back to its kind label when the name is blank. */
export function groupDisplayName(t: TFn, g: { name: string; groupKind: GroupKind | string }): string {
  return g.name.trim() || groupKindLabel(t, g.groupKind);
}

/** "Team · Invite" — composed from the existing section + action keys. */
export function permLabel(t: TFn, leaf: PermLeaf): string {
  const section = leaf.i18nKey.split(".")[0];
  return `${t(`personnel.team.permissionSection.${section}`)} · ${t(`personnel.team.permissionAction.${leaf.action}`)}`;
}

export function permGroupLabel(t: TFn, group: PermGroup["group"]): string {
  return t(`personnel.team.org.permGroup.${group}`);
}

export function groupKindLabel(t: TFn, kind: GroupKind | string): string {
  const k = (GROUP_KINDS as readonly string[]).includes(kind) ? kind : "custom";
  return t(`personnel.team.org.groupKind.${k}`);
}

/** Display name for a role key: built-ins are translated, custom names shown as-is. */
export function builtinRoleName(t: TFn, key: string): string | null {
  return key === "owner" || key === "manager" || key === "staff"
    ? t(`personnel.team.role.${key}`)
    : null;
}

/** Label for a member status (active / invited / disabled). */
export function statusLabel(t: TFn, status: string): string {
  if (status === "invited") return t("personnel.team.statusInvited");
  if (status === "disabled") return t("personnel.team.org.statusDisabled");
  return t("personnel.team.statusActive");
}

// ─── staff_role.permissions shape ──────────────────────────────────────────
//
// The column is shared with the staffing Roles dialog (role-dialogs.tsx),
// which stores a StaffRolePermissions object ({ canViewSchedule, … }). The
// team page keeps its flat ORG_PERMS ids under an `app` array inside that
// same object, so neither editor wipes the other's data. Legacy rows may hold
// a bare array of ids or a nested Permissions object — both are still read.

function parseRolePermissionsJSON(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

const ORG_PERM_IDS = new Set(ORG_PERMS_FLAT.map((leaf) => leaf.id));

export function readRoleAppPerms(raw: unknown): string[] {
  const parsed = parseRolePermissionsJSON(raw);
  if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const app = obj.app;
    if (Array.isArray(app)) return app.filter((x): x is string => typeof x === "string");
    const looksLikePermissions = ORG_PERMS_FLAT.some((leaf) => {
      const sec = obj[leaf.section];
      return !!sec && typeof sec === "object";
    });
    if (looksLikePermissions) return permsToFlat(parsed as Permissions);
    // A legacy bare array edited by the staffing dialog gets spread into an
    // object ({"0":"team.view","1":…,"canViewSchedule":true}) — recover the ids.
    return Object.values(obj).filter((v): v is string => typeof v === "string" && ORG_PERM_IDS.has(v));
  }
  return [];
}

/** Serialise `ids` into the role's permissions JSON, preserving other keys. */
export function writeRoleAppPerms(raw: unknown, ids: string[]): string {
  const parsed = parseRolePermissionsJSON(raw);
  const base: Record<string, unknown> =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  // Drop index keys left behind by a spread legacy array; `app` supersedes them.
  for (const [k, v] of Object.entries(base)) {
    if (/^\d+$/.test(k) && typeof v === "string" && ORG_PERM_IDS.has(v)) delete base[k];
  }
  base.app = Array.from(new Set(ids));
  return JSON.stringify(base);
}
