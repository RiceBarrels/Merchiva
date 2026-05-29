"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrgToolbar, type ViewMode } from "./toolbar";
import { OrgCanvas } from "./canvas";
import { OrgListView } from "./list-view";
import { Inspector } from "./inspector";
import { RoleManager } from "./role-manager";
import { useOrgGraph } from "./use-org-graph";
import { downstreamIds, upstreamIds, type PersonNode } from "./data";
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

const VIEW_MODE_STORAGE = "bz_org_view_mode";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

export function OrgPanel({ orgId }: { orgId: string }) {
  const t = useT();
  const { can } = usePermissions();
  const canEditTeam = can("team", "edit");
  const canInviteTeam = can("team", "invite");

  const graph = useOrgGraph(orgId);
  const [rawMembers] = useOrgMembers() as [unknown[], boolean];
  const isMobile = useIsMobile();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "graph";
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE);
      if (stored === "graph" || stored === "list") return stored;
      // First-time mobile default → list (canvas is hard to use on touch).
      if (window.matchMedia?.("(max-width: 767px)").matches) {
        window.localStorage.setItem("bz_org_mobile_seen", "1");
        return "list";
      }
    } catch {}
    return "graph";
  });
  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE, viewMode); } catch {}
  }, [viewMode]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [q, setQ] = useState("");
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EditMemberInput | null>(null);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  const highlightIds = useMemo(() => {
    if (!focusMode || !selectedId) return null;
    const set = new Set<string>([
      ...downstreamIds(selectedId, graph.edges),
      ...upstreamIds(selectedId, graph.edges),
    ]);
    // pull in group members of any included group, and vice-versa
    graph.nodes.forEach((n) => {
      if (n.kind === "person" && n.groupId && set.has(n.groupId)) set.add(n.id);
      if (n.kind === "group" && graph.nodes.some((p) => p.kind === "person" && p.groupId === n.id && set.has(p.id))) set.add(n.id);
    });
    return set;
  }, [focusMode, selectedId, graph.edges, graph.nodes]);

  const searchMatchIds = useMemo(() => {
    if (!q.trim()) return null;
    const needle = q.trim().toLowerCase();
    const set = new Set<string>();
    for (const n of graph.nodes) {
      const hay = [n.name, n.kind === "person" ? n.email : "", n.kind === "person" ? n.role : ""]
        .join(" ")
        .toLowerCase();
      if (hay.includes(needle)) set.add(n.id);
    }
    return set;
  }, [q, graph.nodes]);

  const totals = useMemo(() => ({
    persons: graph.nodes.filter((n) => n.kind === "person").length,
    groups: graph.nodes.filter((n) => n.kind === "group").length,
    edges: graph.edges.length,
  }), [graph.nodes, graph.edges]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openEditMemberForPerson(p: PersonNode) {
    const raw = (rawMembers as Array<{ id: { toString(): string }; role: string; permissions: unknown }>)
      .find((x) => (x.id?.toString?.() ?? String(x.id)) === p.id);
    let parsed: Permissions = defaultPermissions();
    const rawPerms = raw?.permissions;
    if (typeof rawPerms === "string") {
      try { parsed = { ...parsed, ...(JSON.parse(rawPerms) as Partial<Permissions>) }; } catch {}
    } else if (rawPerms && typeof rawPerms === "object") {
      parsed = { ...parsed, ...(rawPerms as Partial<Permissions>) };
    }
    const role = String(raw?.role ?? p.role).toLowerCase();
    setEditingMember({
      id: p.id,
      displayName: p.name,
      email: p.email,
      role: role === "manager" ? "manager" : "staff",
      perms: parsed,
    });
  }

  async function handleRemoveMember(p: PersonNode) {
    if (!confirm(t("personnel.team.removeConfirm").replace("{name}", p.name))) return;
    try {
      await removeMember(p.id);
      toast.success(t("personnel.team.toastRemoved"));
      if (selectedId === p.id) setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("personnel.team.toastRemoveFailed"));
    }
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 relative min-w-0 flex flex-col">
        <OrgToolbar
          onInviteMember={() => setInviteOpen(true)}
          onAddGroup={() => {
            const id = graph.addGroup();
            setSelectedId(id);
            toast.message("已添加分组，把人员拖进虚线框内即可加入");
          }}
          onAutoLayout={() => { graph.autoLayout(); toast.message("已重新排列"); }}
          onResetView={() => graph.setView({ zoom: 0.7, tx: 40, ty: 70 })}
          onFocusMode={() => setFocusMode((f) => !f)}
          focusMode={focusMode}
          view={graph.view}
          onZoom={(z) => graph.setView({ ...graph.view, zoom: Math.min(2, Math.max(0.3, z)) })}
          q={q}
          onQuery={setQ}
          matchCount={searchMatchIds?.size ?? 0}
          totals={totals}
          viewMode={viewMode}
          onViewMode={setViewMode}
          onOpenRoleManager={() => setShowRoleManager(true)}
          isMobile={isMobile}
          canEdit={canEditTeam || canInviteTeam}
        />

        {viewMode === "graph" ? (
          <div className="flex-1 relative min-h-0">
            <OrgCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              selectedId={selectedId}
              onSelectNode={setSelectedId}
              onMoveNode={graph.moveNode}
              onMoveGroup={graph.moveGroup}
              onResizeGroup={graph.resizeGroup}
              onDropPersonInGroup={graph.dropPersonInGroup}
              onCreateEdge={graph.createEdge}
              onDeleteEdge={graph.deleteEdge}
              onBgClick={() => setSelectedId(null)}
              highlightIds={highlightIds}
              searchMatchIds={searchMatchIds}
              roles={graph.roles}
              view={graph.view}
              onViewChange={graph.setView}
            />
            <div className="absolute left-4 bottom-4 z-20 bg-background/95 backdrop-blur border border-border rounded-[0.3rem] shadow-sm px-3 py-2 text-[10.5px]">
              <div className="text-[9.5px] uppercase font-mono tracking-wider text-muted-foreground mb-1.5">图例</div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {graph.roles.map((r) => (
                  <div key={r.key} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-stone-700 dark:text-stone-200">{r.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <OrgListView
            nodes={graph.nodes}
            edges={graph.edges}
            roles={graph.roles}
            selectedId={selectedId}
            searchMatchIds={searchMatchIds}
            onSelectNode={setSelectedId}
            onUpdateNode={graph.updateNode}
            onDeleteNode={graph.deleteNode}
          />
        )}
      </div>

      <Inspector
        node={selectedNode}
        edges={graph.edges}
        nodes={graph.nodes}
        roles={graph.roles}
        isMobile={isMobile}
        canEdit={canEditTeam}
        onUpdateNode={graph.updateNode}
        onDeleteNode={graph.deleteNode}
        onSelect={setSelectedId}
        onTidyGroup={(id) => { graph.tidyGroup(id); toast.message("已整理"); }}
        onOpenRoleManager={() => setShowRoleManager(true)}
        onClose={() => setSelectedId(null)}
        onOpenEditMember={openEditMemberForPerson}
        onRemoveMember={handleRemoveMember}
      />

      {showRoleManager && (
        <RoleManager
          open={showRoleManager}
          onClose={() => setShowRoleManager(false)}
          roles={graph.roles}
          nodes={graph.nodes}
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
