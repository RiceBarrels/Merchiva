// Mobile shared primitives — used by staffing + settings mobile variants.
// Renders inside IOSDevice (402×874). We DO NOT use tailwind inside the device —
// all inline styles, native-feeling iOS type sizes, SF-ish system stack.

const M = {
  // Stone palette (mirrors desktop)
  bg: '#f2f2f7',
  bgGrouped: '#f2f2f7',
  surface: '#ffffff',
  sep: 'rgba(60,60,67,0.12)',
  sep2: 'rgba(60,60,67,0.18)',
  label: '#000',
  sec: 'rgba(60,60,67,0.6)',
  ter: 'rgba(60,60,67,0.3)',
  tint: '#1c1917',       // stone-900 as tint (matches desktop)
  tintSoft: '#44403c',
  green: '#34c759',
  red:  '#ff3b30',
  orange: '#ff9500',
  blue: '#007aff',
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
};

// Avatar with initials + color class (we translate the tailwind class to a hex bg)
const AV_COLOR = {
  'bg-stone-200 text-stone-800':     ['#e7e5e4', '#292524'],
  'bg-cyan-100 text-cyan-800':       ['#cffafe', '#155e75'],
  'bg-violet-100 text-violet-800':   ['#ede9fe', '#5b21b6'],
  'bg-rose-100 text-rose-800':       ['#ffe4e6', '#9f1239'],
  'bg-emerald-100 text-emerald-800': ['#d1fae5', '#065f46'],
  'bg-amber-100 text-amber-800':     ['#fef3c7', '#92400e'],
};
function MAvatar({ name, size = 32, color }) {
  const [bg, fg] = AV_COLOR[color] || ['#e7e5e4', '#292524'];
  return (
    <div style={{
      width: size, height: size, borderRadius: 9999, background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: Math.max(10, size * 0.4), flexShrink: 0,
      fontFamily: M.font,
    }}>{initials(name)}</div>
  );
}

// Simple SF-symbol style inline icons (line, 1.75 stroke). We only need a handful.
function MIcon({ name, size = 18, color = 'currentColor', style }) {
  const sw = 1.75;
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'chevron-right': return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case 'chevron-left':  return <svg {...p}><path d="M15 18l-6-6 6-6"/></svg>;
    case 'chevron-down':  return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'plus':          return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check':         return <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>;
    case 'x':             return <svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case 'filter':        return <svg {...p}><path d="M3 6h18M7 12h10M10 18h4"/></svg>;
    case 'search':        return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'more':          return <svg {...p}><circle cx="5" cy="12" r="1.2" fill={color}/><circle cx="12" cy="12" r="1.2" fill={color}/><circle cx="19" cy="12" r="1.2" fill={color}/></svg>;
    case 'calendar':      return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
    case 'users':         return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
    case 'inbox':         return <svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>;
    case 'clock':         return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    case 'swap':          return <svg {...p}><path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>;
    case 'bell':          return <svg {...p}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>;
    case 'user':          return <svg {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'building':      return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-5h6v5M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>;
    case 'mappin':        return <svg {...p}><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'card':          return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>;
    case 'shield':        return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'lock':          return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
    case 'package':       return <svg {...p}><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>;
    case 'plug':          return <svg {...p}><path d="M12 22v-5M9 7V2M15 7V2M5 10h14v4a7 7 0 01-14 0v-4z"/></svg>;
    case 'key':           return <svg {...p}><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M15 7l3 3M18 4l3 3"/></svg>;
    case 'code':          return <svg {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>;
    case 'star':          return <svg {...p}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
    case 'coffee':        return <svg {...p}><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>;
    case 'banknote':      return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
    case 'chef':          return <svg {...p}><path d="M6 13v7h12v-7M5 13a4 4 0 014-4h.5A3.5 3.5 0 0113 5.5h0A3.5 3.5 0 0116.5 9h.5a4 4 0 014 4c0 2-1.5 3-3 3H8c-1.5 0-3-1-3-3z"/></svg>;
    case 'sparkles':      return <svg {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6L19 14zM5 14l.8 2.4L8 17l-2.2.6L5 20l-.8-2.4L2 17l2.2-.6L5 14z"/></svg>;
    case 'edit':          return <svg {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case 'download':      return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
    case 'sun':           return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    case 'msgs':          return <svg {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
    case 'arrow-right':   return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-up-right':return <svg {...p}><path d="M7 17L17 7M7 7h10v10"/></svg>;
    case 'refresh':       return <svg {...p}><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
    case 'logout':        return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>;
    case 'zap':           return <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
    default:              return <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

// A screen-wide section divider / header label (iOS grouped-list convention)
function MGroupHeader({ children, style }) {
  return (
    <div style={{
      padding: '16px 32px 6px',
      fontFamily: M.font, fontSize: 13, letterSpacing: -0.08,
      color: M.sec, textTransform: 'uppercase', fontWeight: 500,
      ...style,
    }}>{children}</div>
  );
}

function MGroupFooter({ children }) {
  return (
    <div style={{
      padding: '6px 32px 0',
      fontFamily: M.font, fontSize: 13, letterSpacing: -0.08,
      color: M.sec, lineHeight: 1.35,
    }}>{children}</div>
  );
}

// Inset grouped card — rounded corners, dividers between rows
function MCard({ children, style }) {
  return (
    <div style={{
      background: M.surface, borderRadius: 12,
      margin: '0 16px', overflow: 'hidden',
      ...style,
    }}>{children}</div>
  );
}

// Row inside a card. 44pt min height (iOS HIG). Divider auto unless isLast.
function MRow({ leading, title, subtitle, detail, trailing, chevron = true, onClick, isLast = false, leadingIconBg, destructive = false, titleColor }) {
  return (
    <div onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', minHeight: 44,
        padding: '10px 16px', position: 'relative', gap: 12,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: M.font,
      }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 17, letterSpacing: -0.43,
          color: destructive ? M.red : (titleColor || M.label),
          fontWeight: 400, lineHeight: '22px',
        }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: M.sec, marginTop: 2, lineHeight: '17px', letterSpacing: -0.08 }}>{subtitle}</div>}
      </div>
      {detail && <span style={{ color: M.sec, fontSize: 17, letterSpacing: -0.43 }}>{detail}</span>}
      {trailing}
      {chevron && (
        <svg width="8" height="13" viewBox="0 0 8 13" style={{ flexShrink: 0 }}>
          <path d="M1 1l5.5 5.5L1 12" stroke={M.ter} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {!isLast && (
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          left: leading ? 60 : 16, height: 0.5, background: M.sep,
        }} />
      )}
    </div>
  );
}

// Filled square 29pt icon tile for settings rows
function MIconTile({ name, bg, color = '#fff', size = 29 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 7,
      background: bg, color: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <MIcon name={name} size={size * 0.6} color={color} />
    </div>
  );
}

// iOS-style toggle
function MSwitch({ on, onChange }) {
  return (
    <div onClick={() => onChange && onChange(!on)}
      style={{
        width: 51, height: 31, borderRadius: 9999,
        background: on ? M.green : '#e9e9ea',
        display: 'flex', alignItems: 'center',
        padding: 2, cursor: 'pointer',
        transition: 'background .15s',
        flexShrink: 0,
      }}>
      <div style={{
        width: 27, height: 27, borderRadius: 9999, background: '#fff',
        boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06)',
        transform: on ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform .15s',
      }} />
    </div>
  );
}

// Tab bar (bottom)
function MTabBar({ current, items, onTab }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 83, background: 'rgba(249,249,249,0.94)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderTop: '0.5px solid rgba(60,60,67,0.12)',
      display: 'flex', justifyContent: 'space-around',
      paddingTop: 6, paddingBottom: 30,
      fontFamily: M.font, zIndex: 40,
    }}>
      {items.map(it => {
        const active = it.id === current;
        return (
          <div key={it.id} onClick={() => onTab && onTab(it.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, cursor: 'pointer', flex: 1,
              color: active ? M.tint : M.sec,
            }}>
            <MIcon name={it.icon} size={25} color={active ? M.tint : M.sec} />
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 0.1 }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// Large-title header (scroll-static version) — reusable
function MLargeTitle({ title, trailing, leading }) {
  return (
    <div style={{ paddingTop: 54, paddingBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px',
        minHeight: 44,
      }}>
        {leading || <div />}
        <div style={{ display: 'flex', gap: 14 }}>{trailing}</div>
      </div>
      <div style={{
        padding: '4px 20px 8px',
        fontFamily: M.font, fontSize: 34, fontWeight: 700,
        letterSpacing: 0.37, lineHeight: '41px',
      }}>{title}</div>
    </div>
  );
}

// Pill badge
function MBadge({ children, tone = 'stone' }) {
  const tones = {
    stone: { bg: 'rgba(120,120,128,0.16)', fg: M.label },
    green: { bg: 'rgba(52,199,89,0.18)', fg: '#1f7a3a' },
    amber: { bg: 'rgba(255,149,0,0.18)', fg: '#a65800' },
    red:   { bg: 'rgba(255,59,48,0.18)', fg: '#a01c17' },
    blue:  { bg: 'rgba(0,122,255,0.14)', fg: '#0053b3' },
    dark:  { bg: M.label, fg: '#fff' },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 9999,
      background: t.bg, color: t.fg,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.1,
      lineHeight: '16px', fontFamily: M.font,
    }}>{children}</span>
  );
}

Object.assign(window, {
  M, MAvatar, MIcon, MGroupHeader, MGroupFooter, MCard, MRow, MIconTile,
  MSwitch, MTabBar, MLargeTitle, MBadge,
});
