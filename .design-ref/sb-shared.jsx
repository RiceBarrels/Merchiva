// ═══════════════════════════════════════════════════════════
// BizOps Mobile — Site Builder primitives & tokens.
// Stays in the achromatic stone system; v3 (实验) adds a single
// warm clay accent for "creative tool" personality.
// ═══════════════════════════════════════════════════════════

const SB = {
  bg: '#ffffff',
  surface: '#fafaf9',
  muted: '#f5f5f4',
  mutedDeep: '#eeece9',
  border: '#e7e5e4',
  borderS: '#d6d3d1',
  text: '#1c1917',
  text2: '#44403c',
  sec: '#78716c',
  ter: '#a8a29e',
  primary: '#1c1917',
  onPri: '#fafaf9',
  ok: '#059669',
  warn: '#d97706',
  danger: '#dc2626',
  accent: '#a16544',         // warm clay (v3 only)
  accentSoft: '#f5ede4',
  accentText: '#5a3a25',
  font: B.font,
  mono: B.mono,
};

// ─── Phone shell ─────────────────────────────────────────
function Phone({ children, bg = SB.bg }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: SB.text,
      fontFamily: SB.font, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>{children}</div>
  );
}

function StatBar({ dark, bg }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{
      height: 44, padding: '0 24px 0 28px', flexShrink: 0, background: bg || 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 15, fontWeight: 600, color: c,
      fontFamily: '-apple-system, system-ui',
    }}>
      <div style={{ letterSpacing: -0.2 }}>9:41</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="17" height="10" viewBox="0 0 17 10"><path d="M1 8.5h2.5V6.5H1v2zm4 0h2.5V4H5v4.5zm4 0h2.5V1.5H9v7zm4 0h2.5V0H13v8.5z" fill={c}/></svg>
        <svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="2.5" stroke={c} fill="none" opacity=".4"/><rect x="2" y="2" width="17" height="7" rx="1.5" fill={c}/><rect x="21.5" y="3.5" width="1.5" height="4" rx=".5" fill={c} opacity=".4"/></svg>
      </div>
    </div>
  );
}

// ─── Builder top bar (page title + back/actions) ─────────
function SBTopBar({ back, title, sub, right, border = true, bg }) {
  return (
    <div style={{
      padding: '8px 14px 12px', borderBottom: border ? `1px solid ${SB.border}` : 'none',
      background: bg || SB.bg, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
    }}>
      {back !== undefined && (
        <button style={{
          width: 32, height: 32, borderRadius: SB.radius || 6, border: 'none',
          background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: SB.text2, cursor: 'pointer', flexShrink: 0,
        }}><BIcon name="chevron-left" size={20} /></button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: SB.text, letterSpacing: -0.3, lineHeight: 1.15 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 2, fontFamily: SB.mono, letterSpacing: 0 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>{right}</div>
    </div>
  );
}

// ─── Pill button ─────────────────────────────────────────
function SBBtn({ icon, children, variant = 'default', size = 'md', accent, onClick, style }) {
  const styles = {
    default: { bg: SB.bg, fg: SB.text, bd: SB.border },
    primary: { bg: SB.primary, fg: SB.onPri, bd: SB.primary },
    ghost: { bg: 'transparent', fg: SB.text2, bd: 'transparent' },
    accent: { bg: SB.accent, fg: '#fff', bd: SB.accent },
    accentSoft: { bg: SB.accentSoft, fg: SB.accentText, bd: '#e8d8c5' },
    danger: { bg: SB.bg, fg: SB.danger, bd: '#fecaca' },
  }[accent ? 'accent' : variant] || { bg: SB.bg, fg: SB.text, bd: SB.border };
  const sizes = {
    sm: { h: 26, px: 9, fs: 12 },
    md: { h: 32, px: 12, fs: 13 },
    lg: { h: 38, px: 14, fs: 13.5 },
  }[size];
  return (
    <button onClick={onClick} style={{
      height: sizes.h, padding: `0 ${sizes.px}px`, borderRadius: 6,
      border: `1px solid ${styles.bd}`, background: styles.bg, color: styles.fg,
      fontFamily: SB.font, fontSize: sizes.fs, fontWeight: 500, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: -0.1,
      ...style,
    }}>
      {icon && <BIcon name={icon} size={sizes.fs + 1} />}
      {children}
    </button>
  );
}

// ─── Status dot/badge for site state ─────────────────────
function SiteStatus({ state = 'live', mono = true }) {
  const map = {
    live: { dot: SB.ok, l: 'Live', bd: '#bbf7d0', bg: '#f0fdf4', fg: SB.ok },
    draft: { dot: SB.warn, l: 'Draft', bd: '#fde68a', bg: '#fffbeb', fg: SB.warn },
    scheduled: { dot: SB.text2, l: 'Scheduled', bd: SB.border, bg: SB.muted, fg: SB.text2 },
    offline: { dot: SB.ter, l: 'Offline', bd: SB.border, bg: SB.muted, fg: SB.sec },
  }[state];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px',
      borderRadius: 4, background: map.bg, color: map.fg, border: `1px solid ${map.bd}`,
      fontSize: 11, fontWeight: 600, fontFamily: mono ? SB.mono : SB.font,
      letterSpacing: mono ? 0 : -0.1, textTransform: mono ? 'uppercase' : 'none',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 9999, background: map.dot, display: 'inline-block' }} />
      {map.l}
    </span>
  );
}

// ─── Mini fake-website preview drawing primitives ────────
// A tiny representation of the user's site, shown inside the phone.
// Pure CSS shapes, no real images.
function MiniHero({ accent, h = 90, label = 'Maple Coffee' }) {
  return (
    <div style={{
      height: h, background: accent ? SB.accentSoft : '#1c1917',
      color: accent ? SB.accentText : '#fafaf9', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 10,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.4 }}>{label}</div>
      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>Roasted in-house since 2019</div>
      {/* faux image grain */}
      <div style={{
        position: 'absolute', inset: 0,
        background: accent ? 'radial-gradient(ellipse at top right, rgba(161,101,68,.18), transparent 60%)'
                           : 'radial-gradient(ellipse at top right, rgba(255,255,255,.08), transparent 60%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

function MiniMenu({ rows = 3 }) {
  const items = [
    ['Cortado', '4.50'], ['Pour-over', '5.25'], ['Drip', '3.75'], ['Latte', '5.00'],
  ].slice(0, rows);
  return (
    <div style={{ padding: 10, borderTop: `1px solid ${SB.border}` }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SB.sec, textTransform: 'uppercase', marginBottom: 6 }}>Menu</div>
      {items.map(([n, p], i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '4px 0', borderBottom: i < items.length - 1 ? `1px dashed ${SB.border}` : 'none',
          fontSize: 10,
        }}>
          <span style={{ color: SB.text }}>{n}</span>
          <span style={{ fontFamily: SB.mono, color: SB.text2, fontVariantNumeric: 'tabular-nums' }}>${p}</span>
        </div>
      ))}
    </div>
  );
}

function MiniHours() {
  return (
    <div style={{ padding: 10, borderTop: `1px solid ${SB.border}`, background: SB.surface }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SB.sec, textTransform: 'uppercase', marginBottom: 6 }}>Hours</div>
      <div style={{ fontSize: 10, fontFamily: SB.mono, color: SB.text2, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
        Mon–Fri  7a – 6p<br/>Sat–Sun  8a – 5p
      </div>
    </div>
  );
}

function MiniGallery() {
  return (
    <div style={{ padding: 10, borderTop: `1px solid ${SB.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          aspectRatio: '1', background: `oklch(${0.78 - (i % 3) * 0.06} 0 0)`,
          borderRadius: 2,
        }} />
      ))}
    </div>
  );
}

function MiniContact({ accent }) {
  return (
    <div style={{ padding: 10, borderTop: `1px solid ${SB.border}` }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: SB.sec, textTransform: 'uppercase', marginBottom: 6 }}>Visit</div>
      <div style={{ fontSize: 10, color: SB.text2, lineHeight: 1.5 }}>
        184 Pine St, Austin TX<br/>(512) 555 0142
      </div>
      <div style={{
        marginTop: 6, height: 14, borderRadius: 3, background: accent ? SB.accent : SB.text,
        color: '#fff', fontSize: 9, fontWeight: 600, display: 'inline-flex',
        alignItems: 'center', padding: '0 8px',
      }}>Get directions</div>
    </div>
  );
}

// ─── Section type registry ──────────────────────────────
const SECTION_TYPES = [
  { id: 'hero',    icon: 'image',           label: 'Hero',    sub: 'Title + cover' },
  { id: 'text',    icon: 'type',            label: 'Text',    sub: 'Heading & paragraph' },
  { id: 'menu',    icon: 'utensils',        label: 'Menu',    sub: 'Live from BizOps' },
  { id: 'hours',   icon: 'clock',           label: 'Hours',   sub: 'Live from BizOps' },
  { id: 'gallery', icon: 'images',          label: 'Gallery', sub: 'Image grid' },
  { id: 'map',     icon: 'map-pin',         label: 'Map',     sub: 'Location' },
  { id: 'contact', icon: 'mail',            label: 'Contact', sub: 'Form + info' },
  { id: 'cta',     icon: 'arrow-up-right',  label: 'Button',  sub: 'Link / call to action' },
  { id: 'staff',   icon: 'users',           label: 'Team',    sub: 'Live from BizOps' },
];

function SectionIcon({ id, size = 32, accent }) {
  const def = SECTION_TYPES.find(s => s.id === id);
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: accent ? SB.accentSoft : SB.muted,
      border: `1px solid ${accent ? '#e8d8c5' : SB.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: accent ? SB.accentText : SB.text2, flexShrink: 0,
    }}><BIcon name={def?.icon || 'square'} size={size * 0.5} /></div>
  );
}

// ─── Theme presets ─────────────────────────────────────
const THEME_PRESETS = [
  { id: 'mono',   name: 'Press',     fonts: 'Inter · Mono',     a: '#1c1917', b: '#fafaf9', accent: false },
  { id: 'clay',   name: 'Clay',      fonts: 'Inter · Mono',     a: '#a16544', b: '#f5ede4', accent: true },
  { id: 'paper',  name: 'Paper',     fonts: 'Serif · Mono',     a: '#3a352e', b: '#f4ecd9', accent: false },
  { id: 'midnight',name:'Midnight',  fonts: 'Inter · Mono',     a: '#0a0a0a', b: '#1a1a1a', accent: false },
  { id: 'sage',   name: 'Sage',      fonts: 'Inter · Mono',     a: '#3a4a3a', b: '#eaf0e8', accent: false },
  { id: 'kraft',  name: 'Kraft',     fonts: 'Mono · Mono',      a: '#5c4a32', b: '#e8dcc4', accent: false },
];

Object.assign(window, {
  SB, Phone, StatBar, SBTopBar, SBBtn, SiteStatus,
  MiniHero, MiniMenu, MiniHours, MiniGallery, MiniContact,
  SECTION_TYPES, SectionIcon, THEME_PRESETS,
});
