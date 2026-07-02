"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useOrgMembers,
  useStaffRoles,
  useOrgInvitations,
  useUsers,
  useSpacetimeDB,
} from "@/lib/spacetimedb/hooks";
import { updateMember } from "@/lib/spacetimedb/actions";
import { defaultPermissions } from "@/lib/db/team";
import type { Permissions } from "@/lib/types";
import {
  CARD_W,
  CARD_H,
  GROUP_HEADER_H,
  GROUP_PAD_X,
  GROUP_PAD_Y,
  emptyLayout,
  loadLayout,
  saveLayout,
  permsToFlat,
  flatToPerms,
  nextId,
  groupSize,
  computeLevels,
  layeredLayout,
  layeredLayoutInGroup,
  type EdgeLayout,
  type GroupNode,
  type GroupNodeLayout,
  type OrgLayout,
  type OrgNode,
  type PersonNode,
  type ViewLayout,
} from "./data";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RoleRow {
  id: string;          // staffRole id (or built-in key)
  key: string;         // normalised lookup key (lower-case name)
  name: string;        // display name
  color: string;
  icon: string;
  description: string;
  perms: string[];     // default flat perms for this role
  rawPermissions: unknown; // original JSON string (so updates round-trip)
  isBuiltin: boolean;  // built-in roles can't be deleted
}

const BUILTIN_ROLES = ["owner", "manager", "staff"];

const BUILTIN_ROLE_DEFAULTS: Record<string, { color: string; description: string }> = {
  owner:   { color: "#1c1917", description: "Full access" },
  manager: { color: "#7c3aed", description: "Manages a store or team" },
  staff:   { color: "#78716c", description: "Day-to-day operations" },
};

function parseMaybeJSON(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

function parsePermissions(raw: unknown): Permissions {
  const base = defaultPermissions();
  const parsed = parseMaybeJSON(raw);
  if (parsed && typeof parsed === "object") {
    return { ...base, ...(parsed as Partial<Permissions>) } as Permissions;
  }
  return base;
}

function pickStaffRolePerms(raw: unknown): string[] {
  // staffRole.permissions is stored as a JSON string. The graph treats it as
  // either a flat array of perm ids OR a Permissions object — accept both.
  const parsed = parseMaybeJSON(raw);
  if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  if (parsed && typeof parsed === "object") return permsToFlat(parsed as Permissions);
  return [];
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

function avatarMapFromUsers(rawUsers: unknown[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const user of rawUsers as Array<{ identity?: unknown; avatarUrl?: string | null }>) {
    if (!user.identity) continue;
    const avatarUrl = user.avatarUrl ?? null;
    const key = rowIdentityKey(user.identity);
    if (key) map.set(key, avatarUrl);
    const textKey = user.identity.toString();
    if (textKey) map.set(textKey, avatarUrl);
  }
  return map;
}

export interface UseOrgGraphResult {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  roles: RoleRow[];
  view: ViewLayout;
  loaded: boolean;
  myMemberId: string | null;

  setView: (next: ViewLayout) => void;

  // node mutations — patch is applied locally for layout fields and pushed to
  // SpacetimeDB for role/permissions
  updateNode: (id: string, patch: Partial<PersonNode> & Partial<GroupNode> & { role?: string; perms?: string[] }) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveGroup: (id: string, gx: number, gy: number, memberSnapshots: Array<{ id: string; ox: number; oy: number }>, dx: number, dy: number) => void;
  resizeGroup: (id: string, w: number, h: number) => void;
  dropPersonInGroup: (personId: string, groupId: string | null) => void;
  deleteNode: (id: string) => void;

  // edges
  createEdge: (from: string, to: string) => void;
  deleteEdge: (id: string) => void;

  // groups
  addGroup: () => string;
  duplicateGroup: (id: string) => string | null;
  tidyGroup: (groupId: string) => void;
  autoLayout: () => void;

  // role catalog
  upsertRole: (key: string, next: Partial<RoleRow>) => Promise<void>;
  createRole: (defaults?: Partial<RoleRow>) => Promise<string | null>;
  deleteRole: (key: string) => Promise<void>;
}

export function useOrgGraph(orgId: string): UseOrgGraphResult {
  const [rawMembers] = useOrgMembers() as [any[], boolean];
  const [rawUsers] = useUsers() as [unknown[], boolean];
  const [rawRoles] = useStaffRoles() as [any[], boolean];
  const [rawInvitations] = useOrgInvitations() as [any[], boolean];
  const stdb = useSpacetimeDB();

  const [layout, setLayout] = useState<OrgLayout>(() => emptyLayout());
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Reload layout when org changes.
  useEffect(() => {
    setLayout(loadLayout(orgId));
    setLayoutLoaded(true);
  }, [orgId]);

  // Persist on change.
  useEffect(() => {
    if (!layoutLoaded) return;
    saveLayout(orgId, layout);
  }, [orgId, layout, layoutLoaded]);

  // ── Roles ────────────────────────────────────────────────────────────────
  const roles = useMemo<RoleRow[]>(() => {
    const fromDb: RoleRow[] = (rawRoles || [])
      .filter((r) => r.organizationId === orgId)
      .map((r) => {
        const name = String(r.name ?? "");
        const key = name.toLowerCase();
        return {
          id: r.id?.toString?.() ?? String(r.id),
          key,
          name,
          color: String(r.color ?? "#44403c"),
          icon: String(r.icon ?? "user"),
          description: String(r.description ?? ""),
          perms: pickStaffRolePerms(r.permissions),
          rawPermissions: r.permissions,
          isBuiltin: BUILTIN_ROLES.includes(key),
        };
      });
    // Ensure built-ins exist as placeholder rows even if the org never
    // created them — they still get used by every member's `role` field.
    const haveKeys = new Set(fromDb.map((r) => r.key));
    for (const k of BUILTIN_ROLES) {
      if (haveKeys.has(k)) continue;
      const def = BUILTIN_ROLE_DEFAULTS[k];
      fromDb.unshift({
        id: `__builtin__${k}`,
        key: k,
        name: k.charAt(0).toUpperCase() + k.slice(1),
        color: def?.color ?? "#78716c",
        icon: "user",
        description: def?.description ?? "",
        perms: [],
        rawPermissions: "",
        isBuiltin: true,
      });
    }
    return fromDb;
  }, [rawRoles, orgId]);

  const rolesByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);

  // ── Members → person nodes ──────────────────────────────────────────────
  const myUserId = stdb?.identity?.toString?.() ?? null;
  const myUserKey = rowIdentityKey(stdb?.identity ?? myUserId);
  const avatarByUserId = useMemo(() => avatarMapFromUsers(rawUsers), [rawUsers]);

  const persons = useMemo<PersonNode[]>(() => {
    const members = (rawMembers || []).filter(
      (m) => m.organizationId === orgId && m.status !== "removed",
    );

    const positions = layout.positions;
    // Auto-place new members in a row so they appear without manual layout.
    let cursor = 60;
    const STRIP_Y = 80;
    return members.map((m) => {
      const id = m.id?.toString?.() ?? String(m.id);
      const userId = rowIdentityKey(m.userId);
      const role = String(m.role ?? "staff").toLowerCase();
      const perm = parsePermissions(m.permissions);
      const layoutEntry = positions[id];
      const x = layoutEntry?.x ?? (cursor += CARD_W + 16) - (CARD_W + 16);
      const y = layoutEntry?.y ?? STRIP_Y;
      return {
        id,
        kind: "person",
        name: String(m.displayName ?? "—"),
        en: String(m.displayName ?? "—"),
        email: String(m.email ?? ""),
        avatarUrl: avatarByUserId.get(userId) ?? null,
        role,
        orgRole: role,
        status: String(m.status ?? "active"),
        groupId: layoutEntry?.groupId ?? null,
        x,
        y,
        perms: permsToFlat(perm),
        rawPermissions: m.permissions,
        punchInCode: m.punchInCode ?? null,
        isMe: !!myUserId && (userId === myUserId || userId === myUserKey || m.userId?.toString?.() === myUserId),
      };
    });
  }, [rawMembers, orgId, layout.positions, myUserId, myUserKey, avatarByUserId]);

  // Pending invitations also appear as "person" nodes so the inviter can drag
  // them into groups before they accept.
  const invitedPersons = useMemo<PersonNode[]>(() => {
    return (rawInvitations || [])
      .filter((i) => i.organizationId === orgId && !i.acceptedAt)
      .map((i, idx) => {
        const id = `inv-${i.id?.toString?.() ?? i.id}`;
        const layoutEntry = layout.positions[id];
        return {
          id,
          kind: "person" as const,
          name: String(i.email ?? "—").split("@")[0],
          en: String(i.email ?? "—").split("@")[0],
          email: String(i.email ?? ""),
          avatarUrl: null,
          role: String(i.role ?? "staff").toLowerCase(),
          orgRole: String(i.role ?? "staff").toLowerCase(),
          status: "invited",
          groupId: layoutEntry?.groupId ?? null,
          x: layoutEntry?.x ?? 60 + idx * (CARD_W + 16),
          y: layoutEntry?.y ?? 200,
          perms: [],
          rawPermissions: "",
          punchInCode: null,
          isMe: false,
        };
      });
  }, [rawInvitations, orgId, layout.positions]);

  const allPersons = useMemo(() => [...persons, ...invitedPersons], [persons, invitedPersons]);

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
        perms: [], // groups don't carry their own perms in this iteration
      })),
    [layout.groups],
  );

  const nodes = useMemo<OrgNode[]>(() => [...groups, ...allPersons], [groups, allPersons]);

  const myMemberId = useMemo(() => persons.find((p) => p.isMe)?.id ?? null, [persons]);

  // ── Mutations ───────────────────────────────────────────────────────────
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
    patchLayout((l) => {
      const prev = l.positions[personId] ?? { x: 0, y: 0, groupId: null };
      return {
        ...l,
        positions: { ...l.positions, [personId]: { ...prev, groupId } },
      };
    });
    const g = layout.groups.find((x) => x.id === groupId);
    if (g) toast.message(`已加入 ${g.name}`);
    else if (groupId === null) toast.message("已从分组移出");
  }, [layout.groups, patchLayout]);

  const updateNode = useCallback((id: string, patch: Partial<PersonNode> & Partial<GroupNode> & { role?: string; perms?: string[] }) => {
    const isGroup = id.startsWith("g-") || layout.groups.some((g) => g.id === id);
    if (isGroup) {
      patchLayout((l) => ({
        ...l,
        groups: l.groups.map((g) => (g.id === id ? {
          ...g,
          name: patch.name ?? g.name,
          groupKind: (patch.groupKind as GroupNodeLayout["groupKind"]) ?? g.groupKind,
          desc: patch.desc ?? g.desc,
        } : g)),
      }));
      return;
    }
    // Person node
    // Layout-only fields → localStorage
    if (patch.x != null || patch.y != null || "groupId" in patch) {
      patchLayout((l) => {
        const prev = l.positions[id] ?? { x: 0, y: 0, groupId: null };
        return {
          ...l,
          positions: { ...l.positions, [id]: {
            x: patch.x ?? prev.x,
            y: patch.y ?? prev.y,
            groupId: ("groupId" in patch ? (patch.groupId ?? null) : prev.groupId),
          } },
        };
      });
    }
    // SpacetimeDB-backed fields → call the reducer.
    if (patch.role != null || patch.perms != null) {
      if (id.startsWith("inv-")) {
        toast.warning("尚未入职的成员暂不可修改权限");
        return;
      }
      const nextPerms = patch.perms ? flatToPerms(patch.perms) : undefined;
      const body: Record<string, unknown> = {};
      if (patch.role != null) body.role = patch.role;
      if (nextPerms) body.permissions = JSON.stringify(nextPerms);
      void updateMember(id, body).catch((err) => {
        toast.error(err instanceof Error ? err.message : "更新失败");
      });
    }
  }, [layout.groups, patchLayout]);

  const deleteNode = useCallback((id: string) => {
    const isGroup = layout.groups.some((g) => g.id === id);
    if (isGroup) {
      patchLayout((l) => ({
        ...l,
        groups: l.groups.filter((g) => g.id !== id),
        edges: l.edges.filter((e) => e.from !== id && e.to !== id),
        positions: Object.fromEntries(
          Object.entries(l.positions).map(([k, v]) => [k, v.groupId === id ? { ...v, groupId: null } : v]),
        ),
      }));
      return;
    }
    // Persons: remove edges + position only — actually removing the member is
    // an explicit action handled by the existing dialog.
    patchLayout((l) => ({
      ...l,
      edges: l.edges.filter((e) => e.from !== id && e.to !== id),
      positions: Object.fromEntries(Object.entries(l.positions).filter(([k]) => k !== id)),
    }));
  }, [layout.groups, patchLayout]);

  const createEdge = useCallback((from: string, to: string) => {
    if (from === to) return;
    patchLayout((l) => {
      if (l.edges.some((e) => e.from === from && e.to === to)) {
        toast.message("连接已存在");
        return l;
      }
      toast.success("已建立管理关系");
      return { ...l, edges: [...l.edges, { id: nextId("e"), from, to }] };
    });
  }, [patchLayout]);

  const deleteEdge = useCallback((id: string) => {
    patchLayout((l) => ({ ...l, edges: l.edges.filter((e) => e.id !== id) }));
  }, [patchLayout]);

  const addGroup = useCallback(() => {
    const id = nextId("g");
    const sz = groupSize(0, 2);
    const view = layout.view ?? { zoom: 0.7, tx: 40, ty: 70 };
    const x = -view.tx / view.zoom + 200;
    const y = -view.ty / view.zoom + 120;
    patchLayout((l) => ({
      ...l,
      groups: [...l.groups, {
        id,
        name: "新分组",
        groupKind: "custom",
        desc: "自定义分组",
        x,
        y,
        w: Math.max(sz.w, 340),
        h: 200,
      }],
    }));
    return id;
  }, [layout.view, patchLayout]);

  const duplicateGroup = useCallback((id: string): string | null => {
    const src = layout.groups.find((g) => g.id === id);
    if (!src) return null;
    const newId = nextId("g");
    patchLayout((l) => ({
      ...l,
      groups: [...l.groups, {
        ...src,
        id: newId,
        name: `${src.name} (副本)`,
        x: src.x + 40,
        y: src.y + 40,
      }],
    }));
    return newId;
  }, [layout.groups, patchLayout]);

  const tidyGroup = useCallback((groupId: string) => {
    patchLayout((l) => {
      const g = l.groups.find((n) => n.id === groupId);
      if (!g) return l;
      const memberIds = Object.entries(l.positions)
        .filter(([, p]) => p.groupId === groupId)
        .map(([k]) => k);
      if (memberIds.length === 0) return l;
      // Layered: managers (edge.from) on top, reports (edge.to) below, peers
      // sharing a row. Only edges between this group's members count.
      const { positions: positioned, w, h } = layeredLayoutInGroup(g.x, g.y, memberIds, l.edges);
      const nextPositions = { ...l.positions };
      for (const p of positioned) {
        const prev = nextPositions[p.id];
        nextPositions[p.id] = { x: p.x, y: p.y, groupId: prev?.groupId ?? groupId };
      }
      return {
        ...l,
        positions: nextPositions,
        groups: l.groups.map((x) => x.id === groupId
          ? { ...x, w: Math.max(x.w, w), h: Math.max(x.h, h) }
          : x),
      };
    });
  }, [patchLayout]);

  const autoLayout = useCallback(() => {
    patchLayout((l) => {
      const ROW_Y = 80;
      const ROW_GAP = 60;
      const G_GAP = 40;
      const nextPositions: typeof l.positions = {};

      // 1) Size each group to its hierarchically-laid-out members. We compute
      //    sizes first (at a temporary origin) so the group-level layout below
      //    can place the boxes knowing their real width/height.
      const sizeOf = new Map<string, { w: number; h: number }>();
      for (const g of l.groups) {
        const memberIds = Object.entries(l.positions)
          .filter(([, p]) => p.groupId === g.id)
          .map(([k]) => k);
        const { w, h } = layeredLayoutInGroup(0, 0, memberIds, l.edges);
        sizeOf.set(g.id, {
          w: Math.max(w, CARD_W + GROUP_PAD_X * 2),
          h: Math.max(h, GROUP_HEADER_H + GROUP_PAD_Y * 2 + CARD_H),
        });
      }

      // 2) Lay the GROUP boxes out hierarchically too: a group that manages
      //    another (edge from→to between group ids) sits on the row above; peer
      //    groups share a row. Variable box sizes → custom row packing.
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
        const memberIds = Object.entries(l.positions)
          .filter(([, p]) => p.groupId === g.id)
          .map(([k]) => k);
        const pos = groupPos.get(g.id) ?? { x: g.x, y: g.y };
        const { positions, w, h } = layeredLayoutInGroup(pos.x, pos.y, memberIds, l.edges);
        for (const p of positions) nextPositions[p.id] = { x: p.x, y: p.y, groupId: g.id };
        return {
          ...g,
          x: pos.x,
          y: pos.y,
          w: Math.max(w, CARD_W + GROUP_PAD_X * 2),
          h: Math.max(h, GROUP_HEADER_H + GROUP_PAD_Y * 2 + CARD_H),
        };
      });

      // 4) Ungrouped people: one hierarchical block below all the groups.
      const groupedIds = new Set(Object.keys(nextPositions));
      const ungroupedIds = Object.entries(l.positions)
        .filter(([k, v]) => !groupedIds.has(k) && v.groupId == null)
        .map(([k]) => k);
      const groupsBottom = newGroups.reduce((m, g) => Math.max(m, g.y + g.h), ROW_Y);
      const ungroupedY = (newGroups.length > 0 ? groupsBottom : ROW_Y) + ROW_GAP;
      const { positions: ungroupedPos } = layeredLayout(ungroupedIds, l.edges, 60, ungroupedY);
      for (const p of ungroupedPos) nextPositions[p.id] = { x: p.x, y: p.y, groupId: null };

      // Anything left (e.g. grouped member whose group vanished) keeps its spot.
      for (const [k, v] of Object.entries(l.positions)) {
        if (!(k in nextPositions)) nextPositions[k] = v;
      }
      return { ...l, groups: newGroups, positions: nextPositions };
    });
  }, [patchLayout]);

  // ── Roles catalog (SpacetimeDB-backed) ──────────────────────────────────
  const upsertRole = useCallback<UseOrgGraphResult["upsertRole"]>(async (key, next) => {
    const existing = rolesByKey[key];
    if (!existing) return;
    const payload = {
      name: next.name ?? existing.name,
      color: next.color ?? existing.color,
      icon: next.icon ?? existing.icon,
      description: next.description ?? existing.description,
      permissions: next.perms
        ? JSON.stringify(next.perms)
        : (typeof existing.rawPermissions === "string" ? existing.rawPermissions : JSON.stringify(existing.perms)),
    };
    const mod = await import("@/lib/spacetimedb/actions");
    if (existing.id.startsWith("__builtin__")) {
      await mod.addStaffRole(payload);
      toast.success("已新增角色");
    } else {
      await mod.updateStaffRole(existing.id, payload);
    }
  }, [rolesByKey]);

  const createRole = useCallback<UseOrgGraphResult["createRole"]>(async (defaults) => {
    const mod = await import("@/lib/spacetimedb/actions");
    const palette = ["#7c3aed", "#0891b2", "#0d9488", "#16a34a", "#ea580c", "#dc2626"];
    const color = defaults?.color ?? palette[roles.length % palette.length];
    const name = defaults?.name ?? "新角色";
    try {
      await mod.addStaffRole({
        name,
        color,
        icon: defaults?.icon ?? "user",
        description: defaults?.description ?? "",
        permissions: JSON.stringify(defaults?.perms ?? []),
      });
      toast.success("已新增角色");
      return name.toLowerCase();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新增失败");
      return null;
    }
  }, [roles.length]);

  const deleteRole = useCallback<UseOrgGraphResult["deleteRole"]>(async (key) => {
    const r = rolesByKey[key];
    if (!r) return;
    if (r.isBuiltin) {
      toast.warning("内置角色不能删除，但可以修改");
      return;
    }
    const mod = await import("@/lib/spacetimedb/actions");
    try {
      await mod.deleteStaffRole(r.id);
      toast.success("已删除角色");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }, [rolesByKey]);

  return {
    nodes,
    edges: layout.edges,
    roles,
    view: layout.view ?? { zoom: 0.7, tx: 40, ty: 70 },
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
  };
}

// Re-export for convenience.
export { CARD_W, CARD_H, GROUP_HEADER_H, GROUP_PAD_X, GROUP_PAD_Y };
