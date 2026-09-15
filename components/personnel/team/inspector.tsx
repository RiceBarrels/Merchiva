"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building,
  LayoutGrid,
  MailX,
  Map as MapIcon,
  MousePointerClick,
  Plus,
  Settings2,
  SquarePen,
  Store,
  Trash2,
  User,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import {
  GROUP_KINDS,
  ORG_GROUP_PRESETS,
  ORG_PERMS,
  ORG_PERMS_FLAT,
  builtinRoleName,
  fmt,
  groupDisplayName,
  groupKindLabel,
  permGroupLabel,
  permLabel,
  statusLabel,
  type EdgeLayout,
  type GroupKind,
  type GroupNode,
  type OrgNode,
  type PersonNode,
} from "./data";
import type { RoleRow } from "./use-org-graph";

type NodePatch = Partial<PersonNode> & Partial<GroupNode> & { role?: string; perms?: string[] };

export interface InspectorProps {
  node: OrgNode | null;
  edges: EdgeLayout[];
  nodes: OrgNode[];
  roles: RoleRow[];
  isMobile: boolean;
  viewMode: "graph" | "list";
  canEditMembers: boolean;
  canEditLayout: boolean;
  canInvite: boolean;
  canManageRoles: boolean;
  onUpdateNode: (id: string, patch: NodePatch) => void;
  onDeleteNode: (id: string) => void;
  onCreateEdge: (from: string, to: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onSelect: (id: string) => void;
  onTidyGroup: (id: string) => void;
  onOpenRoleManager: () => void;
  onClose: () => void;
  onOpenEditMember: (member: PersonNode) => void;
  onRemoveMember: (member: PersonNode) => void;
  onCancelInvite: (member: PersonNode) => void;
}

const GROUP_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  store: Store,
  map: MapIcon,
  building: Building,
  "users-round": Users,
};

const NO_GROUP = "__none";
const NO_PERMS: string[] = [];
/** Rapid checkbox toggles collapse into one write carrying the final array. */
const PERM_WRITE_DEBOUNCE_MS = 250;
/** If the server never echoes a write (e.g. the reducer rejected it), fall back to server state. */
const PERM_SETTLE_MS = 4000;
/**
 * Safety net for a deferred sheet action (F22): normally it runs from the
 * drawer's onCloseAutoFocus once vaul's 500ms exit animation has unmounted it.
 */
const SHEET_EXIT_FALLBACK_MS = 1200;

const k = (key: string) => `personnel.team.org.${key}`;

function permsKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function nodeLabel(t: ReturnType<typeof useT>, n: OrgNode): string {
  return n.kind === "group" ? groupDisplayName(t, n) : n.name.trim() || n.email;
}

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "invited") return "warning";
  return "neutral";
}

// ─── Inspector (desktop aside / mobile bottom sheet) ─────────────────────────

export function Inspector(props: InspectorProps) {
  const { node, isMobile, viewMode, canEditLayout, onClose } = props;

  // Keep the last selected node so the mobile sheet can play its close
  // animation after the selection is cleared (F21).
  const [lastNode, setLastNode] = useState<OrgNode | null>(node);
  if (node && node !== lastNode) setLastNode(node);
  const shown = node ?? lastNode;
  const open = !!node;

  // ── Actions that open another layer (F22) ─────────────────────────────────
  // On phones the dialog / confirm() must open only after the vaul sheet has
  // fully unmounted: until then Radix keeps body pointer-events:none and its
  // scroll lock, so a stacked dialog would be untappable for ~500ms.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPending = useCallback(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    const fn = pendingRef.current;
    pendingRef.current = null;
    fn?.();
  }, []);

  const runOutsideSheet = useCallback((fn: () => void) => {
    // Desktop, or the sheet is already gone: nothing to wait for.
    if (!isMobile || !contentRef.current) {
      fn();
      return;
    }
    pendingRef.current = fn;
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    fallbackRef.current = setTimeout(runPending, SHEET_EXIT_FALLBACK_MS);
    onClose();
  }, [isMobile, onClose, runPending]);

  // Re-opened before the old sheet finished closing: the sheet never unmounts,
  // so drop the stale action instead of firing it on some later close.
  useEffect(() => {
    if (!open) return;
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    pendingRef.current = null;
  }, [open]);

  useEffect(() => {
    const pending = pendingRef;
    const fallback = fallbackRef;
    return () => {
      pending.current = null;
      if (fallback.current) clearTimeout(fallback.current);
    };
  }, []);

  if (isMobile) {
    if (!shown) return null;
    return (
      <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} direction="bottom">
        <DrawerContent
          ref={contentRef}
          onCloseAutoFocus={(e) => {
            // Fires after Radix Presence unmounted the sheet (body
            // pointer-events already restored).
            if (!pendingRef.current) return;
            e.preventDefault();
            runPending();
          }}
          className="bg-background flex flex-col data-[vaul-drawer-direction=bottom]:max-h-[85dvh]"
        >
          <InspectorPanel
            key={shown.id}
            {...props}
            node={shown}
            mobile
            runOutsideSheet={runOutsideSheet}
            portalContainer={portalRef}
          />
          {/* Select popups portal here so they sit inside the drawer's
              RemoveScroll shard and focus trap (N06). The sheet is transformed
              (vaul will-change/translate), so this layer re-creates a
              viewport-sized containing block: bottom-anchored like the sheet,
              full dynamic-viewport height, own transform. That keeps Base UI's
              fixed backdrop covering the screen and its trigger cut-out
              aligned. */}
          <div
            ref={portalRef}
            data-vaul-no-drag=""
            className="pointer-events-none absolute inset-x-0 bottom-0 z-50 h-dvh [transform:translateZ(0)]"
          />
        </DrawerContent>
      </Drawer>
    );
  }

  if (!node) return <EmptyAside viewMode={viewMode} canEditLayout={canEditLayout} />;

  return (
    <aside className="w-[340px] shrink-0 min-h-0 border-l border-border bg-background flex flex-col">
      <InspectorPanel key={node.id} {...props} node={node} mobile={false} runOutsideSheet={runOutsideSheet} />
    </aside>
  );
}

// ─── Empty state (desktop only) ──────────────────────────────────────────────

function EmptyAside({ viewMode, canEditLayout }: { viewMode: "graph" | "list"; canEditLayout: boolean }) {
  const t = useT();
  return (
    <aside className="w-[340px] shrink-0 border-l border-border bg-background flex flex-col">
      <div className="px-5 py-5 text-[12.5px] text-muted-foreground leading-relaxed">
        <div className="flex items-center gap-2 text-foreground font-semibold text-[13px] mb-2">
          <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t(k("inspector.emptyTitle"))}
        </div>
        {viewMode === "list" ? (
          <p>{t(k("inspector.emptyList"))}</p>
        ) : (
          <>
            <p>{t(k("inspector.emptyGraph"))}</p>
            {canEditLayout && <p className="mt-1">{t(k("inspector.emptyGraphConnect"))}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
              {canEditLayout && (
                <>
                  <Tip title={t(k("inspector.tipJoinTitle"))} body={t(k("inspector.tipJoinBody"))} />
                  <Tip title={t(k("inspector.tipMoveTitle"))} body={t(k("inspector.tipMoveBody"))} />
                </>
              )}
              <Tip title={t(k("inspector.tipZoomTitle"))} body={t(k("inspector.tipZoomBody"))} />
              {canEditLayout && (
                <Tip title={t(k("inspector.tipUnlinkTitle"))} body={t(k("inspector.tipUnlinkBody"))} />
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-border rounded-lg p-2.5">
      <Eyebrow size="xs" className="font-mono mb-1">{title}</Eyebrow>
      <div className="text-foreground">{body}</div>
    </div>
  );
}

// ─── Field label (real <label>, eyebrow styling) ─────────────────────────────

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "block mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

// ─── Panel content (header · one scroll body · footer) ───────────────────────

type PanelProps = Omit<InspectorProps, "node" | "isMobile"> & {
  node: OrgNode;
  mobile: boolean;
  /** Runs `fn` directly on desktop; on phones only after the sheet has closed (F22). */
  runOutsideSheet: (fn: () => void) => void;
  /** Mobile only: in-sheet portal layer for Select popups (N06). */
  portalContainer?: React.RefObject<HTMLDivElement | null>;
};

function InspectorPanel({
  node, edges, nodes, roles, mobile, viewMode,
  canEditMembers, canEditLayout, canInvite, canManageRoles,
  onUpdateNode, onDeleteNode, onCreateEdge, onDeleteEdge, onSelect, onTidyGroup, onOpenRoleManager, onClose,
  onOpenEditMember, onRemoveMember, onCancelInvite, runOutsideSheet, portalContainer,
}: PanelProps) {
  const t = useT();
  const uid = useId();
  const ids = {
    groupName: `${uid}-group-name`,
    roleLabel: `${uid}-role-label`,
    role: `${uid}-role`,
    groupLabel: `${uid}-group-label`,
    group: `${uid}-group`,
    email: `${uid}-email`,
    kindLabel: `${uid}-kind-label`,
    kind: `${uid}-kind`,
    desc: `${uid}-desc`,
    managedBy: `${uid}-managed-by`,
    manages: `${uid}-manages`,
    members: `${uid}-members`,
    perms: `${uid}-perms`,
  };

  const person = node.kind === "person" ? node : null;
  const group = node.kind === "group" ? node : null;

  const rolesByKey = useMemo(() => new Map(roles.map((r) => [r.key, r])), [roles]);
  const groupNodes = useMemo(() => nodes.filter((n): n is GroupNode => n.kind === "group"), [nodes]);

  const currentRoleKey = person ? person.role.trim().toLowerCase() : "";
  const isOwner = !!person && (person.orgRole.trim().toLowerCase() === "owner" || currentRoleKey === "owner");
  const isInvite = !!person && person.id.startsWith("inv-");
  const locked = isOwner || isInvite;
  const permsEditable = !!person && canEditMembers && !locked;
  const lockNote = !person
    ? null
    : isOwner
      ? t(k("lockedOwner"))
      : isInvite
        ? t(k("lockedInvite"))
        : !canEditMembers
          ? t(k("ownerOnly"))
          : null;

  const roleName = (key: string): string =>
    rolesByKey.get(key)?.name ?? builtinRoleName(t, key) ?? t(k("roleMissing"));
  const currentRole = person ? rolesByKey.get(currentRoleKey) ?? null : null;

  // ── Optimistic permissions (F26) ──────────────────────────────────────────
  // Seeded from the node; re-seeded when the server value changes and no local
  // write is pending. The panel is keyed by node id, so a new node remounts it.
  const serverPerms = person ? person.perms : NO_PERMS;
  const serverKey = permsKey(serverPerms);
  const [perms, setPerms] = useState<string[]>(serverPerms);
  const [syncedKey, setSyncedKey] = useState(serverKey);
  const [pending, setPending] = useState(false);
  if (syncedKey !== serverKey) {
    setSyncedKey(serverKey);
    if (!pending) setPerms(serverPerms);
    else if (serverKey === permsKey(perms)) setPending(false);
  }
  const permSet = new Set(perms);

  const nodeId = node.id;
  const updateRef = useRef(onUpdateNode);
  const serverPermsRef = useRef(serverPerms);
  useEffect(() => {
    updateRef.current = onUpdateNode;
    serverPermsRef.current = serverPerms;
  });
  const queuedRef = useRef<string[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armSettle = useCallback(() => {
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      setPending(false);
      setPerms(serverPermsRef.current);
    }, PERM_SETTLE_MS);
  }, []);

  const flushPerms = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const next = queuedRef.current;
    if (!next) return;
    queuedRef.current = null;
    updateRef.current(nodeId, { perms: next });
    armSettle();
  }, [nodeId, armSettle]);

  // Send any queued write when the panel unmounts (sheet closed / other node).
  useEffect(() => {
    const settleTimers = settleRef;
    return () => {
      flushPerms();
      if (settleTimers.current) clearTimeout(settleTimers.current);
    };
  }, [flushPerms]);

  const commitPerms = (next: string[]) => {
    if (!permsEditable) return;
    setPerms(next);
    setPending(true);
    queuedRef.current = next;
    if (settleRef.current) {
      clearTimeout(settleRef.current);
      settleRef.current = null;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushPerms, PERM_WRITE_DEBOUNCE_MS);
  };

  const togglePerm = (pid: string, on: boolean) => {
    if (on === permSet.has(pid)) return;
    commitPerms(on ? [...perms, pid] : perms.filter((p) => p !== pid));
  };

  const changeRole = (value: string | null) => {
    if (!person || !permsEditable || value == null || value === currentRoleKey) return;
    const r = rolesByKey.get(value);
    if (!r || r.key === "owner") return;
    const nextPerms = r.perms.length > 0 ? r.perms : perms;
    // One combined write replaces any queued permission toggle.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    queuedRef.current = null;
    setPerms(nextPerms);
    setPending(true);
    onUpdateNode(person.id, { role: r.key, perms: nextPerms });
    armSettle();
  };

  const personGroupId = person?.groupId && groupNodes.some((g) => g.id === person.groupId) ? person.groupId : null;
  const changeGroup = (value: string | null) => {
    if (!person || !canEditLayout || value == null) return;
    const next = value === NO_GROUP ? null : value;
    if (next === personGroupId) return;
    onUpdateNode(person.id, { groupId: next });
  };

  const changeKind = (value: string | null) => {
    if (!group || !canEditLayout || value == null || value === group.groupKind) return;
    if (!(GROUP_KINDS as readonly string[]).includes(value)) return;
    onUpdateNode(group.id, { groupKind: value as GroupKind });
  };

  // Select popups inside the phone sheet portal into the sheet (N06).
  const selectContainer = mobile ? portalContainer : undefined;

  // ── Derived display data ──────────────────────────────────────────────────
  const assignableRoles = roles.filter((r) => r.key !== "owner");
  const roleItems = assignableRoles.map((r) => ({ value: r.key, label: r.name }));
  if (person && !isOwner && !roleItems.some((i) => i.value === currentRoleKey)) {
    roleItems.push({ value: currentRoleKey, label: t(k("roleMissing")) });
  }
  const groupItems = [
    { value: NO_GROUP, label: t(k("noGroup")) },
    ...groupNodes.map((g) => ({ value: g.id, label: groupDisplayName(t, g) })),
  ];
  const kindItems = GROUP_KINDS.map((kind) => ({ value: kind, label: groupKindLabel(t, kind) }));

  const preset = group ? ORG_GROUP_PRESETS[group.groupKind] ?? ORG_GROUP_PRESETS.custom : null;
  const PresetIcon = preset ? GROUP_ICON_MAP[preset.icon] ?? Users : Users;
  const groupMembers = group
    ? nodes.filter((n): n is PersonNode => n.kind === "person" && n.groupId === group.id)
    : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const toRows = (list: EdgeLayout[], otherEnd: (e: EdgeLayout) => string): RelationRow[] =>
    list.flatMap((e) => {
      const other = nodeById.get(otherEnd(e));
      return other ? [{ edgeId: e.id, node: other, label: nodeLabel(t, other) }] : [];
    });
  const managerEdges = edges.filter((e) => e.to === node.id);
  const reportEdges = edges.filter((e) => e.from === node.id);
  const managers = toRows(managerEdges, (e) => e.from);
  const reports = toRows(reportEdges, (e) => e.to);

  // Keyboard / touch alternative to dragging connectors on the canvas (F58).
  const candidatesExcluding = (taken: Set<string>): RelationCandidate[] =>
    canEditLayout
      ? nodes
          .filter((n) => n.id !== node.id && !taken.has(n.id))
          .map((n) => ({ value: n.id, label: nodeLabel(t, n), kind: n.kind }))
          .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "group" ? -1 : 1))
      : [];
  const managerCandidates = candidatesExcluding(new Set(managerEdges.map((e) => e.from)));
  const reportCandidates = candidatesExcluding(new Set(reportEdges.map((e) => e.to)));

  const displayName = nodeLabel(t, node);
  const subtitle = group
    ? `${groupKindLabel(t, group.groupKind)} · ${fmt(t(k("peopleCount")), { n: groupMembers.length })}`
    : person
      ? roleName(currentRoleKey)
      : "";

  const titleClass = "min-w-0 truncate text-[14px] leading-7 font-semibold tracking-[-0.01em] text-foreground";
  const nameEditable = !!group && canEditLayout;
  let title: React.ReactNode;
  if (nameEditable) {
    title = (
      <>
        {mobile && <DrawerTitle className="sr-only">{displayName}</DrawerTitle>}
        <Input
          id={ids.groupName}
          aria-label={t("common.name")}
          value={group.name}
          onChange={(e) => onUpdateNode(group.id, { name: e.target.value })}
          className="h-7 text-[14px] font-semibold tracking-[-0.01em] border-transparent px-1 -mx-1 bg-transparent hover:border-border focus-visible:bg-muted/40 focus-visible:ring-0"
        />
      </>
    );
  } else if (mobile) {
    title = <DrawerTitle className={cn("font-sans", titleClass)}>{displayName}</DrawerTitle>;
  } else {
    title = <h2 className={titleClass}>{displayName}</h2>;
  }

  // ── Footer actions ────────────────────────────────────────────────────────
  const canDeleteGroup = !!group && canEditLayout;
  const canRemove = !!person && canEditMembers && !locked && !person.isMe;
  const canCancelInvite = !!person && isInvite && canInvite;
  const hasFooter = canDeleteGroup || canRemove || canCancelInvite;

  return (
    <>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
        {group && preset ? (
          <div
            className="h-9 w-9 rounded-lg inline-flex items-center justify-center text-white shrink-0"
            style={{ background: preset.color }}
            aria-hidden
          >
            <PresetIcon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : person ? (
          <Avatar name={person.name} src={person.avatarUrl} size="lg" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {title}
            {person?.isMe && (
              <StatusBadge tone="neutral" size="xs">{t("chat.you")}</StatusBadge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          <X strokeWidth={1.75} />
        </Button>
      </div>
      {mobile && (
        <DrawerDescription className="sr-only">{t(k("inspector.sheetDescription"))}</DrawerDescription>
      )}

      {/* Body — the single scroll region */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {person ? (
          <section className="px-4 py-3 border-b border-border space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <FieldLabel id={ids.roleLabel} htmlFor={isOwner ? undefined : ids.role} className="mb-0">
                  {t("personnel.team.fieldRole")}
                </FieldLabel>
                {canManageRoles && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => runOutsideSheet(onOpenRoleManager)}
                    className="h-5 px-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                  >
                    <Settings2 className="h-3 w-3" strokeWidth={1.75} />
                    {t(k("inspector.manageRoles"))}
                  </Button>
                )}
              </div>
              {isOwner ? (
                <div className="h-8 px-2.5 flex items-center gap-2 text-[12.5px] rounded-lg border border-border bg-muted/30 w-full">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: rolesByKey.get("owner")?.color ?? "var(--muted-foreground)" }}
                    aria-hidden
                  />
                  <span className="truncate">{builtinRoleName(t, "owner")}</span>
                </div>
              ) : (
                <Select
                  items={roleItems}
                  value={currentRoleKey}
                  onValueChange={changeRole}
                  disabled={!permsEditable}
                >
                  <SelectTrigger
                    id={ids.role}
                    aria-labelledby={ids.roleLabel}
                    className="h-8 text-[12.5px] w-full min-w-0"
                  >
                    <SelectValue>
                      {(value: string) => (
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: rolesByKey.get(value)?.color ?? "var(--muted-foreground)" }}
                            aria-hidden
                          />
                          <span className="truncate">{rolesByKey.get(value)?.name ?? t(k("roleMissing"))}</span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent container={selectContainer} data-vaul-no-drag="">
                    {roleItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-[12.5px]">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: rolesByKey.get(item.value)?.color ?? "var(--muted-foreground)" }}
                            aria-hidden
                          />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {lockNote && (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{lockNote}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <FieldLabel>{t("personnel.team.colStatus")}</FieldLabel>
                <div className="h-8 flex items-center">
                  <StatusBadge tone={statusTone(person.status)} dot>
                    {statusLabel(t, person.status)}
                  </StatusBadge>
                </div>
              </div>
              <div className="min-w-0">
                <FieldLabel id={ids.groupLabel} htmlFor={ids.group}>
                  {t(k("inspector.fieldGroup"))}
                </FieldLabel>
                <Select
                  items={groupItems}
                  value={personGroupId ?? NO_GROUP}
                  onValueChange={changeGroup}
                  disabled={!canEditLayout}
                >
                  <SelectTrigger
                    id={ids.group}
                    aria-labelledby={ids.groupLabel}
                    className="h-8 text-[12.5px] w-full min-w-0"
                  >
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent container={selectContainer} data-vaul-no-drag="">
                    {groupItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-[12.5px]">
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor={ids.email}>{t("personnel.team.fieldEmail")}</FieldLabel>
              <Input
                id={ids.email}
                value={person.email}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono h-8 text-[12.5px] bg-muted/30 focus-visible:ring-0"
              />
            </div>

            {canEditMembers && !locked && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-[12px]"
                onClick={() => runOutsideSheet(() => onOpenEditMember(person))}
              >
                <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t(k("inspector.editInDialog"))}
              </Button>
            )}
          </section>
        ) : group ? (
          <>
            <section className="px-4 py-3 border-b border-border space-y-2.5">
              <div>
                <FieldLabel id={ids.kindLabel} htmlFor={ids.kind}>{t("common.type")}</FieldLabel>
                <Select
                  items={kindItems}
                  value={group.groupKind}
                  onValueChange={changeKind}
                  disabled={!canEditLayout}
                >
                  <SelectTrigger
                    id={ids.kind}
                    aria-labelledby={ids.kindLabel}
                    className="h-8 text-[12.5px] w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent container={selectContainer} data-vaul-no-drag="">
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} className="text-[12.5px]">
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                {canEditLayout ? (
                  <>
                    <FieldLabel htmlFor={ids.desc}>{t("common.description")}</FieldLabel>
                    <Input
                      id={ids.desc}
                      value={group.desc}
                      onChange={(e) => onUpdateNode(group.id, { desc: e.target.value })}
                      placeholder={t(k("inspector.groupDescPlaceholder"))}
                      className="h-8 text-[12.5px]"
                    />
                  </>
                ) : (
                  <>
                    <Eyebrow as="h3" className="font-mono mb-1">{t("common.description")}</Eyebrow>
                    <p className="text-[12.5px] text-foreground/80 break-words">{group.desc || "—"}</p>
                  </>
                )}
              </div>
              {canEditLayout && viewMode === "graph" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTidyGroup(group.id)}
                  className="w-full h-8 text-[12px]"
                >
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {t(k("inspector.tidyGroup"))}
                </Button>
              )}
            </section>

            <section className="px-4 py-3 border-b border-border" aria-labelledby={ids.members}>
              <div className="flex items-center justify-between mb-2">
                <Eyebrow as="h3" id={ids.members} className="font-mono">{t(k("inspector.members"))}</Eyebrow>
                <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">{groupMembers.length}</span>
              </div>
              {groupMembers.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">
                  {t(k("inspector.noMembers"))}
                  {viewMode === "graph" && canEditLayout && <> {t(k("inspector.noMembersHint"))}</>}
                </p>
              ) : (
                <ul className="space-y-0.5 -mx-1">
                  {groupMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(m.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 text-left"
                      >
                        <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-medium text-foreground truncate">{nodeLabel(t, m)}</span>
                          <span className="block text-[10.5px] text-muted-foreground truncate">
                            {roleName(m.role.trim().toLowerCase())}
                            {m.email ? ` · ${m.email}` : ""}
                          </span>
                        </span>
                        {m.status === "invited" && (
                          <StatusBadge tone="warning" size="xs">{statusLabel(t, m.status)}</StatusBadge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        {/* Relationships */}
        <section className="px-4 py-3 border-b border-border grid grid-cols-2 gap-3 text-[11.5px]">
          <RelationList
            headingId={ids.managedBy}
            icon={ArrowUp}
            label={t(k("managedBy"))}
            rows={managers}
            emptyLabel={t(k("inspector.none"))}
            onSelect={onSelect}
            mobile={mobile}
            removeLabel={canEditLayout ? t(k("inspector.removeManagerLink")) : null}
            onRemove={onDeleteEdge}
            add={canEditLayout ? (
              <AddRelationSelect
                label={t(k("inspector.addManager"))}
                candidates={managerCandidates}
                container={selectContainer}
                onPick={(managerId) => onCreateEdge(managerId, node.id)}
              />
            ) : null}
          />
          <RelationList
            headingId={ids.manages}
            icon={ArrowDown}
            label={t(k("manages"))}
            rows={reports}
            emptyLabel={t(k("inspector.none"))}
            onSelect={onSelect}
            mobile={mobile}
            removeLabel={canEditLayout ? t(k("inspector.removeReportLink")) : null}
            onRemove={onDeleteEdge}
            add={canEditLayout ? (
              <AddRelationSelect
                label={t(k("inspector.addReport"))}
                candidates={reportCandidates}
                container={selectContainer}
                onPick={(reportId) => onCreateEdge(node.id, reportId)}
              />
            ) : null}
          />
        </section>

        {/* Permissions — members only (groups carry no permissions, F25) */}
        {person && (
          <section aria-labelledby={ids.perms}>
            <div className="sticky top-0 z-10 px-4 pt-3 pb-2 bg-background border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <h3 id={ids.perms} className="text-[12.5px] font-semibold text-foreground">
                  {t("personnel.team.fieldPermissions")}
                </h3>
                <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">
                  {permSet.size} / {ORG_PERMS_FLAT.length}
                </span>
              </div>
              {permsEditable && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[10.5px]"
                    disabled={permSet.size === ORG_PERMS_FLAT.length}
                    onClick={() => commitPerms(ORG_PERMS_FLAT.map((p) => p.id))}
                  >
                    {t(k("inspector.selectAll"))}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-[10.5px]"
                    disabled={permSet.size === 0}
                    onClick={() => commitPerms([])}
                  >
                    {t(k("inspector.clearAll"))}
                  </Button>
                  {currentRole && currentRole.perms.length > 0 && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 px-2 text-[10.5px]"
                      disabled={permsKey(currentRole.perms) === permsKey(perms)}
                      onClick={() => commitPerms(currentRole.perms)}
                    >
                      {t(k("inspector.resetToRole"))}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="px-2 py-2">
              {ORG_PERMS.map((g) => {
                const groupHeadingId = `${uid}-pg-${g.group}`;
                return (
                  <div key={g.group} role="group" aria-labelledby={groupHeadingId} className="mb-2">
                    <Eyebrow size="xs" id={groupHeadingId} className="px-2 pt-1 pb-1 font-mono">
                      {permGroupLabel(t, g.group)}
                    </Eyebrow>
                    {g.items.map((p) => {
                      const labelId = `${uid}-perm-${p.id}`;
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-2.5 py-1.5 px-2 rounded-lg",
                            permsEditable ? "cursor-pointer hover:bg-muted/40" : "cursor-default",
                          )}
                        >
                          <Checkbox
                            checked={permSet.has(p.id)}
                            disabled={!permsEditable}
                            onCheckedChange={(v) => togglePerm(p.id, v === true)}
                            aria-labelledby={labelId}
                          />
                          <span id={labelId} className="min-w-0 flex-1 text-[12.5px] font-medium text-foreground">
                            {permLabel(t, p)}
                          </span>
                          {p.sensitive && (
                            <StatusBadge tone="warning" size="xs">{t(k("sensitive"))}</StatusBadge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      {(hasFooter || mobile) && (
        <div
          className={cn(
            "shrink-0 px-4 flex flex-wrap items-center gap-2",
            hasFooter ? "py-3 border-t border-border" : "pt-0",
            mobile && "pb-[max(env(safe-area-inset-bottom),0.75rem)]",
          )}
        >
          {canDeleteGroup && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const groupId = group.id;
                const message = fmt(t(k("inspector.confirmDeleteGroup")), { name: displayName });
                // confirm() is another layer: on phones it waits for the sheet to close (F22).
                runOutsideSheet(() => {
                  if (!confirm(message)) return;
                  onDeleteNode(groupId);
                  onClose();
                });
              }}
            >
              <Trash2 strokeWidth={1.75} />
              {t(k("inspector.deleteGroup"))}
            </Button>
          )}
          {canRemove && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => runOutsideSheet(() => onRemoveMember(person))}
            >
              <UserMinus strokeWidth={1.75} />
              {t("personnel.team.actionRemove")}
            </Button>
          )}
          {canCancelInvite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => runOutsideSheet(() => onCancelInvite(person))}
            >
              <MailX strokeWidth={1.75} />
              {t("personnel.team.actionCancelInvite")}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

// ─── Relationship column ─────────────────────────────────────────────────────

interface RelationRow {
  edgeId: string;
  node: OrgNode;
  label: string;
}

interface RelationCandidate {
  value: string;
  label: string;
  kind: OrgNode["kind"];
}

function RelationList({
  headingId, icon: Icon, label, rows, emptyLabel, onSelect, mobile, removeLabel, onRemove, add,
}: {
  headingId: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  rows: RelationRow[];
  emptyLabel: string;
  onSelect: (id: string) => void;
  mobile: boolean;
  /** Template with {name}; null hides the per-row remove button. */
  removeLabel: string | null;
  onRemove: (edgeId: string) => void;
  add: React.ReactNode;
}) {
  return (
    <div className="min-w-0" role="group" aria-labelledby={headingId}>
      <Eyebrow as="h3" id={headingId} className="font-mono mb-1.5 flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{rows.length}</span>
      </Eyebrow>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const removeText = removeLabel ? fmt(removeLabel, { name: r.label }) : null;
            return (
              <li key={r.edgeId} className="flex items-center gap-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelect(r.node.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-foreground/80 hover:text-foreground"
                >
                  {r.node.kind === "group" ? (
                    <Users className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                  ) : (
                    <User className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                  )}
                  <span className="truncate">{r.label}</span>
                </button>
                {removeText && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={cn("shrink-0 text-muted-foreground hover:text-foreground", mobile ? "size-7" : "size-5")}
                    aria-label={removeText}
                    title={removeText}
                    onClick={() => onRemove(r.edgeId)}
                  >
                    <X className="size-3" strokeWidth={1.75} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {add}
    </div>
  );
}

// ─── "Add manager" / "Add report" picker (F58) ───────────────────────────────

function AddRelationSelect({
  label, candidates, container, onPick,
}: {
  label: string;
  candidates: RelationCandidate[];
  container?: React.RefObject<HTMLDivElement | null>;
  onPick: (id: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <Select
      items={candidates}
      value={null}
      onValueChange={(v) => {
        if (typeof v === "string" && v) onPick(v);
      }}
    >
      <SelectTrigger aria-label={label} className="mt-1.5 h-7 w-full min-w-0 px-2 text-[11.5px]">
        <SelectValue
          className="min-w-0"
          placeholder={
            <span className="inline-flex items-center gap-1 min-w-0">
              <Plus className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{label}</span>
            </span>
          }
        />
      </SelectTrigger>
      <SelectContent
        container={container}
        data-vaul-no-drag=""
        align="start"
        alignItemWithTrigger={false}
        className="min-w-48 max-w-[calc(100vw-2rem)]"
      >
        {candidates.map((c) => (
          <SelectItem key={c.value} value={c.value} className="text-[12px]">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {c.kind === "group" ? (
                <Users className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
              ) : (
                <User className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
              )}
              <span className="truncate">{c.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
