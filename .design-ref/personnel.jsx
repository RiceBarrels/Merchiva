// ═══════════════════════════════════════════════════════════
// 人员管理 · Unified Personnel Management
// Combines: Training · Staffing · Team · Role task todos · Roles
// ═══════════════════════════════════════════════════════════

const { useState: pUS, useEffect: pUE, useMemo: pUM } = React;

// ─── Left bizops sidebar, with "人员管理" pinned active ───
const P_NAV = [
  { id: 'dashboard',  label: '仪表盘',     en: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'personnel',  label: '人员管理',   en: 'Personnel', icon: 'users-round', badge: 3 },
  { id: 'sales',      label: '销售',       en: 'Sales',     icon: 'trending-up' },
  { id: 'pos',        label: 'POS',        en: 'POS',       icon: 'credit-card' },
  { id: 'inventory',  label: '库存',       en: 'Inventory', icon: 'package' },
  { id: 'products',   label: '商品',       en: 'Products',  icon: 'shopping-bag' },
  { id: 'chat',       label: '消息',       en: 'Chat',      icon: 'message-square' },
  { id: 'punch-in',   label: '打卡',       en: 'Punch In',  icon: 'clock' },
];

function PSidebar({ collapsed, onToggleCollapse }) {
  return (
    <aside
      className="hidden lg:flex flex-col border-r border-[var(--border)] bg-white shrink-0 transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 220 }}
    >
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-[var(--border)]">
        <div className="h-7 w-7 rounded bg-stone-900 text-white flex items-center justify-center font-bold text-[11px] tracking-tight shrink-0">bz</div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight truncate">Maple Coffee</div>
            <div className="text-[10.5px] text-stone-500 leading-tight truncate">Oakland · Amelia</div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {P_NAV.map(item => {
          const active = item.id === 'personnel';
          return (
            <button
              key={item.id}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] font-medium transition-colors ${
                active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} size={15} />
              {!collapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-mono font-bold flex items-center justify-center tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'
                    }`}>{item.badge}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-2 py-3 border-t border-[var(--border)] flex flex-col gap-0.5">
        <button className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100">
          <Icon name="settings" size={15} />
          {!collapsed && <span className="truncate">设置</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          className="mt-1 flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded"
        >
          <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} size={15} />
          {!collapsed && <span>收起</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Top tab bar ─────────────────────────────────
const TABS = [
  { id: 'schedule', cn: '排班',     en: 'Schedule',  icon: 'calendar-clock', sub: '本周班次 · 时间表'    },
  { id: 'team',     cn: '团队',     en: 'Team',      icon: 'git-fork',       sub: '成员 · 分组 · 权限图'  },
  { id: 'roles',    cn: '角色任务', en: 'Roles',     icon: 'shield',         sub: '岗位职责 · 任务清单'  },
  { id: 'training', cn: '培训',     en: 'Training',  icon: 'graduation-cap', sub: '课程 · 进度 · 考核'   },
];

function TopTabs({ tab, onChange, pendingRequests }) {
  return (
    <div className="h-[56px] sm:h-[60px] border-b border-[var(--border)] bg-white flex items-stretch shrink-0">
      <div className="flex-1 flex">
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex-1 flex items-center justify-center sm:justify-start gap-2.5 px-2 sm:px-5 transition-colors border-r border-[var(--border)] last:border-r-0 relative ${
                active ? 'bg-stone-50' : 'bg-white hover:bg-stone-50/60'
              }`}
            >
              <span className={`w-8 h-8 rounded inline-flex items-center justify-center shrink-0 ${
                active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
              }`}>
                <Icon name={t.icon} size={14} />
              </span>
              <div className="text-left min-w-0 hidden sm:block">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[13.5px] font-semibold tracking-[-0.01em] ${active ? 'text-stone-900' : 'text-stone-700'}`}>{t.cn}</span>
                  <span className="text-[10.5px] text-stone-400">{t.en}</span>
                </div>
                <div className={`text-[11px] truncate ${active ? 'text-stone-600' : 'text-stone-500'}`}>{t.sub}</div>
              </div>
              {/* mobile: short label under icon is too tight — show inline */}
              <span className={`sm:hidden text-[12px] font-semibold tracking-[-0.01em] ${active ? 'text-stone-900' : 'text-stone-600'}`}>{t.cn}</span>
              {t.id === 'schedule' && pendingRequests > 0 && (
                <span className="absolute top-1.5 right-1.5 sm:static sm:ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-mono font-bold inline-flex items-center justify-center">
                  {pendingRequests}
                </span>
              )}
              {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-stone-900" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 员工 Team panel ────────────────────────────────────────
function TeamPanel({ toast }) {
  const [filter, setFilter] = pUS('all'); // all | active | invited
  const [q, setQ] = pUS('');

  const list = TEAM.filter(m => {
    if (filter === 'active' && m.status !== 'active') return false;
    if (filter === 'invited' && m.status !== 'invited') return false;
    if (q && !m.name.toLowerCase().includes(q.toLowerCase()) && !m.roleTitle.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: TEAM.length,
    active: TEAM.filter(m => m.status === 'active').length,
    invited: TEAM.filter(m => m.status === 'invited').length,
  };

  // simple aggregate stats by role
  const byRole = ROLES.map(r => ({
    ...r,
    members: TEAM.filter(m => m.roleTitle.toLowerCase().includes(r.name.toLowerCase())).length,
  }));

  return (
    <div className="flex-1 overflow-auto">
      {/* Header bar */}
      <div className="px-6 pt-5 pb-4 bg-white border-b border-[var(--border)] flex items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-[-0.01em]">员工 · Team</h1>
          <div className="text-[11.5px] text-stone-500 mt-0.5">
            {counts.active} 在职 · {counts.invited} 待入职 · 共 {counts.all} 人
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名或岗位…"
              className="h-8 pl-7 pr-3 text-[12.5px] border border-[var(--border)] rounded bg-white w-[220px] outline-none focus:border-stone-400"
            />
          </div>
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all',     label: `全部 ${counts.all}` },
              { value: 'active',  label: `在职 ${counts.active}` },
              { value: 'invited', label: `待入职 ${counts.invited}` },
            ]}
          />
          <Button variant="outline" size="sm" icon="download">导出</Button>
          <Button size="sm" icon="user-plus" onClick={() => toast('邀请成员')}>邀请成员</Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-[minmax(0,1fr)_280px] gap-6">
        {/* Members table */}
        <div className="bg-white border border-[var(--border)] rounded overflow-hidden">
          <div className="grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_60px] gap-3 items-center px-4 py-2.5 bg-stone-50 border-b border-[var(--border)] text-[10.5px] uppercase tracking-wide text-stone-500 font-semibold">
            <div />
            <div>姓名 · Name</div>
            <div>岗位 · Role</div>
            <div>联系方式 · Contact</div>
            <div>状态</div>
            <div />
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-14 text-center text-[12.5px] text-stone-400">没有符合条件的成员</div>
          ) : list.map((m, i) => {
            const isMe = m.id === 'm1';
            return (
              <div
                key={m.id}
                className={`grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_60px] gap-3 items-center px-4 py-2.5 hover:bg-stone-50/60 ${
                  i < list.length - 1 ? 'border-b border-[var(--border)]' : ''
                }`}
              >
                <Avatar name={m.name} size={30} color={m.color} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                    {m.name}
                    {isMe && <Pill tone="dark">YOU</Pill>}
                  </div>
                  <div className="text-[11px] text-stone-500">@{m.name.toLowerCase().split(' ')[0]}</div>
                </div>
                <div className="text-[12.5px] text-stone-700 truncate flex items-center gap-1.5">
                  {(() => {
                    const r = ROLES.find(x => m.roleTitle.toLowerCase().includes(x.name.toLowerCase()));
                    return r ? <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} /> : null;
                  })()}
                  {m.roleTitle}
                </div>
                <div className="text-[12px] text-stone-500 truncate font-mono">{m.email}</div>
                <Pill tone={m.status === 'active' ? 'emerald' : 'amber'}>
                  {m.status === 'active' ? '在职' : '待入职'}
                </Pill>
                <div className="flex items-center justify-end gap-0.5">
                  <button title="编辑" className="h-7 w-7 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-800 inline-flex items-center justify-center">
                    <Icon name="pencil" size={13} />
                  </button>
                  <button title="更多" className="h-7 w-7 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-800 inline-flex items-center justify-center">
                    <Icon name="more-horizontal" size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right rail — role breakdown + quick links */}
        <div className="space-y-4">
          <div className="bg-white border border-[var(--border)] rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold">按岗位分布</div>
              <span className="font-mono text-[10px] text-stone-400 uppercase tracking-wider">by role</span>
            </div>
            <div className="space-y-2">
              {byRole.map(r => {
                const pct = Math.min(100, Math.round((r.members / counts.active) * 100)) || 0;
                return (
                  <div key={r.id} className="text-[12px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                        <span className="text-stone-700">{r.name}</span>
                      </span>
                      <span className="font-mono tabular-nums text-stone-500">{r.members}</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, background: r.color, opacity: 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[var(--border)] rounded p-4">
            <div className="text-[13px] font-semibold mb-2">本周提醒</div>
            <div className="space-y-2 text-[12px]">
              <div className="flex items-start gap-2">
                <Icon name="cake" size={13} className="text-pink-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-stone-700">Marcus Lee 生日</div>
                  <div className="text-[10.5px] text-stone-500">本周五 · 5/22</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="award" size={13} className="text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-stone-700">Sofia Rossi 满 1 年</div>
                  <div className="text-[10.5px] text-stone-500">下周二 · 5/26</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="file-text" size={13} className="text-stone-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-stone-700">Devon Ray 待签合同</div>
                  <div className="text-[10.5px] text-stone-500">已发送 3 天</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-900 text-white rounded p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Icon name="user-plus" size={13} />
              <div className="text-[12.5px] font-semibold">扩充团队？</div>
            </div>
            <div className="text-[11.5px] text-stone-300 leading-relaxed mb-3">
              点击下方按钮发送邀请链接，新成员通过链接完成入职。
            </div>
            <button onClick={() => toast('已生成邀请链接')} className="w-full h-8 rounded bg-white text-stone-900 text-[12px] font-medium hover:bg-stone-100">
              生成邀请链接
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 培训 Training panel — Manager/Trainer/Intern switcher ─
function TrainingPanel() {
  const [role, setRole] = pUS(() => {
    try { return localStorage.getItem('bz_personnel_training_role') || 'manager'; } catch { return 'manager'; }
  });
  pUE(() => {
    try { localStorage.setItem('bz_personnel_training_role', role); } catch {}
  }, [role]);

  const roles = [
    { id: 'manager', cn: '经理',     en: 'Manager', sub: '编写并发布培训课程',     icon: 'pencil-ruler' },
    { id: 'trainer', cn: '培训师',   en: 'Trainer', sub: '观察并评估实习员工',     icon: 'award' },
    { id: 'intern',  cn: '实习员工', en: 'Intern',  sub: '今日学习与练习',         icon: 'graduation-cap' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* role view-as switcher */}
      <div className="h-12 border-b border-[var(--border)] bg-white flex items-stretch shrink-0">
        <div className="flex items-center gap-2 px-5 border-r border-[var(--border)] min-w-[160px]">
          <Icon name="eye" size={13} className="text-stone-600" />
          <span className="text-[11px] text-stone-500 font-mono uppercase tracking-wider">view as</span>
        </div>
        <div className="flex-1 flex">
          {roles.map(r => {
            const active = r.id === role;
            return (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className={`flex-1 flex items-center gap-2.5 px-5 transition-colors border-r border-[var(--border)] last:border-r-0 ${
                  active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
                }`}
              >
                <Icon name={r.icon} size={14} />
                <div className="text-left min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[12.5px] font-semibold tracking-[-0.01em]">{r.cn}</span>
                    <span className={`text-[10.5px] ${active ? 'text-stone-400' : 'text-stone-400'}`}>· {r.en}</span>
                  </div>
                  <div className={`text-[10.5px] truncate ${active ? 'text-stone-300' : 'text-stone-500'}`}>{r.sub}</div>
                </div>
                {active && (
                  <span className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-white/70 bg-white/10 rounded px-1.5 py-0.5">
                    active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {role === 'manager' && <ManagerView />}
        {role === 'trainer' && <TrainerView />}
        {role === 'intern'  && <InternView />}
      </div>
    </div>
  );
}

// ─── Schedule wrapper — uses StaffingA ──────────────────────
function SchedulePanel({ state, toast }) {
  return <StaffingA state={state} toast={toast} />;
}

// ─── Root ───────────────────────────────────────────────────
function PersonnelApp() {
  const [collapsed, setCollapsed] = pUS(false);
  const [tab, setTab] = pUS(() => {
    try {
      // Bump default once for the merged team+graph tab
      if (!localStorage.getItem('bz_personnel_v3')) {
        localStorage.setItem('bz_personnel_v3', '1');
        localStorage.setItem('bz_personnel_tab', 'team');
      }
      const t = localStorage.getItem('bz_personnel_tab') || 'team';
      // Old 'org' tab id is now 'team'
      return t === 'org' ? 'team' : t;
    } catch { return 'team'; }
  });
  const [toastMsg, setToastMsg] = pUS('');
  const staffingState = useStaffingState();

  pUE(() => {
    try { localStorage.setItem('bz_personnel_tab', tab); } catch {}
  }, [tab]);

  const pending = staffingState.timeOff.filter(r => r.status === 'pending').length
                + staffingState.trades.filter(t => t.status === 'pending').length;

  return (
    <div className="h-screen w-screen flex bg-stone-50 overflow-hidden">
      <PSidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopTabs tab={tab} onChange={setTab} pendingRequests={pending} />
        {tab === 'schedule' && <SchedulePanel state={staffingState} toast={setToastMsg} />}
        {tab === 'team'     && <OrgPanel toast={setToastMsg} />}
        {tab === 'roles'    && <div className="flex-1 overflow-auto"><RolesPanelDesktop /></div>}
        {tab === 'training' && <TrainingPanel />}
      </main>
      <Toast msg={toastMsg} onDone={() => setToastMsg('')} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PersonnelApp />);
