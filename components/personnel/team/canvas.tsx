"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building, Copy, Map as MapIcon, Pencil, Plus, RefreshCw, Store, Trash2, UserMinus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  CARD_W,
  CARD_H,
  GROUP_HEADER_H,
  ORG_GROUP_PRESETS,
  bottomAnchor,
  edgeMid,
  edgePath,
  initials,
  pointInGroupInterior,
  type EdgeLayout,
  type GroupNode,
  type OrgNode,
  type PersonNode,
  type ViewLayout,
} from "./data";
import type { RoleRow } from "./use-org-graph";

type RoleMap = Record<string, RoleRow>;

function roleForPerson(p: PersonNode, roles: RoleMap): RoleRow {
  return roles[p.role] ?? roles.staff ?? Object.values(roles)[0] ?? {
    id: "fallback", key: "staff", name: "Staff", color: "#78716c", icon: "user",
    description: "", perms: [], rawPermissions: "", isBuiltin: true,
  } as RoleRow;
}

const GROUP_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  store: Store,
  map: MapIcon,
  building: Building,
  "users-round": Users,
};

function PersonAvatar({
  node,
  color,
  className,
}: {
  node: PersonNode;
  color: string;
  className?: string;
}) {
  if (node.avatarUrl) {
    return (
      <img
        src={node.avatarUrl}
        alt={node.name}
        className={cn("rounded-full border border-border bg-muted object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn("rounded-full inline-flex items-center justify-center font-semibold shrink-0", className)}
      style={{ background: color + "20", color }}
    >
      {initials(node.name)}
    </div>
  );
}

// ─── Person card ───────────────────────────────────────────────────────────

function PersonCard({
  node, selected, dimmed, dragging, matchesSearch, roles,
  onPointerDown, onClick, onHandlePointerDown, onContextMenu,
}: {
  node: PersonNode;
  selected: boolean;
  dimmed: boolean;
  dragging: boolean;
  matchesSearch: boolean;
  roles: RoleMap;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onClick: (id: string) => void;
  onHandlePointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: PersonNode) => void;
}) {
  const role = roleForPerson(node, roles);
  return (
    <div
      data-node-id={node.id}
      data-node-kind="person"
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      onContextMenu={(e) => onContextMenu(e, node)}
      className={cn(
        "absolute select-none cursor-grab active:cursor-grabbing transition-opacity",
        dimmed && "opacity-30",
        dragging ? "z-30" : "z-20",
      )}
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: CARD_W, height: CARD_H }}
    >
      <div className={cn(
        "relative h-full w-full rounded-[0.5rem] border bg-background shadow-sm transition-shadow",
        selected
          ? "border-foreground ring-2 ring-foreground/15 shadow-md"
          : matchesSearch
          ? "border-amber-400 ring-2 ring-amber-200"
          : "border-border hover:border-stone-300 dark:hover:border-stone-700 hover:shadow",
      )}>
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[0.5rem]" style={{ background: role.color }} />
        <div className="h-full flex items-center gap-2.5 pl-3 pr-2.5">
          <PersonAvatar node={node} color={role.color} className="h-9 w-9 text-[11px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="text-[12.5px] font-semibold tracking-[-0.01em] truncate">{node.name}</div>
              {node.status === "invited" && (
                <span className="text-[8.5px] uppercase tracking-wider font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 shrink-0 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">待入职</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[9.5px] font-medium"
                style={{ background: role.color + "15", color: role.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: role.color }} />
                {role.name}
              </span>
              <span className="text-[9.5px] text-stone-400 font-mono tabular-nums">{node.perms.length}p</span>
            </div>
          </div>
        </div>
        <button
          onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(e, node.id); }}
          title="拖动以创建管理关系"
          className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] h-3.5 w-3.5 rounded-full bg-background border border-stone-300 dark:border-stone-700 hover:border-foreground hover:bg-foreground shadow-sm flex items-center justify-center"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Group frame ───────────────────────────────────────────────────────────

function GroupFrame({
  node, selected, dimmed, memberCount, dropTarget,
  onHeaderPointerDown, onClick, onHandlePointerDown, onResizePointerDown, onContextMenu,
}: {
  node: GroupNode;
  selected: boolean;
  dimmed: boolean;
  memberCount: number;
  dropTarget: boolean;
  onHeaderPointerDown: (e: React.PointerEvent, id: string) => void;
  onClick: (id: string) => void;
  onHandlePointerDown: (e: React.PointerEvent, id: string) => void;
  onResizePointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: GroupNode) => void;
}) {
  const preset = ORG_GROUP_PRESETS[node.groupKind] || ORG_GROUP_PRESETS.custom;
  const Icon = GROUP_ICON_MAP[preset.icon] || Users;
  const borderColor = selected ? "#1c1917" : dropTarget ? "#16a34a" : preset.color + "90";
  return (
    <div
      data-node-id={node.id}
      data-node-kind="group"
      data-group-id={node.id}
      className={cn("absolute transition-opacity z-10", dimmed && "opacity-30")}
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: node.w, height: node.h }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <div
        className="absolute inset-0 rounded-[0.7rem] pointer-events-none"
        style={{
          border: `2px dashed ${borderColor}`,
          background: dropTarget
            ? `linear-gradient(180deg, ${preset.color}10, #16a34a18)`
            : `linear-gradient(180deg, ${preset.color}06, ${preset.color}0E)`,
          transition: "border-color 120ms, background 120ms",
        }}
      />
      <div
        onPointerDown={(e) => onHeaderPointerDown(e, node.id)}
        className="absolute left-0 right-0 top-0 cursor-grab active:cursor-grabbing flex items-center gap-2.5 px-3"
        style={{
          height: GROUP_HEADER_H,
          background: `linear-gradient(180deg, ${preset.color}24, ${preset.color}10)`,
          borderTopLeftRadius: 10, borderTopRightRadius: 10,
          borderBottom: `1px dashed ${borderColor}`,
        }}
      >
        <div className="h-8 w-8 rounded-[0.3rem] inline-flex items-center justify-center text-white shrink-0 shadow-sm" style={{ background: preset.color }}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[12.5px] font-semibold tracking-[-0.01em] truncate text-stone-800 dark:text-stone-100">{node.name}</div>
            <span className="text-[8.5px] uppercase tracking-wider font-mono text-stone-500 shrink-0">group</span>
          </div>
          <div className="text-[10.5px] text-stone-500 truncate leading-tight">{node.desc}</div>
        </div>
        <div className="flex items-center gap-2 text-[10.5px] font-mono text-stone-600 dark:text-stone-300 tabular-nums shrink-0">
          <span className="inline-flex items-center gap-1">
            <Users className="h-2.5 w-2.5" strokeWidth={1.75} />
            {memberCount}
          </span>
        </div>
      </div>
      <button
        onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(e, node.id); }}
        onClick={(e) => e.stopPropagation()}
        title="拖动以创建管理关系"
        className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] h-3.5 w-3.5 rounded-full bg-background border border-stone-300 dark:border-stone-700 hover:border-foreground hover:bg-foreground shadow-sm flex items-center justify-center z-10"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
      </button>
      {memberCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-[11px] text-stone-400 italic">拖动成员到此处</div>
        </div>
      )}
      <div
        onPointerDown={(e) => { e.stopPropagation(); onResizePointerDown(e, node.id); }}
        onClick={(e) => e.stopPropagation()}
        title="拖动以调整大小"
        className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize flex items-end justify-end p-0.5 group/resize"
        style={{ touchAction: "none" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-50 group-hover/resize:opacity-100">
          <path d="M11 1 L11 11 L1 11" fill="none" stroke={borderColor} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 5 L5 11 M11 8 L8 11" stroke={borderColor} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── Edges layer ───────────────────────────────────────────────────────────

function EdgesLayer({
  nodes, edges, hoverEdgeId, onHoverEdge, onDeleteEdge, tempEdge, dimEdgeIds, onContextMenuEdge,
}: {
  nodes: OrgNode[];
  edges: EdgeLayout[];
  hoverEdgeId: string | null;
  onHoverEdge: (id: string | null) => void;
  onDeleteEdge: (id: string) => void;
  tempEdge: { x1: number; y1: number; x2: number; y2: number } | null;
  dimEdgeIds: Set<string> | null;
  onContextMenuEdge: (e: React.MouseEvent, id: string) => void;
}) {
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ overflow: "visible", zIndex: 15 }}
      width="100%" height="100%"
    >
      <defs>
        <marker id="org-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#a8a29e" />
        </marker>
        <marker id="org-arrow-hov" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
        </marker>
      </defs>
      {edges.map((e) => {
        const from = nodeById[e.from];
        const to = nodeById[e.to];
        if (!from || !to) return null;
        const d = edgePath(from, to);
        const mid = edgeMid(from, to);
        const hovered = hoverEdgeId === e.id;
        const dimmed = dimEdgeIds && !dimEdgeIds.has(e.id);
        return (
          <g key={e.id} style={{ opacity: dimmed ? 0.2 : 1, transition: "opacity 150ms" }}>
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth="18"
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseEnter={() => onHoverEdge(e.id)}
              onMouseLeave={() => onHoverEdge(null)}
              onContextMenu={(ev) => onContextMenuEdge(ev, e.id)}
            />
            <path
              d={d}
              fill="none"
              stroke={hovered ? "#dc2626" : "#78716c"}
              strokeWidth={hovered ? 2 : 1.4}
              markerEnd={hovered ? "url(#org-arrow-hov)" : "url(#org-arrow)"}
              style={{ transition: "stroke 120ms" }}
            />
            {hovered && (
              <g
                transform={`translate(${mid.x},${mid.y})`}
                style={{ pointerEvents: "all", cursor: "pointer" }}
                onClick={(ev) => { ev.stopPropagation(); onDeleteEdge(e.id); }}
                onMouseEnter={() => onHoverEdge(e.id)}
              >
                <circle r="10" fill="#dc2626" />
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
          stroke="#1c1917"
          strokeWidth="1.6"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}

// ─── The canvas ────────────────────────────────────────────────────────────

interface OrgCanvasProps {
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
}

export function OrgCanvas({
  nodes, edges,
  selectedId, onSelectNode,
  onMoveNode, onMoveGroup, onResizeGroup, onDropPersonInGroup,
  onCreateEdge, onDeleteEdge,
  onDeleteNode, onAddGroup, onDuplicateGroup,
  onBgClick,
  highlightIds, searchMatchIds,
  roles,
  view, onViewChange,
}: OrgCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [dragGroup, setDragGroup] = useState<{ id: string; startX: number; startY: number; ox: number; oy: number; members: Array<{ id: string; ox: number; oy: number }> } | null>(null);
  const [resizeGroup, setResizeGroup] = useState<{ id: string; startX: number; startY: number; ow: number; oh: number } | null>(null);
  const [pan, setPan] = useState<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [tempEdge, setTempEdge] = useState<{ fromId: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<
    | { kind: "person"; id: string; groupId: string | null; x: number; y: number }
    | { kind: "group"; id: string; x: number; y: number }
    | { kind: "edge"; id: string; x: number; y: number }
    | { kind: "bg"; x: number; y: number }
    | null
  >(null);

  const rolesMap = useMemo<RoleMap>(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);
  const groups = useMemo(() => nodes.filter((n): n is GroupNode => n.kind === "group"), [nodes]);
  const persons = useMemo(() => nodes.filter((n): n is PersonNode => n.kind === "person"), [nodes]);

  const memberCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of persons) if (p.groupId) c[p.groupId] = (c[p.groupId] || 0) + 1;
    return c;
  }, [persons]);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.tx) / view.zoom,
      y: (clientY - r.top - view.ty) / view.zoom,
    };
  }, [view]);

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.target !== wrapRef.current && (e.target as HTMLElement).tagName !== "svg" && !(e.target as HTMLElement).classList.contains("__org-world")) return;
    e.preventDefault();
    setPan({ startX: e.clientX, startY: e.clientY, ox: view.tx, oy: view.ty });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.min(2, Math.max(0.3, view.zoom * factor));
    const r = wrapRef.current!.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const wx = (cx - view.tx) / view.zoom;
    const wy = (cy - view.ty) / view.zoom;
    onViewChange({ zoom: newZoom, tx: cx - wx * newZoom, ty: cy - wy * newZoom });
  };

  // Touch pinch-zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let pinch: { dist: number; cx: number; cy: number } | null = null;
    const dist = (t1: Touch, t2: Touch) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        pinch = { dist: dist(t1, t2), cx: (t1.clientX + t2.clientX) / 2, cy: (t1.clientY + t2.clientY) / 2 };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const nd = dist(t1, t2);
        const ratio = nd / pinch.dist;
        const r = el.getBoundingClientRect();
        const cx = (t1.clientX + t2.clientX) / 2 - r.left;
        const cy = (t1.clientY + t2.clientY) / 2 - r.top;
        const newZoom = Math.min(2, Math.max(0.3, view.zoom * ratio));
        const wx = (cx - view.tx) / view.zoom;
        const wy = (cy - view.ty) / view.zoom;
        onViewChange({ zoom: newZoom, tx: cx - wx * newZoom, ty: cy - wy * newZoom });
        pinch.dist = nd;
      }
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [view, onViewChange]);

  // Zoom centered on the canvas viewport center (used by keyboard shortcuts)
  const zoomAtCenter = useCallback((nextZoom: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height / 2;
    const z = Math.min(2, Math.max(0.3, nextZoom));
    const wx = (cx - view.tx) / view.zoom;
    const wy = (cy - view.ty) / view.zoom;
    onViewChange({ zoom: z, tx: cx - wx * z, ty: cy - wy * z });
  }, [view, onViewChange]);

  // Keyboard shortcuts
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      // Delete / Backspace — remove selected node
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !mod) {
        e.preventDefault();
        onDeleteNode(selectedId);
        return;
      }
      // Escape — clear selection / close menu
      if (e.key === "Escape") {
        if (menuTarget) setMenuTarget(null);
        else onBgClick();
        return;
      }
      // Cmd/Ctrl + 0 — reset zoom to 1
      if (mod && e.key === "0") {
        e.preventDefault();
        zoomAtCenter(1);
        return;
      }
      // Cmd/Ctrl + +/= — zoom in
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomAtCenter(view.zoom * 1.15);
        return;
      }
      // Cmd/Ctrl + - — zoom out
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomAtCenter(view.zoom / 1.15);
        return;
      }
      // Cmd/Ctrl + D — duplicate selected group
      if (mod && (e.key === "d" || e.key === "D")) {
        if (!selectedId) return;
        const isGroup = nodes.some((n) => n.id === selectedId && n.kind === "group");
        if (!isGroup) return;
        e.preventDefault();
        const newId = onDuplicateGroup(selectedId);
        if (newId) onSelectNode(newId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, menuTarget, view.zoom, nodes, onDeleteNode, onBgClick, zoomAtCenter, onDuplicateGroup, onSelectNode]);

  const onPersonPointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodes.find((n) => n.id === id);
    if (!node || node.kind !== "person") return;
    setDragNode({ id, startX: e.clientX, startY: e.clientY, ox: node.x, oy: node.y });
  };

  const onGroupHeaderPointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const g = nodes.find((n) => n.id === id);
    if (!g || g.kind !== "group") return;
    const memberSnapshot = persons.filter((p) => p.groupId === id).map((p) => ({ id: p.id, ox: p.x, oy: p.y }));
    setDragGroup({ id, startX: e.clientX, startY: e.clientY, ox: g.x, oy: g.y, members: memberSnapshot });
  };

  const onResizePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const g = nodes.find((n) => n.id === id);
    if (!g || g.kind !== "group") return;
    setResizeGroup({ id, startX: e.clientX, startY: e.clientY, ow: g.w, oh: g.h });
  };

  const onHandlePointerDown = (e: React.PointerEvent, fromId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const from = nodes.find((n) => n.id === fromId);
    if (!from) return;
    const a = bottomAnchor(from);
    const p = screenToCanvas(e.clientX, e.clientY);
    setTempEdge({ fromId, x1: a.x, y1: a.y, x2: p.x, y2: p.y });
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dragNode) {
        const dx = (e.clientX - dragNode.startX) / view.zoom;
        const dy = (e.clientY - dragNode.startY) / view.zoom;
        const nx = dragNode.ox + dx;
        const ny = dragNode.oy + dy;
        onMoveNode(dragNode.id, nx, ny);
        const pCenter = { x: nx + CARD_W / 2, y: ny + CARD_H / 2 };
        const hit = groups.find((g) => pointInGroupInterior(g, pCenter.x, pCenter.y));
        setDropTargetGroupId(hit ? hit.id : null);
      } else if (dragGroup) {
        const dx = (e.clientX - dragGroup.startX) / view.zoom;
        const dy = (e.clientY - dragGroup.startY) / view.zoom;
        onMoveGroup(dragGroup.id, dragGroup.ox + dx, dragGroup.oy + dy, dragGroup.members, dx, dy);
      } else if (resizeGroup) {
        const dx = (e.clientX - resizeGroup.startX) / view.zoom;
        const dy = (e.clientY - resizeGroup.startY) / view.zoom;
        const w = Math.max(280, resizeGroup.ow + dx);
        const h = Math.max(GROUP_HEADER_H + 80, resizeGroup.oh + dy);
        onResizeGroup(resizeGroup.id, w, h);
      } else if (pan) {
        onViewChange({ ...view, tx: pan.ox + (e.clientX - pan.startX), ty: pan.oy + (e.clientY - pan.startY) });
      } else if (tempEdge) {
        const p = screenToCanvas(e.clientX, e.clientY);
        setTempEdge((prev) => prev ? { ...prev, x2: p.x, y2: p.y } : null);
      }
    }
    function onUp(e: PointerEvent) {
      if (tempEdge) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cardEl = (el as HTMLElement | null)?.closest?.("[data-node-id]") as HTMLElement | null;
        if (cardEl) {
          const targetId = cardEl.getAttribute("data-node-id");
          if (targetId && targetId !== tempEdge.fromId) onCreateEdge(tempEdge.fromId, targetId);
        }
      } else if (dragNode) {
        const moved = Math.hypot(e.clientX - dragNode.startX, e.clientY - dragNode.startY) > 3;
        if (moved) {
          const node = nodes.find((n) => n.id === dragNode.id);
          if (node && node.kind === "person" && node.groupId !== dropTargetGroupId) {
            onDropPersonInGroup(dragNode.id, dropTargetGroupId);
          }
        }
      }
      setDragNode(null);
      setDragGroup(null);
      setResizeGroup(null);
      setPan(null);
      setTempEdge(null);
      setDropTargetGroupId(null);
    }
    if (dragNode || dragGroup || resizeGroup || pan || tempEdge) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }
  }, [dragNode, dragGroup, resizeGroup, pan, tempEdge, view, groups, nodes, dropTargetGroupId, onMoveNode, onMoveGroup, onResizeGroup, onViewChange, onCreateEdge, onDropPersonInGroup, screenToCanvas]);

  const focusEdgeIds = useMemo(() => {
    if (!highlightIds) return null;
    const set = new Set<string>();
    for (const e of edges) if (highlightIds.has(e.from) && highlightIds.has(e.to)) set.add(e.id);
    return set;
  }, [highlightIds, edges]);

  // ── Context menu handlers ────────────────────────────────────────────────
  const onPersonContextMenu = useCallback((e: React.MouseEvent, n: PersonNode) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectNode(n.id);
    setMenuTarget({ kind: "person", id: n.id, groupId: n.groupId ?? null, x: e.clientX, y: e.clientY });
  }, [onSelectNode]);

  const onGroupContextMenu = useCallback((e: React.MouseEvent, n: GroupNode) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectNode(n.id);
    setMenuTarget({ kind: "group", id: n.id, x: e.clientX, y: e.clientY });
  }, [onSelectNode]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuTarget({ kind: "edge", id, x: e.clientX, y: e.clientY });
  }, []);

  const onBgContextMenu = useCallback((e: React.MouseEvent) => {
    // Only when the click really lands on background (not bubbled from a card)
    const target = e.target as HTMLElement;
    const onBg = target === wrapRef.current || target.tagName === "svg" || target.classList.contains("__org-world");
    if (!onBg) return;
    e.preventDefault();
    setMenuTarget({ kind: "bg", x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuTarget(null), []);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden cursor-grab active:cursor-grabbing bg-muted/30"
      onPointerDown={onBgPointerDown}
      onWheel={onWheel}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target === wrapRef.current || target.tagName === "svg" || target.classList.contains("__org-world")) onBgClick();
      }}
      onContextMenu={onBgContextMenu}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(120,113,108,.25) 1px, transparent 1px)",
        backgroundSize: `20px 20px`,
        backgroundPosition: `${view.tx}px ${view.ty}px`,
      }}
    >
      <div
        className="__org-world absolute top-0 left-0"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`,
          transformOrigin: "0 0",
          width: 1, height: 1,
        }}
      >
        {groups.map((g) => {
          const dim = !!highlightIds && !highlightIds.has(g.id);
          return (
            <GroupFrame
              key={g.id}
              node={g}
              selected={g.id === selectedId}
              dimmed={dim}
              memberCount={memberCounts[g.id] || 0}
              dropTarget={g.id === dropTargetGroupId}
              onHeaderPointerDown={onGroupHeaderPointerDown}
              onClick={onSelectNode}
              onHandlePointerDown={onHandlePointerDown}
              onResizePointerDown={onResizePointerDown}
              onContextMenu={onGroupContextMenu}
            />
          );
        })}

        <EdgesLayer
          nodes={nodes}
          edges={edges}
          hoverEdgeId={hoverEdgeId}
          onHoverEdge={setHoverEdgeId}
          onDeleteEdge={onDeleteEdge}
          tempEdge={tempEdge}
          dimEdgeIds={focusEdgeIds}
          onContextMenuEdge={onEdgeContextMenu}
        />

        {persons.map((p) => {
          const dim = !!highlightIds && !highlightIds.has(p.id);
          const isMatch = !!searchMatchIds && searchMatchIds.has(p.id);
          return (
            <PersonCard
              key={p.id}
              node={p}
              selected={p.id === selectedId}
              dimmed={dim}
              dragging={!!dragNode && dragNode.id === p.id}
              matchesSearch={isMatch}
              roles={rolesMap}
              onPointerDown={onPersonPointerDown}
              onClick={onSelectNode}
              onHandlePointerDown={onHandlePointerDown}
              onContextMenu={onPersonContextMenu}
            />
          );
        })}
      </div>

      {/* ── Context menu ──────────────────────────────────────────────── */}
      <ContextMenu open={menuTarget !== null} onOpenChange={(o) => { if (!o) closeMenu(); }}>
        <ContextMenuTrigger
          render={(props) => (
            <span
              {...props}
              aria-hidden="true"
              style={{
                position: "fixed",
                left: menuTarget?.x ?? -9999,
                top: menuTarget?.y ?? -9999,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          )}
        />
        <ContextMenuContent className="min-w-[180px]" align="start" side="right" sideOffset={2}>
          {menuTarget?.kind === "person" && (
            <>
              {menuTarget.groupId && (
                <ContextMenuItem onClick={() => { onDropPersonInGroup(menuTarget.id, null); closeMenu(); }}>
                  <UserMinus />
                  <span>移出分组</span>
                </ContextMenuItem>
              )}
              <ContextMenuItem onClick={() => { onDeleteNode(menuTarget.id); closeMenu(); }}>
                <Trash2 />
                <span>从画布删除</span>
              </ContextMenuItem>
            </>
          )}
          {menuTarget?.kind === "group" && (
            <>
              <ContextMenuItem onClick={() => { onSelectNode(menuTarget.id); closeMenu(); }}>
                <Pencil />
                <span>重命名 (打开侧栏)</span>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => {
                const newId = onDuplicateGroup(menuTarget.id);
                if (newId) onSelectNode(newId);
                closeMenu();
              }}>
                <Copy />
                <span>复制分组</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => { onDeleteNode(menuTarget.id); closeMenu(); }}>
                <Trash2 />
                <span>删除分组</span>
              </ContextMenuItem>
            </>
          )}
          {menuTarget?.kind === "edge" && (
            <ContextMenuItem onClick={() => { onDeleteEdge(menuTarget.id); closeMenu(); }}>
              <Trash2 />
              <span>删除连接</span>
            </ContextMenuItem>
          )}
          {menuTarget?.kind === "bg" && (
            <>
              <ContextMenuItem onClick={() => {
                const newId = onAddGroup();
                if (newId) onSelectNode(newId);
                closeMenu();
              }}>
                <Plus />
                <span>新增分组</span>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => { onViewChange({ zoom: 1, tx: 0, ty: 0 }); closeMenu(); }}>
                <RefreshCw />
                <span>重设视图</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
