"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Building,
  Copy,
  KeyRound,
  Map as MapIcon,
  Maximize,
  Pencil,
  Plus,
  Store,
  Trash2,
  Unlink,
  UserMinus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useI18n, useT } from "@/lib/i18n/context";
import {
  CARD_W,
  CARD_H,
  DEFAULT_VIEW,
  GROUP_HEADER_H,
  ORG_GROUP_PRESETS,
  bottomAnchor,
  builtinRoleName,
  clampZoom,
  edgeMid,
  edgePath,
  fmt,
  groupDisplayName,
  groupKindLabel,
  pointInGroupInterior,
  statusLabel,
  type EdgeLayout,
  type GroupNode,
  type OrgNode,
  type PersonNode,
  type ViewLayout,
} from "./data";
import type { RoleRow } from "./use-org-graph";

// ─── Helpers ───────────────────────────────────────────────────────────────

type TFn = (key: string) => string;
type RoleMap = Record<string, RoleRow>;

const K = "personnel.team.org.canvas";
/** Pointer travel (px) before a press counts as a drag / pan. */
const MOVE_THRESHOLD = 3;
const FIT_PADDING = 48;
const GROUP_MIN_W = 280;
const DROP_GREEN = "#16a34a";
/** Canvas px an Arrow key moves the focused card / group (Shift = large step). */
const NUDGE_STEP = 10;
const NUDGE_STEP_LARGE = 50;
/** Screen px kept between a keyboard-focused node and the viewport edge. */
const REVEAL_MARGIN = 24;
/** A focus this soon after a pointer press came from that press, not the keyboard. */
const POINTER_FOCUS_WINDOW_MS = 1000;

const ARROW_DIRS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type NativeGestureEvent = Event & { scale: number; clientX: number; clientY: number };

function roleDisplay(p: PersonNode, roles: RoleMap, t: TFn): { name: string; color: string } {
  const key = p.role.trim().toLowerCase();
  const r = roles[key] ?? roles[p.role];
  if (r) return { name: r.name, color: r.color };
  // Same fallback as the list and inspector: never claim "Staff" for a dead role key.
  return {
    name: builtinRoleName(t, key) ?? t("personnel.team.org.roleMissing"),
    color: "var(--muted-foreground)",
  };
}

/** Top-most (last rendered) group whose interior contains the point. */
function groupAt(nodes: readonly OrgNode[], cx: number, cy: number): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.kind === "group" && pointInGroupInterior(n, cx, cy)) return n.id;
  }
  return null;
}

/**
 * Translation change along one axis that brings [start, start + size] (screen px)
 * inside the viewport. Something larger than the viewport only has its leading
 * edge brought on screen.
 */
function revealDelta(start: number, size: number, viewSize: number, margin: number): number {
  const m = Math.min(margin, viewSize / 4);
  if (size + 2 * m <= viewSize) {
    if (start < m) return m - start;
    if (start + size > viewSize - m) return viewSize - m - (start + size);
    return 0;
  }
  return start < m || start > viewSize - m ? m - start : 0;
}

/** View that scales to `zoom` while keeping the screen point (cx, cy) fixed. */
function zoomAbout(v: ViewLayout, zoom: number, cx: number, cy: number): ViewLayout {
  const wx = (cx - v.tx) / v.zoom;
  const wy = (cy - v.ty) / v.zoom;
  return { zoom, tx: cx - wx * zoom, ty: cy - wy * zoom };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** True when a dialog / drawer is actually on screen (hidden ones don't count). */
function visibleDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  const els = document.querySelectorAll('[role="dialog"], [data-vaul-drawer]');
  for (const el of Array.from(els)) if (el.getClientRects().length > 0) return true;
  return false;
}

const GROUP_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  store: Store,
  map: MapIcon,
  building: Building,
  "users-round": Users,
};

// Shared bits for the small connector dot under cards and groups. `min-*-0!`
// opts out of the 44px mobile touch-target rule; the ::after pseudo-element
// widens the actual hit area instead.
const HANDLE_CLASS =
  "absolute left-1/2 -translate-x-1/2 -bottom-[7px] z-10 h-3.5 w-3.5 min-h-0! min-w-0! p-0 rounded-full bg-background border border-border hover:border-foreground hover:bg-foreground flex items-center justify-center touch-none cursor-crosshair after:absolute after:-inset-2 after:content-['']";

// ─── Person card ───────────────────────────────────────────────────────────

function PersonCard({
  node, role, selected, dimmed, dragging, matchesSearch, canEditLayout, onActivate,
}: {
  node: PersonNode;
  role: { name: string; color: string };
  selected: boolean;
  dimmed: boolean;
  dragging: boolean;
  matchesSearch: boolean;
  canEditLayout: boolean;
  onActivate: (id: string) => void;
}) {
  const t = useT();
  const { dir } = useI18n();
  const connectLabel = t(`${K}.connectHandle`);
  return (
    <div
      data-node-id={node.id}
      data-node-kind="person"
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      aria-label={fmt(t(`${K}.personAria`), { name: node.name, role: role.name, status: statusLabel(t, node.status) })}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(node.id); }
      }}
      className={cn(
        // left-0/top-0: the translate must start from a fixed inset in RTL documents too.
        "absolute left-0 top-0 select-none touch-none rounded-lg outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50",
        canEditLayout ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dimmed && "opacity-30",
        dragging ? "z-30" : "z-20",
      )}
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: CARD_W, height: CARD_H }}
    >
      <div
        dir={dir}
        className={cn(
          "relative h-full w-full rounded-lg border bg-background transition-colors",
          selected
            ? "border-foreground ring-2 ring-foreground/15"
            : matchesSearch
            ? "border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900/60"
            : "border-border hover:border-muted-foreground/40",
        )}
      >
        <span aria-hidden className="absolute start-0 top-0 bottom-0 w-1 rounded-s-lg" style={{ background: role.color }} />
        <div className="h-full min-w-0 flex items-center gap-2.5 ps-3 pe-2.5 overflow-hidden rounded-lg">
          <Avatar name={node.name} src={node.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="min-w-0 text-[12.5px] font-semibold tracking-[-0.01em] truncate">{node.name}</div>
              {node.status === "invited" && (
                <span className="text-[8.5px] uppercase tracking-wider font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 shrink-0 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
                  {t("personnel.team.statusInvited")}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 mt-0.5 overflow-hidden">
              <span
                className="inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-[1px] rounded text-[9.5px] font-medium text-foreground"
                style={{ background: `color-mix(in srgb, ${role.color} 12%, transparent)` }}
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: role.color }} />
                <span className="truncate">{role.name}</span>
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[9.5px] text-muted-foreground font-mono tabular-nums"
                title={fmt(t(`${K}.permCount`), { n: node.perms.length })}
              >
                <KeyRound aria-hidden className="h-2.5 w-2.5" strokeWidth={1.75} />
                {node.perms.length}
              </span>
            </div>
          </div>
        </div>
        {canEditLayout && (
          // Pointer-only affordance: not a control for assistive tech (no nested interactive).
          <span aria-hidden data-connect-handle title={connectLabel} className={HANDLE_CLASS}>
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Group frame ───────────────────────────────────────────────────────────

function GroupFrame({
  node, selected, dimmed, memberCount, dropTarget, canEditLayout, onActivate,
}: {
  node: GroupNode;
  selected: boolean;
  dimmed: boolean;
  memberCount: number;
  dropTarget: boolean;
  canEditLayout: boolean;
  onActivate: (id: string) => void;
}) {
  const t = useT();
  const { dir } = useI18n();
  const preset = ORG_GROUP_PRESETS[node.groupKind] || ORG_GROUP_PRESETS.custom;
  const Icon = GROUP_ICON_MAP[preset.icon] || Users;
  const kindLabel = groupKindLabel(t, node.groupKind);
  const displayName = groupDisplayName(t, node);
  const borderColor = selected
    ? "var(--foreground)"
    : dropTarget
    ? DROP_GREEN
    : `color-mix(in srgb, ${preset.color} 56%, transparent)`;
  const connectLabel = t(`${K}.connectHandle`);
  return (
    <div
      data-node-id={node.id}
      data-node-kind="group"
      data-group-id={node.id}
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      aria-label={fmt(t(`${K}.groupAria`), { name: displayName, kind: kindLabel })}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(node.id); }
      }}
      className={cn(
        "absolute left-0 top-0 z-10 rounded-lg touch-none outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50",
        dimmed && "opacity-30",
      )}
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.w, height: node.h }}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          border: `2px dashed ${borderColor}`,
          background: dropTarget ? `color-mix(in srgb, ${DROP_GREEN} 8%, transparent)` : "var(--card)",
          transition: "border-color 120ms, background 120ms",
        }}
      />
      <div
        data-group-header
        dir={dir}
        className={cn(
          "absolute left-0 right-0 top-0 flex items-center gap-2.5 px-3",
          canEditLayout ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        )}
        style={{
          height: GROUP_HEADER_H,
          background: "var(--muted)",
          borderTopLeftRadius: "var(--radius-lg)", borderTopRightRadius: "var(--radius-lg)",
          borderBottom: `1px dashed ${borderColor}`,
        }}
      >
        <div aria-hidden className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-white shrink-0" style={{ background: preset.color }}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="min-w-0 text-[12.5px] font-semibold tracking-[-0.01em] truncate text-foreground">{displayName}</div>
            <span className="max-w-[45%] truncate text-[8.5px] uppercase tracking-wider font-mono text-muted-foreground shrink-0">{kindLabel}</span>
          </div>
          {node.desc && <div className="text-[10.5px] text-muted-foreground truncate leading-tight">{node.desc}</div>}
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-mono text-muted-foreground tabular-nums"
          title={fmt(t("personnel.team.org.peopleCount"), { n: memberCount })}
        >
          <Users aria-hidden className="h-2.5 w-2.5" strokeWidth={1.75} />
          {memberCount}
        </span>
      </div>
      {canEditLayout && (
        <span aria-hidden data-connect-handle title={connectLabel} className={HANDLE_CLASS}>
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        </span>
      )}
      {memberCount === 0 && canEditLayout && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex items-center justify-center pointer-events-none px-3"
          style={{ top: GROUP_HEADER_H }}
        >
          <div className="text-[11px] text-muted-foreground text-center">{t(`${K}.dropHere`)}</div>
        </div>
      )}
      {canEditLayout && (
        <div
          data-resize
          aria-hidden
          title={t(`${K}.resizeHandle`)}
          className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize flex items-end justify-end p-0.5 group/resize touch-none"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-50 group-hover/resize:opacity-100">
            <path d="M11 1 L11 11 L1 11" fill="none" style={{ stroke: borderColor }} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 5 L5 11 M11 8 L8 11" style={{ stroke: borderColor }} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Edges layer ───────────────────────────────────────────────────────────

function EdgesLayer({
  nodes, edges, hoverEdgeId, onHoverEdge, onDeleteEdge, tempEdge, dimEdgeIds, canEditLayout,
}: {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  hoverEdgeId: string | null;
  onHoverEdge: (id: string | null) => void;
  onDeleteEdge: (id: string) => void;
  tempEdge: { x1: number; y1: number; x2: number; y2: number } | null;
  dimEdgeIds: Set<string> | null;
  canEditLayout: boolean;
}) {
  const t = useT();
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const deleteLabel = t(`${K}.deleteEdge`);
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: "visible", zIndex: 15 }}
      width="100%" height="100%"
      aria-hidden={!canEditLayout}
    >
      <defs>
        <marker id="org-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: "var(--muted-foreground)" }} />
        </marker>
        <marker id="org-arrow-hov" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: "var(--destructive)" }} />
        </marker>
      </defs>
      {edges.map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        const d = edgePath(from, to);
        const hovered = canEditLayout && hoverEdgeId === e.id;
        const dimmed = dimEdgeIds && !dimEdgeIds.has(e.id);
        const mid = hovered ? edgeMid(from, to) : null;
        return (
          <g key={e.id} style={{ opacity: dimmed ? 0.2 : 1, transition: "opacity 150ms" }}>
            {canEditLayout && (
              <path
                data-edge-id={e.id}
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onMouseEnter={() => onHoverEdge(e.id)}
                onMouseLeave={() => onHoverEdge(null)}
              />
            )}
            <path
              d={d}
              fill="none"
              strokeWidth={hovered ? 2 : 1.4}
              markerEnd={hovered ? "url(#org-arrow-hov)" : "url(#org-arrow)"}
              style={{ stroke: hovered ? "var(--destructive)" : "var(--muted-foreground)", transition: "stroke 120ms" }}
            />
            {hovered && mid && (
              <g
                role="button"
                aria-label={deleteLabel}
                transform={`translate(${mid.x},${mid.y})`}
                style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={(ev) => { ev.stopPropagation(); onDeleteEdge(e.id); onHoverEdge(null); }}
                onMouseEnter={() => onHoverEdge(e.id)}
              >
                <title>{deleteLabel}</title>
                <circle r="10" style={{ fill: "var(--destructive)" }} />
                <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            )}
          </g>
        );
      })}
      {tempEdge && (
        <path
          d={`M ${tempEdge.x1} ${tempEdge.y1} C ${tempEdge.x1} ${tempEdge.y1 + 50}, ${tempEdge.x2} ${tempEdge.y2 - 50}, ${tempEdge.x2} ${tempEdge.y2}`}
          fill="none"
          strokeWidth="1.6"
          strokeDasharray="4 3"
          style={{ stroke: "var(--foreground)" }}
        />
      )}
    </svg>
  );
}

// ─── The canvas ────────────────────────────────────────────────────────────

export interface OrgCanvasHandle {
  /** Zoom to `nextZoom` (clamped) keeping the viewport centre fixed. */
  zoomAtCenter(nextZoom: number): void;
  /** Fit every node into the viewport (or reset to the default view when empty). */
  fitToContent(): void;
}

export interface OrgCanvasProps {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onMoveGroup: (id: string, gx: number, gy: number, memberSnapshots: Array<{ id: string; ox: number; oy: number }>, dx: number, dy: number) => void;
  onResizeGroup: (id: string, w: number, h: number) => void;
  onDropPersonInGroup: (personId: string, groupId: string | null) => void;
  onCreateEdge: (from: string, to: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onAddGroup: () => string;
  onDuplicateGroup: (id: string) => string | null;
  onBgClick: () => void;
  highlightIds: Set<string> | null;
  searchMatchIds: Set<string> | null;
  roles: RoleRow[];
  view: ViewLayout;
  onViewChange: (next: ViewLayout) => void;
  /** When false the canvas is read-only: select, pan and zoom only. */
  canEditLayout: boolean;
}

type GestureKind = "node" | "group" | "resize" | "pan" | "edge";

type Gesture = { pointerId: number; startX: number; startY: number; moved: boolean } & (
  | { kind: "node"; id: string; ox: number; oy: number; dropTarget: string | null }
  | { kind: "group"; id: string; ox: number; oy: number; members: Array<{ id: string; ox: number; oy: number }> }
  | { kind: "resize"; id: string; ow: number; oh: number }
  | { kind: "pan"; ox: number; oy: number }
  | { kind: "edge"; fromId: string }
);

type MenuTarget =
  | { kind: "person"; id: string; groupId: string | null; hasEdges: boolean; x: number; y: number }
  | { kind: "group"; id: string; x: number; y: number }
  | { kind: "edge"; id: string; x: number; y: number }
  | { kind: "bg"; x: number; y: number };

export const OrgCanvas = forwardRef<OrgCanvasHandle, OrgCanvasProps>(function OrgCanvas(props, ref) {
  const {
    nodes, edges, selectedId,
    onSelectNode, onDropPersonInGroup, onDeleteEdge, onDeleteNode, onAddGroup, onDuplicateGroup,
    highlightIds, searchMatchIds, roles, view, canEditLayout,
  } = props;
  const t = useT();

  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Latest props / view for native listeners registered once.
  const propsRef = useRef(props);
  const tRef = useRef<TFn>(t);
  const viewRef = useRef<ViewLayout>(view);
  useLayoutEffect(() => {
    propsRef.current = props;
    tRef.current = t;
  });
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  const gestureRef = useRef<Gesture | null>(null);
  /** Kind of the last gesture that actually moved; consumed by the next click. */
  const movedRef = useRef<GestureKind | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  /** performance.now() of the last pointer press in the canvas; reset by any key press. */
  const lastPointerDownRef = useRef(-Infinity);
  /** Arrow-key move in progress on a person: membership is settled when it ends. */
  const keyMoveRef = useRef<{ id: string; startHit: string | null } | null>(null);

  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tempEdge, setTempEdge] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  // The target is kept after close so the exit animation keeps its anchor and items.
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  useLayoutEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  const rolesMap = useMemo<RoleMap>(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const groups = useMemo(() => nodes.filter((n): n is GroupNode => n.kind === "group"), [nodes]);
  const persons = useMemo(() => nodes.filter((n): n is PersonNode => n.kind === "person"), [nodes]);

  const memberCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of persons) if (p.groupId) c[p.groupId] = (c[p.groupId] || 0) + 1;
    return c;
  }, [persons]);

  // ── View helpers ─────────────────────────────────────────────────────────
  const commitView = useCallback((next: ViewLayout) => {
    viewRef.current = next;
    propsRef.current.onViewChange(next);
  }, []);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    const v = viewRef.current;
    const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: (clientX - r.left - v.tx) / v.zoom, y: (clientY - r.top - v.ty) / v.zoom };
  }, []);

  /** Pan (never zoom) so a node is on screen. Groups only need their header visible. */
  const revealNode = useCallback((n: OrgNode) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const v = viewRef.current;
    const w = (n.kind === "group" ? n.w : CARD_W) * v.zoom;
    const h = (n.kind === "group" ? GROUP_HEADER_H : CARD_H) * v.zoom;
    const ddx = revealDelta(n.x * v.zoom + v.tx, w, r.width, REVEAL_MARGIN);
    const ddy = revealDelta(n.y * v.zoom + v.ty, h, r.height, REVEAL_MARGIN);
    if (ddx !== 0 || ddy !== 0) commitView({ ...v, tx: v.tx + ddx, ty: v.ty + ddy });
  }, [commitView]);

  /** End an Arrow-key move: join / leave a group only if the card crossed a frame edge. */
  const finishKeyMove = useCallback(() => {
    const km = keyMoveRef.current;
    if (!km) return;
    keyMoveRef.current = null;
    setDropTargetGroupId(null);
    const p = propsRef.current;
    const node = p.nodes.find((n) => n.id === km.id);
    if (!node || node.kind !== "person") return;
    const hit = groupAt(p.nodes, node.x + CARD_W / 2, node.y + CARD_H / 2);
    if (hit !== km.startHit && hit !== (node.groupId ?? null)) p.onDropPersonInGroup(node.id, hit);
  }, []);

  const zoomAtCenter = useCallback((nextZoom: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const z = clampZoom(nextZoom);
    if (!Number.isFinite(z)) return;
    commitView(zoomAbout(viewRef.current, z, r.width / 2, r.height / 2));
  }, [commitView]);

  const fitToContent = useCallback(() => {
    const el = wrapRef.current;
    const all = propsRef.current.nodes;
    if (all.length === 0) {
      commitView({ ...DEFAULT_VIEW });
      return;
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of all) {
      const w = n.kind === "group" ? n.w : CARD_W;
      const h = n.kind === "group" ? n.h : CARD_H;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const zoom = clampZoom(Math.min((r.width - 2 * FIT_PADDING) / bw, (r.height - 2 * FIT_PADDING) / bh));
    commitView({
      zoom,
      tx: (r.width - bw * zoom) / 2 - minX * zoom,
      ty: (r.height - bh * zoom) / 2 - minY * zoom,
    });
  }, [commitView]);

  useImperativeHandle(ref, () => ({ zoomAtCenter, fitToContent }), [zoomAtCenter, fitToContent]);

  // ── Gesture lifecycle ────────────────────────────────────────────────────
  const endGesture = useCallback(() => {
    gestureRef.current = null;
    setDraggingId(null);
    setDropTargetGroupId(null);
    setTempEdge(null);
  }, []);

  /** Abort the active gesture: undo any in-flight move, never commit a drop or edge. */
  const cancelGesture = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    const p = propsRef.current;
    if (g.moved) {
      if (g.kind === "node") p.onMoveNode(g.id, g.ox, g.oy);
      else if (g.kind === "group") p.onMoveGroup(g.id, g.ox, g.oy, g.members, 0, 0);
      else if (g.kind === "resize") p.onResizeGroup(g.id, g.ow, g.oh);
    }
    endGesture();
  }, [endGesture]);

  // Window pointer listeners — registered once, read everything from refs.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (!g.moved) {
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) <= MOVE_THRESHOLD) return;
        g.moved = true;
        movedRef.current = g.kind;
      }
      const p = propsRef.current;
      const v = viewRef.current;
      const dx = (e.clientX - g.startX) / v.zoom;
      const dy = (e.clientY - g.startY) / v.zoom;
      switch (g.kind) {
        case "node": {
          const nx = g.ox + dx;
          const ny = g.oy + dy;
          p.onMoveNode(g.id, nx, ny);
          const hit = groupAt(p.nodes, nx + CARD_W / 2, ny + CARD_H / 2);
          g.dropTarget = hit;
          setDropTargetGroupId(hit); // React bails out when unchanged
          break;
        }
        case "group":
          p.onMoveGroup(g.id, g.ox + dx, g.oy + dy, g.members, dx, dy);
          break;
        case "resize":
          p.onResizeGroup(g.id, Math.max(GROUP_MIN_W, g.ow + dx), Math.max(GROUP_HEADER_H + 80, g.oh + dy));
          break;
        case "pan":
          commitView({ ...v, tx: g.ox + (e.clientX - g.startX), ty: g.oy + (e.clientY - g.startY) });
          break;
        case "edge": {
          const pt = screenToCanvas(e.clientX, e.clientY);
          setTempEdge((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : prev));
          break;
        }
      }
    }
    function onUp(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const p = propsRef.current;
      if (g.kind === "edge") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetId = el?.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
        if (targetId && targetId !== g.fromId && p.nodes.some((n) => n.id === targetId)) {
          p.onCreateEdge(g.fromId, targetId);
        }
      } else if (g.kind === "node" && g.moved) {
        const node = p.nodes.find((n) => n.id === g.id);
        if (node && node.kind === "person" && (node.groupId ?? null) !== g.dropTarget) {
          p.onDropPersonInGroup(g.id, g.dropTarget);
        }
      }
      endGesture();
    }
    function onCancel(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      cancelGesture();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [cancelGesture, commitView, endGesture, screenToCanvas]);

  // Wheel (pan / ctrl-or-cmd zoom), touch pinch and Safari trackpad pinch —
  // native, non-passive, registered once.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    /** Zoom when a Safari gesture (trackpad pinch) began; null when none is active. */
    let gestureStartZoom: number | null = null;

    function onWheel(e: WheelEvent) {
      if (!el) return;
      e.preventDefault();
      const v = viewRef.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        // A Safari gesture already drives the zoom; don't apply the pinch twice.
        if (gestureStartZoom !== null) return;
        if (dy === 0) return;
        // Trackpad pinch arrives as ctrl+wheel with small deltas; cap per-event steps
        // so a notched mouse wheel with ctrl doesn't jump several zoom levels at once.
        const exponent = Math.max(-0.5, Math.min(0.5, -dy * (e.ctrlKey ? 0.01 : 0.002)));
        const z = clampZoom(v.zoom * Math.pow(2, exponent));
        if (z === v.zoom) return;
        const r = el.getBoundingClientRect();
        commitView(zoomAbout(v, z, e.clientX - r.left, e.clientY - r.top));
        return;
      }
      if (dx === 0 && dy === 0) return;
      commitView({ ...v, tx: v.tx - dx, ty: v.ty - dy });
    }

    function touchDist(a: Touch, b: Touch) {
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    }
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length < 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        dist: Math.max(1, touchDist(a, b)),
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
      };
      // A second finger turns whatever the first finger started into a pinch.
      cancelGesture();
    }
    function onTouchMove(e: TouchEvent) {
      const pinch = pinchRef.current;
      if (!el || !pinch || e.touches.length < 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const nd = Math.max(1, touchDist(a, b));
      const cxAbs = (a.clientX + b.clientX) / 2;
      const cyAbs = (a.clientY + b.clientY) / 2;
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const z = clampZoom(v.zoom * (nd / pinch.dist));
      // Keep the world point under the previous midpoint under the new midpoint (zoom + two-finger pan).
      const wx = (pinch.cx - r.left - v.tx) / v.zoom;
      const wy = (pinch.cy - r.top - v.ty) / v.zoom;
      commitView({ zoom: z, tx: cxAbs - r.left - wx * z, ty: cyAbs - r.top - wy * z });
      pinchRef.current = { dist: nd, cx: cxAbs, cy: cyAbs };
    }
    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchRef.current = null;
    }

    // Desktop Safari reports a trackpad pinch as WebKit gesture events, not ctrl+wheel.
    // preventDefault stops the page zoom; iOS touch pinches also fire these, but the
    // touch listeners above already handle them.
    function onGestureStart(ev: Event) {
      ev.preventDefault();
      gestureStartZoom = viewRef.current.zoom;
    }
    function onGestureChange(ev: Event) {
      ev.preventDefault();
      const e = ev as NativeGestureEvent;
      if (!el || gestureStartZoom === null || pinchRef.current) return;
      if (!Number.isFinite(e.scale) || e.scale <= 0) return;
      const v = viewRef.current;
      const z = clampZoom(gestureStartZoom * e.scale);
      if (!Number.isFinite(z) || z === v.zoom) return;
      const r = el.getBoundingClientRect();
      const cx = Number.isFinite(e.clientX) ? e.clientX - r.left : r.width / 2;
      const cy = Number.isFinite(e.clientY) ? e.clientY - r.top : r.height / 2;
      commitView(zoomAbout(v, z, cx, cy));
    }
    function onGestureEnd(ev: Event) {
      ev.preventDefault();
      gestureStartZoom = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [cancelGesture, commitView]);

  // Keyboard shortcuts — only while focus is on the page body or inside the canvas.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const p = propsRef.current;
      const tr = tRef.current;
      const dialogOpen = visibleDialogOpen();

      if (e.key === "Escape") {
        if (dialogOpen) return;
        if (menuOpenRef.current) { setMenuOpen(false); return; }
      }

      const active = document.activeElement;
      const focusInCanvas = !active || active === document.body || wrap.contains(active);
      if (!focusInCanvas || dialogOpen || menuOpenRef.current || isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        if (p.selectedId) p.onBgClick();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        if (!p.selectedId || !p.canEditLayout) return;
        const node = p.nodes.find((n) => n.id === p.selectedId);
        if (!node) return;
        e.preventDefault();
        if (node.kind === "group") {
          if (window.confirm(fmt(tr(`${K}.confirmDeleteGroup`), { name: groupDisplayName(tr, node) }))) p.onDeleteNode(node.id);
          return;
        }
        const hasLinks = !!node.groupId || p.edges.some((ed) => ed.from === node.id || ed.to === node.id);
        if (hasLinks && window.confirm(fmt(tr(`${K}.confirmClearPerson`), { name: node.name }))) {
          p.onDeleteNode(node.id);
        }
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        zoomAtCenter(1);
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomAtCenter(viewRef.current.zoom * 1.15);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomAtCenter(viewRef.current.zoom / 1.15);
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        if (!p.selectedId || !p.canEditLayout) return;
        const isGroup = p.nodes.some((n) => n.id === p.selectedId && n.kind === "group");
        if (!isGroup) return;
        e.preventDefault();
        const newId = p.onDuplicateGroup(p.selectedId);
        if (newId) p.onSelectNode(newId);
      }
    }
    // Any key press means the next focus change is keyboard driven (see onWrapFocus).
    function onKeyCapture() {
      lastPointerDownRef.current = -Infinity;
    }
    window.addEventListener("keydown", onKeyCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKeyCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [zoomAtCenter]);

  // ── Pointer down (single delegated handler) ──────────────────────────────
  const onWrapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    const target = e.target as Element;
    if (!wrap || !wrap.contains(target)) return;
    movedRef.current = null;
    lastPointerDownRef.current = performance.now();
    finishKeyMove();
    // Primary button for everything; middle button only pans.
    if (e.button !== 0 && e.button !== 1) return;
    if (pinchRef.current) return;
    const active = gestureRef.current;
    if (active && active.pointerId !== e.pointerId) {
      if (e.pointerType === "touch") return; // extra finger: the pinch listener takes over
      cancelGesture();
    }

    const p = propsRef.current;
    const v = viewRef.current;
    const base = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };

    const nodeEl = target.closest<HTMLElement>("[data-node-id]");
    const nodeId = nodeEl?.getAttribute("data-node-id") ?? null;
    const node = nodeId ? p.nodes.find((n) => n.id === nodeId) ?? null : null;
    const onHandle = !!target.closest("[data-connect-handle]");
    const onResize = !!target.closest("[data-resize]");
    const onHeader = !!target.closest("[data-group-header]");
    const onBg = target === wrap || target.hasAttribute("data-canvas-bg");

    const capture = (el: Element | null) => {
      try { el?.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    };
    const focusEl = (el: HTMLElement | null) => {
      try { el?.focus({ preventScroll: true }); } catch { /* ignore */ }
    };
    const startPan = (captureEl: Element) => {
      e.preventDefault();
      focusEl(nodeEl ?? wrap);
      capture(captureEl);
      gestureRef.current = { ...base, kind: "pan", ox: v.tx, oy: v.ty };
    };

    if (node && nodeEl) {
      const editable = p.canEditLayout && e.button === 0;
      if (editable && onHandle) {
        e.preventDefault();
        focusEl(nodeEl);
        const handleEl = target.closest("[data-connect-handle]");
        capture(handleEl);
        const a = bottomAnchor(node);
        const pt = screenToCanvas(e.clientX, e.clientY);
        gestureRef.current = { ...base, kind: "edge", fromId: node.id };
        setTempEdge({ x1: a.x, y1: a.y, x2: pt.x, y2: pt.y });
        return;
      }
      if (node.kind === "group") {
        if (editable && onResize) {
          e.preventDefault();
          focusEl(nodeEl);
          capture(target.closest("[data-resize]"));
          gestureRef.current = { ...base, kind: "resize", id: node.id, ow: node.w, oh: node.h };
          return;
        }
        if (editable && onHeader) {
          e.preventDefault();
          focusEl(nodeEl);
          capture(target.closest("[data-group-header]"));
          const members = p.nodes
            .filter((n): n is PersonNode => n.kind === "person" && n.groupId === node.id)
            .map((m) => ({ id: m.id, ox: m.x, oy: m.y }));
          gestureRef.current = { ...base, kind: "group", id: node.id, ox: node.x, oy: node.y, members };
          return;
        }
        // Empty interior (or read-only header): pan the canvas.
        if (onResize || onHandle || (e.button === 1 && onHeader)) return;
        startPan(nodeEl);
        return;
      }
      // Person card
      if (e.button !== 0) return;
      if (editable) {
        e.preventDefault();
        focusEl(nodeEl);
        capture(nodeEl);
        gestureRef.current = { ...base, kind: "node", id: node.id, ox: node.x, oy: node.y, dropTarget: node.groupId ?? null };
        setDraggingId(node.id);
        return;
      }
      startPan(nodeEl);
      return;
    }

    if (onBg) startPan(wrap);
  };

  // ── Click (selection) ────────────────────────────────────────────────────
  const onWrapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    const target = e.target as Element;
    const moved = movedRef.current;
    movedRef.current = null;
    if (!wrap || !wrap.contains(target)) return;
    if (target.closest("[data-connect-handle], [data-resize]")) return;
    const nodeEl = target.closest("[data-node-id]");
    if (nodeEl) {
      // A pan or connector drag that ended over a node is not a selection click.
      if (moved === "pan" || moved === "edge") return;
      const id = nodeEl.getAttribute("data-node-id");
      if (id) onSelectNode(id);
      return;
    }
    if (moved) return;
    if (target === wrap || target.hasAttribute("data-canvas-bg")) propsRef.current.onBgClick();
  };

  // ── Context menu ─────────────────────────────────────────────────────────
  const onWrapContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    const target = e.target as Element;
    if (!wrap || !wrap.contains(target)) return;
    const g = gestureRef.current;
    if (g) {
      if (g.moved) { e.preventDefault(); return; }
      cancelGesture();
    }
    const p = propsRef.current;
    const pos = { x: e.clientX, y: e.clientY };
    let next: MenuTarget | null = null;

    const edgeId = target.closest("[data-edge-id]")?.getAttribute("data-edge-id") ?? null;
    if (edgeId) {
      if (p.canEditLayout) next = { kind: "edge", id: edgeId, ...pos };
    } else {
      const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
      const node = nodeId ? p.nodes.find((n) => n.id === nodeId) ?? null : null;
      if (node?.kind === "person") {
        onSelectNode(node.id);
        const hasEdges = p.edges.some((ed) => ed.from === node.id || ed.to === node.id);
        if (p.canEditLayout && (node.groupId || hasEdges)) {
          next = { kind: "person", id: node.id, groupId: node.groupId ?? null, hasEdges, ...pos };
        }
      } else if (node?.kind === "group") {
        onSelectNode(node.id);
        next = { kind: "group", id: node.id, ...pos };
      } else if (!nodeId) {
        next = { kind: "bg", ...pos };
      }
    }
    if (!next) return; // nothing to offer: leave the native menu alone
    e.preventDefault();
    setMenuTarget(next);
    setMenuOpen(true);
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const menuAnchor = useMemo(() => {
    if (!menuTarget) return undefined;
    const { x, y } = menuTarget;
    return { getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) };
  }, [menuTarget]);

  const focusEdgeIds = useMemo(() => {
    if (!highlightIds) return null;
    const set = new Set<string>();
    for (const e of edges) if (highlightIds.has(e.from) && highlightIds.has(e.to)) set.add(e.id);
    return set;
  }, [highlightIds, edges]);

  const nameOf = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return "";
    return n.kind === "group" ? groupDisplayName(t, n) : n.name;
  };

  // ── Keyboard focus / nudging ─────────────────────────────────────────────
  /** Keyboard focus on a node pans it into view (the wrapper itself never scrolls). */
  const onWrapFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const id = target.getAttribute("data-node-id");
    if (!id) return;
    if (performance.now() - lastPointerDownRef.current < POINTER_FOCUS_WINDOW_MS) return;
    const node = propsRef.current.nodes.find((n) => n.id === id);
    if (node) revealNode(node);
  };

  const onWrapBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const km = keyMoveRef.current;
    if (km && (e.target as HTMLElement).getAttribute("data-node-id") === km.id) finishKeyMove();
  };

  /** Arrow keys move the focused card / group (Shift = large step). */
  const onWrapKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dirXY = ARROW_DIRS[e.key];
    if (!dirXY || e.altKey || e.metaKey || e.ctrlKey) return;
    const id = (e.target as HTMLElement).getAttribute("data-node-id");
    if (!id) return;
    const p = propsRef.current;
    if (!p.canEditLayout || gestureRef.current) return;
    const node = p.nodes.find((n) => n.id === id);
    if (!node) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const dx = dirXY[0] * step;
    const dy = dirXY[1] * step;
    if (node.kind === "group") {
      finishKeyMove();
      const members = p.nodes
        .filter((n): n is PersonNode => n.kind === "person" && n.groupId === node.id)
        .map((m) => ({ id: m.id, ox: m.x, oy: m.y }));
      p.onMoveGroup(node.id, node.x + dx, node.y + dy, members, dx, dy);
      revealNode({ ...node, x: node.x + dx, y: node.y + dy });
      return;
    }
    if (keyMoveRef.current?.id !== node.id) {
      finishKeyMove();
      keyMoveRef.current = { id: node.id, startHit: groupAt(p.nodes, node.x + CARD_W / 2, node.y + CARD_H / 2) };
    }
    const nx = node.x + dx;
    const ny = node.y + dy;
    p.onMoveNode(node.id, nx, ny);
    const hit = groupAt(p.nodes, nx + CARD_W / 2, ny + CARD_H / 2);
    const startHit = keyMoveRef.current?.startHit ?? null;
    setDropTargetGroupId(hit !== startHit && hit !== (node.groupId ?? null) ? hit : null);
    revealNode({ ...node, x: nx, y: ny });
  };

  const onWrapKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (ARROW_DIRS[e.key]) finishKeyMove();
  };

  return (
    <>
      <div
        ref={wrapRef}
        role="group"
        tabIndex={0}
        aria-label={t(`${K}.ariaLabel`)}
        data-no-sidebar-swipe
        className="relative h-full w-full overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        onPointerDown={onWrapPointerDown}
        onClick={onWrapClick}
        onContextMenu={onWrapContextMenu}
        onFocus={onWrapFocus}
        onBlur={onWrapBlur}
        onKeyDown={onWrapKeyDown}
        onKeyUp={onWrapKeyUp}
        // All view math assumes a zero scroll offset; undo any scroll a browser still applies.
        onScroll={(e) => {
          e.currentTarget.scrollLeft = 0;
          e.currentTarget.scrollTop = 0;
        }}
        style={{
          // `clip` (not a scroll container) keeps focus / find-in-page from scrolling the
          // canvas; browsers without it drop this declaration and keep overflow-hidden.
          overflow: "clip",
          touchAction: "none",
          WebkitTouchCallout: "none",
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          backgroundPosition: `${view.tx}px ${view.ty}px`,
        }}
      >
        <div
          data-canvas-bg
          dir="ltr"
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
            width: 1, height: 1,
          }}
        >
          {groups.map((g) => (
            <GroupFrame
              key={g.id}
              node={g}
              selected={g.id === selectedId}
              dimmed={!!highlightIds && !highlightIds.has(g.id)}
              memberCount={memberCounts[g.id] || 0}
              dropTarget={g.id === dropTargetGroupId}
              canEditLayout={canEditLayout}
              onActivate={onSelectNode}
            />
          ))}

          <EdgesLayer
            nodes={nodes}
            edges={edges}
            hoverEdgeId={hoverEdgeId}
            onHoverEdge={setHoverEdgeId}
            onDeleteEdge={onDeleteEdge}
            tempEdge={tempEdge}
            dimEdgeIds={focusEdgeIds}
            canEditLayout={canEditLayout}
          />

          {persons.map((p) => (
            <PersonCard
              key={p.id}
              node={p}
              role={roleDisplay(p, rolesMap, t)}
              selected={p.id === selectedId}
              dimmed={!!highlightIds && !highlightIds.has(p.id)}
              dragging={draggingId === p.id}
              matchesSearch={!!searchMatchIds && searchMatchIds.has(p.id)}
              canEditLayout={canEditLayout}
              onActivate={onSelectNode}
            />
          ))}
        </div>
      </div>

      {/* Rendered outside the canvas so React events from the portal don't bubble into it. */}
      <ContextMenu open={menuOpen} onOpenChange={(o) => { if (!o) closeMenu(); }}>
        <ContextMenuContent
          anchor={menuAnchor}
          className="min-w-[180px]"
          align="start"
          side="right"
          sideOffset={2}
          alignOffset={2}
        >
          {menuTarget?.kind === "person" && canEditLayout && (
            <>
              {menuTarget.groupId && (
                <ContextMenuItem onClick={() => { closeMenu(); onDropPersonInGroup(menuTarget.id, null); }}>
                  <UserMinus />
                  <span>{t(`${K}.removeFromGroup`)}</span>
                </ContextMenuItem>
              )}
              {(menuTarget.groupId || menuTarget.hasEdges) && (
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => {
                    closeMenu();
                    if (window.confirm(fmt(t(`${K}.confirmClearPerson`), { name: nameOf(menuTarget.id) }))) {
                      onDeleteNode(menuTarget.id);
                    }
                  }}
                >
                  <Unlink />
                  <span>{t(`${K}.clearPersonLinks`)}</span>
                </ContextMenuItem>
              )}
            </>
          )}
          {menuTarget?.kind === "group" && (
            <>
              <ContextMenuItem onClick={() => { closeMenu(); onSelectNode(menuTarget.id); }}>
                <Pencil />
                <span>{t(`${K}.editGroup`)}</span>
              </ContextMenuItem>
              {canEditLayout && (
                <>
                  <ContextMenuItem onClick={() => {
                    closeMenu();
                    const newId = onDuplicateGroup(menuTarget.id);
                    if (newId) onSelectNode(newId);
                  }}>
                    <Copy />
                    <span>{t(`${K}.duplicateGroup`)}</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => {
                      closeMenu();
                      if (window.confirm(fmt(t(`${K}.confirmDeleteGroup`), { name: nameOf(menuTarget.id) }))) {
                        onDeleteNode(menuTarget.id);
                      }
                    }}
                  >
                    <Trash2 />
                    <span>{t(`${K}.deleteGroup`)}</span>
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
          {menuTarget?.kind === "edge" && canEditLayout && (
            <ContextMenuItem variant="destructive" onClick={() => { closeMenu(); onDeleteEdge(menuTarget.id); }}>
              <Trash2 />
              <span>{t(`${K}.deleteEdge`)}</span>
            </ContextMenuItem>
          )}
          {menuTarget?.kind === "bg" && (
            <>
              {canEditLayout && (
                <ContextMenuItem onClick={() => {
                  closeMenu();
                  const newId = onAddGroup();
                  if (newId) onSelectNode(newId);
                }}>
                  <Plus />
                  <span>{t(`${K}.addGroup`)}</span>
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => { closeMenu(); fitToContent(); }}>
                <Maximize />
                <span>{t(`${K}.fitView`)}</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
});
