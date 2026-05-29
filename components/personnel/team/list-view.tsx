"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building, KeyRound, Map as MapIcon, Store, Trash2, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ORG_GROUP_PRESETS,
  initials,
  type EdgeLayout,
  type GroupNode,
  type OrgNode,
  type PersonNode,
} from "./data";
import type { RoleRow } from "./use-org-graph";

const GROUP_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  store: Store,
  map: MapIcon,
  building: Building,
  "users-round": Users,
};

type SortKey = "name" | "role" | "group" | "status" | "joined";

export function OrgListView({
  nodes,
  edges,
  roles,
  selectedId,
  searchMatchIds,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
}: {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  roles: RoleRow[];
  selectedId: string | null;
  searchMatchIds: Set<string> | null;
  onSelectNode: (id: string) => void;
  onUpdateNode: (id: string, patch: { groupId?: string | null; role?: string; perms?: string[] }) => void;
  onDeleteNode: (id: string) => void;
}) {
  const rolesByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const [sortKey, setSortKey] = useState<SortKey>("group");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showGroupHeaders, setShowGroupHeaders] = useState(true);

  const groupsById = useMemo(
    () => Object.fromEntries(
      nodes.filter((n): n is GroupNode => n.kind === "group").map((g) => [g.id, g]),
    ),
    [nodes],
  );
  const persons = useMemo(
    () => nodes.filter((n): n is PersonNode => n.kind === "person"),
    [nodes],
  );

  const manageCount = useMemo(() => {
    const out: Record<string, number> = {};
    const inc: Record<string, number> = {};
    for (const e of edges) {
      out[e.from] = (out[e.from] || 0) + 1;
      inc[e.to] = (inc[e.to] || 0) + 1;
    }
    return { out, inc };
  }, [edges]);

  // Management always floats to the top: owner → manager → staff. This rank is
  // the primary sort key for every column so "tidying" the list keeps the
  // people in charge first, regardless of the chosen field or direction.
  const orgRoleRank = (p: PersonNode): number => {
    const r = (p.orgRole || "").toLowerCase();
    if (r === "owner") return 0;
    if (r === "manager") return 1;
    return 2;
  };

  const visible = useMemo(() => {
    let arr = persons.slice();
    if (searchMatchIds) arr = arr.filter((p) => searchMatchIds.has(p.id));
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const rankDiff = orgRoleRank(a) - orgRoleRank(b);
      if (rankDiff !== 0) return rankDiff;
      const ga = a.groupId ? groupsById[a.groupId]?.name ?? "￿" : "￿";
      const gb = b.groupId ? groupsById[b.groupId]?.name ?? "￿" : "￿";
      switch (sortKey) {
        case "name":   return a.name.localeCompare(b.name, "zh") * dir;
        case "role":   return (rolesByKey[a.role]?.name ?? "").localeCompare(rolesByKey[b.role]?.name ?? "", "zh") * dir;
        case "group":  return (ga.localeCompare(gb, "zh") || a.name.localeCompare(b.name, "zh")) * dir;
        case "status": return (a.status || "").localeCompare(b.status || "") * dir;
        default: return 0;
      }
    });
    return arr;
  }, [persons, sortKey, sortDir, searchMatchIds, rolesByKey, groupsById]);

  const grouped = useMemo(() => {
    if (sortKey !== "group" || !showGroupHeaders) return null;
    const map = new Map<string, PersonNode[]>();
    for (const p of visible) {
      const key = p.groupId || "__none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [visible, sortKey, showGroupHeaders]);

  const headerCell = (label: string, k: SortKey, className?: string) => (
    <th
      onClick={() => {
        if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
        else { setSortKey(k); setSortDir("asc"); }
      }}
      className={cn(
        "px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground cursor-pointer hover:text-foreground select-none",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (
          sortDir === "asc"
            ? <ArrowUp className="h-2.5 w-2.5" strokeWidth={1.75} />
            : <ArrowDown className="h-2.5 w-2.5" strokeWidth={1.75} />
        )}
      </span>
    </th>
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-background">
      <div className="sticky top-0 z-20 px-4 py-2.5 bg-background border-b border-border flex items-center gap-3 sm:gap-4 text-[11.5px] flex-wrap">
        <span className="text-stone-700 dark:text-stone-200">
          <span className="font-mono tabular-nums font-semibold text-foreground">{visible.length}</span>
          {searchMatchIds && <span className="text-muted-foreground"> / {persons.length}</span>}
          <span className="text-muted-foreground"> 人</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-stone-600 dark:text-stone-300 inline-flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showGroupHeaders} onCheckedChange={(v) => setShowGroupHeaders(!!v)} />
            按分组显示
          </label>
        </div>
      </div>

      <table className="w-full text-[12.5px]">
        <thead className="sticky top-[42px] z-10 bg-muted/40 border-b border-border">
          <tr>
            <th className="px-3 py-2 w-8" />
            {headerCell("姓名", "name")}
            {headerCell("角色", "role")}
            {headerCell("分组", "group")}
            {headerCell("状态", "status")}
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground">联系方式</th>
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground">权限</th>
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground">关系</th>
            <th className="px-3 py-2 w-10" />
          </tr>
        </thead>

        <tbody>
          {grouped ? grouped.flatMap(([gid, rows]) => {
            const g = gid === "__none" ? null : groupsById[gid];
            const preset = g ? (ORG_GROUP_PRESETS[g.groupKind] || ORG_GROUP_PRESETS.custom) : null;
            const Icon = preset ? (GROUP_ICON_MAP[preset.icon] || Users) : Users;
            return [
              <tr key={"h-" + gid} className="bg-muted/40 border-y border-border">
                <td colSpan={9} className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {g ? (
                      <>
                        <span className="h-5 w-5 rounded-[0.3rem] inline-flex items-center justify-center text-white" style={{ background: preset!.color }}>
                          <Icon className="h-2.5 w-2.5" strokeWidth={1.75} />
                        </span>
                        <button onClick={() => onSelectNode(g.id)} className="text-[12px] font-semibold text-stone-800 dark:text-stone-100 hover:underline">{g.name}</button>
                        <span className="text-[10.5px] text-muted-foreground">{g.desc}</span>
                      </>
                    ) : (
                      <span className="text-[12px] font-semibold text-muted-foreground italic">未分组</span>
                    )}
                    <span className="ml-auto text-[10.5px] font-mono text-muted-foreground tabular-nums">{rows.length} 人</span>
                  </div>
                </td>
              </tr>,
              ...rows.map((p) => (
                <PersonRow
                  key={p.id}
                  p={p}
                  roles={roles}
                  groupNodes={nodes.filter((n): n is GroupNode => n.kind === "group")}
                  manageCount={manageCount}
                  isSelected={p.id === selectedId}
                  isMatch={!!searchMatchIds && searchMatchIds.has(p.id)}
                  onSelect={() => onSelectNode(p.id)}
                  onUpdateNode={onUpdateNode}
                  onDeleteNode={onDeleteNode}
                />
              )),
            ];
          }) : visible.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              roles={roles}
              groupNodes={nodes.filter((n): n is GroupNode => n.kind === "group")}
              manageCount={manageCount}
              isSelected={p.id === selectedId}
              isMatch={!!searchMatchIds && searchMatchIds.has(p.id)}
              onSelect={() => onSelectNode(p.id)}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonRow({
  p, roles, groupNodes, manageCount, isSelected, isMatch,
  onSelect, onUpdateNode, onDeleteNode,
}: {
  p: PersonNode;
  roles: RoleRow[];
  groupNodes: GroupNode[];
  manageCount: { out: Record<string, number>; inc: Record<string, number> };
  isSelected: boolean;
  isMatch: boolean;
  onSelect: () => void;
  onUpdateNode: (id: string, patch: { groupId?: string | null; role?: string; perms?: string[] }) => void;
  onDeleteNode: (id: string) => void;
}) {
  const rolesByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const role = rolesByKey[p.role] ?? roles[0];

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "border-b border-border group cursor-pointer transition-colors",
        isSelected
          ? "bg-muted/40"
          : isMatch
          ? "bg-amber-50/60 dark:bg-amber-950/20"
          : "hover:bg-muted/30",
      )}
    >
      <td className="px-3 py-2.5 align-middle">
        <span className="block h-7 w-1 rounded" style={{ background: role?.color ?? "#78716c" }} />
      </td>

      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-full inline-flex items-center justify-center font-semibold text-[10.5px] shrink-0"
            style={{ background: (role?.color ?? "#78716c") + "20", color: role?.color ?? "#78716c" }}
          >
            {initials(p.name)}
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-foreground truncate">{p.name}</div>
            {p.isMe && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] mt-0.5 bg-foreground text-background border-foreground rounded-[0.2rem]">
                YOU
              </Badge>
            )}
          </div>
        </div>
      </td>

      <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
        <Select
          value={p.role}
          onValueChange={(v) => {
            if (v == null) return;
            const r = rolesByKey[v];
            if (!r) return;
            onUpdateNode(p.id, { role: v, perms: r.perms.length > 0 ? r.perms : p.perms });
          }}
        >
          <SelectTrigger
            size="sm"
            className="max-w-[150px] h-7 text-[12px]"
            style={{ color: role?.color, fontWeight: 500 }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.key} value={r.key} className="text-[12px]">{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
        <Select
          value={p.groupId ?? "__none"}
          onValueChange={(v) => {
            if (v == null) return;
            onUpdateNode(p.id, { groupId: v === "__none" ? null : v });
          }}
        >
          <SelectTrigger size="sm" className="max-w-[160px] h-7 text-[12px] text-stone-700 dark:text-stone-200">
            <SelectValue placeholder="— 无组 —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— 无组 —</SelectItem>
            {groupNodes.map((g) => (
              <SelectItem key={g.id} value={g.id} className="text-[12px]">{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-3 py-2.5 align-middle">
        <StatusPill status={p.status} />
      </td>

      <td className="px-3 py-2.5 align-middle">
        <div className="text-[11.5px] font-mono text-stone-700 dark:text-stone-200 truncate max-w-[180px]">{p.email}</div>
      </td>

      <td className="px-3 py-2.5 align-middle">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          title="点开侧栏编辑权限"
        >
          <KeyRound className="h-2.5 w-2.5" strokeWidth={1.75} />
          <span className="font-mono tabular-nums">{p.perms.length}</span>
        </button>
      </td>

      <td className="px-3 py-2.5 align-middle">
        <div className="inline-flex items-center gap-2 text-[10.5px] font-mono text-muted-foreground tabular-nums">
          <span title="谁管它">
            <ArrowDown className="inline h-2.5 w-2.5 align-[-1px]" strokeWidth={1.75} /> {manageCount.inc[p.id] || 0}
          </span>
          <span title="它管谁">
            <ArrowUp className="inline h-2.5 w-2.5 align-[-1px]" strokeWidth={1.75} /> {manageCount.out[p.id] || 0}
          </span>
        </div>
      </td>

      <td className="px-3 py-2.5 align-middle">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`从画布移除 ${p.name}（不会删除成员）？`)) onDeleteNode(p.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity rounded-[0.2rem] text-stone-400 hover:text-destructive hover:bg-destructive/10"
          title="从画布移除"
        >
          <Trash2 strokeWidth={1.75} />
        </Button>
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    active:   { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", label: "在职" },
    invited:  { bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-700 dark:text-amber-300",     label: "待入职" },
    disabled: { bg: "bg-muted",                              text: "text-muted-foreground",                  label: "已停用" },
  };
  const s = styles[status] ?? styles.active;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[0.2rem] px-1.5 py-0.5 text-[10.5px] font-medium", s.bg, s.text)}>
      ●&nbsp;{s.label}
    </span>
  );
}

