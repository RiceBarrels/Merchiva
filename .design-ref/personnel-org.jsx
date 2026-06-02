// ═══════════════════════════════════════════════════════════
// 组织图 · Root panel
// Hosts the canvas + toolbar + inspector. Combines team-list
// features (search, status, contact, role breakdown) with the
// graph so this is the ONE place to view/manage the team.
// ═══════════════════════════════════════════════════════════

const { useState: opUS, useEffect: opUE, useMemo: opUM, useCallback: opUC, useRef: opUR } = React;

// ─── Helpers ───────────────────────────────────────────────
function nextId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
function downstreamIds(rootId, edges) {
  const out = new Set([rootId]);
  const adj = {};
  for (const e of edges) (adj[e.from] = adj[e.from] || []).push(e.to);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const nx of (adj[id] || [])) if (!out.has(nx)) { out.add(nx); queue.push(nx); }
  }
  return out;
}
function upstreamIds(rootId, edges) {
  const out = new Set([rootId]);
  const adj = {};
  for (const e of edges) (adj[e.to] = adj[e.to] || []).push(e.from);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const pv of (adj[id] || [])) if (!out.has(pv)) { out.add(pv); queue.push(pv); }
  }
  return out;
}

// ─── Permission row ────────────────────────────────────────
function PermissionRow({ perm, checked, onToggle }) {
  return (
    <label className="flex items-start gap-2.5 py-1.5 px-2 rounded hover:bg-stone-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(perm.id, e.target.checked)}
        className="mt-[3px] h-3.5 w-3.5 accent-stone-900"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-stone-800">{perm.cn}</span>
          {perm.sensitive && (
            <span className="text-[9px] uppercase tracking-wider font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">敏感</span>
          )}
        </div>
        <div className="text-[11px] text-stone-500 leading-snug">{perm.desc}</div>
      </div>
      <span className="text-[9.5px] uppercase font-mono text-stone-400 mt-1 shrink-0">{perm.id}</span>
    </label>
  );
}

// ─── Inspector (right) ─────────────────────────────────────
function Inspector({ node, edges, nodes, roles, isMobile, onUpdateNode, onDeleteNode, onSelect, onTidyGroup, onOpenRoleManager, onClose, toast }) {
  if (!node) {
    // On mobile, no selection = no panel (saves space)
    if (isMobile) return null;
    // Empty-state: tips
    return (
      <aside className="w-[340px] shrink-0 border-l border-[var(--border)] bg-white flex flex-col">
        <div className="px-5 py-5 text-[12.5px] text-stone-500 leading-relaxed">
          <div className="flex items-center gap-2 text-stone-700 font-semibold text-[13px] mb-2">
            <Icon name="mouse-pointer-click" size={14} />
            选择一个节点
          </div>
          点击画布上的人员卡或团队组以查看和编辑权限。<br />
          拖动卡片底部的圆点连接到另一个节点，建立"管理"关系。
          <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
            <div className="border border-stone-200 rounded p-2.5">
              <div className="font-mono text-stone-400 uppercase tracking-wider text-[9.5px] mb-1">拖人到组</div>
              <div className="text-stone-700">放到虚线框内即加入</div>
            </div>
            <div className="border border-stone-200 rounded p-2.5">
              <div className="font-mono text-stone-400 uppercase tracking-wider text-[9.5px] mb-1">拖组头</div>
              <div className="text-stone-700">整组一起搬走</div>
            </div>
            <div className="border border-stone-200 rounded p-2.5">
              <div className="font-mono text-stone-400 uppercase tracking-wider text-[9.5px] mb-1">scroll</div>
              <div className="text-stone-700">缩放</div>
            </div>
            <div className="border border-stone-200 rounded p-2.5">
              <div className="font-mono text-stone-400 uppercase tracking-wider text-[9.5px] mb-1">点连线</div>
              <div className="text-stone-700">删除连接</div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const permSet = new Set(node.perms);
  const isGroup = node.kind === 'group';
  const rolesMap = roles || ORG_ROLES;
  const role = !isGroup ? (rolesMap[node.role] || rolesMap.staff || ORG_ROLES.staff) : null;
  const useCustomTone = role && (!role.tone || role.tone === '__custom-tone');
  const avatarStyle = useCustomTone ? { background: role.color + '20', color: role.color } : null;
  const preset = isGroup ? (ORG_GROUP_PRESETS[node.groupKind] || ORG_GROUP_PRESETS.custom) : null;

  const managers = edges.filter(e => e.to === node.id).map(e => nodes.find(n => n.id === e.from)).filter(Boolean);
  const reports  = edges.filter(e => e.from === node.id).map(e => nodes.find(n => n.id === e.to)).filter(Boolean);
  const groupMembers = isGroup ? nodes.filter(n => n.kind === 'person' && n.groupId === node.id) : [];

  const togglePerm = (pid, on) => {
    const next = on ? [...node.perms, pid] : node.perms.filter(p => p !== pid);
    onUpdateNode(node.id, { perms: next });
  };

  return (
    <React.Fragment>
      {/* Mobile backdrop */}
      {isMobile && (
        <div className="fixed inset-0 z-40 bg-stone-900/30 backdrop-blur-[1px]" onClick={onClose} />
      )}
      <aside className={isMobile
        ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl border-t border-[var(--border)] bg-white flex flex-col shadow-2xl"
        : "w-[340px] shrink-0 border-l border-[var(--border)] bg-white flex flex-col"
      }>
      {/* Mobile drag affordance */}
      {isMobile && (
        <div className="flex justify-center pt-2 pb-1 shrink-0" onClick={onClose}>
          <span className="h-1 w-10 rounded-full bg-stone-300" />
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center gap-3">
        {isGroup ? (
          <div className="h-10 w-10 rounded-md inline-flex items-center justify-center text-white shrink-0" style={{ background: preset.color }}>
            <Icon name={preset.icon} size={18} />
          </div>
        ) : (
          <div className={`h-10 w-10 rounded-full inline-flex items-center justify-center font-semibold text-[12px] shrink-0 ${useCustomTone ? '' : role.tone}`} style={avatarStyle}>
            {initials(node.en || node.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <input
            value={node.name}
            onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
            className="w-full text-[14px] font-semibold tracking-[-0.01em] border-0 px-0 py-0 bg-transparent outline-none focus:bg-stone-50 rounded px-1 -mx-1"
          />
          <div className="text-[11px] text-stone-500 mt-0.5">
            {isGroup ? `${preset.cn} · group · ${groupMembers.length} 人` : `${role.cn} · ${role.en}`}
          </div>
        </div>
        <button onClick={onClose} className="h-7 w-7 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-800 inline-flex items-center justify-center" title="关闭">
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Person contact / Group meta */}
      {!isGroup ? (
        <div className="px-4 py-3 border-b border-[var(--border)] space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400">岗位角色</div>
              <button
                onClick={onOpenRoleManager}
                className="text-[10.5px] text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
                title="增加·编辑角色"
              >
                <Icon name="settings-2" size={11} />
                管理角色
              </button>
            </div>
            <select
              value={node.role}
              onChange={(e) => {
                const r = e.target.value;
                const preset = rolesMap[r];
                onUpdateNode(node.id, { role: r, perms: preset.perms });
                toast(`已套用 ${preset.cn} 的默认权限`);
              }}
              className="w-full"
            >
              {Object.entries(rolesMap).map(([k, v]) => (
                <option key={k} value={k}>{v.cn} · {v.en}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">状态</div>
              <select
                value={node.status || 'active'}
                onChange={(e) => onUpdateNode(node.id, { status: e.target.value })}
                className="w-full"
              >
                <option value="active">在职</option>
                <option value="invited">待入职</option>
                <option value="paused">已停用</option>
              </select>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">所在组</div>
              <select
                value={node.groupId || ''}
                onChange={(e) => onUpdateNode(node.id, { groupId: e.target.value || null })}
                className="w-full"
              >
                <option value="">— 无组 —</option>
                {nodes.filter(n => n.kind === 'group').map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">邮箱</div>
            <input
              value={node.email || ''}
              onChange={(e) => onUpdateNode(node.id, { email: e.target.value })}
              placeholder="name@maple.co"
              className="w-full font-mono"
            />
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">电话</div>
            <input
              value={node.phone || ''}
              onChange={(e) => onUpdateNode(node.id, { phone: e.target.value })}
              placeholder="+1 510 555 0100"
              className="w-full font-mono"
            />
          </div>

          {/* Wage / salary */}
          <div className="pt-2 mt-1 border-t border-stone-100">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400">薪酬 · Pay</div>
              <div className="inline-flex rounded border border-stone-200 overflow-hidden text-[10.5px]">
                {[{k:'hourly', cn:'时薪'},{k:'salary', cn:'月薪'}].map((opt, i) => (
                  <button
                    key={opt.k}
                    onClick={() => onUpdateNode(node.id, { payType: opt.k })}
                    className={`px-2 py-0.5 ${(node.payType || 'hourly') === opt.k ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'} ${i === 0 ? '' : 'border-l border-stone-200'}`}
                  >
                    {opt.cn}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-stretch gap-1.5">
              <select
                value={node.currency || 'USD'}
                onChange={(e) => onUpdateNode(node.id, { currency: e.target.value })}
                className="w-[80px] font-mono text-[12px]"
              >
                <option value="USD">USD $</option>
                <option value="CNY">CNY ¥</option>
                <option value="HKD">HKD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  step={(node.payType || 'hourly') === 'hourly' ? 0.5 : 100}
                  value={node.wage ?? ''}
                  onChange={(e) => onUpdateNode(node.id, { wage: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="0"
                  className="w-full font-mono tabular-nums text-right pr-12"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-mono text-stone-400 pointer-events-none">
                  /{(node.payType || 'hourly') === 'hourly' ? '小时' : '月'}
                </span>
              </div>
            </div>
            {node.wage != null && (node.payType || 'hourly') === 'hourly' && (
              <div className="mt-1 text-[10.5px] text-stone-500">
                按每周 40 小时 ≈ <span className="font-mono tabular-nums">{(node.wage * 40 * 4.33).toFixed(0)}</span> {node.currency || 'USD'} / 月
              </div>
            )}
            {node.wage != null && (node.payType || 'hourly') === 'salary' && (
              <div className="mt-1 text-[10.5px] text-stone-500">
                折算时薪 ≈ <span className="font-mono tabular-nums">{(node.wage / (40 * 4.33)).toFixed(2)}</span> {node.currency || 'USD'} / 小时
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 py-3 border-b border-[var(--border)] space-y-2.5">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">类型</div>
              <select
                value={node.groupKind}
                onChange={(e) => onUpdateNode(node.id, { groupKind: e.target.value })}
                className="w-full"
              >
                {Object.entries(ORG_GROUP_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.cn}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">描述</div>
              <input
                value={node.desc || ''}
                onChange={(e) => onUpdateNode(node.id, { desc: e.target.value })}
                placeholder="给这个组写一句说明"
                className="w-full"
              />
            </div>
            <button
              onClick={() => onTidyGroup(node.id)}
              className="w-full h-8 text-[12px] border border-stone-200 rounded hover:bg-stone-50 text-stone-700 inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="layout-grid" size={11} />
              整理成员排列
            </button>
          </div>

          {/* Group members list */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400">成员</div>
              <span className="text-[10.5px] font-mono text-stone-500 tabular-nums">{groupMembers.length}</span>
            </div>
            {groupMembers.length === 0 ? (
              <div className="text-[11.5px] text-stone-400 italic">还没有成员 · 把人员卡拖到这个组里</div>
            ) : (
              <ul className="space-y-0.5 -mx-1">
                {groupMembers.map(m => {
                  const r = rolesMap[m.role] || rolesMap.staff || ORG_ROLES.staff;
                  const mUseCustom = !r.tone || r.tone === '__custom-tone';
                  const mStyle = mUseCustom ? { background: r.color + '20', color: r.color } : null;
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => onSelect(m.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-50 text-left"
                      >
                        <div className={`h-6 w-6 rounded-full inline-flex items-center justify-center font-semibold text-[9.5px] shrink-0 ${mUseCustom ? '' : r.tone}`} style={mStyle}>
                          {initials(m.en || m.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium text-stone-800 truncate">{m.name}</div>
                          <div className="text-[10.5px] text-stone-500 truncate">{r.cn} · {m.email}</div>
                        </div>
                        {m.status === 'invited' && (
                          <span className="text-[8.5px] uppercase tracking-wider font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 shrink-0">待入职</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Relationships */}
      <div className="px-4 py-3 border-b border-[var(--border)] grid grid-cols-2 gap-3 text-[11.5px]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1.5">↑ 谁管它 · {managers.length}</div>
          {managers.length === 0 ? <div className="text-stone-400 italic">无</div> : (
            <ul className="space-y-1">
              {managers.map(m => (
                <li key={m.id}>
                  <button onClick={() => onSelect(m.id)} className="flex items-center gap-1.5 text-stone-700 hover:text-stone-900 truncate w-full text-left">
                    <Icon name={m.kind === 'group' ? 'users-round' : 'user'} size={11} className="text-stone-400 shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1.5">↓ 它管谁 · {reports.length}</div>
          {reports.length === 0 ? <div className="text-stone-400 italic">无</div> : (
            <ul className="space-y-1">
              {reports.map(m => (
                <li key={m.id}>
                  <button onClick={() => onSelect(m.id)} className="flex items-center gap-1.5 text-stone-700 hover:text-stone-900 truncate w-full text-left">
                    <Icon name={m.kind === 'group' ? 'users-round' : 'user'} size={11} className="text-stone-400 shrink-0" />
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Permissions */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 px-4 pt-3 pb-2 bg-white border-b border-[var(--border)] z-10">
          <div className="flex items-center justify-between">
            <div className="text-[12.5px] font-semibold text-stone-800">权限 · Permissions</div>
            <div className="text-[10.5px] font-mono text-stone-500 tabular-nums">{permSet.size} / {ORG_PERMS_FLAT.length}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button onClick={() => onUpdateNode(node.id, { perms: ORG_PERMS_FLAT.map(p => p.id) })} className="h-6 px-2 text-[10.5px] border border-stone-200 rounded hover:bg-stone-50 text-stone-600">全选</button>
            <button onClick={() => onUpdateNode(node.id, { perms: [] })} className="h-6 px-2 text-[10.5px] border border-stone-200 rounded hover:bg-stone-50 text-stone-600">清空</button>
            {!isGroup && (
              <button onClick={() => onUpdateNode(node.id, { perms: rolesMap[node.role].perms })} className="h-6 px-2 text-[10.5px] border border-stone-200 rounded hover:bg-stone-50 text-stone-600">重置为角色默认</button>
            )}
          </div>
        </div>
        <div className="px-2 py-2">
          {ORG_PERMS.map(g => (
            <div key={g.group} className="mb-2">
              <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wider font-mono text-stone-400">{g.group}</div>
              {g.items.map(p => (
                <PermissionRow key={p.id} perm={p} checked={permSet.has(p.id)} onToggle={togglePerm} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--border)] flex items-center gap-2">
        <button
          onClick={() => {
            if (confirm(`删除 ${node.name}？所有连接也会被删除。`)) onDeleteNode(node.id);
          }}
          className="h-8 px-2.5 text-[12px] text-red-600 hover:bg-red-50 border border-red-200 rounded inline-flex items-center gap-1.5"
        >
          <Icon name="trash-2" size={12} />
          删除
        </button>
        <div className="ml-auto text-[10.5px] font-mono text-stone-400 truncate">{node.id}</div>
      </div>
    </aside>
    </React.Fragment>
  );
}

// ─── Toolbar ───────────────────────────────────────────────
function OrgToolbar({
  onAddPerson, onAddGroup,
  onAutoLayout, onResetView,
  onFocusMode, focusMode,
  view, onZoom,
  q, onQuery, matchCount,
  totals,
  viewMode, onViewMode,
  onOpenRoleManager,
  isMobile,
}) {
  const { useState } = React;
  const [mSearchOpen, setMSearchOpen] = useState(false);
  const [mMenuOpen, setMMenuOpen] = useState(false);
  return (
    <div className="shrink-0 z-30 flex items-center gap-1.5 sm:gap-2 flex-wrap px-2.5 sm:px-3 py-2 border-b border-[var(--border)] bg-white">
        {/* Title block */}
        <div className="flex items-center gap-2">
          <Icon name="git-fork" size={14} className="text-stone-700" />
          <div>
            <div className="text-[12.5px] font-semibold leading-tight">团队<span className="hidden sm:inline"> · Team</span></div>
            <div className="text-[10px] text-stone-500 leading-tight">
              {totals.persons} 人 · {totals.groups} 组<span className="hidden sm:inline"> · {totals.edges} 关系</span>
            </div>
          </div>
        </div>

        <span className="hidden sm:block h-6 w-px bg-stone-200" />

        {/* View toggle */}
        <div className="border border-[var(--border)] rounded-md p-0.5 flex items-center">
          <button
            onClick={() => onViewMode('graph')}
            className={`h-7 px-2 sm:px-2.5 rounded inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors ${viewMode === 'graph' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            title="图谱视图"
          >
            <Icon name="git-fork" size={12} />
            <span className="hidden sm:inline">图谱</span>
          </button>
          <button
            onClick={() => onViewMode('list')}
            className={`h-7 px-2 sm:px-2.5 rounded inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors ${viewMode === 'list' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
            title="列表视图"
          >
            <Icon name="list" size={12} />
            <span className="hidden sm:inline">列表</span>
          </button>
        </div>

        {/* Search — full on desktop; toggle-expand on mobile */}
        {(!isMobile || mSearchOpen) ? (
          <div className="border border-[var(--border)] rounded-md px-2 py-1.5 flex items-center gap-1.5 flex-1 sm:flex-none min-w-0">
            <Icon name="search" size={12} className="text-stone-400 shrink-0" />
            <input
              value={q}
              autoFocus={isMobile}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="搜索姓名、邮箱、角色…"
              className="h-6 w-full sm:w-[200px] text-[12px] outline-none bg-transparent min-w-0"
            />
            {(q || isMobile) && (
              <>
                {q && <span className="text-[10px] font-mono text-stone-400 tabular-nums shrink-0">{matchCount}</span>}
                <button onClick={() => { onQuery(''); if (isMobile) setMSearchOpen(false); }} className="h-5 w-5 rounded hover:bg-stone-100 text-stone-400 inline-flex items-center justify-center shrink-0">
                  <Icon name="x" size={11} />
                </button>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => setMSearchOpen(true)} className="h-8 w-8 border border-[var(--border)] rounded-md inline-flex items-center justify-center text-stone-600">
            <Icon name="search" size={14} />
          </button>
        )}

        {/* Add actions — inline on desktop, popover "+" on mobile */}
        {!isMobile ? (
          <div className="border border-[var(--border)] rounded-md px-2 py-1.5 flex items-center gap-1">
            <button onClick={onAddPerson} className="h-7 px-2 rounded hover:bg-stone-100 text-stone-700 inline-flex items-center gap-1.5 text-[12px] font-medium">
              <Icon name="user-plus" size={12} />加成员
            </button>
            <span className="h-4 w-px bg-stone-200" />
            <button onClick={onAddGroup} className="h-7 px-2 rounded hover:bg-stone-100 text-stone-700 inline-flex items-center gap-1.5 text-[12px] font-medium">
              <Icon name="users-round" size={12} />加分组
            </button>
            <span className="h-4 w-px bg-stone-200" />
            <button onClick={onOpenRoleManager} className="h-7 px-2 rounded hover:bg-stone-100 text-stone-700 inline-flex items-center gap-1.5 text-[12px] font-medium" title="增加/编辑岗位角色">
              <Icon name="shield-plus" size={12} />角色
            </button>
          </div>
        ) : (
          <div className="relative">
            <button onClick={() => setMMenuOpen(o => !o)} className="h-8 w-8 rounded-md bg-stone-900 text-white inline-flex items-center justify-center" title="添加">
              <Icon name="plus" size={16} />
            </button>
            {mMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-40 w-40 bg-white border border-stone-200 rounded-lg shadow-lg py-1">
                  <button onClick={() => { setMMenuOpen(false); onAddPerson(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-stone-50 inline-flex items-center gap-2">
                    <Icon name="user-plus" size={14} className="text-stone-500" />加成员
                  </button>
                  <button onClick={() => { setMMenuOpen(false); onAddGroup(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-stone-50 inline-flex items-center gap-2">
                    <Icon name="users-round" size={14} className="text-stone-500" />加分组
                  </button>
                  <button onClick={() => { setMMenuOpen(false); onOpenRoleManager(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-stone-50 inline-flex items-center gap-2">
                    <Icon name="shield-plus" size={14} className="text-stone-500" />管理角色
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* View tools */}
        <div className="border border-[var(--border)] rounded-md px-1.5 sm:px-2 py-1.5 flex items-center gap-1 ml-auto">
          {viewMode === 'graph' && (
            <>
              <button onClick={onAutoLayout} className="h-7 px-2 rounded hover:bg-stone-100 text-stone-700 inline-flex items-center gap-1.5 text-[12px]" title="自动整理">
                <Icon name="layout-grid" size={12} /><span className="hidden sm:inline">整理</span>
              </button>
              <button
                onClick={onFocusMode}
                className={`h-7 px-2 rounded inline-flex items-center gap-1.5 text-[12px] ${focusMode ? 'bg-stone-900 text-white' : 'hover:bg-stone-100 text-stone-700'}`}
                title="只看选中节点的上下级"
              >
                <Icon name="target" size={12} /><span className="hidden sm:inline">聚焦</span>
              </button>
              <span className="hidden sm:block h-4 w-px bg-stone-200" />
              <button onClick={() => onZoom(view.zoom * 0.9)} className="hidden sm:inline-flex h-7 w-7 rounded hover:bg-stone-100 text-stone-700 items-center justify-center">
                <Icon name="minus" size={12} />
              </button>
              <span className="hidden sm:block text-[10.5px] font-mono text-stone-500 w-10 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
              <button onClick={() => onZoom(view.zoom * 1.1)} className="hidden sm:inline-flex h-7 w-7 rounded hover:bg-stone-100 text-stone-700 items-center justify-center">
                <Icon name="plus" size={12} />
              </button>
              <button onClick={onResetView} className="h-7 px-2 rounded hover:bg-stone-100 text-stone-600 text-[11px] inline-flex items-center gap-1" title="适配">
                <Icon name="maximize" size={11} /><span className="hidden sm:inline">适配</span>
              </button>
            </>
          )}
        </div>
    </div>
  );
}

// ─── Root panel ────────────────────────────────────────────
function OrgPanel({ toast }) {
  const [nodes, setNodes] = opUS(() => {
    try {
      const raw = localStorage.getItem('bz_org_nodes_v3');
      if (raw) return JSON.parse(raw);
    } catch {}
    return ORG_NODES_SEED;
  });
  const [edges, setEdges] = opUS(() => {
    try {
      const raw = localStorage.getItem('bz_org_edges_v3');
      if (raw) return JSON.parse(raw);
    } catch {}
    return ORG_EDGES_SEED;
  });
  const [view, setView] = opUS({ zoom: 0.7, tx: 40, ty: 70 });
  const [selectedId, setSelectedId] = opUS(null);
  const [focusMode, setFocusMode] = opUS(false);
  const [q, setQ] = opUS('');
  const [roles, setRoles] = opUS(() => {
    try {
      const raw = localStorage.getItem('bz_org_roles_v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return ORG_ROLES;
  });
  const [viewMode, setViewMode] = opUS('graph');
  const [showRoleManager, setShowRoleManager] = opUS(false);
  const isMobile = useIsMobile();

  // On mobile, the graph canvas is hard to use — default to list once.
  opUE(() => {
    if (isMobile) {
      try {
        if (!localStorage.getItem('bz_org_mobile_seen')) {
          localStorage.setItem('bz_org_mobile_seen', '1');
          setViewMode('list');
        }
      } catch {}
    }
  }, [isMobile]);

  opUE(() => { try { localStorage.setItem('bz_org_roles_v1', JSON.stringify(roles)); } catch {} }, [roles]);

  opUE(() => { try { localStorage.setItem('bz_org_nodes_v3', JSON.stringify(nodes)); } catch {} }, [nodes]);
  opUE(() => { try { localStorage.setItem('bz_org_edges_v3', JSON.stringify(edges)); } catch {} }, [edges]);

  const selectedNode = nodes.find(n => n.id === selectedId);

  const highlightIds = opUM(() => {
    if (!focusMode || !selectedId) return null;
    const set = new Set([
      ...downstreamIds(selectedId, edges),
      ...upstreamIds(selectedId, edges),
    ]);
    // also include group members of any group in the set, and vice-versa
    nodes.forEach(n => {
      if (n.kind === 'person' && n.groupId && set.has(n.groupId)) set.add(n.id);
      if (n.kind === 'group' && nodes.some(p => p.kind === 'person' && p.groupId === n.id && set.has(p.id))) set.add(n.id);
    });
    return set;
  }, [focusMode, selectedId, edges, nodes]);

  const searchMatchIds = opUM(() => {
    if (!q.trim()) return null;
    const needle = q.trim().toLowerCase();
    const set = new Set();
    for (const n of nodes) {
      const hay = [
        n.name, n.en || '', n.email || '', n.phone || '',
        ORG_ROLES[n.role]?.cn || '', ORG_ROLES[n.role]?.en || '',
        ORG_GROUP_PRESETS[n.groupKind]?.cn || '',
      ].join(' ').toLowerCase();
      if (hay.includes(needle)) set.add(n.id);
    }
    return set;
  }, [q, nodes]);

  // ─── Mutations ───────────────────────────────────────────
  const moveNode = opUC((id, x, y) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  }, []);

  const moveGroup = opUC((id, gx, gy, memberSnapshots, dx, dy) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) return { ...n, x: gx, y: gy };
      const snap = memberSnapshots.find(m => m.id === n.id);
      if (snap) return { ...n, x: snap.ox + dx, y: snap.oy + dy };
      return n;
    }));
  }, []);

  const resizeGroup = opUC((id, w, h) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, w, h } : n));
  }, []);

  const dropPersonInGroup = opUC((personId, groupId) => {
    setNodes(prev => prev.map(n => n.id === personId ? { ...n, groupId: groupId || null } : n));
    if (groupId) {
      const g = nodes.find(n => n.id === groupId);
      if (g) toast(`已加入 ${g.name}`);
    } else {
      toast('已从分组移出');
    }
  }, [nodes, toast]);

  const updateNode = opUC((id, patch) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const deleteNode = opUC((id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    setSelectedId(null);
  }, []);

  const createEdge = opUC((from, to) => {
    if (from === to) return;
    setEdges(prev => {
      if (prev.some(e => e.from === from && e.to === to)) {
        toast('连接已存在');
        return prev;
      }
      toast('已建立管理关系');
      return [...prev, { id: nextId('e'), from, to }];
    });
  }, [toast]);

  const deleteEdge = opUC((id) => setEdges(prev => prev.filter(e => e.id !== id)), []);

  const addPerson = () => {
    const center = { x: -view.tx / view.zoom + 280, y: -view.ty / view.zoom + 180 };
    const id = nextId('n');
    setNodes(prev => [...prev, {
      id, kind: 'person',
      name: '新成员', en: 'New Member',
      role: 'staff', storeId: null, groupId: null,
      email: '', phone: '', status: 'invited',
      perms: ORG_ROLES.staff.perms,
      x: center.x, y: center.y,
    }]);
    setSelectedId(id);
    toast('已添加成员，请在右侧填写详情');
  };
  const addGroup = () => {
    const center = { x: -view.tx / view.zoom + 200, y: -view.ty / view.zoom + 120 };
    const id = nextId('g');
    const sz = groupSize(0, 2);
    setNodes(prev => [...prev, {
      id, kind: 'group',
      name: '新分组', groupKind: 'custom',
      desc: '自定义分组',
      perms: ORG_ROLES.staff.perms,
      x: center.x, y: center.y,
      w: Math.max(sz.w, 340),
      h: 200,
    }]);
    setSelectedId(id);
    toast('已添加分组，把人员拖进虚线框内即可加入');
  };

  // Re-arrange members of a single group in a tidy grid
  const tidyGroup = opUC((groupId) => {
    setNodes(prev => {
      const g = prev.find(n => n.id === groupId);
      if (!g) return prev;
      const members = prev.filter(n => n.kind === 'person' && n.groupId === groupId);
      if (members.length === 0) return prev;
      const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(members.length))));
      const sz = groupSize(members.length, cols);
      const newG = { ...g, w: Math.max(g.w, sz.w), h: Math.max(g.h, sz.h) };
      const positioned = layoutInGroup(g.x, g.y, members, cols);
      const posById = Object.fromEntries(positioned.map(p => [p.id, p]));
      return prev.map(n => {
        if (n.id === groupId) return newG;
        if (posById[n.id]) return { ...n, x: posById[n.id].x, y: posById[n.id].y };
        return n;
      });
    });
    toast('已整理');
  }, [toast]);

  // Auto-layout: tidy every group + place ungrouped persons in a strip
  const autoLayout = () => {
    setNodes(prev => {
      const groups = prev.filter(n => n.kind === 'group');
      // Lay groups out left→right in a single row, packing widths
      let cursorX = 60;
      const ROW_Y = 80;
      const G_GAP = 40;

      const layout = {};
      for (const g of groups) {
        const members = prev.filter(n => n.kind === 'person' && n.groupId === g.id);
        const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, members.length)))));
        const sz = groupSize(Math.max(1, members.length), cols);
        layout[g.id] = { x: cursorX, y: ROW_Y, w: sz.w, h: sz.h, cols };
        cursorX += sz.w + G_GAP;
      }
      // Now position ungrouped persons in a row below
      const ungrouped = prev.filter(n => n.kind === 'person' && !n.groupId);
      const ungroupedY = ROW_Y + 500;

      return prev.map(n => {
        if (n.kind === 'group') {
          const L = layout[n.id];
          return L ? { ...n, x: L.x, y: L.y, w: L.w, h: L.h } : n;
        }
        if (n.kind === 'person') {
          if (n.groupId && layout[n.groupId]) {
            const L = layout[n.groupId];
            const members = prev.filter(m => m.kind === 'person' && m.groupId === n.groupId);
            const idx = members.findIndex(m => m.id === n.id);
            const positioned = layoutInGroup(L.x, L.y, members, L.cols);
            const me = positioned[idx];
            return { ...n, x: me.x, y: me.y };
          }
          if (!n.groupId) {
            const idx = ungrouped.findIndex(m => m.id === n.id);
            return { ...n, x: 60 + idx * (CARD_W + 16), y: ungroupedY };
          }
        }
        return n;
      });
    });
    toast('已重新排列');
  };

  const resetView = () => setView({ zoom: 0.7, tx: 40, ty: 70 });

  // Totals for toolbar
  const totals = {
    persons: nodes.filter(n => n.kind === 'person').length,
    groups: nodes.filter(n => n.kind === 'group').length,
    edges: edges.length,
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 relative min-w-0 flex flex-col">
        <OrgToolbar
          onAddPerson={addPerson}
          onAddGroup={addGroup}
          onAutoLayout={autoLayout}
          onResetView={resetView}
          onFocusMode={() => setFocusMode(f => !f)}
          focusMode={focusMode}
          view={view}
          onZoom={(z) => setView(v => ({ ...v, zoom: Math.min(2, Math.max(0.3, z)) }))}
          q={q}
          onQuery={setQ}
          matchCount={searchMatchIds ? searchMatchIds.size : 0}
          totals={totals}
          viewMode={viewMode}
          onViewMode={setViewMode}
          onOpenRoleManager={() => setShowRoleManager(true)}
          isMobile={isMobile}
        />

        {viewMode === 'graph' ? (
          <div className="flex-1 relative min-h-0">
            <OrgCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selectedId}
            onSelectNode={setSelectedId}
            onMoveNode={moveNode}
            onMoveGroup={moveGroup}
            onResizeGroup={resizeGroup}
            onDropPersonInGroup={dropPersonInGroup}
            onCreateEdge={createEdge}
            onDeleteEdge={deleteEdge}
            onBgClick={() => setSelectedId(null)}
            highlightIds={highlightIds}
            searchMatchIds={searchMatchIds}
              roles={roles}
              view={view}
              onViewChange={setView}
            />
            {/* Legend (bottom-left of canvas) */}
            <div className="absolute left-4 bottom-4 z-20 bg-white/95 backdrop-blur border border-[var(--border)] rounded-md shadow-sm px-3 py-2 text-[10.5px]">
              <div className="text-[9.5px] uppercase font-mono tracking-wider text-stone-400 mb-1.5">图例</div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {Object.entries(roles).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                    <span className="text-stone-700">{v.cn}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <OrgListView
            nodes={nodes}
            edges={edges}
            roles={roles}
            selectedId={selectedId}
            searchMatchIds={searchMatchIds}
            isMobile={isMobile}
            onSelectNode={setSelectedId}
            onUpdateNode={updateNode}
            onDeleteNode={deleteNode}
            toast={toast}
          />
        )}
      </div>

      <Inspector
        node={selectedNode}
        edges={edges}
        nodes={nodes}
        roles={roles}
        isMobile={isMobile}
        onUpdateNode={updateNode}
        onDeleteNode={deleteNode}
        onSelect={setSelectedId}
        onTidyGroup={tidyGroup}
        onOpenRoleManager={() => setShowRoleManager(true)}
        onClose={() => setSelectedId(null)}
        toast={toast}
      />

      {showRoleManager && (
        <RoleManager
          roles={roles}
          onChange={setRoles}
          nodes={nodes}
          onClose={() => setShowRoleManager(false)}
          toast={toast}
        />
      )}
    </div>
  );
}

Object.assign(window, { OrgPanel });
