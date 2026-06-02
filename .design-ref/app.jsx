// Main app: shell + state.

const { useState: useStateApp, useEffect: useEffectApp, useMemo: useMemoApp, useRef: useRefApp } = React;

function App() {
  const [fns, setFns] = useStateApp(() => {
    try {
      const saved = localStorage.getItem('flowfn:fns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return seedFunctions();
  });
  const [activeId, setActiveId] = useStateApp(() => fns[0]?.id);
  const [selectedNodeIds, setSelectedNodeIds] = useStateApp(new Set());
  const [tab, setTab] = useStateApp('code'); // code | tests | console
  const [logs, setLogs] = useStateApp([]);
  const [results, setResults] = useStateApp({}); // nodeId -> {value} | {err}
  const [executingNodes, setExecutingNodes] = useStateApp(new Set());
  const [search, setSearch] = useStateApp('');
  const [editingFnName, setEditingFnName] = useStateApp(null);

  // Persist
  useEffectApp(() => {
    localStorage.setItem('flowfn:fns', JSON.stringify(fns));
  }, [fns]);

  const activeFn = fns.find(f => f.id === activeId) || fns[0];

  function pushLog(level, msg) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(l => [...l, { ts, level, msg }].slice(-200));
  }

  function updateActiveFn(next) {
    setFns(fs => fs.map(f => f.id === activeFn.id ? next : f));
  }

  function newFunction() {
    const id = 'fn_' + Math.random().toString(36).slice(2,8);
    const param = makeNode('param', 80, 100);
    const ret = makeNode('return', 480, 100);
    const fn = {
      id, name: 'newFunction',
      desc: '',
      nodes: [param, ret],
      edges: [],
      tests: [],
    };
    setFns(fs => [...fs, fn]);
    setActiveId(id);
    setEditingFnName(id);
  }

  function deleteFunction(id) {
    if (fns.length <= 1) {
      pushLog('warn', 'Need at least one function');
      return;
    }
    if (!confirm('Delete this function?')) return;
    const newFns = fns.filter(f => f.id !== id);
    setFns(newFns);
    if (activeId === id) setActiveId(newFns[0].id);
  }

  function duplicateFunction(id) {
    const f = fns.find(x=>x.id===id);
    if (!f) return;
    const newId = 'fn_' + Math.random().toString(36).slice(2,8);
    // Reassign node ids so they don't conflict with original
    const idMap = {};
    const newNodes = f.nodes.map(n => {
      const nid = 'n_' + Math.random().toString(36).slice(2,9);
      idMap[n.id] = nid;
      return { ...n, id: nid };
    });
    const newEdges = f.edges.map(e => ({
      from: { node: idMap[e.from.node], port: e.from.port },
      to: { node: idMap[e.to.node], port: e.to.port },
    }));
    const newFn = {
      ...f, id: newId, name: f.name + 'Copy',
      nodes: newNodes, edges: newEdges,
    };
    setFns(fs => [...fs, newFn]);
    setActiveId(newId);
  }

  async function runFn() {
    pushLog('info', `Running ${activeFn.name}…`);
    // Build args from first test, else default.
    const params = activeFn.nodes.filter(n=>n.type==='param').sort((a,b)=> a.y - b.y);
    const args = params.map(p => {
      if (p.data.type === 'number') return '0';
      if (p.data.type === 'string') return '""';
      if (p.data.type === 'bool') return 'false';
      if (p.data.type === 'array') return '[]';
      if (p.data.type === 'object') return '{}';
      return 'null';
    });
    // Use first test if available
    if (activeFn.tests?.[0]) {
      const t = activeFn.tests[0];
      t.args.forEach((a, i) => { if (a) args[i] = a; });
    }
    setResults({});
    const exec = await executeFunction(activeFn, args, fns);
    if (exec.ok) {
      pushLog('ok', `→ ${formatPreview(exec.result)}`);
    } else {
      pushLog('err', exec.error);
    }
    exec.logs.forEach(l => pushLog('info', `${l.label ? l.label + ': ' : ''}${formatPreview(l.value)}`));
    // Compute per-node previews by running the node's expression in isolation
    await computeNodeResults(activeFn, fns, args, params);
  }

  async function computeNodeResults(fn, allFns, args, params) {
    const out = {};
    // Evaluate each node by generating a tiny wrapper that returns its expression.
    for (const n of fn.nodes) {
      const def = NODE_LIB[n.type];
      if (!def || !def.outputs?.length) continue;
      try {
        // Build a "mini-function" returning the expression for this node
        const testFn = {
          id: 'preview', name: '__preview',
          nodes: [...fn.nodes.filter(x=>x.type!=='return'), { ...n, _isPreview: true }, makePreviewReturn(n)],
          edges: [
            ...fn.edges.filter(e=> e.to.node !== '__preview_ret'),
            { from:{node:n.id, port: def.outputs[0].id}, to:{node:'__preview_ret', port:'value'} },
          ],
          tests: [],
        };
        // Re-use real param nodes
        testFn.nodes = fn.nodes.concat([{ id:'__preview_ret', type:'return', x:0, y:0, data:{} }]);
        testFn.edges = [
          ...fn.edges.filter(e => e.to.node !== '__preview_ret'),
          { from:{node:n.id, port: def.outputs[0].id}, to:{node:'__preview_ret', port:'value'} },
        ];
        const res = await executeFunction(testFn, args, allFns);
        if (res.ok) out[n.id] = { value: res.result };
        else out[n.id] = { err: res.error };
      } catch (err) {
        out[n.id] = { err: String(err.message||err) };
      }
    }
    setResults(out);
  }

  function makePreviewReturn(n) {
    return { id:'__preview_ret', type:'return', x:0, y:0, data:{} };
  }

  function clearLogs() { setLogs([]); }

  // Filter functions by search
  const filteredFns = fns.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">F</div>
        <div>
          <span className="brand">FlowFn</span>
          <span className="brand-sub">visual function editor</span>
        </div>
        <div className="crumbs" style={{marginLeft:18}}>
          <span>Workspace</span>
          <span className="sep">/</span>
          <span>Functions</span>
          <span className="sep">/</span>
          <span className="cur mono">{activeFn?.name}</span>
        </div>
        <div className="topbar-spacer" />
        <span className="status-pill ok">
          <span className="dot"></span> {fns.length} function{fns.length===1?'':'s'} · saved locally
        </span>
        <button className="btn outline sm" onClick={()=> {
          if (!confirm('Reset to seed examples? Your functions will be lost.')) return;
          setFns(seedFunctions());
          setActiveId(seedFunctions()[0].id);
        }}><Icon name="reset" size={12} /> Reset</button>
        <button className="btn run" onClick={runFn}>
          <Icon name="play" size={14} /> Run
        </button>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sb-search">
          <Icon name="search" size={14} style={{color:'var(--stone-500)'}} />
          <input placeholder="Search functions" value={search} onChange={(e)=>setSearch(e.target.value)} />
        </div>
        <div className="sb-section">
          <span>Functions</span>
          <button className="btn icon sm ghost" title="New" onClick={newFunction}><Icon name="plus" size={12} /></button>
        </div>
        <div className="sb-list" style={{overflow:'auto', flex:1}}>
          {filteredFns.map(f => {
            const isActive = f.id === activeId;
            const isEditing = editingFnName === f.id;
            return (
              <div
                key={f.id}
                className={`sb-item ${isActive ? 'active' : ''}`}
                onClick={()=> { setActiveId(f.id); setSelectedNodeIds(new Set()); setResults({}); }}
                onDoubleClick={()=> setEditingFnName(f.id)}
              >
                <Icon name="fn" size={16} />
                {isEditing ? (
                  <input
                    autoFocus
                    className="mono"
                    style={{flex:1, background:'transparent', border:'1px solid var(--stone-400)', borderRadius:3, padding:'1px 4px', fontSize:12, color:'inherit'}}
                    defaultValue={f.name}
                    onBlur={(e)=> {
                      setFns(fs => fs.map(x => x.id===f.id ? { ...x, name: safeIdent(e.target.value) || x.name } : x));
                      setEditingFnName(null);
                    }}
                    onKeyDown={(e)=> {
                      if (e.key === 'Enter') e.target.blur();
                      if (e.key === 'Escape') setEditingFnName(null);
                    }}
                    onClick={(e)=>e.stopPropagation()}
                  />
                ) : (
                  <span className="mono" style={{flex:1, fontSize:12, overflow:'hidden', textOverflow:'ellipsis'}}>{f.name}</span>
                )}
                <span className="meta">{f.nodes.length}n</span>
                {isActive && !isEditing && (
                  <>
                    <button className="btn icon sm ghost" style={{color:'inherit', height:20, width:20}}
                      title="Rename"
                      onClick={(e)=>{e.stopPropagation(); setEditingFnName(f.id);}}
                    ><Icon name="refresh" size={12} /></button>
                    <button className="btn icon sm ghost" style={{color:'inherit', height:20, width:20}}
                      title="Duplicate"
                      onClick={(e)=>{e.stopPropagation(); duplicateFunction(f.id);}}
                    ><Icon name="copy" size={12} /></button>
                    <button className="btn icon sm ghost" style={{color:'inherit', height:20, width:20}}
                      title="Delete"
                      onClick={(e)=>{e.stopPropagation(); deleteFunction(f.id);}}
                    ><Icon name="trash" size={12} /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="sb-divider" />
        <div className="sb-section"><span>Help</span></div>
        <div style={{padding:'4px 14px 14px', fontSize:11, color:'var(--stone-500)', lineHeight:1.7}}>
          <div><span className="kbd">/</span> Add node</div>
          <div><span className="kbd">2×click</span> Add node here</div>
          <div><span className="kbd">drag port</span> Connect</div>
          <div><span className="kbd">click wire</span> Delete wire</div>
          <div><span className="kbd">⌫</span> Delete selected</div>
          <div><span className="kbd">scroll</span> Pan · <span className="kbd">⌘scroll</span> Zoom</div>
        </div>
      </div>

      {/* Canvas */}
      <div className="canvas-pane">
        {activeFn && (
          <Canvas
            fn={activeFn}
            allFns={fns}
            onUpdateFn={updateActiveFn}
            results={results}
            executingNodes={executingNodes}
            onSelectNode={setSelectedNodeIds}
            selectedNodeIds={selectedNodeIds}
            onLog={pushLog}
          />
        )}
      </div>

      {/* Right pane */}
      <div className="right-pane">
        <div className="tabs">
          <button className={`tab ${tab==='code'?'active':''}`} onClick={()=>setTab('code')}>
            <Icon name="code" size={14} /> Code
          </button>
          <button className={`tab ${tab==='tests'?'active':''}`} onClick={()=>setTab('tests')}>
            <Icon name="test" size={14} /> Tests
            {activeFn?.tests?.length ? <span className="badge">{activeFn.tests.length}</span> : null}
          </button>
          <button className={`tab ${tab==='console'?'active':''}`} onClick={()=>setTab('console')}>
            <Icon name="log" size={14} /> Console
            {logs.length ? <span className="badge">{logs.length}</span> : null}
          </button>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0}}>
          {tab === 'code' && activeFn && <CodePanel fn={activeFn} allFns={fns} />}
          {tab === 'tests' && activeFn && (
            <TestsPanel
              fn={activeFn}
              allFns={fns}
              onLog={pushLog}
              onUpdateFn={updateActiveFn}
            />
          )}
          {tab === 'console' && <ConsolePanel logs={logs} onClear={clearLogs} />}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
