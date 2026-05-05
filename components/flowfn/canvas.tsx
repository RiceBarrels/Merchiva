"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FlowIcon } from "./icons";
import { NODE_LIB, makeNode, nodeCategories } from "./node-lib";
import type {
  FlowFunction, FlowNode, NodeDef, ViewState, DragState,
  ConnectorState, AddMenuState, NodeResult,
} from "./types";

const NODE_W = 200;
const HEADER_H = 30;
const ROW_H = 26;
const RESULT_H = 36;

const WIRE_COLORS: Record<string, string> = {
  number: "oklch(0.55 0.06 230)",
  string: "oklch(0.6 0.07 145)",
  bool: "oklch(0.62 0.12 35)",
  any: "oklch(0.55 0 0)",
  array: "oklch(0.55 0.07 290)",
  object: "oklch(0.6 0.06 80)",
  flow: "oklch(0.3 0 0)",
};

function getPortYOffset(node: FlowNode, side: "in" | "out", portId: string): number {
  const def = NODE_LIB[node.type];
  if (!def) return HEADER_H + ROW_H / 2;
  const ports = side === "in" ? def.inputs : def.outputs;
  const idx = ports.findIndex((p) => p.id === portId);
  if (idx < 0) return HEADER_H + ROW_H / 2;
  let y = HEADER_H + 6;
  if (side === "in") {
    y += idx * ROW_H + ROW_H / 2;
  } else {
    y += def.inputs.length * ROW_H;
    y += (def.controls?.length || 0) * ROW_H;
    y += idx * ROW_H + ROW_H / 2;
  }
  return y;
}

function getPortPos(node: FlowNode, side: "in" | "out", portId: string) {
  return {
    x: node.x + (side === "in" ? 0 : NODE_W),
    y: node.y + getPortYOffset(node, side, portId),
  };
}

function bezier(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x},${a.y} C ${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

function formatPreview(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); }
  catch { return String(v); }
}

// ── NodeCard ──

function NodeCard({
  node, def, selected, results, onMouseDown, onPortMouseDown, onPortMouseUp,
  onChange, allFns, fn, executing, hoverPortKey,
}: {
  node: FlowNode;
  def: NodeDef;
  selected: boolean;
  results: Record<string, NodeResult>;
  onMouseDown: (e: React.MouseEvent, node: FlowNode, fromHeader?: boolean) => void;
  onPortMouseDown: (e: React.MouseEvent, node: FlowNode, side: "in" | "out", portId: string) => void;
  onPortMouseUp: (e: React.MouseEvent, node: FlowNode, side: "in" | "out", portId: string) => void;
  onChange: (nodeId: string, key: string, value: string | boolean) => void;
  allFns: FlowFunction[];
  fn: FlowFunction;
  executing: boolean;
  hoverPortKey: string | null;
}) {
  const result = results[node.id];
  const hasResult = result !== undefined;
  const errored = result && result.err;

  return (
    <div
      className={`ffn-node ${selected ? "selected" : ""} ${errored ? "error" : ""} ${executing ? "executing" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W }}
      onMouseDown={(e) => onMouseDown(e, node)}
    >
      <div className="ffn-node-header" onMouseDown={(e) => onMouseDown(e, node, true)}>
        <div className={`ffn-node-icon ${def.iconClass || ""}`}>
          <FlowIcon name={def.icon} size={12} />
        </div>
        <div className="ffn-node-title">{def.label}</div>
      </div>
      <div className="ffn-node-body">
        {def.inputs.map((p) => {
          const key = node.id + "|" + p.id;
          const targetable = hoverPortKey === "in:" + key;
          return (
            <div className="ffn-node-row in" key={"in-" + p.id}>
              <span
                className={`ffn-port in ${p.type} ${targetable ? "targetable" : ""}`}
                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node, "in", p.id); }}
                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node, "in", p.id); }}
                data-port-key={"in:" + key}
              />
              <span className="ffn-port-label">{p.label}</span>
            </div>
          );
        })}
        {(def.controls || []).map((c) => (
          <div className="ffn-node-row body" key={"ctrl-" + c.id}>
            {c.kind === "select" && (
              <select className="ffn-node-select" value={node.data[c.id] as string} onChange={(e) => onChange(node.id, c.id, e.target.value)}>
                {c.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {c.kind === "fn-select" && (
              <select className="ffn-node-select" value={(node.data[c.id] as string) || ""} onChange={(e) => onChange(node.id, c.id, e.target.value)}>
                <option value="">—choose function—</option>
                {allFns.filter((f) => f.id !== fn.id).map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            )}
            {c.kind === "text" && (
              <input className="ffn-node-input" value={(node.data[c.id] as string) || ""} placeholder={c.placeholder || ""} onChange={(e) => onChange(node.id, c.id, e.target.value)} />
            )}
            {c.kind === "number" && (
              <input type="number" className="ffn-node-input" value={node.data[c.id] as number} onChange={(e) => onChange(node.id, c.id, e.target.value)} />
            )}
            {c.kind === "textarea" && (
              <textarea
                className="ffn-node-input"
                style={{ height: "auto", minHeight: 22, padding: "4px 6px", resize: "vertical" }}
                value={(node.data[c.id] as string) || ""}
                onChange={(e) => onChange(node.id, c.id, e.target.value)}
              />
            )}
            {c.kind === "bool" && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--stone-700)" }}>
                <input type="checkbox" checked={!!node.data[c.id]} onChange={(e) => onChange(node.id, c.id, e.target.checked)} />
                {String(!!node.data[c.id])}
              </label>
            )}
          </div>
        ))}
        {hasResult && (
          <div className={`ffn-node-result ${result.err ? "err" : ""}`}>
            {result.err ? result.err : formatPreview(result.value)}
          </div>
        )}
        {def.outputs.map((p) => {
          const key = node.id + "|" + p.id;
          const targetable = hoverPortKey === "out:" + key;
          return (
            <div className="ffn-node-row out" key={"out-" + p.id}>
              <span className="ffn-port-label r">{p.label}</span>
              <span
                className={`ffn-port out ${p.type} ${targetable ? "targetable" : ""}`}
                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node, "out", p.id); }}
                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node, "out", p.id); }}
                data-port-key={"out:" + key}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AddMenu ──

function AddMenu({ state, onClose, onPick, onUpdate }: {
  state: AddMenuState;
  onClose: () => void;
  onPick: (typeId: string) => void;
  onUpdate: (s: AddMenuState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const groups = nodeCategories();
  const flat: (NodeDef & { id: string; cat: string })[] = [];
  Object.entries(groups).forEach(([cat, items]) => {
    items.forEach((it) => flat.push({ ...it, cat }));
  });
  const q = state.query.toLowerCase();
  const filtered = q
    ? flat.filter((it) => it.label.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q) || it.desc?.toLowerCase().includes(q))
    : flat;

  const grouped: Record<string, typeof flat> = {};
  filtered.forEach((it) => {
    if (!grouped[it.cat]) grouped[it.cat] = [];
    grouped[it.cat].push(it);
  });

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); onUpdate({ ...state, activeIdx: Math.min(filtered.length - 1, state.activeIdx + 1) }); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); onUpdate({ ...state, activeIdx: Math.max(0, state.activeIdx - 1) }); return; }
    if (e.key === "Enter" && filtered[state.activeIdx]) { e.preventDefault(); onPick(filtered[state.activeIdx].id); }
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".ffn-add-menu")) onClose();
    }
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  return (
    <div className="ffn-add-menu" style={{ left: state.x, top: state.y }}>
      <div className="ffn-add-search">
        <FlowIcon name="search" size={14} style={{ color: "var(--stone-500)" }} />
        <input
          ref={inputRef}
          placeholder="Search nodes..."
          value={state.query}
          onChange={(e) => onUpdate({ ...state, query: e.target.value, activeIdx: 0 })}
          onKeyDown={onKey}
        />
        <span style={{ fontSize: 10, color: "var(--stone-400)" }}>↑↓ ↵</span>
      </div>
      <div className="ffn-add-list">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="ffn-add-group">{cat}</div>
            {items.map((it) => {
              const idx = filtered.indexOf(it);
              return (
                <div
                  key={it.id}
                  className={`ffn-add-item ${idx === state.activeIdx ? "kbd-active" : ""}`}
                  onClick={() => onPick(it.id)}
                  onMouseEnter={() => onUpdate({ ...state, activeIdx: idx })}
                >
                  <span className={`ffn-add-ic ${it.iconClass || ""}`}>
                    <FlowIcon name={it.icon} size={12} />
                  </span>
                  <span>{it.label}</span>
                  <span className="ffn-add-desc">{it.desc}</span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && <div className="ffn-empty">No matches</div>}
      </div>
    </div>
  );
}

// ── Auto-layout ──

function autoLayout(fn: FlowFunction): FlowFunction {
  const layer: Record<string, number> = {};
  fn.nodes.forEach((n) => (layer[n.id] = 0));
  let changed = true, guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    fn.edges.forEach((e) => {
      if (layer[e.to.node] < layer[e.from.node] + 1) {
        layer[e.to.node] = layer[e.from.node] + 1;
        changed = true;
      }
    });
  }
  const cols: Record<number, FlowNode[]> = {};
  fn.nodes.forEach((n) => {
    const L = layer[n.id] || 0;
    if (!cols[L]) cols[L] = [];
    cols[L].push(n);
  });
  const newNodes: FlowNode[] = [];
  Object.keys(cols).map(Number).sort((a, b) => a - b).forEach((L) => {
    cols[L].forEach((n, i) => {
      newNodes.push({ ...n, x: 80 + L * 240, y: 80 + i * 160 });
    });
  });
  return { ...fn, nodes: newNodes };
}

// ── findNearestPort ──

function findNearestPort(e: MouseEvent, fn: FlowFunction, stageEl: HTMLDivElement): { node: FlowNode; side: "in" | "out"; portId: string } | null {
  const els = stageEl.querySelectorAll(".ffn-port");
  let best: { node: FlowNode; side: "in" | "out"; portId: string } | null = null;
  let bestDist = 40;
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      const key = el.getAttribute("data-port-key") || "";
      const [side, payload] = key.split(":");
      const [nodeId, portId] = (payload || "").split("|");
      const node = fn.nodes.find((n) => n.id === nodeId);
      if (node) best = { node, side: side as "in" | "out", portId };
    }
  });
  return best;
}

// ── Canvas ──

export function Canvas({
  fn, allFns, onUpdateFn, results, executingNodes, onSelectNode, selectedNodeIds, onLog,
}: {
  fn: FlowFunction;
  allFns: FlowFunction[];
  onUpdateFn: (fn: FlowFunction) => void;
  results: Record<string, NodeResult>;
  executingNodes: Set<string>;
  onSelectNode: (ids: Set<string>) => void;
  selectedNodeIds: Set<string>;
  onLog: (level: "info" | "ok" | "err" | "warn", msg: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [connector, setConnector] = useState<ConnectorState | null>(null);
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null);
  const [hoverPortKey, setHoverPortKey] = useState<string | null>(null);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: (cx - r.left - view.x) / view.k,
      y: (cy - r.top - view.y) / view.k,
    };
  }, [view]);

  function onStageMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("ffn-canvas-world")) return;
    if (e.button === 1 || e.button === 0) {
      setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
      onSelectNode(new Set());
    }
  }

  function onStageDoubleClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("ffn-canvas-world")) return;
    const r = stageRef.current!.getBoundingClientRect();
    setAddMenu({ x: e.clientX - r.left, y: e.clientY - r.top, world: toWorld(e.clientX, e.clientY), query: "", activeIdx: 0 });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = stageRef.current!.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newK = Math.max(0.25, Math.min(2.5, view.k * factor));
      const wx = (cx - view.x) / view.k;
      const wy = (cy - view.y) / view.k;
      setView({ x: cx - wx * newK, y: cy - wy * newK, k: newK });
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag) return;
      if (drag.kind === "pan") {
        setView((v) => ({ ...v, x: drag.ox! + (e.clientX - drag.sx!), y: drag.oy! + (e.clientY - drag.sy!) }));
      } else if (drag.kind === "node") {
        const w = toWorld(e.clientX, e.clientY);
        const dx = w.x - drag.startWorld!.x;
        const dy = w.y - drag.startWorld!.y;
        const newNodes = fn.nodes.map((n) => {
          const initial = drag.initial?.[n.id];
          if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy };
          return n;
        });
        onUpdateFn({ ...fn, nodes: newNodes });
      } else if (drag.kind === "wire") {
        const w = toWorld(e.clientX, e.clientY);
        const hover = findNearestPort(e, fn, stageRef.current!);
        setHoverPortKey(hover ? `${hover.side}:${hover.node.id}|${hover.portId}` : null);
        setConnector({ from: drag.from!, x: w.x, y: w.y });
      }
    }
    function onUp(e: MouseEvent) {
      if (!drag) return;
      if (drag.kind === "wire") {
        const hit = findNearestPort(e, fn, stageRef.current!);
        if (hit && hit.side !== drag.from!.side) {
          let from, to;
          if (drag.from!.side === "out") {
            from = { node: drag.from!.node.id, port: drag.from!.portId };
            to = { node: hit.node.id, port: hit.portId };
          } else {
            from = { node: hit.node.id, port: hit.portId };
            to = { node: drag.from!.node.id, port: drag.from!.portId };
          }
          const newEdges = fn.edges.filter((ed) => !(ed.to.node === to.node && ed.to.port === to.port));
          if (from.node !== to.node) {
            newEdges.push({ from, to });
            onUpdateFn({ ...fn, edges: newEdges });
          }
        }
        setConnector(null);
        setHoverPortKey(null);
      }
      setDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, fn, view, onUpdateFn, toWorld, onSelectNode]);

  function startNodeDrag(e: React.MouseEvent, node: FlowNode, fromHeader?: boolean) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!fromHeader && ((e.target as HTMLElement).classList.contains("ffn-node-input") || (e.target as HTMLElement).classList.contains("ffn-node-select") || (e.target as HTMLElement).tagName === "OPTION")) return;
    const startWorld = toWorld(e.clientX, e.clientY);
    const ids = selectedNodeIds.has(node.id) ? new Set(selectedNodeIds) : new Set([node.id]);
    if (!selectedNodeIds.has(node.id)) onSelectNode(ids);
    const initial: Record<string, { x: number; y: number }> = {};
    fn.nodes.forEach((n) => { if (ids.has(n.id)) initial[n.id] = { x: n.x, y: n.y }; });
    setDrag({ kind: "node", startWorld, initial });
  }

  function onPortDown(e: React.MouseEvent, node: FlowNode, side: "in" | "out", portId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind: "wire", from: { node, side, portId } });
    const w = toWorld(e.clientX, e.clientY);
    setConnector({ from: { node, side, portId }, x: w.x, y: w.y });
  }

  function onPortUp(_e: React.MouseEvent, node: FlowNode, side: "in" | "out", portId: string) {
    if (!drag || drag.kind !== "wire") return;
    if (side === drag.from!.side) return;
    let from, to;
    if (drag.from!.side === "out") {
      from = { node: drag.from!.node.id, port: drag.from!.portId };
      to = { node: node.id, port: portId };
    } else {
      from = { node: node.id, port: portId };
      to = { node: drag.from!.node.id, port: drag.from!.portId };
    }
    if (from.node === to.node) return;
    const newEdges = fn.edges.filter((ed) => !(ed.to.node === to.node && ed.to.port === to.port));
    newEdges.push({ from, to });
    onUpdateFn({ ...fn, edges: newEdges });
    setConnector(null);
    setHoverPortKey(null);
    setDrag(null);
  }

  function onChangeNodeData(nodeId: string, key: string, value: string | boolean) {
    const newNodes = fn.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n);
    onUpdateFn({ ...fn, nodes: newNodes });
  }

  function deleteEdge(e: React.MouseEvent, idx: number) {
    e.stopPropagation();
    const newEdges = fn.edges.filter((_, i) => i !== idx);
    onUpdateFn({ ...fn, edges: newEdges });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (addMenu) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeIds.size) {
        e.preventDefault();
        const newNodes = fn.nodes.filter((n) => !selectedNodeIds.has(n.id));
        const newEdges = fn.edges.filter((ed) => !selectedNodeIds.has(ed.from.node) && !selectedNodeIds.has(ed.to.node));
        onUpdateFn({ ...fn, nodes: newNodes, edges: newEdges });
        onSelectNode(new Set());
      }
      if (e.key === "/" && !addMenu) {
        e.preventDefault();
        const r = stageRef.current!.getBoundingClientRect();
        setAddMenu({ x: r.width / 2 - 140, y: r.height / 2 - 200, world: toWorld(r.left + r.width / 2, r.top + r.height / 2), query: "", activeIdx: 0 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fn, selectedNodeIds, onUpdateFn, onSelectNode, addMenu, toWorld]);

  const wires = useMemo(() => {
    const list: { i: number; a: { x: number; y: number }; b: { x: number; y: number }; type: string }[] = [];
    fn.edges.forEach((ed, i) => {
      const fromNode = fn.nodes.find((n) => n.id === ed.from.node);
      const toNode = fn.nodes.find((n) => n.id === ed.to.node);
      if (!fromNode || !toNode) return;
      const a = getPortPos(fromNode, "out", ed.from.port);
      const b = getPortPos(toNode, "in", ed.to.port);
      const def = NODE_LIB[fromNode.type];
      const port = def?.outputs.find((p) => p.id === ed.from.port);
      list.push({ i, a, b, type: port?.type || "any" });
    });
    return list;
  }, [fn.edges, fn.nodes]);

  return (
    <>
      <div
        ref={stageRef}
        className={`ffn-canvas-stage ${drag?.kind === "pan" ? "panning" : ""}`}
        onMouseDown={onStageMouseDown}
        onDoubleClick={onStageDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = stageRef.current!.getBoundingClientRect();
          setAddMenu({ x: e.clientX - r.left, y: e.clientY - r.top, world: toWorld(e.clientX, e.clientY), query: "", activeIdx: 0 });
        }}
      >
        <div className="ffn-canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="ffn-wires-svg" style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
            {wires.map((w) => (
              <g key={w.i}>
                <path d={bezier(w.a, w.b)} fill="none" stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={(e) => deleteEdge(e, w.i)} />
                <path d={bezier(w.a, w.b)} fill="none" stroke={WIRE_COLORS[w.type] || WIRE_COLORS.any} strokeWidth={2} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={(e) => deleteEdge(e, w.i)} />
              </g>
            ))}
            {connector && (() => {
              const node = connector.from.node;
              const a = getPortPos(node, connector.from.side, connector.from.portId);
              const b = { x: connector.x, y: connector.y };
              const a0 = connector.from.side === "out" ? a : b;
              const b0 = connector.from.side === "out" ? b : a;
              return <path d={bezier(a0, b0)} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="4 3" />;
            })()}
          </svg>
          {fn.nodes.map((n) => {
            const def = NODE_LIB[n.type];
            if (!def) return null;
            return (
              <NodeCard
                key={n.id}
                node={n}
                def={def}
                selected={selectedNodeIds.has(n.id)}
                results={results}
                executing={executingNodes?.has(n.id)}
                onMouseDown={startNodeDrag}
                onPortMouseDown={onPortDown}
                onPortMouseUp={onPortUp}
                onChange={onChangeNodeData}
                allFns={allFns}
                fn={fn}
                hoverPortKey={hoverPortKey}
              />
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="ffn-canvas-toolbar">
        <button className="ffn-btn icon sm" title="Add node (/)" onClick={() => {
          const r = stageRef.current!.getBoundingClientRect();
          setAddMenu({ x: 12, y: 44, world: toWorld(r.left + 200, r.top + 200), query: "", activeIdx: 0 });
        }}>
          <FlowIcon name="search" size={14} />
        </button>
        <button className="ffn-btn sm" onClick={() => onUpdateFn(autoLayout(fn))}>
          <FlowIcon name="arrange" size={12} /> Arrange
        </button>
        <button className="ffn-btn sm" onClick={() => {
          if (!fn.nodes.length) return;
          const minX = Math.min(...fn.nodes.map((n) => n.x));
          const minY = Math.min(...fn.nodes.map((n) => n.y));
          const maxX = Math.max(...fn.nodes.map((n) => n.x + NODE_W));
          const maxY = Math.max(...fn.nodes.map((n) => n.y + 200));
          const r = stageRef.current!.getBoundingClientRect();
          const padding = 40;
          const k = Math.min(1, Math.min((r.width - padding * 2) / (maxX - minX), (r.height - padding * 2) / (maxY - minY)));
          const x = (r.width - (maxX - minX) * k) / 2 - minX * k;
          const y = (r.height - (maxY - minY) * k) / 2 - minY * k;
          setView({ x, y, k: Math.max(0.4, k) });
        }}>
          <FlowIcon name="fit" size={12} /> Fit
        </button>
      </div>

      <div className="ffn-canvas-zoom">
        <button className="ffn-btn icon sm" onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k * 0.8) }))}>
          <FlowIcon name="zoomOut" size={14} />
        </button>
        <span className="ffn-zlabel">{Math.round(view.k * 100)}%</span>
        <button className="ffn-btn icon sm" onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.25) }))}>
          <FlowIcon name="zoomIn" size={14} />
        </button>
        <button className="ffn-btn icon sm" title="Reset" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
          <FlowIcon name="reset" size={14} />
        </button>
      </div>

      {addMenu && (
        <AddMenu
          state={addMenu}
          onClose={() => setAddMenu(null)}
          onPick={(typeId) => {
            const node = makeNode(typeId, addMenu.world.x - NODE_W / 2, addMenu.world.y - 20);
            onUpdateFn({ ...fn, nodes: [...fn.nodes, node] });
            setAddMenu(null);
            onSelectNode(new Set([node.id]));
          }}
          onUpdate={(s) => setAddMenu(s)}
        />
      )}
    </>
  );
}
