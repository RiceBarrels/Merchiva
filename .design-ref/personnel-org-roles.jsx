// ═══════════════════════════════════════════════════════════
// 角色管理弹窗 · RoleManager
// Edit the catalog of "岗位角色" — name (cn/en), color, and the
// default permission set applied when assigning the role.
// ═══════════════════════════════════════════════════════════

const { useState: rmUS, useMemo: rmUM, useEffect: rmUE } = React;

// Built-in role keys cannot be deleted (only edited).
const BUILTIN_ROLE_KEYS = ['admin', 'ops', 'manager', 'lead', 'staff', 'intern'];

// A nice palette for quick pick
const ROLE_COLOR_SWATCHES = [
  '#1c1917', '#44403c', '#78716c', '#a8a29e',
  '#7c3aed', '#0891b2', '#0d9488', '#16a34a',
  '#ea580c', '#dc2626', '#db2777', '#2563eb',
  '#ca8a04', '#65a30d', '#9333ea', '#0369a1',
];

function newRoleKey(roles) {
  let i = 1;
  while (roles[`role${i}`]) i++;
  return `role${i}`;
}

function colorToTone(hex) {
  // Use a light tint background w/ the color as fg — derive a tailwind-ish utility
  // We just inline-style instead — the `tone` field is only used in a couple of
  // places (avatar circles). For custom roles, fall back to inline styles.
  return `__custom-tone`;
}

function RoleManager({ roles, onChange, nodes, onClose, toast }) {
  const [editingKey, setEditingKey] = rmUS(() => Object.keys(roles)[0] || null);
  const editing = editingKey ? roles[editingKey] : null;

  // Usage count per role
  const usage = rmUM(() => {
    const c = {};
    nodes.forEach(n => { if (n.kind === 'person' && n.role) c[n.role] = (c[n.role] || 0) + 1; });
    return c;
  }, [nodes]);

  const updateField = (key, patch) => {
    onChange({ ...roles, [key]: { ...roles[key], ...patch } });
  };

  const addRole = () => {
    const key = newRoleKey(roles);
    const next = {
      ...roles,
      [key]: {
        cn: '新角色',
        en: 'New Role',
        color: ROLE_COLOR_SWATCHES[Object.keys(roles).length % ROLE_COLOR_SWATCHES.length],
        tone: '__custom-tone',
        perms: ['schedule.view'],
        custom: true,
      }
    };
    onChange(next);
    setEditingKey(key);
    toast('已新增角色');
  };

  const deleteRole = (key) => {
    if (BUILTIN_ROLE_KEYS.includes(key)) {
      toast('内置角色不能删除，但可以修改');
      return;
    }
    const count = usage[key] || 0;
    if (count > 0) {
      if (!confirm(`有 ${count} 名成员正在使用「${roles[key].cn}」。删除后会回退为「员工」。继续？`)) return;
    } else {
      if (!confirm(`删除角色「${roles[key].cn}」？`)) return;
    }
    const { [key]: _, ...rest } = roles;
    onChange(rest);
    if (editingKey === key) {
      setEditingKey(Object.keys(rest)[0] || null);
    }
    toast('已删除角色');
  };

  const togglePerm = (pid, on) => {
    if (!editing) return;
    const next = on ? [...editing.perms, pid] : editing.perms.filter(p => p !== pid);
    updateField(editingKey, { perms: next });
  };

  // Close on Esc
  rmUE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-stone-900/30 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-2xl border border-stone-200 w-[840px] max-w-[95vw] h-[600px] max-h-[90vh] flex overflow-hidden"
      >
        {/* Left — role list */}
        <div className="w-[260px] border-r border-stone-200 flex flex-col">
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold tracking-[-0.01em]">岗位角色</div>
              <div className="text-[10.5px] text-stone-500">{Object.keys(roles).length} 个角色</div>
            </div>
            <button onClick={onClose} className="h-7 w-7 rounded hover:bg-stone-100 text-stone-500 inline-flex items-center justify-center" title="关闭">
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {Object.entries(roles).map(([key, r]) => {
              const sel = key === editingKey;
              const isBuiltin = BUILTIN_ROLE_KEYS.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => setEditingKey(key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${sel ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
                >
                  <span className="h-7 w-7 rounded-md inline-flex items-center justify-center text-white font-semibold text-[11px] shrink-0" style={{ background: r.color }}>
                    {r.cn.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="text-[12.5px] font-medium text-stone-800 truncate">{r.cn}</div>
                      {isBuiltin && (
                        <span className="text-[8.5px] uppercase tracking-wider font-mono text-stone-400 shrink-0">内置</span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-stone-500 truncate">{r.en} · {r.perms.length} 权限</div>
                  </div>
                  <span className="text-[9.5px] font-mono text-stone-400 tabular-nums shrink-0">{usage[key] || 0}</span>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-stone-200">
            <button
              onClick={addRole}
              className="w-full h-8 rounded bg-stone-900 hover:bg-stone-800 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="plus" size={12} />
              新增角色
            </button>
          </div>
        </div>

        {/* Right — editor */}
        {!editing ? (
          <div className="flex-1 flex items-center justify-center text-stone-400 text-[12.5px]">
            选择左侧角色或新增一个
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center gap-3">
              <span className="h-10 w-10 rounded-md inline-flex items-center justify-center text-white font-semibold text-[14px] shrink-0" style={{ background: editing.color }}>
                {editing.cn.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-[14px] font-semibold tracking-[-0.01em]">{editing.cn}</div>
                  {BUILTIN_ROLE_KEYS.includes(editingKey) ? (
                    <span className="text-[9.5px] uppercase tracking-wider font-mono text-stone-400">内置角色</span>
                  ) : (
                    <span className="text-[9.5px] uppercase tracking-wider font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">自定义</span>
                  )}
                </div>
                <div className="text-[11px] text-stone-500">{usage[editingKey] || 0} 人正在使用 · key {editingKey}</div>
              </div>
              {!BUILTIN_ROLE_KEYS.includes(editingKey) && (
                <button
                  onClick={() => deleteRole(editingKey)}
                  className="h-8 px-2.5 text-[12px] text-red-600 hover:bg-red-50 border border-red-200 rounded inline-flex items-center gap-1.5"
                >
                  <Icon name="trash-2" size={12} />
                  删除
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Name + color */}
              <div className="px-5 py-4 border-b border-stone-200 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">中文名</div>
                  <input
                    value={editing.cn}
                    onChange={(e) => updateField(editingKey, { cn: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1">English</div>
                  <input
                    value={editing.en}
                    onChange={(e) => updateField(editingKey, { en: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-[10.5px] uppercase tracking-wider font-mono text-stone-400 mb-1.5">颜色</div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {ROLE_COLOR_SWATCHES.map(c => (
                      <button
                        key={c}
                        onClick={() => updateField(editingKey, { color: c })}
                        className={`h-7 w-7 rounded-md transition-transform ${c === editing.color ? 'ring-2 ring-offset-2 ring-stone-900 scale-105' : 'hover:scale-105'}`}
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-stone-500 cursor-pointer">
                      <input
                        type="color"
                        value={editing.color}
                        onChange={(e) => updateField(editingKey, { color: e.target.value })}
                        className="h-7 w-9 rounded border border-stone-200 cursor-pointer"
                      />
                      <span className="font-mono">{editing.color}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Default permissions */}
              <div className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[12.5px] font-semibold text-stone-800">默认权限</div>
                    <div className="text-[10.5px] text-stone-500">分配此角色时套用，可单独调整每个成员</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-mono text-stone-500 tabular-nums">{editing.perms.length} / {ORG_PERMS_FLAT.length}</span>
                    <button onClick={() => updateField(editingKey, { perms: ORG_PERMS_FLAT.map(p => p.id) })} className="h-6 px-2 text-[10.5px] border border-stone-200 rounded hover:bg-stone-50 text-stone-600">全选</button>
                    <button onClick={() => updateField(editingKey, { perms: [] })} className="h-6 px-2 text-[10.5px] border border-stone-200 rounded hover:bg-stone-50 text-stone-600">清空</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {ORG_PERMS.map(g => (
                    <div key={g.group} className="mb-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-mono text-stone-400 mb-0.5">{g.group}</div>
                      {g.items.map(p => {
                        const checked = editing.perms.includes(p.id);
                        return (
                          <label key={p.id} className="flex items-start gap-2 py-1 px-1 rounded hover:bg-stone-50 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={(e) => togglePerm(p.id, e.target.checked)} className="mt-[3px] h-3.5 w-3.5 accent-stone-900" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[12px] text-stone-800">{p.cn}</span>
                                {p.sensitive && <span className="text-[8.5px] uppercase tracking-wider font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">敏感</span>}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="text-[11px] text-stone-500">
                修改默认权限不会影响已分配此角色的成员；可在成员卡的右侧用「重置为角色默认」套用最新设置。
              </div>
              <button onClick={onClose} className="h-8 px-3 text-[12px] rounded bg-stone-900 hover:bg-stone-800 text-white font-medium">
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { RoleManager, BUILTIN_ROLE_KEYS });
