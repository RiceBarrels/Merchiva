"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/components/ui/eyebrow";
import { OrgToolbar, type ViewMode } from "./toolbar";
import { OrgCanvas, type OrgCanvasHandle } from "./canvas";
import { OrgListView } from "./list-view";
import { Inspector } from "./inspector";
import { RoleManager } from "./role-manager";
import { useOrgGraph } from "./use-org-graph";
import {
  clampZoom,
  downstreamIds,
  fmt,
  groupDisplayName,
  upstreamIds,
  type PersonNode,
} from "./data";
import { defaultPermissions } from "@/lib/db/team";
import type { Permissions } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";
import { removeMember } from "@/lib/spacetimedb/actions";
import { useOrgMembers } from "@/lib/spacetimedb/hooks";
import {
  InviteMemberDialog,
  EditMemberDialog,
  type EditMemberInput,
} from "@/components/personnel/team-dialogs";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * v2: the old key was written automatically on every visit, so its values are
 * not explicit choices. They are ignored, and the old keys are removed on mount.
 */
const VIEW_MODE_STORAGE = "bz_org_view_mode_v2";
const LEGACY_STORAGE_KEYS = ["bz_org_view_mode", "bz_org_mobile_seen"] as const;
/** On phones the legend is hidden once it would cover a real slab of the canvas. */
const MOBILE_LEGEND_MAX_ROLES = 6;
/**
 * Desktop legend: 4 rows x 3 columns fit inside its max height. Past that, 11
 * roles are shown and the last cell becomes a "+n" count.
 */
const LEGEND_MAX_CELLS = 12;
const ZOOM_STEP_IN = 1.1;
const ZOOM_STEP_OUT = 0.9;

interface RawMemberRow {
  id: { toString(): string };
  role: string;
  permissions: unknown;
}

function readStoredViewMode(): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE);
    return stored === "graph" || stored === "list" ? stored : null;
  } catch {
    return null;
  }
}

/** Owners and pending invitations can't be edited through the member reducers. */
function isLockedPerson(p: PersonNode): boolean {
  return p.orgRole.toLowerCase() === "owner" || p.id.startsWith("inv-");
}

function parseMemberPermissions(raw: unknown): Permissions {
  const base = defaultPermissions();
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [section, value] of Object.entries(parsed as Record<string, unknown>)) {
    const current = out[section];
    out[section] =
      current && typeof current === "object" && value && typeof value === "object"
        ? { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value;
  }
  return out as unknown as Permissions;
}

function errorDescription(err: unknown): string | undefined {
  return err instanceof Error && err.message ? err.message : undefined;
}

export function OrgPanel({ orgId }: { orgId: string }) {
  const t = useT();
  const { can, isOwner, role: orgRole } = usePermissions();

  // Client gating mirrors the reducers: member role/permission/status changes
  // are owner-only; staff roles and invitations need manager or owner; the
  // graph layout is localStorage-only, so team.edit is enough for it.
  const canEditMembers = isOwner;
  const canManageRoles = isOwner || orgRole === "manager";
  const canInvite = isOwner || orgRole === "manager";
  const canEditLayout = isOwner || orgRole === "manager" || can("team", "edit");

  const graph = useOrgGraph(orgId);
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const isMobile = useIsMobile();
  const canvasRef = useRef<OrgCanvasHandle>(null);

  // ── View mode ────────────────────────────────────────────────────────────
  // Only an explicit choice is persisted; until then the mode follows the
  // viewport (list on phones, graph on wider screens).
  const [storedViewMode, setStoredViewMode] = useState<ViewMode | null>(readStoredViewMode);
  const viewMode: ViewMode = storedViewMode ?? (isMobile ? "list" : "graph");

  useEffect(() => {
    try {
      for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
    } catch {}
  }, []);

  // ── Selection ────────────────────────────────────────────────────────────
  // The selection is derived from graph.nodes, so a node that disappears
  // (member removed, invite cancelled, group deleted) deselects itself.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => (pickedId ? graph.nodes.find((n) => n.id === pickedId) ?? null : null),
    [graph.nodes, pickedId],
  );
  const selectedId = selectedNode ? selectedNode.id : null;

  // ── Focus mode ───────────────────────────────────────────────────────────
  // Focus is reset whenever the view mode changes or the selection clears,
  // whatever caused it (toolbar, viewport resize, node removed elsewhere).
  const [focusMode, setFocusMode] = useState(false);
  const hasSelection = selectedId !== null;
  const [focusContext, setFocusContext] = useState({ viewMode, hasSelection });
  if (focusContext.viewMode !== viewMode || focusContext.hasSelection !== hasSelection) {
    setFocusContext({ viewMode, hasSelection });
    if (focusContext.viewMode !== viewMode || !hasSelection) setFocusMode(false);
  }
  const focusActive = focusMode && hasSelection && viewMode === "graph";

  const [q, setQ] = useState("");
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EditMemberInput | null>(null);

  const clearSelection = useCallback(() => setPickedId(null), []);

  const highlightIds = useMemo(() => {
    if (!focusActive || !selectedId) return null;
    const set = new Set<string>([
      ...downstreamIds(selectedId, graph.edges),
      ...upstreamIds(selectedId, graph.edges),
    ]);
    // Pull in the members of any included group, and the group of any included member.
    for (const n of graph.nodes) {
      if (n.kind === "person" && n.groupId && set.has(n.groupId)) set.add(n.id);
    }
    for (const n of graph.nodes) {
      if (n.kind === "person" && n.groupId && set.has(n.id)) set.add(n.groupId);
    }
    return set;
  }, [focusActive, selectedId, graph.edges, graph.nodes]);

  const roleNameByKey = useMemo(
    () => new Map(graph.roles.map((r) => [r.key, r.name])),
    [graph.roles],
  );

  const searchMatchIds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const set = new Set<string>();
    for (const n of graph.nodes) {
      const hay =
        n.kind === "person"
          ? [n.name, n.email, n.role, roleNameByKey.get(n.role) ?? ""]
          : [n.name, groupDisplayName(t, n)];
      if (hay.join(" ").toLowerCase().includes(needle)) set.add(n.id);
    }
    return set;
  }, [q, graph.nodes, roleNameByKey, t]);

  // The list only renders people, so its counter must not include groups.
  const matchCount = useMemo(() => {
    if (!searchMatchIds) return 0;
    if (viewMode === "graph") return searchMatchIds.size;
    // The list shows direct matches plus every member of a group whose name matched.
    return graph.nodes.filter(
      (n) => n.kind === "person" && (searchMatchIds.has(n.id) || (!!n.groupId && searchMatchIds.has(n.groupId))),
    ).length;
  }, [searchMatchIds, viewMode, graph.nodes]);

  const totals = useMemo(() => ({
    persons: graph.nodes.filter((n) => n.kind === "person").length,
    groups: graph.nodes.filter((n) => n.kind === "group").length,
    edges: graph.edges.length,
  }), [graph.nodes, graph.edges]);

  const showLegend =
    graph.roles.length > 0 && !(isMobile && graph.roles.length > MOBILE_LEGEND_MAX_ROLES);
  const legendRoles =
    graph.roles.length > LEGEND_MAX_CELLS ? graph.roles.slice(0, LEGEND_MAX_CELLS - 1) : graph.roles;
  const legendOverflow = graph.roles.length - legendRoles.length;

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleViewMode(next: ViewMode) {
    setStoredViewMode(next);
    setFocusMode(false);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE, next);
    } catch {}
  }

  function handleFocusMode() {
    if (!selectedId) return;
    setFocusMode((f) => !f);
  }

  function handleAddGroup() {
    if (!canEditLayout) return;
    const id = graph.addGroup();
    setPickedId(id);
    toast.message(
      viewMode === "list"
        ? t("personnel.team.org.panel.groupAddedList")
        : t("personnel.team.org.panel.groupAddedGraph"),
    );
  }

  function handleAutoLayout() {
    if (!canEditLayout) return;
    graph.autoLayout();
    toast.message(t("personnel.team.org.panel.tidied"));
  }

  function handleTidyGroup(id: string) {
    if (!canEditLayout) return;
    graph.tidyGroup(id);
    toast.message(t("personnel.team.org.panel.groupTidied"));
  }

  function handleZoomIn() {
    canvasRef.current?.zoomAtCenter(clampZoom(graph.view.zoom * ZOOM_STEP_IN));
  }

  function handleZoomOut() {
    canvasRef.current?.zoomAtCenter(clampZoom(graph.view.zoom * ZOOM_STEP_OUT));
  }

  function handleFit() {
    canvasRef.current?.fitToContent();
  }

  function openEditMemberForPerson(p: PersonNode) {
    if (!canEditMembers || isLockedPerson(p)) return;
    const raw = (rawMembers as RawMemberRow[]).find((x) => x.id.toString() === p.id);
    // Send the raw role back unchanged so custom staff-role names survive.
    const role = String(raw?.role ?? p.orgRole ?? p.role).trim() || "staff";
    if (role.toLowerCase() === "owner") return;
    setEditingMember({
      id: p.id,
      displayName: p.name,
      email: p.email,
      role,
      perms: parseMemberPermissions(raw?.permissions ?? p.rawPermissions),
    });
  }

  async function handleRemoveMember(p: PersonNode) {
    if (!canEditMembers || isLockedPerson(p)) return;
    if (!confirm(fmt(t("personnel.team.confirmRemove"), { name: p.name }))) {
      // On phones the sheet was closed first so confirm() isn't stacked on it.
      if (isMobile) setPickedId(p.id);
      return;
    }
    try {
      await removeMember(p.id);
      toast.success(t("personnel.team.toastRemoved"));
      if (pickedId === p.id) clearSelection();
    } catch (err) {
      toast.error(t("personnel.team.toastRemoveFailed"), { description: errorDescription(err) });
    }
  }

  async function handleCancelInvite(p: PersonNode) {
    if (!canInvite || !p.id.startsWith("inv-")) return;
    if (!confirm(fmt(t("personnel.team.confirmCancelInvite"), { email: p.email }))) {
      if (isMobile) setPickedId(p.id);
      return;
    }
    try {
      const ok = await graph.cancelInvite(p.id);
      if (ok && pickedId === p.id) clearSelection();
    } catch (err) {
      toast.error(t("personnel.team.org.panel.cancelInviteFailed"), {
        description: errorDescription(err),
      });
    }
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 relative min-w-0 flex flex-col">
        <OrgToolbar
          viewMode={viewMode}
          onViewMode={handleViewMode}
          q={q}
          onQuery={setQ}
          matchCount={matchCount}
          totals={totals}
          isMobile={isMobile}
          canInvite={canInvite}
          canEditLayout={canEditLayout}
          canManageRoles={canManageRoles}
          onInviteMember={() => { if (canInvite) setInviteOpen(true); }}
          onAddGroup={handleAddGroup}
          onOpenRoleManager={() => setShowRoleManager(true)}
          zoom={graph.view.zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={handleFit}
          onAutoLayout={handleAutoLayout}
          focusActive={focusActive}
          focusDisabled={!selectedId}
          onFocusMode={handleFocusMode}
        />

        {viewMode === "graph" ? (
          <div className="flex-1 relative min-h-0">
            <OrgCanvas
              ref={canvasRef}
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selectedId}
              onSelectNode={setPickedId}
              onMoveNode={graph.moveNode}
              onMoveGroup={graph.moveGroup}
              onResizeGroup={graph.resizeGroup}
              onDropPersonInGroup={graph.dropPersonInGroup}
              onCreateEdge={graph.createEdge}
              onDeleteEdge={graph.deleteEdge}
              onDeleteNode={graph.deleteNode}
              onAddGroup={graph.addGroup}
              onDuplicateGroup={graph.duplicateGroup}
              onBgClick={clearSelection}
              highlightIds={highlightIds}
              searchMatchIds={searchMatchIds}
              roles={graph.roles}
              view={graph.view}
              onViewChange={graph.setView}
              canEditLayout={canEditLayout}
            />
            {showLegend && (
              <div
                className="pointer-events-none select-none absolute left-4 bottom-4 z-20 max-w-[calc(100%-2rem)] max-h-32 overflow-hidden bg-background/95 border border-border rounded-md px-3 py-2 text-[10.5px]"
              >
                <Eyebrow size="xs" className="font-mono mb-1.5">
                  {t("personnel.team.org.panel.legend")}
                </Eyebrow>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                  {legendRoles.map((r) => (
                    <div key={r.id} className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="text-foreground truncate">{r.name}</span>
                    </div>
                  ))}
                  {legendOverflow > 0 && (
                    <div className="font-mono text-muted-foreground truncate">
                      {fmt(t("personnel.team.org.panel.legendMore"), { n: legendOverflow })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <OrgListView
            nodes={graph.nodes}
            edges={graph.edges}
            roles={graph.roles}
            selectedId={selectedId}
            searchMatchIds={searchMatchIds}
            isMobile={isMobile}
            canEditMembers={canEditMembers}
            canEditLayout={canEditLayout}
            canInvite={canInvite}
            onSelectNode={setPickedId}
            onUpdateNode={graph.updateNode}
            onRemoveMember={handleRemoveMember}
            onCancelInvite={handleCancelInvite}
          />
        )}
      </div>

      <Inspector
        node={selectedNode}
        edges={graph.edges}
        nodes={graph.nodes}
        roles={graph.roles}
        isMobile={isMobile}
        viewMode={viewMode}
        canEditMembers={canEditMembers}
        canEditLayout={canEditLayout}
        canInvite={canInvite}
        canManageRoles={canManageRoles}
        onUpdateNode={graph.updateNode}
        onDeleteNode={graph.deleteNode}
        onCreateEdge={graph.createEdge}
        onDeleteEdge={graph.deleteEdge}
        onSelect={setPickedId}
        onTidyGroup={handleTidyGroup}
        onOpenRoleManager={() => setShowRoleManager(true)}
        onClose={clearSelection}
        onOpenEditMember={openEditMemberForPerson}
        onRemoveMember={handleRemoveMember}
        onCancelInvite={handleCancelInvite}
      />

      {showRoleManager && (
        <RoleManager
          open={showRoleManager}
          onClose={() => setShowRoleManager(false)}
          roles={graph.roles}
          nodes={graph.nodes}
          canManageRoles={canManageRoles}
          isOwner={isOwner}
          upsertRole={graph.upsertRole}
          createRole={graph.createRole}
          deleteRole={graph.deleteRole}
        />
      )}

      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} orgId={orgId} />
      <EditMemberDialog member={editingMember} onClose={() => setEditingMember(null)} />
    </div>
  );
}
