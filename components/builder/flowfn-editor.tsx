"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FlowIcon } from "@/components/flowfn/icons";
import { Canvas } from "@/components/flowfn/canvas";
import { CodePanel, TestsPanel, ConsolePanel } from "@/components/flowfn/panels";
import { makeNode, safeIdent, NODE_LIB } from "@/components/flowfn/node-lib";
import { executeFunction, formatPreview } from "@/components/flowfn/codegen";
import { seedFunctions } from "@/components/flowfn/seed";
import { saveFunction, updateFunction, deleteFunction } from "@/lib/spacetimedb/actions";
import type { FlowFunction, LogEntry, NodeResult } from "@/components/flowfn/types";

interface FlowFnEditorProps {
  siteId?: string;
}

export function FlowFnEditor({ siteId }: FlowFnEditorProps) {
  const [fns, setFns] = useState<FlowFunction[]>(() => {
    if (typeof window === "undefined") return seedFunctions();
    try {
      const saved = localStorage.getItem("flowfn:fns");
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return seedFunctions();
  });
  const [activeId, setActiveId] = useState(() => fns[0]?.id);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"code" | "tests" | "console">("code");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<Record<string, NodeResult>>({});
  const [executingNodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [editingFnName, setEditingFnName] = useState<string | null>(null);
  const syncedFromDb = useRef(false);

  // Load from localStorage on mount (SpacetimeDB siteFunction table removed)
  const _syncedFromDb = syncedFromDb;

  // Write-through to localStorage (for runtime trigger execution)
  useEffect(() => {
    localStorage.setItem("flowfn:fns", JSON.stringify(fns));
  }, [fns]);

  // Listen for external function additions (from AI)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "flowfn:fns" && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as FlowFunction[];
          if (updated.length !== fns.length || updated.some((f, i) => f.id !== fns[i]?.id)) {
            setFns(updated);
            if (!updated.find((f) => f.id === activeId) && updated.length) {
              setActiveId(updated[updated.length - 1].id);
            }
          }
        } catch { /* ignore */ }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fns, activeId]);

  // Persist to localStorage (SpacetimeDB siteFunction table removed)
  useEffect(() => {
    localStorage.setItem("flowfn:fns", JSON.stringify(fns));
  }, [fns]);

  const activeFn = fns.find((f) => f.id === activeId) || fns[0];

  const pushLog = useCallback((level: LogEntry["level"], msg: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((l) => [...l, { ts, level, msg }].slice(-200));
  }, []);

  function updateActiveFn(next: FlowFunction) {
    setFns((fs) => fs.map((f) => (f.id === activeFn.id ? next : f)));
  }

  function newFunction() {
    const id = "fn_" + Math.random().toString(36).slice(2, 8);
    const param = makeNode("param", 80, 100);
    const ret = makeNode("return", 480, 100);
    const fn: FlowFunction = { id, name: "newFunction", desc: "", nodes: [param, ret], edges: [], tests: [] };
    setFns((fs) => [...fs, fn]);
    setActiveId(id);
    setEditingFnName(id);
  }

  function deleteFunction(id: string) {
    if (fns.length <= 1) { pushLog("warn", "Need at least one function"); return; }
    const newFns = fns.filter((f) => f.id !== id);
    setFns(newFns);
    if (activeId === id) setActiveId(newFns[0].id);
  }

  function duplicateFunction(id: string) {
    const f = fns.find((x) => x.id === id);
    if (!f) return;
    const newId = "fn_" + Math.random().toString(36).slice(2, 8);
    const idMap: Record<string, string> = {};
    const newNodes = f.nodes.map((n) => { const nid = "n_" + Math.random().toString(36).slice(2, 9); idMap[n.id] = nid; return { ...n, id: nid }; });
    const newEdges = f.edges.map((e) => ({ from: { node: idMap[e.from.node], port: e.from.port }, to: { node: idMap[e.to.node], port: e.to.port } }));
    setFns((fs) => [...fs, { ...f, id: newId, name: f.name + "Copy", nodes: newNodes, edges: newEdges }]);
    setActiveId(newId);
  }

  async function runFn() {
    pushLog("info", `Running ${activeFn.name}...`);
    const params = activeFn.nodes.filter((n) => n.type === "param").sort((a, b) => a.y - b.y);
    const args: string[] = params.map((p) => {
      if (p.data.type === "number") return "0";
      if (p.data.type === "string") return '""';
      if (p.data.type === "bool") return "false";
      if (p.data.type === "array") return "[]";
      if (p.data.type === "object") return "{}";
      return "null";
    });
    if (activeFn.tests?.[0]) {
      activeFn.tests[0].args.forEach((a, i) => { if (a) args[i] = a; });
    }
    setResults({});
    const exec = await executeFunction(activeFn, args, fns);
    if (exec.ok) pushLog("ok", `-> ${formatPreview(exec.result)}`);
    else pushLog("err", exec.error || "unknown error");
    exec.logs.forEach((l) => pushLog("info", `${l.label ? l.label + ": " : ""}${formatPreview(l.value)}`));
    await computeNodeResults(activeFn, fns, args);
  }

  async function computeNodeResults(fn: FlowFunction, allFns: FlowFunction[], args: string[]) {
    const out: Record<string, NodeResult> = {};
    for (const n of fn.nodes) {
      const def = NODE_LIB[n.type];
      if (!def || !def.outputs?.length) continue;
      try {
        const testFn: FlowFunction = {
          id: "preview", name: "__preview", desc: "",
          nodes: [...fn.nodes, { id: "__preview_ret", type: "return", x: 0, y: 0, data: {} }],
          edges: [
            ...fn.edges.filter((e) => e.to.node !== "__preview_ret"),
            { from: { node: n.id, port: def.outputs[0].id }, to: { node: "__preview_ret", port: "value" } },
          ],
          tests: [],
        };
        const res = await executeFunction(testFn, args, allFns);
        if (res.ok) out[n.id] = { value: res.result };
        else out[n.id] = { err: res.error };
      } catch (err) {
        out[n.id] = { err: err instanceof Error ? err.message : String(err) };
      }
    }
    setResults(out);
  }

  const filteredFns = fns.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{flowfnStyles}</style>
      <div className="ffn-app">
        {/* Sidebar */}
        <div className="ffn-sidebar">
          <div className="ffn-sb-search">
            <FlowIcon name="search" size={14} style={{ color: "var(--muted-foreground)" }} />
            <input placeholder="Search functions" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="ffn-sb-section">
            <span>Functions</span>
            <button className="ffn-btn icon sm ghost" title="New" onClick={newFunction}><FlowIcon name="plus" size={12} /></button>
          </div>
          <div className="ffn-sb-list" style={{ overflow: "auto", flex: 1 }}>
            {filteredFns.map((f) => {
              const isActive = f.id === activeId;
              const isEditing = editingFnName === f.id;
              return (
                <div
                  key={f.id}
                  className={`ffn-sb-item ${isActive ? "active" : ""}`}
                  onClick={() => { setActiveId(f.id); setSelectedNodeIds(new Set()); setResults({}); }}
                  onDoubleClick={() => setEditingFnName(f.id)}
                >
                  <FlowIcon name="fn" size={16} />
                  {isEditing ? (
                    <input
                      autoFocus
                      className="font-mono"
                      style={{ flex: 1, background: "transparent", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 4px", fontSize: 12, color: "inherit" }}
                      defaultValue={f.name}
                      onBlur={(e) => { setFns((fs) => fs.map((x) => x.id === f.id ? { ...x, name: safeIdent(e.target.value) || x.name } : x)); setEditingFnName(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingFnName(null); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="font-mono" style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                  )}
                  <span className="meta">{f.nodes.length}n</span>
                  {isActive && !isEditing && (
                    <>
                      <button className="ffn-btn icon sm ghost" style={{ color: "inherit", height: 20, width: 20 }} title="Rename" onClick={(e) => { e.stopPropagation(); setEditingFnName(f.id); }}><FlowIcon name="refresh" size={12} /></button>
                      <button className="ffn-btn icon sm ghost" style={{ color: "inherit", height: 20, width: 20 }} title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateFunction(f.id); }}><FlowIcon name="copy" size={12} /></button>
                      <button className="ffn-btn icon sm ghost" style={{ color: "inherit", height: 20, width: 20 }} title="Delete" onClick={(e) => { e.stopPropagation(); deleteFunction(f.id); }}><FlowIcon name="trash" size={12} /></button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="ffn-sb-divider" />
          <div style={{ padding: "4px 14px 14px", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
            <div><span className="ffn-kbd">/</span> Add node</div>
            <div><span className="ffn-kbd">2x click</span> Add here</div>
            <div><span className="ffn-kbd">drag port</span> Connect</div>
            <div><span className="ffn-kbd">Del</span> Delete</div>
          </div>
          <div className="ffn-sb-divider" />
          <button className="ffn-btn run" style={{ margin: "8px" }} onClick={runFn}>
            <FlowIcon name="play" size={14} /> Run
          </button>
        </div>

        {/* Canvas */}
        <div className="ffn-canvas-pane">
          {activeFn && (
            <Canvas fn={activeFn} allFns={fns} onUpdateFn={updateActiveFn} results={results} executingNodes={executingNodes} onSelectNode={setSelectedNodeIds} selectedNodeIds={selectedNodeIds} onLog={pushLog} />
          )}
        </div>

        {/* Right pane */}
        <div className="ffn-right-pane">
          <div className="ffn-tabs">
            <button className={`ffn-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>
              <FlowIcon name="code" size={14} /> Code
            </button>
            <button className={`ffn-tab ${tab === "tests" ? "active" : ""}`} onClick={() => setTab("tests")}>
              <FlowIcon name="test" size={14} /> Tests
              {activeFn?.tests?.length ? <span className="ffn-badge">{activeFn.tests.length}</span> : null}
            </button>
            <button className={`ffn-tab ${tab === "console" ? "active" : ""}`} onClick={() => setTab("console")}>
              <FlowIcon name="log" size={14} /> Console
              {logs.length ? <span className="ffn-badge">{logs.length}</span> : null}
            </button>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {tab === "code" && activeFn && <CodePanel fn={activeFn} allFns={fns} />}
            {tab === "tests" && activeFn && <TestsPanel fn={activeFn} allFns={fns} onLog={pushLog} onUpdateFn={updateActiveFn} />}
            {tab === "console" && <ConsolePanel logs={logs} onClear={() => setLogs([])} />}
          </div>
        </div>
      </div>
    </>
  );
}

const flowfnStyles = `
  :root {
    --ffn-t-number: oklch(0.55 0.06 230);
    --ffn-t-string: oklch(0.6 0.07 145);
    --ffn-t-bool: oklch(0.62 0.12 35);
    --ffn-t-any: oklch(0.55 0 0);
    --ffn-t-array: oklch(0.55 0.07 290);
    --ffn-t-object: oklch(0.6 0.06 80);
    --ffn-t-flow: oklch(0.3 0 0);
    --stone-50: oklch(0.985 0 0);
    --stone-100: oklch(0.97 0 0);
    --stone-200: oklch(0.922 0 0);
    --stone-300: oklch(0.87 0 0);
    --stone-400: oklch(0.708 0 0);
    --stone-500: oklch(0.556 0 0);
    --stone-600: oklch(0.439 0 0);
    --stone-700: oklch(0.371 0 0);
    --stone-800: oklch(0.269 0 0);
    --stone-900: oklch(0.205 0 0);
    --emerald-500: oklch(0.696 0.17 162.48);
    --emerald-600: oklch(0.596 0.145 163.225);
  }
  .ffn-app { display: grid; grid-template-columns: 200px 1fr 280px; height: 100%; overflow: hidden; }
  .ffn-sidebar { border-right: 1px solid var(--border); background: var(--background); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .ffn-sb-search { margin: 6px 6px 4px; height: 26px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); display: flex; align-items: center; padding: 0 6px; gap: 4px; }
  .ffn-sb-search input { border: 0; outline: 0; background: transparent; flex: 1; font-size: 11px; font: inherit; color: inherit; }
  .ffn-sb-section { padding: 8px 8px 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); display: flex; justify-content: space-between; align-items: center; }
  .ffn-sb-list { display: flex; flex-direction: column; padding: 0 4px; gap: 1px; }
  .ffn-sb-item { display: flex; align-items: center; gap: 6px; padding: 5px 6px; font-size: 12px; color: var(--muted-foreground); border-radius: var(--radius); cursor: pointer; transition: background 120ms; border: 1px solid transparent; }
  .ffn-sb-item:hover { background: var(--accent); color: var(--foreground); }
  .ffn-sb-item.active { background: var(--primary); color: var(--primary-foreground); }
  .ffn-sb-item .meta { margin-left: auto; font-size: 10px; opacity: 0.6; }
  .ffn-sb-divider { height: 1px; background: var(--border); margin: 6px 4px; }
  .ffn-kbd { display: inline-block; padding: 0 4px; height: 16px; line-height: 15px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 3px; background: var(--muted); font-size: 10px; font-family: var(--font-mono); color: var(--muted-foreground); }
  .ffn-btn { height: 26px; padding: 0 8px; font-size: 12px; font-weight: 500; border: 1px solid transparent; border-radius: var(--radius); background: transparent; display: inline-flex; align-items: center; gap: 5px; transition: background 160ms; white-space: nowrap; cursor: pointer; font: inherit; color: inherit; }
  .ffn-btn:hover { background: var(--accent); }
  .ffn-btn.primary { background: var(--primary); color: var(--primary-foreground); }
  .ffn-btn.primary:hover { opacity: 0.9; }
  .ffn-btn.outline { border-color: var(--border); background: var(--background); }
  .ffn-btn.ghost { background: transparent; }
  .ffn-btn.sm { height: 22px; padding: 0 6px; font-size: 11px; }
  .ffn-btn.xs { height: 20px; padding: 0 5px; font-size: 10px; }
  .ffn-btn.icon { width: 26px; padding: 0; justify-content: center; }
  .ffn-btn.icon.sm { width: 22px; }
  .ffn-btn.run { background: var(--primary); color: var(--primary-foreground); padding: 0 12px; }
  .ffn-btn.run:hover { opacity: 0.9; }
  .ffn-btn:disabled { opacity: 0.5; pointer-events: none; }
  .ffn-canvas-pane { position: relative; background: radial-gradient(circle at 1px 1px, oklch(0.88 0 0) 1px, transparent 1px) 0 0 / 18px 18px, var(--background); overflow: hidden; }
  .ffn-canvas-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
  .ffn-canvas-stage.panning { cursor: grabbing; }
  .ffn-canvas-world { position: absolute; left: 0; top: 0; width: 1px; height: 1px; transform-origin: 0 0; }
  .ffn-canvas-toolbar { position: absolute; top: 8px; left: 8px; display: flex; gap: 3px; background: var(--background); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px; z-index: 6; }
  .ffn-canvas-toolbar .ffn-btn { height: 24px; }
  .ffn-canvas-zoom { position: absolute; bottom: 8px; left: 8px; display: flex; gap: 3px; background: var(--background); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px; z-index: 6; }
  .ffn-zlabel { font-size: 10px; color: var(--muted-foreground); font-family: var(--font-mono); padding: 0 6px; align-self: center; }
  .ffn-wires-svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
  .ffn-wire { fill: none; stroke-width: 2; pointer-events: stroke; cursor: pointer; }
  .ffn-wire-hit { fill: none; stroke: transparent; stroke-width: 12; pointer-events: stroke; cursor: pointer; }
  .ffn-node { position: absolute; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); width: 200px; box-shadow: 0 0 0 1px transparent; transition: border-color 140ms, box-shadow 140ms; user-select: none; }
  .ffn-node:hover { border-color: var(--stone-400); }
  .ffn-node.selected { border-color: var(--foreground); box-shadow: 0 0 0 1px var(--foreground); }
  .ffn-node.error { border-color: var(--destructive); }
  .ffn-node.executing { border-color: var(--emerald-600); box-shadow: 0 0 0 1px var(--emerald-600); }
  .ffn-node-header { display: flex; align-items: center; gap: 5px; padding: 5px 7px; border-bottom: 1px solid var(--border); cursor: grab; background: var(--muted); border-radius: var(--radius) var(--radius) 0 0; }
  .ffn-node-icon { width: 16px; height: 16px; flex-shrink: 0; display: grid; place-items: center; border-radius: 3px; background: var(--stone-200); color: var(--stone-700); }
  .ffn-node-icon.input { background: oklch(0.92 0.04 230); color: oklch(0.4 0.08 230); }
  .ffn-node-icon.output { background: oklch(0.92 0.04 35); color: oklch(0.4 0.1 35); }
  .ffn-node-icon.logic { background: oklch(0.92 0.04 80); color: oklch(0.4 0.1 80); }
  .ffn-node-icon.data { background: oklch(0.92 0.04 290); color: oklch(0.4 0.1 290); }
  .ffn-node-icon.io { background: oklch(0.92 0.04 145); color: oklch(0.4 0.08 145); }
  .ffn-node-title { font-size: 11px; font-weight: 600; flex: 1; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ffn-node-body { padding: 5px 0; display: flex; flex-direction: column; gap: 3px; }
  .ffn-node-row { display: flex; align-items: center; min-height: 20px; position: relative; font-size: 11px; }
  .ffn-node-row.in { padding-left: 7px; padding-right: 7px; }
  .ffn-node-row.out { justify-content: flex-end; padding-left: 7px; padding-right: 7px; }
  .ffn-node-row.body { padding: 3px 7px; }
  .ffn-port { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--background); background: var(--stone-400); position: absolute; top: 50%; transform: translateY(-50%); cursor: crosshair; transition: transform 100ms, box-shadow 100ms; box-sizing: border-box; box-shadow: 0 0 0 1px var(--stone-400); }
  .ffn-port:hover, .ffn-port.targetable { transform: translateY(-50%) scale(1.3); box-shadow: 0 0 0 2px var(--foreground); }
  .ffn-port.in { left: -5px; }
  .ffn-port.out { right: -5px; }
  .ffn-port.number { background: var(--ffn-t-number); box-shadow: 0 0 0 1px var(--ffn-t-number); }
  .ffn-port.string { background: var(--ffn-t-string); box-shadow: 0 0 0 1px var(--ffn-t-string); }
  .ffn-port.bool { background: var(--ffn-t-bool); box-shadow: 0 0 0 1px var(--ffn-t-bool); }
  .ffn-port.any { background: var(--ffn-t-any); box-shadow: 0 0 0 1px var(--ffn-t-any); }
  .ffn-port.array { background: var(--ffn-t-array); box-shadow: 0 0 0 1px var(--ffn-t-array); }
  .ffn-port.object { background: var(--ffn-t-object); box-shadow: 0 0 0 1px var(--ffn-t-object); }
  .ffn-port-label { color: var(--muted-foreground); font-size: 10px; margin: 0 3px; }
  .ffn-port-label.r { margin-left: auto; }
  .ffn-node-input, .ffn-node-select { background: var(--background); border: 1px solid var(--input); border-radius: 3px; height: 20px; font-size: 10.5px; padding: 0 5px; width: 100%; outline: none; font-family: var(--font-mono); font: inherit; color: inherit; }
  .ffn-node-input:focus, .ffn-node-select:focus { border-color: var(--ring); box-shadow: 0 0 0 2px oklch(0.708 0 0 / 0.3); }
  .ffn-node-result { margin: 3px 7px 5px; padding: 3px 5px; background: var(--muted); border: 1px solid var(--border); border-radius: 3px; font-family: var(--font-mono); font-size: 10px; color: var(--muted-foreground); max-height: 50px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .ffn-node-result.err { color: var(--destructive); border-color: oklch(0.577 0.245 27.325 / 0.3); background: oklch(0.577 0.245 27.325 / 0.06); }
  .ffn-right-pane { border-left: 1px solid var(--border); background: var(--background); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .ffn-tabs { display: flex; border-bottom: 1px solid var(--border); }
  .ffn-tab { flex: 1; height: 32px; background: transparent; border: 0; border-bottom: 2px solid transparent; font-size: 11px; font-weight: 500; color: var(--muted-foreground); display: flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; font: inherit; }
  .ffn-tab:hover { color: var(--foreground); background: var(--muted); }
  .ffn-tab.active { color: var(--foreground); border-bottom-color: var(--foreground); }
  .ffn-badge { height: 14px; padding: 0 4px; border-radius: 3px; background: var(--muted); color: var(--muted-foreground); font-size: 9px; font-weight: 600; display: inline-flex; align-items: center; }
  .ffn-tab.active .ffn-badge { background: var(--primary); color: var(--primary-foreground); }
  .ffn-pane-section { padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .ffn-label { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
  .ffn-tab-body { flex: 1; overflow: auto; }
  .ffn-code-pre { margin: 0; padding: 10px; font-family: var(--font-mono); font-size: 11px; line-height: 1.5; color: var(--foreground); white-space: pre; }
  .ffn-kw { color: oklch(0.45 0.16 290); font-weight: 600; }
  .ffn-str { color: oklch(0.5 0.13 145); }
  .ffn-num { color: oklch(0.5 0.13 230); }
  .ffn-com { color: var(--muted-foreground); font-style: italic; }
  .ffn-fn { color: oklch(0.45 0.13 35); }
  .ffn-console { padding: 8px 10px; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.5; }
  .ffn-console-row { display: flex; gap: 6px; padding: 2px 0; border-bottom: 1px dashed var(--border); }
  .ffn-console-row:last-child { border-bottom: 0; }
  .ffn-console-ts { color: var(--muted-foreground); width: 50px; flex-shrink: 0; }
  .ffn-console-lvl { width: 40px; flex-shrink: 0; }
  .ffn-console-lvl.info { color: var(--muted-foreground); }
  .ffn-console-lvl.ok { color: var(--emerald-600); }
  .ffn-console-lvl.err { color: var(--destructive); }
  .ffn-console-lvl.warn { color: oklch(0.666 0.179 58.318); }
  .ffn-console-msg { flex: 1; color: var(--foreground); white-space: pre-wrap; word-break: break-word; }
  .ffn-test-form { padding: 8px 10px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 5px; }
  .ffn-test-row { display: grid; grid-template-columns: 1fr 1fr 24px; gap: 5px; align-items: center; }
  .ffn-test-status { font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
  .ffn-test-status.pass { background: oklch(0.696 0.17 162.48 / 0.15); color: var(--emerald-600); }
  .ffn-test-status.fail { background: oklch(0.577 0.245 27.325 / 0.12); color: var(--destructive); }
  .ffn-test-status.idle { background: var(--muted); color: var(--muted-foreground); }
  .ffn-input { height: 24px; border: 1px solid var(--input); border-radius: 3px; padding: 0 5px; font-size: 11px; font-family: var(--font-mono); background: var(--background); outline: none; width: 100%; font: inherit; color: inherit; }
  .ffn-input:focus { border-color: var(--ring); box-shadow: 0 0 0 2px oklch(0.708 0 0 / 0.3); }
  .ffn-add-menu { position: absolute; z-index: 20; background: var(--background); border: 1px solid var(--border); border-radius: var(--radius); width: 260px; max-height: 380px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 4px 12px oklch(0 0 0 / 0.08); }
  .ffn-add-search { border-bottom: 1px solid var(--border); padding: 6px; display: flex; align-items: center; gap: 5px; }
  .ffn-add-search input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 12px; font: inherit; color: inherit; }
  .ffn-add-list { overflow: auto; flex: 1; padding: 3px; }
  .ffn-add-group { padding: 6px 6px 3px; font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); }
  .ffn-add-item { padding: 5px 6px; border-radius: var(--radius); display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
  .ffn-add-item:hover, .ffn-add-item.kbd-active { background: var(--accent); }
  .ffn-add-desc { color: var(--muted-foreground); font-size: 10px; margin-left: auto; }
  .ffn-add-ic { width: 16px; height: 16px; display: grid; place-items: center; border-radius: 3px; background: var(--muted); color: var(--muted-foreground); font-size: 10px; }
  .ffn-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px 14px; color: var(--muted-foreground); font-size: 11px; text-align: center; }
`;
