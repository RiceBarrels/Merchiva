const { useState: _uS, useMemo: _uM, useEffect: _uE, createContext: _cC, useContext: _ucx } = React;

// ─── App chrome: left nav mirrors the real bizops app ───
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "staffing",  label: "Staffing",  icon: "calendar-clock" },
  { id: "sales",     label: "Sales",     icon: "trending-up" },
  { id: "pos",       label: "POS",       icon: "credit-card" },
  { id: "inventory", label: "Inventory", icon: "package" },
  { id: "products",  label: "Products",  icon: "shopping-bag" },
  { id: "chat",      label: "Chat",      icon: "message-square" },
  { id: "punch-in",  label: "Punch In",  icon: "clock" },
];
const NAV_BOTTOM = [
  { id: "settings",  label: "Settings",  icon: "settings" },
];

function AppSidebar({ current, onNav, collapsed, onToggleCollapse }) {
  return (
    <aside
      className="hidden lg:flex flex-col border-r border-[var(--border)] bg-white shrink-0 transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-[var(--border)]">
        <div className="h-7 w-7 rounded bg-stone-900 text-white flex items-center justify-center font-bold text-[11px] tracking-tight shrink-0">bz</div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight truncate">Maple Coffee</div>
            <div className="text-[10.5px] text-stone-500 leading-tight truncate">Oakland · Amelia</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {NAV.map(item => (
          <NavBtn key={item.id} item={item} active={current === item.id} collapsed={collapsed} onClick={() => onNav(item.id)} />
        ))}
      </nav>
      <div className="px-2 py-3 border-t border-[var(--border)] flex flex-col gap-0.5">
        {NAV_BOTTOM.map(item => (
          <NavBtn key={item.id} item={item} active={current === item.id} collapsed={collapsed} onClick={() => onNav(item.id)} />
        ))}
        <button
          onClick={onToggleCollapse}
          className="mt-1 flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <Icon name={collapsed ? "panel-left-open" : "panel-left-close"} size={15} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function NavBtn({ item, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-[13px] font-medium transition-colors ${active ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"}`}
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} size={15} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}

// ─── Page header (shared for desktop pages) ───
function PageHeader({ title, subtitle, right, breadcrumbs }) {
  return (
    <header className="h-14 border-b border-[var(--border)] bg-white flex items-center px-6 gap-3 shrink-0">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {breadcrumbs && (
          <div className="hidden xl:flex items-center gap-1.5 text-[12px] text-stone-500">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-stone-300">/</span>}
                <span className={i === breadcrumbs.length - 1 ? "text-stone-700" : ""}>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight truncate">{title}</div>
          {subtitle && <div className="text-[11.5px] text-stone-500 leading-tight truncate">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}

// ─── Avatar ───
function Avatar({ name, size = 28, color }) {
  const bg = color ?? "bg-stone-200 text-stone-700";
  const s = size;
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold ${bg}`} style={{ width: s, height: s, fontSize: Math.max(10, s * 0.38) }}>
      {initials(name)}
    </div>
  );
}

// ─── Small helpers ───
function Pill({ children, tone = "stone" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700 border-stone-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    dark: "bg-stone-900 text-white border-stone-900",
  };
  return <span className={`inline-flex items-center px-1.5 py-0.5 text-[10.5px] font-medium border rounded ${tones[tone]}`}>{children}</span>;
}

function Segmented({ options, value, onChange, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]";
  return (
    <div className="inline-flex border border-[var(--border)] rounded overflow-hidden bg-white">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`${pad} font-medium transition-colors ${i > 0 ? "border-l border-[var(--border)]" : ""} ${value === opt.value ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-50"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function IconBtn({ icon, onClick, title, active, size = 32 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center border border-[var(--border)] rounded hover:bg-stone-100 transition-colors ${active ? "bg-stone-900 text-white border-stone-900 hover:bg-stone-800" : "bg-white text-stone-700"}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function Button({ children, variant = "default", size = "md", onClick, icon, className = "" }) {
  const sizes = { sm: "h-8 px-2.5 text-[12px] gap-1.5", md: "h-9 px-3 text-[13px] gap-2" };
  const variants = {
    default: "bg-stone-900 text-white hover:bg-stone-800 border border-stone-900",
    ghost:   "bg-white text-stone-800 hover:bg-stone-100 border border-[var(--border)]",
    outline: "bg-white text-stone-800 hover:bg-stone-50 border border-[var(--border)]",
    danger:  "bg-white text-red-600 hover:bg-red-50 border border-[var(--border)]",
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center font-medium rounded transition-colors ${sizes[size]} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 14} />}
      {children}
    </button>
  );
}

// Fake mobile frame — shows the current mobile layout for comparison if user shrinks window (this is desktop-focused)
function Toast({ msg, onDone }) {
  React.useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white text-[13px] px-4 py-2 rounded shadow-lg animate-in">
      {msg}
    </div>
  );
}

Object.assign(window, {
  AppSidebar, NavBtn, PageHeader, Avatar, Pill, Segmented, IconBtn, Button, Toast,
});
