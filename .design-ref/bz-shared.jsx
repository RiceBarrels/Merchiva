// ═══════════════════════════════════════════════════════════
// BizOps Mobile — faithful to the design system.
// - Achromatic stone palette, 3px radii, 1px borders
// - Dense, tool-like, Inter + Geist Mono for numbers
// - Single phone with Staffing + Settings wired to the bottom tab bar
// ═══════════════════════════════════════════════════════════

const { useState: bzUS } = React;

// ─── Tokens (light theme) ────────────────────────────────
const B = {
  bg:       '#ffffff',                     // --background
  surface:  '#fafaf9',                     // --sidebar / stone-50
  muted:    '#f5f5f4',                     // stone-100
  border:   '#e7e5e4',                     // stone-200 — close to --border
  borderS:  '#d6d3d1',                     // stone-300
  text:     '#1c1917',                     // stone-900
  text2:    '#44403c',                     // stone-700
  sec:      '#78716c',                     // stone-500
  ter:      '#a8a29e',                     // stone-400
  primary:  '#1c1917',                     // near-black
  onPri:    '#fafaf9',
  danger:   '#dc2626',                     // destructive
  warn:     '#d97706',                     // amber-600
  ok:       '#059669',                     // emerald-600
  font:     "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono:     "'JetBrains Mono', 'Geist Mono', ui-monospace, monospace",
  radius:   '0.3rem',                      // 3px base
  radiusLg: '0.5rem',                      // rounded-lg — cards / tiles
};

// ─── Lucide icon wrapper (16px default) ──────────────────
function BIcon({ name, size = 16, color = 'currentColor', strokeWidth = 1.75, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const key = name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
      const def = window.lucide.icons[key] || window.lucide.icons.Circle;
      const svg = window.lucide.createElement(def);
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('stroke-width', strokeWidth);
      svg.setAttribute('stroke', color);
      ref.current.appendChild(svg);
    }
  }, [name, size, strokeWidth, color]);
  return <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, ...style }} aria-hidden />;
}

// ─── Primitives ──────────────────────────────────────────
function Avatar({ name, size = 24 }) {
  const i = initials(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: B.radius,
      background: B.muted, border: `1px solid ${B.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 24 ? 10 : 11, fontWeight: 600, color: B.text2, letterSpacing: 0.2,
      flexShrink: 0,
    }}>{i}</div>
  );
}

function Badge({ children, tone = 'default', mono = false, style }) {
  const tones = {
    default:  { bg: B.muted,    fg: B.text2,  bd: B.border },
    outline:  { bg: B.bg,       fg: B.text2,  bd: B.border },
    warn:     { bg: '#fffbeb',  fg: B.warn,   bd: '#fde68a' },
    ok:       { bg: '#f0fdf4',  fg: B.ok,     bd: '#bbf7d0' },
    danger:   { bg: '#fef2f2',  fg: B.danger, bd: '#fecaca' },
    mute:     { bg: 'transparent', fg: B.sec, bd: 'transparent' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: 20, padding: '0 6px', borderRadius: B.radius,
      background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`,
      fontSize: 11, fontWeight: 500, fontFamily: mono ? B.mono : B.font,
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      letterSpacing: mono ? 0 : -0.1,
      ...style,
    }}>{children}</span>
  );
}

function IconBtn({ icon, onClick, size = 34, active }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: B.radius,
      border: `1px solid ${active ? B.borderS : 'transparent'}`,
      background: active ? B.muted : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: B.text2,
    }}>
      <BIcon name={icon} size={17} />
    </button>
  );
}

function TopBar({ title, right, subtitle }) {
  return (
    <div style={{
      padding: '16px 18px 14px', borderBottom: `1px solid ${B.border}`,
      background: B.bg, display: 'flex', alignItems: 'center', gap: 10,
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: B.text, letterSpacing: -0.4, lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: B.sec, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{right}</div>
    </div>
  );
}

function Label({ children, style }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, color: B.sec,
      letterSpacing: 0.8, textTransform: 'uppercase',
      ...style,
    }}>{children}</div>
  );
}

function TabBar({ current, onTab }) {
  const items = [
    { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'staffing',  icon: 'users',            label: 'Staffing' },
    { id: 'inventory', icon: 'package',          label: 'Inventory' },
    { id: 'sales',     icon: 'trending-up',      label: 'Sales' },
    { id: 'settings',  icon: 'settings',         label: 'Settings' },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${B.border}`,
      background: B.bg,
      display: 'flex', alignItems: 'stretch',
      padding: '8px 6px 24px', // home indicator safe area
      gap: 2,
    }}>
      {items.map(it => {
        const active = current === it.id;
        return (
          <button key={it.id} onClick={() => onTab(it.id)} style={{
            flex: 1, padding: '8px 0 6px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: active ? B.text : B.ter,
            position: 'relative',
            transition: 'color 120ms ease',
          }}>
            <div style={{
              width: 40, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 999,
              background: active ? B.muted : 'transparent',
              transition: 'background 160ms ease',
            }}>
              <BIcon name={it.icon} size={18} strokeWidth={active ? 2 : 1.6} />
            </div>
            <div style={{
              fontSize: 10, fontWeight: active ? 600 : 500,
              letterSpacing: 0.1,
            }}>{it.label}</div>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { B, BIcon, Avatar, Badge, IconBtn, TopBar, Label, TabBar });
