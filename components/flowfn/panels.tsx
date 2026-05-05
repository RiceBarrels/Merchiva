"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { FlowIcon } from "./icons";
import { generateCode, generateAllCode, executeFunction, highlightJs } from "./codegen";
import type { FlowFunction, LogEntry } from "./types";

export function CodePanel({ fn, allFns }: { fn: FlowFunction; allFns: FlowFunction[] }) {
  const gen = useMemo(() => generateCode(fn, allFns), [fn, allFns]);

  function copyOne() { navigator.clipboard?.writeText(gen.code); }
  function copyAll() { navigator.clipboard?.writeText(generateAllCode(allFns)); }
  function exportFile() {
    const blob = new Blob([generateAllCode(allFns)], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowfn.js";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="ffn-pane-section" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="ffn-label">
          <span>Generated JS</span>
          <span style={{ display: "flex", gap: 4 }}>
            <button className="ffn-btn xs ghost" onClick={copyOne} title="Copy this function"><FlowIcon name="copy" size={12} /> Copy</button>
            <button className="ffn-btn xs ghost" onClick={copyAll} title="Copy all functions">All</button>
            <button className="ffn-btn xs ghost" onClick={exportFile} title="Download .js"><FlowIcon name="download" size={12} /></button>
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {gen.isAsync ? "async " : ""}{gen.fnName}({gen.paramList.map((p) => p.name).join(", ")})
        </div>
      </div>
      <div className="ffn-tab-body" style={{ flex: 1 }}>
        <pre className="ffn-code-pre" dangerouslySetInnerHTML={{ __html: highlightJs(gen.code) }} />
      </div>
    </div>
  );
}

export function TestsPanel({ fn, allFns, onLog, onUpdateFn }: {
  fn: FlowFunction;
  allFns: FlowFunction[];
  onLog: (level: "info" | "ok" | "err" | "warn", msg: string) => void;
  onUpdateFn: (fn: FlowFunction) => void;
}) {
  const tests = fn.tests || [];
  const [running, setRunning] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, { pass: boolean; msg: string; result: unknown }>>({});

  function addTest() {
    const ns = fn.nodes.filter((n) => n.type === "param");
    const args = ns.map(() => "");
    onUpdateFn({ ...fn, tests: [...tests, { args, expect: "" }] });
  }

  function updateTest(i: number, patch: Partial<{ args: string[]; expect: string }>) {
    const next = tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    onUpdateFn({ ...fn, tests: next });
  }

  function removeTest(i: number) {
    onUpdateFn({ ...fn, tests: tests.filter((_, idx) => idx !== i) });
  }

  async function runOne(i: number) {
    setRunning(i);
    const t = tests[i];
    const res = await executeFunction(fn, t.args, allFns);
    let pass = false, msg = "";
    if (res.ok) {
      let exp: unknown;
      try { exp = JSON.parse(t.expect); }
      catch { exp = t.expect; }
      pass = JSON.stringify(res.result) === JSON.stringify(exp);
      msg = pass ? "pass" : `expected ${JSON.stringify(exp)}, got ${JSON.stringify(res.result)}`;
    } else {
      pass = false;
      msg = res.error || "unknown error";
    }
    setResults((r) => ({ ...r, [i]: { pass, msg, result: res.result } }));
    setRunning(null);
    onLog(pass ? "ok" : "err", `Test ${i + 1}: ${msg}`);
  }

  async function runAll() {
    for (let i = 0; i < tests.length; i++) {
      await runOne(i);
    }
  }

  const params = fn.nodes.filter((n) => n.type === "param").sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="ffn-pane-section">
        <div className="ffn-label">
          <span>Test cases · {tests.length}</span>
          <span style={{ display: "flex", gap: 4 }}>
            <button className="ffn-btn xs ghost" onClick={addTest}><FlowIcon name="plus" size={12} /> Add</button>
            <button className="ffn-btn xs primary" disabled={!tests.length} onClick={runAll}><FlowIcon name="play" size={12} /> Run all</button>
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Args are JSON. Expected is JSON.</div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {tests.length === 0 && (
          <div className="ffn-empty">
            <FlowIcon name="test" size={28} />
            <div>No test cases yet</div>
            <button className="ffn-btn sm outline" onClick={addTest}>Add a test</button>
          </div>
        )}
        {tests.map((t, i) => {
          const r = results[i];
          const status = running === i ? "idle" : r ? (r.pass ? "pass" : "fail") : "idle";
          const statusLabel = running === i ? "running" : r ? (r.pass ? "pass" : "fail") : "idle";
          return (
            <div key={i} className="ffn-test-form">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>Test {i + 1}</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`ffn-test-status ${status}`}>{statusLabel}</span>
                  <button className="ffn-btn icon sm ghost" title="Run" onClick={() => runOne(i)}><FlowIcon name="play" size={12} /></button>
                  <button className="ffn-btn icon sm ghost" title="Delete" onClick={() => removeTest(i)}><FlowIcon name="trash" size={12} /></button>
                </div>
              </div>
              {params.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Function has no parameters.</div>
              )}
              {params.map((p, pi) => (
                <div className="ffn-test-row" key={p.id}>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="font-mono" style={{ fontSize: 11 }}>{(p.data.name as string) || "arg"}</span>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 10 }}>: {(p.data.type as string) || "any"}</span>
                  </div>
                  <input
                    className="ffn-input"
                    placeholder="JSON"
                    value={t.args[pi] ?? ""}
                    onChange={(e) => {
                      const args = [...t.args];
                      args[pi] = e.target.value;
                      updateTest(i, { args });
                    }}
                  />
                  <span></span>
                </div>
              ))}
              <div className="ffn-test-row">
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Expected</div>
                <input
                  className="ffn-input"
                  placeholder="JSON e.g. 42"
                  value={t.expect || ""}
                  onChange={(e) => updateTest(i, { expect: e.target.value })}
                />
                <span></span>
              </div>
              {r && !r.pass && (
                <div style={{ fontSize: 11, color: "var(--destructive)", fontFamily: "var(--font-mono)" }}>{r.msg}</div>
              )}
              {r && r.pass && (
                <div style={{ fontSize: 11, color: "oklch(0.596 0.145 163.225)", fontFamily: "var(--font-mono)" }}>= {JSON.stringify(r.result)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConsolePanel({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div className="ffn-pane-section">
        <div className="ffn-label">
          <span>Run output</span>
          <button className="ffn-btn xs ghost" onClick={onClear}><FlowIcon name="refresh" size={12} /> Clear</button>
        </div>
      </div>
      <div ref={ref} className="ffn-console" style={{ flex: 1, overflow: "auto" }}>
        {logs.length === 0 && (
          <div style={{ color: "var(--muted-foreground)" }}>Run the function to see output here...</div>
        )}
        {logs.map((l, i) => (
          <div className="ffn-console-row" key={i}>
            <span className="ffn-console-ts">{l.ts}</span>
            <span className={`ffn-console-lvl ${l.level}`}>{l.level}</span>
            <span className="ffn-console-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
