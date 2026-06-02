// Canvas: pans, zooms, renders nodes and wires, handles drag & connect.

const { useState, useRef, useEffect, useCallback, useMemo } = React;

// Node port geometry: rough heights so wires connect in the right place.
const NODE_W = 200;
const HEADER_H = 30;
const ROW_H = 26;
const RESULT_H = 36;

function getPortYOffset(node, side, portId) {
  const def = NODE_LIB[node.type];
  if (!def) return HEADER_H + ROW_H/2;
  const ports = side === 'in' ? def.inputs : def.outputs;
  const idx = ports.findIndex(p => p.id === portId);
  if (idx < 0) return HEADER_H + ROW_H/2;
  // Layout: header, then rows for inputs (interleaved with controls).
  // We compute roughly assuming inputs and outputs are stacked one row each plus controls.
  // For simplicity: row index = idx (each port = 1 row in our layout).
  // Inputs come first, then controls, then outputs in our render. We'll match that.
  let y = HEADER_H + 6; // body padding-top
  if (side === 'in') {
    y += idx * ROW_H + ROW_H/2;
  } else {
    // skip inputs + controls + result
    y += (def.inputs.length) * ROW_H;
    y += (def.controls?.length || 0) * ROW_H;
    y += (node._result !== undefined ? RESULT_H : 0);
    y += idx * ROW_H + ROW_H/2;
  }
  return y;
}

function getPortPos(node, side, portId) {
  return {
    x: node.x + (side === 'in' ? 0 : NODE_W),
    y: node.y + getPortYOffset(node, side, portId),
  };
}

function bezier(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x},${a.y} C ${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

function NodeCard({ node, def, selected, results, onMouseDown, onPortMouseDown, onPortMouseUp, onChange, allFns, fn, executing, hoverPortKey }) {
  const portTypeClass = (p) => p.type;
  const result = results[node.id];
  const hasResult = result !== undefined;
  const errored = result && result.err;

  return (
    <div
      className={`node ${selected ? 'selected' : ''} ${errored ? 'error' : ''} ${executing ? 'executing' : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_W }}
      onMouseDown={(e) => onMouseDown(e, node)}
    >
      <div className="node-header" onMouseDown={(e) => onMouseDown(e, node, true)}>
        <div className={`node-icon ${def.iconClass||''}`}><Icon name={def.icon} size={12} /></div>
        <div className="node-title">{def.label}</div>
      </div>
      <div className="node-body">
        {/* Inputs */}
        {def.inputs.map((p) => {
          const key = node.id + '|' + p.id;
          const targetable = hoverPortKey === 'in:' + key;
          return (
            <div className="node-row in" key={'in-'+p.id}>
              <span
                className={`port in ${portTypeClass(p)} ${targetable ? 'targetable' : ''}`}
                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node, 'in', p.id); }}
                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node, 'in', p.id); }}
                data-port-key={'in:'+key}
              />
              <span className="port-label">{p.label}</span>
            </div>
          );
        })}
        {/* Controls */}
        {(def.controls||[]).map((c) => (
          <div className="node-row body" key={'ctrl-'+c.id}>
            {c.kind === 'select' && (
              <select className="node-select" value={node.data[c.id]} onChange={(e) => onChange(node.id, c.id, e.target.value)}>
                {c.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {c.kind === 'fn-select' && (
              <select className="node-select" value={node.data[c.id]||''} onChange={(e) => onChange(node.id, c.id, e.target.value)}>
                <option value="">—choose function—</option>
                {allFns.filter(f=>f.id !== fn.id).map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            )}
            {c.kind === 'text' && (
              <input className="node-input" value={node.data[c.id]||''} placeholder={c.placeholder||''} onChange={(e) => onChange(node.id, c.id, e.target.value)} />
            )}
            {c.kind === 'number' && (
              <input type="number" className="node-input" value={node.data[c.id]} onChange={(e) => onChange(node.id, c.id, e.target.value)} />
            )}
            {c.kind === 'textarea' && (
              <textarea
                className="node-input"
                style={{ height: 'auto', minHeight: 22, padding: '4px 6px', resize:'vertical' }}
                value={node.data[c.id]||''}
                onChange={(e)=> onChange(node.id, c.id, e.target.value)}
              />
            )}
            {c.kind === 'bool' && (
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--stone-700)'}}>
                <input type="checkbox" checked={!!node.data[c.id]} onChange={(e)=> onChange(node.id, c.id, e.target.checked)} />
                {String(!!node.data[c.id])}
              </label>
            )}
          </div>
        ))}
        {/* Result preview */}
        {hasResult && (
          <div className={`node-result ${result.err ? 'err' : ''}`}>
            {result.err ? result.err : formatPreview(result.value)}
          </div>
        )}
        {/* Outputs */}
        {def.outputs.map((p) => {
          const key = node.id + '|' + p.id;
          const targetable = hoverPortKey === 'out:' + key;
          return (
            <div className="node-row out" key={'out-'+p.id}>
              <span className="port-label r">{p.label}</span>
              <span
                className={`port out ${portTypeClass(p)} ${targetable ? 'targetable' : ''}`}
                onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(e, node, 'out', p.id); }}
                onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(e, node, 'out', p.id); }}
                data-port-key={'out:'+key}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatPreview(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function Canvas({ fn, allFns, onUpdateFn, results, executingNodes, onSelectNode, selectedNodeIds, onLog }) {
  const stageRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState(null); // {kind:'pan'|'node'|'wire', ...}
  const [connector, setConnector] = useState(null); // {from:{node,port,side}, x, y}
  const [addMenu, setAddMenu] = useState(null); // {x,y,query,activeIdx}
  const [hoverPortKey, setHoverPortKey] = useState(null);

  // Convert client coords to world coords
  const toWorld = useCallback((cx, cy) => {
    const r = stageRef.current.getBoundingClientRect();
    return {
      x: (cx - r.left - view.x) / view.k,
      y: (cy - r.top - view.y) / view.k,
    };
  }, [view]);

  // ---- Stage interactions: pan + click empty space ----
  function onStageMouseDown(e) {
    if (e.target !== e.currentTarget && !e.target.classList.contains('canvas-world')) return;
    if (e.button === 1 || e.button === 0) {
      setDrag({ kind:'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
      onSelectNode(new Set());
    }
  }
  function onStageDoubleClick(e) {
    if (e.target !== e.currentTarget && !e.target.classList.contains('canvas-world')) return;
    const r = stageRef.current.getBoundingClientRect();
    setAddMenu({ x: e.clientX - r.left, y: e.clientY - r.top, world: toWorld(e.clientX, e.clientY), query:'', activeIdx:0 });
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.deltaMode === 0) {
      // zoom
      const r = stageRef.current.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newK = Math.max(0.25, Math.min(2.5, view.k * factor));
      // Keep cursor world-position fixed
      const wx = (cx - view.x) / view.k;
      const wy = (cy - view.y) / view.k;
      const nx = cx - wx * newK;
      const ny = cy - wy * newK;
      setView({ x: nx, y: ny, k: newK });
    } else {
      setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }

  // ---- Mouse-up / move on window ----
  useEffect(() => {
    function onMove(e) {
      if (!drag) return;
      if (drag.kind === 'pan') {
        setView(v => ({ ...v, x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) }));
      } else if (drag.kind === 'node') {
        const w = toWorld(e.clientX, e.clientY);
        const dx = w.x - drag.startWorld.x;
        const dy = w.y - drag.startWorld.y;
        const newNodes = fn.nodes.map(n => {
          const initial = drag.initial[n.id];
          if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy };
          return n;
        });
        onUpdateFn({ ...fn, nodes: newNodes });
      } else if (drag.kind === 'wire') {
        const w = toWorld(e.clientX, e.clientY);
        // Find a port near cursor for snap-feedback
        const hover = findNearestPort(e, fn, view, stageRef.current);
        setHoverPortKey(hover ? `${hover.side}:${hover.node.id}|${hover.portId}` : null);
        setConnector({ from: drag.from, x: w.x, y: w.y });
      } else if (drag.kind === 'select') {
        const w = toWorld(e.clientX, e.clientY);
        setDrag({ ...drag, cur: w });
      }
    }
    function onUp(e) {
      if (!drag) return;
      if (drag.kind === 'wire') {
        const hit = findNearestPort(e, fn, view, stageRef.current);
        if (hit && hit.side !== drag.from.side) {
          // connect — drag.from is one side, hit is the opposite
          let from, to;
          if (drag.from.side === 'out') {
            from = { node: drag.from.node.id, port: drag.from.portId };
            to = { node: hit.node.id, port: hit.portId };
          } else {
            from = { node: hit.node.id, port: hit.portId };
            to = { node: drag.from.node.id, port: drag.from.portId };
          }
          // Remove any existing edge into the same target port
          const newEdges = fn.edges.filter(ed => !(ed.to.node === to.node && ed.to.port === to.port));
          // Avoid self-cycle (very basic): from.node !== to.node
          if (from.node !== to.node) {
            newEdges.push({ from, to });
            onUpdateFn({ ...fn, edges: newEdges });
          }
        }
        setConnector(null);
        setHoverPortKey(null);
      } else if (drag.kind === 'select') {
        // Select nodes inside rect
        const a = drag.start, b = drag.cur || a;
        const minx = Math.min(a.x, b.x), maxx = Math.max(a.x, b.x);
        const miny = Math.min(a.y, b.y), maxy = Math.max(a.y, b.y);
        const sel = new Set();
        fn.nodes.forEach(n => {
          if (n.x + NODE_W >= minx && n.x <= maxx && n.y + 60 >= miny && n.y <= maxy) sel.add(n.id);
        });
        onSelectNode(sel);
      }
      setDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, fn, view, onUpdateFn, toWorld, onSelectNode]);

  // ---- Node interactions ----
  function startNodeDrag(e, node, fromHeader) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!fromHeader && (e.target.classList.contains('node-input') || e.target.classList.contains('node-select') || e.target.tagName === 'OPTION')) return;
    const startWorld = toWorld(e.clientX, e.clientY);
    let ids = selectedNodeIds.has(node.id) ? new Set(selectedNodeIds) : new Set([node.id]);
    if (!selectedNodeIds.has(node.id)) onSelectNode(ids);
    const initial = {};
    fn.nodes.forEach(n => { if (ids.has(n.id)) initial[n.id] = { x: n.x, y: n.y }; });
    setDrag({ kind:'node', startWorld, initial });
  }

  function onPortDown(e, node, side, portId) {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind:'wire', from: { node, side, portId } });
    const w = toWorld(e.clientX, e.clientY);
    setConnector({ from:{ node, side, portId }, x: w.x, y: w.y });
  }
  function onPortUp(e, node, side, portId) {
    // handled in window mouseup
  }

  function onChangeNodeData(nodeId, key, value) {
    const newNodes = fn.nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n);
    onUpdateFn({ ...fn, nodes: newNodes });
  }

  // Delete edge
  function deleteEdge(e, idx) {
    e.stopPropagation();
    const newEdges = fn.edges.filter((_,i)=>i!==idx);
    onUpdateFn({ ...fn, edges: newEdges });
  }

  // Delete selected on backspace
  useEffect(() => {
    function onKey(e) {
      if (addMenu) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size) {
        e.preventDefault();
        const ids = selectedNodeIds;
        const newNodes = fn.nodes.filter(n => !ids.has(n.id));
        const newEdges = fn.edges.filter(ed => !ids.has(ed.from.node) && !ids.has(ed.to.node));
        onUpdateFn({ ...fn, nodes: newNodes, edges: newEdges });
        onSelectNode(new Set());
      }
      if (e.key === '/' && !addMenu) {
        e.preventDefault();
        const r = stageRef.current.getBoundingClientRect();
        setAddMenu({ x: r.width/2 - 140, y: r.height/2 - 200, world: toWorld(r.left + r.width/2, r.top + r.height/2), query:'', activeIdx:0 });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fn, selectedNodeIds, onUpdateFn, onSelectNode, addMenu, toWorld]);

  // Wire rendering
  const wires = useMemo(() => {
    const list = [];
    fn.edges.forEach((ed, i) => {
      const fromNode = fn.nodes.find(n => n.id === ed.from.node);
      const toNode = fn.nodes.find(n => n.id === ed.to.node);
      if (!fromNode || !toNode) return;
      const a = getPortPos(fromNode, 'out', ed.from.port);
      const b = getPortPos(toNode, 'in', ed.to.port);
      const def = NODE_LIB[fromNode.type];
      const port = def?.outputs.find(p => p.id === ed.from.port);
      list.push({ i, a, b, type: port?.type || 'any' });
    });
    return list;
  }, [fn.edges, fn.nodes]);

  return (
    <>
      <div
        ref={stageRef}
        className={`canvas-stage ${drag?.kind === 'pan' ? 'panning' : ''}`}
        onMouseDown={onStageMouseDown}
        onDoubleClick={onStageDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e)=>{
          e.preventDefault();
          const r = stageRef.current.getBoundingClientRect();
          setAddMenu({ x: e.clientX - r.left, y: e.clientY - r.top, world: toWorld(e.clientX, e.clientY), query:'', activeIdx:0 });
        }}
      >
        <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {/* Wires */}
          <svg className="wires-svg" width="0" height="0" style={{ overflow:'visible' }}>
            {wires.map(w => (
              <g key={w.i}>
                <path className="wire-hit" d={bezier(w.a, w.b)} onClick={(e) => deleteEdge(e, w.i)} />
                <path className="wire" d={bezier(w.a, w.b)} stroke={`var(--t-${w.type})`} onClick={(e) => deleteEdge(e, w.i)} />
              </g>
            ))}
            {connector && (() => {
              const node = connector.from.node;
              const a = getPortPos(node, connector.from.side, connector.from.portId);
              const b = { x: connector.x, y: connector.y };
              const a0 = connector.from.side === 'out' ? a : b;
              const b0 = connector.from.side === 'out' ? b : a;
              return <path className="wire" d={bezier(a0, b0)} stroke="var(--stone-900)" strokeDasharray="4 3" />;
            })()}
          </svg>
          {fn.nodes.map(n => {
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
      <div className="canvas-toolbar">
        <button className="btn icon sm" title="Add node (/)" onClick={()=>{
          const r = stageRef.current.getBoundingClientRect();
          setAddMenu({ x: 12, y: 44, world: toWorld(r.left + 200, r.top + 200), query:'', activeIdx:0 });
        }}><Icon name="search" size={14} /></button>
        <button className="btn sm" onClick={()=> {
          // Auto-arrange: simple x-sort by topo order
          const arranged = autoLayout(fn);
          onUpdateFn(arranged);
        }}><Icon name="arrange" size={12} /> Arrange</button>
        <button className="btn sm" onClick={()=> {
          // Fit view: center bounding box
          if (!fn.nodes.length) return;
          const minX = Math.min(...fn.nodes.map(n=>n.x));
          const minY = Math.min(...fn.nodes.map(n=>n.y));
          const maxX = Math.max(...fn.nodes.map(n=>n.x + NODE_W));
          const maxY = Math.max(...fn.nodes.map(n=>n.y + 200));
          const r = stageRef.current.getBoundingClientRect();
          const padding = 40;
          const k = Math.min(1, Math.min((r.width-padding*2)/(maxX-minX), (r.height-padding*2)/(maxY-minY)));
          const x = (r.width - (maxX-minX) * k)/2 - minX * k;
          const y = (r.height - (maxY-minY) * k)/2 - minY * k;
          setView({ x, y, k: Math.max(0.4, k) });
        }}><Icon name="fit" size={12} /> Fit</button>
      </div>

      <div className="canvas-zoom">
        <button className="btn icon sm" onClick={()=> setView(v=> ({ ...v, k: Math.max(0.25, v.k * 0.8) }))}><Icon name="zoomOut" size={14} /></button>
        <span className="zlabel">{Math.round(view.k * 100)}%</span>
        <button className="btn icon sm" onClick={()=> setView(v=> ({ ...v, k: Math.min(2.5, v.k * 1.25) }))}><Icon name="zoomIn" size={14} /></button>
        <button className="btn icon sm" title="Reset" onClick={()=> setView({ x:0, y:0, k:1 })}><Icon name="reset" size={14} /></button>
      </div>

      {/* Add menu */}
      {addMenu && (
        <AddMenu
          state={addMenu}
          onClose={()=> setAddMenu(null)}
          onPick={(typeId) => {
            const node = makeNode(typeId, addMenu.world.x - NODE_W/2, addMenu.world.y - 20);
            onUpdateFn({ ...fn, nodes: [...fn.nodes, node] });
            setAddMenu(null);
            onSelectNode(new Set([node.id]));
          }}
          onUpdate={(s)=> setAddMenu(s)}
        />
      )}
    </>
  );
}

function findNearestPort(e, fn, view, stageEl) {
  if (!stageEl) return null;
  const els = stageEl.querySelectorAll('.port');
  let best = null, bestDist = 28; // threshold in px
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      const key = el.getAttribute('data-port-key') || '';
      const [side, payload] = key.split(':');
      const [nodeId, portId] = (payload||'').split('|');
      const node = fn.nodes.find(n => n.id === nodeId);
      if (node) best = { node, side, portId };
    }
  });
  return best;
}

function autoLayout(fn) {
  // Topological-ish layering by longest input path.
  const indeg = {};
  fn.nodes.forEach(n => { indeg[n.id] = 0; });
  fn.edges.forEach(e => { indeg[e.to.node] = (indeg[e.to.node]||0) + 1; });
  const layer = {};
  fn.nodes.forEach(n => layer[n.id] = 0);
  // BFS from roots
  let changed = true, guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    fn.edges.forEach(e => {
      if (layer[e.to.node] < layer[e.from.node] + 1) {
        layer[e.to.node] = layer[e.from.node] + 1;
        changed = true;
      }
    });
  }
  const cols = {};
  fn.nodes.forEach(n => {
    const L = layer[n.id] || 0;
    if (!cols[L]) cols[L] = [];
    cols[L].push(n);
  });
  const newNodes = [];
  Object.keys(cols).map(Number).sort((a,b)=>a-b).forEach((L) => {
    cols[L].forEach((n, i) => {
      newNodes.push({ ...n, x: 80 + L * 240, y: 80 + i * 160 });
    });
  });
  return { ...fn, nodes: newNodes };
}

function AddMenu({ state, onClose, onPick, onUpdate }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const groups = nodeCategories();
  const flat = [];
  Object.entries(groups).forEach(([cat, items]) => {
    items.forEach(it => flat.push({ ...it, cat }));
  });
  const q = state.query.toLowerCase();
  const filtered = q
    ? flat.filter(it => it.label.toLowerCase().includes(q) || it.cat.toLowerCase().includes(q) || it.desc?.toLowerCase().includes(q))
    : flat;

  const grouped = {};
  filtered.forEach(it => {
    if (!grouped[it.cat]) grouped[it.cat] = [];
    grouped[it.cat].push(it);
  });

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); onUpdate({ ...state, activeIdx: Math.min(filtered.length-1, state.activeIdx+1) }); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); onUpdate({ ...state, activeIdx: Math.max(0, state.activeIdx-1) }); return; }
    if (e.key === 'Enter' && filtered[state.activeIdx]) { e.preventDefault(); onPick(filtered[state.activeIdx].id); }
  }

  // Outside click
  useEffect(() => {
    function onDoc(e) {
      if (!e.target.closest('.add-menu')) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div className="add-menu" style={{ left: state.x, top: state.y }}>
      <div className="search-row">
        <Icon name="search" size={14} style={{color:'var(--stone-500)'}} />
        <input
          ref={inputRef}
          placeholder="Search nodes…"
          value={state.query}
          onChange={(e)=> onUpdate({ ...state, query: e.target.value, activeIdx: 0 })}
          onKeyDown={onKey}
        />
        <span style={{fontSize:10, color:'var(--stone-400)'}}>↑↓ ↵</span>
      </div>
      <div className="list">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="group-label">{cat}</div>
            {items.map(it => {
              const idx = filtered.indexOf(it);
              return (
                <div
                  key={it.id}
                  className={`item ${idx === state.activeIdx ? 'kbd-active' : ''}`}
                  onClick={()=> onPick(it.id)}
                  onMouseEnter={()=> onUpdate({ ...state, activeIdx: idx })}
                >
                  <span className={`ic ${it.iconClass||''}`}><Icon name={it.icon} size={12} /></span>
                  <span>{it.label}</span>
                  <span className="desc">{it.desc}</span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && <div className="empty">No matches</div>}
      </div>
    </div>
  );
}

Object.assign(window, { Canvas, NODE_W });
