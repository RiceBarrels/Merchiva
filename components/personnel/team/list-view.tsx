"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building,
  ChevronRight,
  KeyRound,
  MailX,
  Map as MapIcon,
  Store,
  UserMinus,
  Users,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n, useT } from "@/lib/i18n/context";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import {
  ORG_GROUP_PRESETS,
  builtinRoleName,
  fmt,
  groupDisplayName,
  statusLabel,
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

/** Select value used for "no group" (Base UI needs a non-null string for the label lookup). */
const NO_GROUP = "__none";
const FALLBACK_ROLE_COLOR = "var(--muted-foreground)";
/** Sticky, opaque column header with a bottom rule that stays visible while stuck. */
const STICKY_TH = "sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)]";
const COLUMN_COUNT = 9;

type SortKey = "name" | "role" | "group" | "status";
type TFn = (key: string) => string;
type SelectOption = { value: string; label: string };
type ManageCount = { out: Record<string, number>; inc: Record<string, number> };
type UpdatePatch = { groupId?: string | null; role?: string; perms?: string[]; x?: number; y?: number };

interface Bucket {
  id: string;
  group: GroupNode | null;
  rows: PersonNode[];
  /** Members in the group before search filtering (drives the empty-group hint). */
  total: number;
}

function isInvite(p: PersonNode): boolean {
  return p.id.startsWith("inv-");
}

function isOwner(p: PersonNode): boolean {
  return (p.orgRole || "").toLowerCase() === "owner";
}

/** Management always floats to the top: owner → manager → staff. */
function orgRoleRank(p: PersonNode): number {
  const r = (p.orgRole || "").toLowerCase();
  if (r === "owner") return 0;
  if (r === "manager") return 1;
  return 2;
}

function roleDisplayName(t: TFn, rolesByKey: Record<string, RoleRow>, roleKey: string): string {
  return rolesByKey[roleKey]?.name ?? builtinRoleName(t, roleKey) ?? t("personnel.team.org.roleMissing");
}

/** Renders "{n} people" with the number in mono. */
function PeopleCount({ t, n, className }: { t: TFn; n: ReactNode; className?: string }) {
  const [before, after = ""] = t("personnel.team.org.peopleCount").split("{n}");
  return (
    <span className={className}>
      {before}
      <span className="font-mono tabular-nums">{n}</span>
      {after}
    </span>
  );
}

function GroupChip({ group, size }: { group: GroupNode; size: "sm" | "md" }) {
  const preset = ORG_GROUP_PRESETS[group.groupKind] || ORG_GROUP_PRESETS.custom;
  const Icon = GROUP_ICON_MAP[preset.icon] || Users;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm text-white",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
      )}
      style={{ background: preset.color }}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={1.75} />
    </span>
  );
}

export function OrgListView({
  nodes,
  edges,
  roles,
  selectedId,
  searchMatchIds,
  isMobile,
  canEditMembers,
  canEditLayout,
  canInvite,
  onSelectNode,
  onUpdateNode,
  onRemoveMember,
  onCancelInvite,
}: {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  roles: RoleRow[];
  selectedId: string | null;
  searchMatchIds: Set<string> | null;
  isMobile: boolean;
  canEditMembers: boolean;
  canEditLayout: boolean;
  canInvite: boolean;
  onSelectNode: (id: string) => void;
  onUpdateNode: (id: string, patch: UpdatePatch) => void;
  onRemoveMember: (p: PersonNode) => void;
  onCancelInvite: (p: PersonNode) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const collator = useMemo(
    () => new Intl.Collator(LOCALE_BCP47[locale], { sensitivity: "base", numeric: true }),
    [locale],
  );

  const rolesByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const [sortKey, setSortKey] = useState<SortKey>("group");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showGroupHeaders, setShowGroupHeaders] = useState(true);

  // Phones have no column sort: they always sort by group and grouping only
  // depends on the checkbox. Desktop groups only while the group column is the sort.
  const effectiveSortKey: SortKey = isMobile ? "group" : sortKey;
  const effectiveDir = isMobile ? "asc" : sortDir;
  const groupingOn = isMobile ? showGroupHeaders : sortKey === "group" && showGroupHeaders;

  const groupNodes = useMemo(
    () => nodes.filter((n): n is GroupNode => n.kind === "group"),
    [nodes],
  );
  const groupsById = useMemo(
    () => Object.fromEntries(groupNodes.map((g) => [g.id, g])) as Record<string, GroupNode>,
    [groupNodes],
  );
  const sortedGroups = useMemo(
    () =>
      groupNodes
        .slice()
        .sort((a, b) => collator.compare(groupDisplayName(t, a), groupDisplayName(t, b))),
    [groupNodes, collator, t],
  );
  const groupIndex = useMemo(
    () => new Map(sortedGroups.map((g, i) => [g.id, i])),
    [sortedGroups],
  );
  const persons = useMemo(
    () => nodes.filter((n): n is PersonNode => n.kind === "person"),
    [nodes],
  );
  const memberCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of persons) {
      if (p.groupId) m.set(p.groupId, (m.get(p.groupId) ?? 0) + 1);
    }
    return m;
  }, [persons]);

  const manageCount = useMemo<ManageCount>(() => {
    const out: Record<string, number> = {};
    const inc: Record<string, number> = {};
    for (const e of edges) {
      out[e.from] = (out[e.from] || 0) + 1;
      inc[e.to] = (inc[e.to] || 0) + 1;
    }
    return { out, inc };
  }, [edges]);

  // Options for the role / group Selects (Base UI resolves the trigger label from `items`).
  const assignableRoleItems = useMemo<SelectOption[]>(
    () => roles.filter((r) => r.key !== "owner").map((r) => ({ value: r.key, label: r.name })),
    [roles],
  );
  const groupItems = useMemo<SelectOption[]>(
    () => [
      { value: NO_GROUP, label: t("personnel.team.org.noGroup") },
      ...groupNodes.map((g) => ({ value: g.id, label: groupDisplayName(t, g) })),
    ],
    [groupNodes, t],
  );

  // One comparator for the flat list and for group buckets that bypass the search filter.
  const comparePersons = useMemo(() => {
    const dir = effectiveDir === "asc" ? 1 : -1;
    const groupPos = (p: PersonNode): number | undefined =>
      p.groupId ? groupIndex.get(p.groupId) : undefined;
    return (a: PersonNode, b: PersonNode): number => {
      // Rank first so the people in charge stay on top for every column / direction.
      const rankDiff = orgRoleRank(a) - orgRoleRank(b);
      if (rankDiff !== 0) return rankDiff;
      let d = 0;
      switch (effectiveSortKey) {
        case "name":
          d = collator.compare(a.name, b.name);
          break;
        case "role":
          d = collator.compare(roleDisplayName(t, rolesByKey, a.role), roleDisplayName(t, rolesByKey, b.role));
          break;
        case "status":
          d = collator.compare(statusLabel(t, a.status), statusLabel(t, b.status));
          break;
        case "group": {
          const ga = groupPos(a);
          const gb = groupPos(b);
          // Ungrouped always sinks to the bottom, whatever the direction.
          if (ga === undefined && gb !== undefined) return 1;
          if (gb === undefined && ga !== undefined) return -1;
          d = (ga ?? 0) - (gb ?? 0);
          break;
        }
      }
      if (d !== 0) return d * dir;
      return collator.compare(a.name, b.name);
    };
  }, [effectiveDir, effectiveSortKey, groupIndex, collator, t, rolesByKey]);

  const visible = useMemo(() => {
    // A group whose name matched brings all of its members, in flat and grouped mode
    // alike (the toolbar counter uses the same rule).
    const arr = searchMatchIds
      ? persons.filter((p) => searchMatchIds.has(p.id) || (!!p.groupId && searchMatchIds.has(p.groupId)))
      : persons.slice();
    return arr.sort(comparePersons);
  }, [persons, searchMatchIds, comparePersons]);

  const buckets = useMemo<Bucket[] | null>(() => {
    if (!groupingOn) return null;
    const byGroup = new Map<string, PersonNode[]>();
    for (const p of visible) {
      const key = p.groupId && groupsById[p.groupId] ? p.groupId : NO_GROUP;
      const list = byGroup.get(key);
      if (list) list.push(p);
      else byGroup.set(key, [p]);
    }
    const orderedGroups = effectiveDir === "asc" ? sortedGroups : sortedGroups.slice().reverse();
    const out: Bucket[] = [];
    for (const g of orderedGroups) {
      // A group whose own name matched the search shows every member, not just the matching ones.
      const rows = searchMatchIds?.has(g.id)
        ? persons.filter((p) => p.groupId === g.id).sort(comparePersons)
        : byGroup.get(g.id) ?? [];
      // While searching, hide groups with no matching members (unless the group itself matched).
      if (searchMatchIds && rows.length === 0 && !searchMatchIds.has(g.id)) continue;
      out.push({ id: g.id, group: g, rows, total: memberCountByGroup.get(g.id) ?? 0 });
    }
    const ungrouped = byGroup.get(NO_GROUP);
    if (ungrouped && ungrouped.length > 0) {
      out.push({ id: NO_GROUP, group: null, rows: ungrouped, total: ungrouped.length });
    }
    return out;
  }, [groupingOn, visible, groupsById, effectiveDir, sortedGroups, searchMatchIds, memberCountByGroup, persons, comparePersons]);

  const isEmpty = visible.length === 0 && (!buckets || buckets.length === 0);
  // People actually on screen (group-name matches add members that `visible` filtered out).
  const shownCount = buckets ? buckets.reduce((sum, b) => sum + b.rows.length, 0) : visible.length;

  const countLine = (
    <PeopleCount
      t={t}
      className="text-muted-foreground"
      n={
        <>
          <span className="font-semibold text-foreground">{shownCount}</span>
          {searchMatchIds && <> / {persons.length}</>}
        </>
      }
    />
  );

  const groupToggle = (
    <label className="ml-auto inline-flex cursor-pointer items-center gap-2 py-1 text-[11.5px] text-muted-foreground select-none">
      <Checkbox
        className="min-h-0! min-w-0!"
        checked={groupingOn}
        onCheckedChange={(v) => {
          if (v) {
            setShowGroupHeaders(true);
            setSortKey("group");
            setSortDir("asc");
          } else {
            setShowGroupHeaders(false);
          }
        }}
      />
      {t("personnel.team.org.list.groupBy")}
    </label>
  );

  const emptyGroupHint = (mobile: boolean) => (
    <>
      {t("personnel.team.org.list.emptyGroup")}
      {canEditLayout && (
        <>
          {" "}
          {t(mobile ? "personnel.team.org.list.emptyGroupHintMobile" : "personnel.team.org.list.emptyGroupHint")}
        </>
      )}
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Mobile — card list (tap a card to open the inspector sheet for editing).
  // ─────────────────────────────────────────────────────────────────────────
  if (isMobile) {
    const renderCard = (p: PersonNode) => (
      <PersonCard
        key={p.id}
        p={p}
        t={t}
        group={p.groupId ? groupsById[p.groupId] ?? null : null}
        role={rolesByKey[p.role]}
        manageCount={manageCount}
        isSelected={p.id === selectedId}
        onSelect={() => onSelectNode(p.id)}
      />
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3.5 py-1.5 text-[11.5px]">
          {countLine}
          {groupToggle}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isEmpty ? (
            <div className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
              {t("personnel.team.noMatches")}
            </div>
          ) : buckets ? (
            buckets.map((b) => {
              const g = b.group;
              const open = g ? () => onSelectNode(g.id) : undefined;
              return (
                <section key={b.id}>
                  <div
                    role={g ? "button" : undefined}
                    tabIndex={g ? 0 : undefined}
                    onClick={open}
                    onKeyDown={
                      open
                        ? (e: KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              open();
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "sticky top-0 z-10 flex h-9 min-h-0! min-w-0! items-center gap-2 border-y border-border bg-muted px-3.5 -mt-px",
                      g && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-accent",
                    )}
                  >
                    {g ? (
                      <>
                        <GroupChip group={g} size="sm" />
                        <span className="truncate text-[11.5px] font-semibold text-foreground">
                          {groupDisplayName(t, g)}
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" strokeWidth={1.75} aria-hidden />
                      </>
                    ) : (
                      <span className="truncate text-[11.5px] font-semibold text-muted-foreground">
                        {t("personnel.team.org.ungrouped")}
                      </span>
                    )}
                    <PeopleCount
                      t={t}
                      n={b.rows.length}
                      className="ml-auto shrink-0 text-[10.5px] text-muted-foreground"
                    />
                  </div>
                  {b.rows.length === 0 && b.total === 0 ? (
                    <div className="border-b border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                      {emptyGroupHint(true)}
                    </div>
                  ) : (
                    b.rows.map(renderCard)
                  )}
                </section>
              );
            })
          ) : (
            visible.map(renderCard)
          )}
          <div className="h-3" />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Desktop — sortable table.
  // ─────────────────────────────────────────────────────────────────────────
  const sortHead = (label: string, k: SortKey, className?: string) => {
    const active = sortKey === k;
    return (
      <TableHead
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(STICKY_TH, className)}
      >
        <button
          type="button"
          onClick={() => {
            if (active) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey(k);
              setSortDir("asc");
            }
          }}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase tracking-wide outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            active && "text-foreground",
          )}
        >
          {label}
          {active &&
            (sortDir === "asc" ? (
              <ArrowUp className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
            ) : (
              <ArrowDown className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
            ))}
        </button>
      </TableHead>
    );
  };

  const renderRow = (p: PersonNode) => (
    <PersonRow
      key={p.id}
      p={p}
      t={t}
      rolesByKey={rolesByKey}
      assignableRoleItems={assignableRoleItems}
      groupItems={groupItems}
      groupsById={groupsById}
      manageCount={manageCount}
      isSelected={p.id === selectedId}
      canEditMembers={canEditMembers}
      canEditLayout={canEditLayout}
      canInvite={canInvite}
      onSelect={() => onSelectNode(p.id)}
      onUpdateNode={onUpdateNode}
      onRemoveMember={onRemoveMember}
      onCancelInvite={onCancelInvite}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-1.5 text-[11.5px] sm:gap-4">
        {countLine}
        {groupToggle}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table containerClassName="overflow-visible" className="text-[12.5px]">
          <TableHeader className="[&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(STICKY_TH, "w-8")} />
              {sortHead(t("personnel.team.colName"), "name")}
              {sortHead(t("personnel.team.colRole"), "role")}
              {sortHead(t("personnel.team.org.list.colGroup"), "group")}
              {sortHead(t("personnel.team.colStatus"), "status")}
              <TableHead className={STICKY_TH}>{t("personnel.team.colContact")}</TableHead>
              <TableHead className={STICKY_TH}>{t("personnel.team.fieldPermissions")}</TableHead>
              <TableHead className={STICKY_TH}>{t("personnel.team.org.list.colRelations")}</TableHead>
              <TableHead className={cn(STICKY_TH, "w-12")}>
                <span className="sr-only">{t("personnel.team.org.list.colActions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isEmpty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="px-4 py-12 text-center text-[12.5px] whitespace-normal text-muted-foreground"
                >
                  {t("personnel.team.noMatches")}
                </TableCell>
              </TableRow>
            ) : buckets ? (
              buckets.flatMap((b) => {
                const g = b.group;
                const header = (
                  <TableRow
                    key={"h-" + b.id}
                    onClick={g ? () => onSelectNode(g.id) : undefined}
                    className={cn(
                      "border-y border-border bg-muted/40 hover:bg-muted/40",
                      g && "cursor-pointer hover:bg-muted/70",
                    )}
                  >
                    <TableCell colSpan={COLUMN_COUNT} className="py-1.5">
                      <div className="flex h-5 items-center gap-2">
                        {g ? (
                          <>
                            <GroupChip group={g} size="md" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode(g.id);
                              }}
                              className="min-h-0! min-w-0! truncate rounded-sm text-[12px] font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                            >
                              {groupDisplayName(t, g)}
                            </button>
                            {g.desc && (
                              <span className="truncate text-[10.5px] text-muted-foreground">{g.desc}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[12px] font-semibold text-muted-foreground">
                            {t("personnel.team.org.ungrouped")}
                          </span>
                        )}
                        <PeopleCount
                          t={t}
                          n={b.rows.length}
                          className="ml-auto shrink-0 text-[10.5px] text-muted-foreground"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
                if (b.rows.length === 0) {
                  if (b.total > 0) return [header];
                  return [
                    header,
                    <TableRow key={"e-" + b.id} className="hover:bg-transparent">
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="py-2.5 pl-11 text-[11.5px] whitespace-normal text-muted-foreground"
                      >
                        {emptyGroupHint(false)}
                      </TableCell>
                    </TableRow>,
                  ];
                }
                return [header, ...b.rows.map(renderRow)];
              })
            ) : (
              visible.map(renderRow)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Relations (↑ reports to · ↓ manages — same mapping as the inspector) ────

function RelationCounts({ t, id, manageCount, className }: { t: TFn; id: string; manageCount: ManageCount; className?: string }) {
  const managedBy = t("personnel.team.org.managedBy");
  const manages = t("personnel.team.org.manages");
  return (
    <span className={cn("inline-flex items-center gap-2 font-mono tabular-nums text-muted-foreground", className)}>
      <span title={managedBy} className="inline-flex items-center gap-0.5">
        <ArrowUp className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">{managedBy}: </span>
        {manageCount.inc[id] || 0}
      </span>
      <span title={manages} className="inline-flex items-center gap-0.5">
        <ArrowDown className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">{manages}: </span>
        {manageCount.out[id] || 0}
      </span>
    </span>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function PersonCard({
  p, t, group, role, manageCount, isSelected, onSelect,
}: {
  p: PersonNode;
  t: TFn;
  group: GroupNode | null;
  role: RoleRow | undefined;
  manageCount: ManageCount;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = role?.color ?? FALLBACK_ROLE_COLOR;
  const roleName = role?.name ?? builtinRoleName(t, p.role) ?? t("personnel.team.org.roleMissing");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "flex w-full items-stretch gap-0 border-b border-border text-left transition-colors active:bg-muted/60",
        isSelected ? "bg-muted/50" : "bg-background",
      )}
    >
      <span aria-hidden className="w-1 shrink-0" style={{ background: color }} />
      <span className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3">
        <Avatar name={p.name} src={p.avatarUrl} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium tracking-[-0.015em] text-foreground">{p.name}</span>
            {p.isMe && (
              <Badge variant="outline" className="h-4 shrink-0 border-foreground bg-foreground px-1 text-[9px] text-background">
                {t("chat.you")}
              </Badge>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
              {roleName}
            </span>
            {group && (
              <span className="truncate text-[11px] text-muted-foreground">· {groupDisplayName(t, group)}</span>
            )}
            <StatusPill t={t} status={p.status} />
          </span>
          {p.email && (
            <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground/80">{p.email}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <RelationCounts t={t} id={p.id} manageCount={manageCount} className="gap-1.5 text-[10px]" />
          <span className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            <KeyRound className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{t("personnel.team.fieldPermissions")}: </span>
            {p.perms.length}
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" strokeWidth={1.75} aria-hidden />
          </span>
        </span>
      </span>
    </button>
  );
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

function PersonRow({
  p, t, rolesByKey, assignableRoleItems, groupItems, groupsById, manageCount, isSelected,
  canEditMembers, canEditLayout, canInvite,
  onSelect, onUpdateNode, onRemoveMember, onCancelInvite,
}: {
  p: PersonNode;
  t: TFn;
  rolesByKey: Record<string, RoleRow>;
  assignableRoleItems: SelectOption[];
  groupItems: SelectOption[];
  groupsById: Record<string, GroupNode>;
  manageCount: ManageCount;
  isSelected: boolean;
  canEditMembers: boolean;
  canEditLayout: boolean;
  canInvite: boolean;
  onSelect: () => void;
  onUpdateNode: (id: string, patch: UpdatePatch) => void;
  onRemoveMember: (p: PersonNode) => void;
  onCancelInvite: (p: PersonNode) => void;
}) {
  const role = rolesByKey[p.role];
  const color = role?.color ?? FALLBACK_ROLE_COLOR;
  const invite = isInvite(p);
  const owner = isOwner(p);
  const locked = owner || invite;
  const roleEditable = canEditMembers && !locked;
  const groupValue = p.groupId && groupsById[p.groupId] ? p.groupId : NO_GROUP;

  // Keep the member's current role selectable-as-label even if it was removed from the catalog.
  const roleItems = useMemo<SelectOption[]>(() => {
    if (locked || assignableRoleItems.some((o) => o.value === p.role)) return assignableRoleItems;
    const base = builtinRoleName(t, p.role) ?? p.role;
    return [
      ...assignableRoleItems,
      { value: p.role, label: `${base} · ${t("personnel.team.org.roleMissing")}` },
    ];
  }, [assignableRoleItems, locked, p.role, t]);

  const lockNote = owner
    ? t("personnel.team.org.lockedOwner")
    : invite
      ? t("personnel.team.org.lockedInvite")
      : !canEditMembers
        ? t("personnel.team.org.ownerOnly")
        : undefined;

  const permCountLabel = fmt(t("personnel.team.org.list.permCount"), { n: p.perms.length });

  return (
    <TableRow
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-border",
        isSelected ? "bg-muted/40 hover:bg-muted/50" : "hover:bg-muted/30",
      )}
    >
      <TableCell className="py-2.5">
        <span aria-hidden className="block h-7 w-1 rounded-sm" style={{ background: color }} />
      </TableCell>

      <TableCell className="py-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-current={isSelected ? "true" : undefined}
          className="-mx-1 flex max-w-[240px] items-center gap-2.5 rounded-sm px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar name={p.name} src={p.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-foreground">{p.name}</span>
            {p.isMe && (
              <Badge variant="outline" className="mt-0.5 h-4 border-foreground bg-foreground px-1 text-[9px] text-background">
                {t("chat.you")}
              </Badge>
            )}
          </span>
        </button>
      </TableCell>

      <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()} title={lockNote}>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
            {roleDisplayName(t, rolesByKey, p.role)}
          </span>
        ) : (
          <Select
            value={p.role}
            items={roleItems}
            disabled={!roleEditable}
            onValueChange={(v) => {
              if (v == null || v === p.role || !roleEditable) return;
              const r = rolesByKey[v];
              if (!r || r.key === "owner") return;
              // No role defaults → send the role only; the hook merges it with any
              // permission write that is still in flight (p.perms may be stale).
              onUpdateNode(p.id, r.perms.length > 0 ? { role: v, perms: r.perms } : { role: v });
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 max-w-[160px] text-[12px] font-medium text-foreground"
              aria-label={t("personnel.team.colRole")}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleItems.map((o) => (
                <SelectItem
                  key={o.value}
                  value={o.value}
                  disabled={!rolesByKey[o.value]}
                  className="text-[12px]"
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </TableCell>

      <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
        <Select
          value={groupValue}
          items={groupItems}
          disabled={!canEditLayout}
          onValueChange={(v) => {
            if (v == null || !canEditLayout) return;
            const next = v === NO_GROUP ? null : v;
            if (next === (groupValue === NO_GROUP ? null : groupValue)) return;
            onUpdateNode(p.id, { groupId: next });
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-7 max-w-[180px] text-[12px] text-foreground"
            aria-label={t("personnel.team.org.list.colGroup")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupItems.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                className={cn("text-[12px]", o.value === NO_GROUP && "text-muted-foreground")}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell className="py-2.5">
        <StatusPill t={t} status={p.status} />
      </TableCell>

      <TableCell className="py-2.5">
        <div className="max-w-[200px] truncate font-mono text-[11.5px] tabular-nums text-foreground">{p.email}</div>
      </TableCell>

      <TableCell className="py-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          aria-label={permCountLabel}
          title={permCountLabel}
          className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <KeyRound className="h-2.5 w-2.5" strokeWidth={1.75} aria-hidden />
          <span className="font-mono tabular-nums">{p.perms.length}</span>
        </button>
      </TableCell>

      <TableCell className="py-2.5">
        <RelationCounts t={t} id={p.id} manageCount={manageCount} className="text-[10.5px]" />
      </TableCell>

      <TableCell className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        {invite ? (
          canInvite && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onCancelInvite(p)}
              aria-label={t("personnel.team.actionCancelInvite")}
              title={t("personnel.team.actionCancelInvite")}
              className="text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
            >
              <MailX className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )
        ) : (
          canEditMembers && !locked && !p.isMe && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemoveMember(p)}
              aria-label={t("personnel.team.actionRemove")}
              title={t("personnel.team.actionRemove")}
              className="text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
            >
              <UserMinus className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )
        )}
      </TableCell>
    </TableRow>
  );
}

function StatusPill({ t, status }: { t: TFn; status: string }) {
  const tone: StatusTone = status === "invited" ? "warning" : status === "disabled" ? "neutral" : "success";
  return (
    <StatusBadge tone={tone} dot size="xs" className="normal-case tracking-normal">
      {statusLabel(t, status)}
    </StatusBadge>
  );
}
