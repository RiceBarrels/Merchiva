// ═══════════════════════════════════════════════════════════
// Training · Root — bizops shell + Manager · Trainer · Intern switcher
// ═══════════════════════════════════════════════════════════

const { useState: trUS, useEffect: trUE } = React;

// Extend bizops NAV with Training item — handled here by passing a custom NAV
// (the AppSidebar in shared.jsx reads its own NAV constant, so we render a
// near-identical sidebar locally so we can highlight "Training" as current).

const T_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { id: 'staffing',  label: 'Staffing',  icon: 'calendar-clock' },
  { id: 'sales',     label: 'Sales',     icon: 'trending-up' },
  { id: 'pos',       label: 'POS',       icon: 'credit-card' },
  { id: 'inventory', label: 'Inventory', icon: 'package' },
  { id: 'products',  label: 'Products',  icon: 'shopping-bag' },
  { id: 'training',  label: 'Training',  icon: 'graduation-cap', badge: 1 },
  { id: 'chat',      label: 'Chat',      icon: 'message-square' },
  { id: 'punch-in',  label: 'Punch In',  icon: 'clock' },
];

function TrainingSidebar({ collapsed, onToggleCollapse }) {
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
        {T_NAV.map(item => {
          const active = item.id === 'training';
          return (
            <button
              key={item.id}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] font-medium transition-colors ${
                active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} size={15} />
              {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-mono font-bold flex items-center justify-center tabular-nums ${
                  active ? 'bg-white/20 text-white' : 'bg-amber-500 text-white'
                }`}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-[var(--border)] flex flex-col gap-0.5">
        <button className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100">
          <Icon name="settings" size={15} />
          {!collapsed && <span className="truncate">Settings</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          className="mt-1 flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded"
        >
          <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} size={15} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Role switcher (3 tabs, large, prominent) ───────────────
function RoleSwitcher({ role, onChange }) {
  const roles = [
    {
      id: 'manager',
      cnLabel: '经理',
      label: 'Manager',
      sub: 'Author & publish curriculum',
      icon: 'pencil-ruler',
    },
    {
      id: 'trainer',
      cnLabel: '培训师',
      label: 'Trainer',
      sub: 'Observe & grade trainees',
      icon: 'award',
    },
    {
      id: 'intern',
      cnLabel: '实习员工',
      label: 'Intern',
      sub: 'Learn & practice today',
      icon: 'graduation-cap',
    },
  ];
  return (
    <div className="h-14 border-b border-[var(--border)] bg-white flex items-stretch shrink-0">
      <div className="flex items-center gap-2 px-5 border-r border-[var(--border)]">
        <Icon name="graduation-cap" size={15} className="text-stone-700" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-[-0.01em]">Training</div>
          <div className="text-[10.5px] text-stone-500 font-mono uppercase tracking-wider">view as</div>
        </div>
      </div>
      <div className="flex-1 flex">
        {roles.map(r => {
          const active = r.id === role;
          return (
            <button
              key={r.id}
              onClick={() => onChange(r.id)}
              className={`flex-1 flex items-center gap-3 px-5 transition-colors border-r border-[var(--border)] last:border-r-0 ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className={`w-8 h-8 rounded inline-flex items-center justify-center shrink-0 ${
                active ? 'bg-white/10' : 'bg-stone-100'
              }`}>
                <Icon name={r.icon} size={15} />
              </span>
              <div className="text-left min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{r.label}</span>
                  <span className={`text-[10.5px] ${active ? 'text-stone-400' : 'text-stone-400'}`}>· {r.cnLabel}</span>
                </div>
                <div className={`text-[11px] truncate ${active ? 'text-stone-300' : 'text-stone-500'}`}>{r.sub}</div>
              </div>
              {active && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-white/70 bg-white/10 rounded px-1.5 py-0.5">
                  active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════
function TrainingApp() {
  const [role, setRole] = trUS(() => {
    try { return localStorage.getItem('bz_training_role') || 'manager'; } catch { return 'manager'; }
  });
  const [collapsed, setCollapsed] = trUS(false);

  trUE(() => {
    try { localStorage.setItem('bz_training_role', role); } catch {}
  }, [role]);

  return (
    <div className="h-screen w-screen flex bg-stone-50">
      <TrainingSidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <RoleSwitcher role={role} onChange={setRole} />
        {role === 'manager' && <ManagerView />}
        {role === 'trainer' && <TrainerView />}
        {role === 'intern'  && <InternView />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<TrainingApp />);
