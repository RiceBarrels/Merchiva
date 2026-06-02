// Right-side panels: Code, Tests, Console, Inspector

const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

function CodePanel({ fn, allFns }) {
  const gen = useMemo2(() => generateCode(fn, allFns), [fn, allFns]);
  function copyOne() {
    navigator.clipboard?.writeText(gen.code);
  }
  function copyAll() {
    navigator.clipboard?.writeText(generateAllCode(allFns));
  }
  function exportFile() {
    const blob = new Blob([generateAllCode(allFns)], { type:'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'flowfn.js';
    a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }
  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <div className="pane-section" style={{borderBottom:'1px solid var(--border)'}}>
        <div className="label">
          <span>Generated JS</span>
          <span style={{display:'flex', gap:4}}>
            <button className="btn xs ghost" onClick={copyOne} title="Copy this function"><Icon name="copy" size={12} /> Copy</button>
            <button className="btn xs ghost" onClick={copyAll} title="Copy all functions">All</button>
            <button className="btn xs ghost" onClick={exportFile} title="Download .js"><Icon name="download" size={12} /></button>
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--stone-500)' }}>
          {gen.isAsync ? 'async ' : ''}{gen.fnName}({gen.paramList.map(p=>p.name).join(', ')})
        </div>
      </div>
      <div className="tab-body" style={{flex:1}}>
        <pre dangerouslySetInnerHTML={{ __html: highlightJs(gen.code) }} />
      </div>
    </div>
  );
}

function TestsPanel({ fn, allFns, onLog, onUpdateFn, onRunSingle, lastRun }) {
  const tests = fn.tests || [];
  const [running, setRunning] = useState2(null);
  const [results, setResults] = useState2({});

  function addTest() {
    const ns = fn.nodes.filter(n => n.type === 'param');
    const args = ns.map(()=> '');
    onUpdateFn({ ...fn, tests: [...tests, { args, expect: '' }] });
  }
  function updateTest(i, patch) {
    const next = tests.map((t, idx)=> idx===i ? { ...t, ...patch } : t);
    onUpdateFn({ ...fn, tests: next });
  }
  function removeTest(i) {
    onUpdateFn({ ...fn, tests: tests.filter((_,idx)=> idx!==i) });
  }

  async function runOne(i) {
    setRunning(i);
    const t = tests[i];
    const res = await executeFunction(fn, t.args, allFns);
    let pass = false, msg = '';
    if (res.ok) {
      let exp;
      try { exp = JSON.parse(t.expect); }
      catch { exp = t.expect; }
      pass = JSON.stringify(res.result) === JSON.stringify(exp);
      msg = pass ? 'pass' : `expected ${JSON.stringify(exp)}, got ${JSON.stringify(res.result)}`;
    } else {
      pass = false; msg = res.error;
    }
    setResults(r => ({ ...r, [i]: { pass, msg, result: res.result, logs: res.logs } }));
    setRunning(null);
    onLog(pass ? 'ok' : 'err', `Test ${i+1}: ${msg}`);
  }
  async function runAll() {
    for (let i=0; i<tests.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(i);
    }
  }

  const params = fn.nodes.filter(n=>n.type==='param').sort((a,b)=> (a.y - b.y) || (a.x - b.x));

  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <div className="pane-section">
        <div className="label">
          <span>Test cases · {tests.length}</span>
          <span style={{display:'flex', gap:4}}>
            <button className="btn xs ghost" onClick={addTest}><Icon name="plus" size={12} /> Add</button>
            <button className="btn xs primary" disabled={!tests.length} onClick={runAll}><Icon name="play" size={12} /> Run all</button>
          </span>
        </div>
        <div style={{fontSize:11, color:'var(--stone-500)'}}>Args are JSON. Expected is JSON.</div>
      </div>
      <div style={{flex:1, overflow:'auto'}}>
        {tests.length === 0 && (
          <div className="empty">
            <Icon name="test" size={28} />
            <div>No test cases yet</div>
            <button className="btn sm outline" onClick={addTest}>Add a test</button>
          </div>
        )}
        {tests.map((t, i) => {
          const r = results[i];
          const status = running === i ? 'idle' : r ? (r.pass ? 'pass' : 'fail') : 'idle';
          const statusLabel = running === i ? 'running' : r ? (r.pass ? 'pass' : 'fail') : 'idle';
          return (
            <div key={i} className="test-form">
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2}}>
                <div style={{fontSize:11, fontWeight:600, color:'var(--stone-700)'}}>Test {i+1}</div>
                <div style={{display:'flex', gap:6, alignItems:'center'}}>
                  <span className={`status ${status}`}>{statusLabel}</span>
                  <button className="btn icon sm ghost" title="Run" onClick={()=>runOne(i)}><Icon name="play" size={12} /></button>
                  <button className="btn icon sm ghost" title="Delete" onClick={()=>removeTest(i)}><Icon name="trash" size={12} /></button>
                </div>
              </div>
              {params.length === 0 && (
                <div style={{fontSize:11, color:'var(--stone-500)'}}>Function has no parameters.</div>
              )}
              {params.map((p, pi) => (
                <div className="row" key={p.id}>
                  <div style={{fontSize:11, color:'var(--stone-600)', display:'flex', alignItems:'center', gap:6}}>
                    <span className="mono" style={{fontSize:11}}>{p.data.name||'arg'}</span>
                    <span style={{color:'var(--stone-400)', fontSize:10}}>: {p.data.type||'any'}</span>
                  </div>
                  <input
                    className="input"
                    placeholder="JSON"
                    value={t.args[pi] ?? ''}
                    onChange={(e)=> {
                      const args = [...t.args];
                      args[pi] = e.target.value;
                      updateTest(i, { args });
                    }}
                  />
                  <span></span>
                </div>
              ))}
              <div className="row">
                <div style={{fontSize:11, color:'var(--stone-600)'}}>Expected</div>
                <input
                  className="input"
                  placeholder="JSON e.g. 42"
                  value={t.expect||''}
                  onChange={(e)=> updateTest(i, { expect: e.target.value })}
                />
                <span></span>
              </div>
              {r && !r.pass && (
                <div style={{fontSize:11, color:'var(--destructive)', fontFamily:'Geist Mono, monospace'}}>{r.msg}</div>
              )}
              {r && r.pass && (
                <div style={{fontSize:11, color:'var(--emerald-600)', fontFamily:'Geist Mono, monospace'}}>= {JSON.stringify(r.result)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConsolePanel({ logs, onClear }) {
  const ref = React.useRef(null);
  useEffect2(()=> {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);
  return (
    <div style={{display:'flex', flexDirection:'column', flex:1, minHeight:0}}>
      <div className="pane-section">
        <div className="label">
          <span>Run output</span>
          <button className="btn xs ghost" onClick={onClear}><Icon name="refresh" size={12} /> Clear</button>
        </div>
      </div>
      <div ref={ref} className="console" style={{flex:1, overflow:'auto'}}>
        {logs.length === 0 && (
          <div style={{color:'var(--stone-400)'}}>Run the function to see output here…</div>
        )}
        {logs.map((l, i) => (
          <div className="row" key={i}>
            <span className="ts">{l.ts}</span>
            <span className={`lvl ${l.level}`}>{l.level}</span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CodePanel, TestsPanel, ConsolePanel });
