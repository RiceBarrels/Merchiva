// ═══════════════════════════════════════════════════════════
// 团队 · List view
// Spreadsheet-style table; complement to the graph view.
// Inline-editable wage, role, group, status.
// Click a row to open the inspector (same as clicking a card).
// ═══════════════════════════════════════════════════════════

const { useState: olUS, useMemo: olUM } = React;

const CURRENCY_SYM = { USD: '$', CNY: '¥', HKD: 'HK$', EUR: '€', GBP: '£' };

function formatPay(p) {
  if (p == null || p === '') return '—';
  return p.toLocaleString();
}

function OrgListView({ nodes, edges, roles, selectedId, searchMatchIds, isMobile, onSelectNode, onUpdateNode, onDeleteNode, toast }) {
  const rolesMap = roles || ORG_ROLES;
  const [sortKey, setSortKey] = olUS('group');
  const [sortDir, setSortDir] = olUS('asc');
  const [showGroupHeaders, setShowGroupHeaders] = olUS(true);

  const groupsById = olUM(() => Object.fromEntries(nodes.filter(n => n.kind === 'group').map(g => [g.id, g])), [nodes]);
  const persons = olUM(() => nodes.filter(n => n.kind === 'person'), [nodes]);

  // Manager count per person (incoming + outgoing edges)
  const manageCount = olUM(() => {
    const out = {}, inc = {};
    edges.forEach(e => {
      out[e.from] = (out[e.from] || 0) + 1;
      inc[e.to]   = (inc[e.to]   || 0) + 1;
    });
    return { out, inc };
  }, [edges]);

  const visible = olUM(() => {
    let arr = persons.slice();
    if (searchMatchIds) arr = arr.filter(p => searchMatchIds.has(p.id));
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const ga = groupsById[a.groupId]?.name || '\uffff';
      const gb = groupsById[b.groupId]?.name || '\uffff';
      switch (sortKey) {
        case 'name':   return a.name.localeCompare(b.name, 'zh') * dir;
        case 'role':   return (rolesMap[a.role]?.cn || '').localeCompare(rolesMap[b.role]?.cn || '', 'zh') * dir;
        case 'group':  return (ga.localeCompare(gb, 'zh') || a.name.localeCompare(b.name, 'zh')) * dir;
        case 'status': return (a.status || '').localeCompare(b.status || '') * dir;
        case 'wage': {
          const av = a.wage == null ? -1 : (a.payType === 'salary' ? a.wage : a.wage * 40 * 4.33);
          const bv = b.wage == null ? -1 : (b.payType === 'salary' ? b.wage : b.wage * 40 * 4.33);
          return (av - bv) * dir;
        }
        case 'joined': return (a.joined || '').localeCompare(b.joined || '') * dir;
        default: return 0;
      }
    });
    return arr;
  }, [persons, sortKey, sortDir, searchMatchIds, rolesMap, groupsById]);

  // Group rows when sorted by 'group'
  const grouped = olUM(() => {
    if (sortKey !== 'group' || !showGroupHeaders) return null;
    const map = new Map();
    for (const p of visible) {
      const key = p.groupId || '__none';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries());
  }, [visible, sortKey, showGroupHeaders]);

  const headerCell = (label, key, className = '') => (
    <th
      onClick={() => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
      }}
      className={`px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-stone-500 cursor-pointer hover:text-stone-900 select-none ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === key && (
          <Icon name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} />
        )}
      </span>
    </th>
  );

  // Per-person totals
  const stats = olUM(() => {
    let monthly = 0, hourly = 0, hourlyCount = 0, salaryCount = 0;
    for (const p of persons) {
      if (p.wage == null) continue;
      if ((p.payType || 'hourly') === 'salary') { monthly += p.wage; salaryCount++; }
      else { hourly += p.wage; hourlyCount++; monthly += p.wage * 40 * 4.33; }
    }
    return { monthly: Math.round(monthly), avgHourly: hourlyCount ? (hourly / hourlyCount).toFixed(2) : null, hourlyCount, salaryCount };
  }, [persons]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white">
      {/* Summary strip */}
      <div className="sticky top-0 z-20 px-4 py-2.5 bg-white border-b border-stone-200 flex items-center gap-3 sm:gap-4 text-[11.5px] flex-wrap">
        <span className="text-stone-700">
          <span className="font-mono tabular-nums font-semibold text-stone-900">{visible.length}</span>
          {searchMatchIds && <span className="text-stone-400"> / {persons.length}</span>}
          <span className="text-stone-500"> 人</span>
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-stone-700">
          月度人力成本 <span className="font-mono tabular-nums font-semibold text-stone-900">${stats.monthly.toLocaleString()}</span>
        </span>
        {stats.avgHourly && (
          <>
            <span className="text-stone-300 hidden sm:inline">·</span>
            <span className="text-stone-600 hidden sm:inline">
              时薪均价 <span className="font-mono tabular-nums">${stats.avgHourly}</span>
            </span>
          </>
        )}
        {!isMobile && (
          <div className="ml-auto flex items-center gap-2">
            <label className="text-[11px] text-stone-600 inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showGroupHeaders} onChange={(e) => setShowGroupHeaders(e.target.checked)} className="h-3.5 w-3.5 accent-stone-900" />
              按分组显示
            </label>
          </div>
        )}
      </div>

      {isMobile ? (
        <MobileCardList
          grouped={grouped}
          visible={visible}
          groupsById={groupsById}
          rolesMap={rolesMap}
          manageCount={manageCount}
          selectedId={selectedId}
          searchMatchIds={searchMatchIds}
          onSelectNode={onSelectNode}
        />
      ) : (
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-[42px] z-10 bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="px-3 py-2 w-8"></th>
            {headerCell('姓名', 'name')}
            {headerCell('角色', 'role')}
            {headerCell('分组', 'group')}
            {headerCell('状态', 'status')}
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-stone-500">联系方式</th>
            {headerCell('薪酬', 'wage', 'text-right')}
            {headerCell('入职', 'joined')}
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-stone-500">权限</th>
            <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-wider font-mono text-stone-500">关系</th>
            <th className="px-3 py-2 w-10"></th>
          </tr>
        </thead>

        <tbody>
          {grouped ? grouped.flatMap(([gid, rows], i) => {
            const g = gid === '__none' ? null : groupsById[gid];
            const preset = g ? (ORG_GROUP_PRESETS[g.groupKind] || ORG_GROUP_PRESETS.custom) : null;
            return [
              <tr key={'h-' + gid} className="bg-stone-100/60 border-y border-stone-200">
                <td colSpan="11" className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {g ? (
                      <>
                        <span className="h-5 w-5 rounded inline-flex items-center justify-center text-white" style={{ background: preset.color }}>
                          <Icon name={preset.icon} size={10} />
                        </span>
                        <button onClick={() => onSelectNode(g.id)} className="text-[12px] font-semibold text-stone-800 hover:underline">{g.name}</button>
                        <span className="text-[10.5px] text-stone-500">{g.desc}</span>
                      </>
                    ) : (
                      <span className="text-[12px] font-semibold text-stone-500 italic">未分组</span>
                    )}
                    <span className="ml-auto text-[10.5px] font-mono text-stone-500 tabular-nums">{rows.length} 人</span>
                  </div>
                </td>
              </tr>,
              ...rows.map(p => (
                <PersonRow
                  key={p.id}
                  p={p}
                  rolesMap={rolesMap}
                  nodes={nodes}
                  manageCount={manageCount}
                  isSelected={p.id === selectedId}
                  isMatch={searchMatchIds && searchMatchIds.has(p.id)}
                  onSelect={() => onSelectNode(p.id)}
                  onUpdateNode={onUpdateNode}
                  onDeleteNode={onDeleteNode}
                  toast={toast}
                />
              ))
            ];
          }) : visible.map(p => (
            <PersonRow
              key={p.id}
              p={p}
              rolesMap={rolesMap}
              nodes={nodes}
              manageCount={manageCount}
              isSelected={p.id === selectedId}
              isMatch={searchMatchIds && searchMatchIds.has(p.id)}
              onSelect={() => onSelectNode(p.id)}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              toast={toast}
            />
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

// ─── Mobile card list ──────────────────────────────────────
function MobileCardList({ grouped, visible, groupsById, rolesMap, manageCount, selectedId, searchMatchIds, onSelectNode }) {
  const renderCard = (p) => {
    const role = rolesMap[p.role] || rolesMap.staff || ORG_ROLES.staff;
    const useCustomTone = !role.tone || role.tone === '__custom-tone';
    const avatarStyle = useCustomTone ? { background: role.color + '20', color: role.color } : null;
    const sym = CURRENCY_SYM[p.currency || 'USD'];
    const payType = p.payType || 'hourly';
    const isMatch = searchMatchIds && searchMatchIds.has(p.id);
    const statusMap = {
      active:  { text: 'text-emerald-700', bg: 'bg-emerald-50', label: '在职' },
      invited: { text: 'text-amber-700',   bg: 'bg-amber-50',   label: '待入职' },
      paused:  { text: 'text-stone-600',   bg: 'bg-stone-100',  label: '已停用' },
    };
    const s = statusMap[p.status || 'active'] || statusMap.active;
    return (
      <button
        key={p.id}
        onClick={() => onSelectNode(p.id)}
        className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-stone-100 active:bg-stone-50 ${
          p.id === selectedId ? 'bg-stone-50' : isMatch ? 'bg-amber-50/60' : 'bg-white'
        }`}
      >
        <div className={`h-11 w-11 rounded-full inline-flex items-center justify-center font-semibold text-[13px] shrink-0 ${useCustomTone ? '' : role.tone}`} style={avatarStyle}>
          {initials(p.en || p.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-stone-900 truncate">{p.name}</span>
            <span className={`text-[9.5px] uppercase tracking-wide font-mono rounded px-1 ${s.bg} ${s.text} shrink-0`}>{s.label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: role.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: role.color }} />
              {role.cn}
            </span>
            <span className="text-stone-300">·</span>
            <span className="text-[11.5px] text-stone-500 truncate">{groupsById[p.groupId]?.name || '无组'}</span>
          </div>
          <div className="text-[11px] text-stone-400 font-mono truncate mt-0.5">{p.email}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[14px] font-mono font-semibold text-stone-900 tabular-nums">
            {sym}{p.wage == null ? '—' : p.wage.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-stone-400">/{payType === 'hourly' ? '小时' : '月'}</div>
          <div className="text-[10px] font-mono text-stone-400 mt-0.5 inline-flex items-center gap-1 justify-end">
            <Icon name="key-round" size={9} />{p.perms.length}
          </div>
        </div>
      </button>
    );
  };

  if (grouped) {
    return (
      <div>
        {grouped.map(([gid, rows]) => {
          const g = gid === '__none' ? null : groupsById[gid];
          const preset = g ? (ORG_GROUP_PRESETS[g.groupKind] || ORG_GROUP_PRESETS.custom) : null;
          return (
            <div key={gid}>
              <div className="sticky top-[44px] z-10 bg-stone-100/90 backdrop-blur px-4 py-1.5 flex items-center gap-2 border-y border-stone-200">
                {g ? (
                  <>
                    <span className="h-5 w-5 rounded inline-flex items-center justify-center text-white" style={{ background: preset.color }}>
                      <Icon name={preset.icon} size={10} />
                    </span>
                    <span className="text-[12px] font-semibold text-stone-800" onClick={() => onSelectNode(g.id)}>{g.name}</span>
                  </>
                ) : (
                  <span className="text-[12px] font-semibold text-stone-500 italic">未分组</span>
                )}
                <span className="ml-auto text-[10.5px] font-mono text-stone-500 tabular-nums">{rows.length} 人</span>
              </div>
              {rows.map(renderCard)}
            </div>
          );
        })}
      </div>
    );
  }
  return <div>{visible.map(renderCard)}</div>;
}

function PersonRow({ p, rolesMap, nodes, manageCount, isSelected, isMatch, onSelect, onUpdateNode, onDeleteNode, toast }) {
  const role = rolesMap[p.role] || rolesMap.staff || ORG_ROLES.staff;
  const useCustomTone = !role.tone || role.tone === '__custom-tone';
  const avatarStyle = useCustomTone ? { background: role.color + '20', color: role.color } : null;
  const groupOptions = nodes.filter(n => n.kind === 'group');
  const sym = CURRENCY_SYM[p.currency || 'USD'];
  const payType = p.payType || 'hourly';

  return (
    <tr
      onClick={onSelect}
      className={`border-b border-stone-100 group cursor-pointer transition-colors ${
        isSelected ? 'bg-stone-50'
        : isMatch  ? 'bg-amber-50/60'
        : 'hover:bg-stone-50/60'
      }`}
    >
      {/* color swatch */}
      <td className="px-3 py-2.5 align-middle">
        <span className="block h-7 w-1 rounded" style={{ background: role.color }} />
      </td>

      {/* name + avatar */}
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center gap-2.5">
          <div className={`h-7 w-7 rounded-full inline-flex items-center justify-center font-semibold text-[10.5px] shrink-0 ${useCustomTone ? '' : role.tone}`} style={avatarStyle}>
            {initials(p.en || p.name)}
          </div>
          <div className="min-w-0">
            <input
              value={p.name}
              onChange={(e) => onUpdateNode(p.id, { name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-[12.5px] font-medium text-stone-900 bg-transparent border-0 outline-none focus:bg-white focus:border focus:border-stone-300 rounded px-1 -ml-1 w-[120px]"
            />
            <div className="text-[10.5px] text-stone-500 truncate">{p.en}</div>
          </div>
        </div>
      </td>

      {/* role */}
      <td className="px-3 py-2.5 align-middle">
        <select
          value={p.role}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const r = e.target.value;
            const preset = rolesMap[r];
            onUpdateNode(p.id, { role: r, perms: preset.perms });
            toast(`已套用 ${preset.cn} 的默认权限`);
          }}
          className="text-[12px] py-0.5 px-1.5 max-w-[120px]"
          style={{ color: role.color, fontWeight: 500 }}
        >
          {Object.entries(rolesMap).map(([k, v]) => (
            <option key={k} value={k}>{v.cn}</option>
          ))}
        </select>
      </td>

      {/* group */}
      <td className="px-3 py-2.5 align-middle">
        <select
          value={p.groupId || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdateNode(p.id, { groupId: e.target.value || null })}
          className="text-[12px] py-0.5 px-1.5 max-w-[150px] text-stone-700"
        >
          <option value="">— 无组 —</option>
          {groupOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </td>

      {/* status */}
      <td className="px-3 py-2.5 align-middle">
        {(() => {
          const status = p.status || 'active';
          const styles = {
            active:  { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: '#10b981', label: '在职' },
            invited: { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: '#f59e0b', label: '待入职' },
            paused:  { bg: 'bg-stone-100',   text: 'text-stone-600',   dot: '#a8a29e', label: '已停用' },
          };
          const s = styles[status] || styles.active;
          return (
            <select
              value={status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateNode(p.id, { status: e.target.value })}
              className={`text-[11px] py-0.5 px-1.5 rounded border-0 ${s.bg} ${s.text} font-medium`}
            >
              <option value="active">● 在职</option>
              <option value="invited">● 待入职</option>
              <option value="paused">● 已停用</option>
            </select>
          );
        })()}
      </td>

      {/* contact */}
      <td className="px-3 py-2.5 align-middle">
        <input
          value={p.email || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdateNode(p.id, { email: e.target.value })}
          placeholder="email@…"
          className="text-[11.5px] font-mono text-stone-700 bg-transparent border-0 outline-none focus:bg-white focus:border focus:border-stone-300 rounded px-1 -ml-1 w-[150px]"
        />
        <div className="text-[10.5px] font-mono text-stone-500 truncate">{p.phone}</div>
      </td>

      {/* wage */}
      <td className="px-3 py-2.5 align-middle text-right">
        <div className="inline-flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <select
            value={payType}
            onChange={(e) => onUpdateNode(p.id, { payType: e.target.value })}
            className="text-[10.5px] py-0.5 px-1 font-mono text-stone-500 bg-transparent border-0"
          >
            <option value="hourly">时</option>
            <option value="salary">月</option>
          </select>
          <span className="text-[11px] font-mono text-stone-400">{sym}</span>
          <input
            type="number"
            min="0"
            step={payType === 'hourly' ? 0.5 : 100}
            value={p.wage ?? ''}
            onChange={(e) => onUpdateNode(p.id, { wage: e.target.value === '' ? null : Number(e.target.value) })}
            className="text-[12.5px] font-mono tabular-nums text-right w-[70px] bg-transparent border-0 outline-none focus:bg-white focus:border focus:border-stone-300 rounded px-1 font-semibold text-stone-900"
          />
          <span className="text-[10px] font-mono text-stone-400">/{payType === 'hourly' ? '时' : '月'}</span>
        </div>
      </td>

      {/* joined */}
      <td className="px-3 py-2.5 align-middle text-[11.5px] font-mono text-stone-500 tabular-nums">
        {p.joined || '—'}
      </td>

      {/* perms */}
      <td className="px-3 py-2.5 align-middle">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
          title="点开侧栏编辑权限"
        >
          <Icon name="key-round" size={11} />
          <span className="font-mono tabular-nums">{p.perms.length}</span>
        </button>
      </td>

      {/* relationships */}
      <td className="px-3 py-2.5 align-middle">
        <div className="inline-flex items-center gap-2 text-[10.5px] font-mono text-stone-500 tabular-nums">
          <span title="谁管它"><Icon name="arrow-down" size={9} className="inline align-[-1px]" /> {manageCount.inc[p.id] || 0}</span>
          <span title="它管谁"><Icon name="arrow-up"   size={9} className="inline align-[-1px]" /> {manageCount.out[p.id] || 0}</span>
        </div>
      </td>

      {/* delete */}
      <td className="px-3 py-2.5 align-middle">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`删除 ${p.name}？`)) onDeleteNode(p.id);
          }}
          className="h-6 w-6 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="删除"
        >
          <Icon name="trash-2" size={11} />
        </button>
      </td>
    </tr>
  );
}

Object.assign(window, { OrgListView, MobileCardList });
