// ═══════════════════════════════════════════════════════════
// BizOps · Site Builder — shared primitives
// (Phone, StatBar, MiniTab, SBTop, SBSect, SBLab, SBIcon, BlockRow,
//  PubPill, BIcon, SitePreview, palette SB)
// ═══════════════════════════════════════════════════════════

const SB = {
  bg: '#ffffff',
  surface: '#fafaf9',
  muted: '#f5f5f4',
  border: '#e7e5e4',
  borderS: '#d6d3d1',
  text: '#1c1917',
  text2: '#44403c',
  sec: '#78716c',
  ter: '#a8a29e',
  onPri: '#fafaf9',
  ok: '#059669',
  warn: '#d97706',
  danger: '#dc2626',
  accent: '#a16544',
  accentSoft: '#f5ede4',
  accentBorder: '#e6d4c0',
  accentText: '#5a3a25',
  radius: 6,
  radiusLg: 8,
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
};

// ─── Lucide-style icon set (stroke 1.6, 24-vb, mostly used at 14-18) ───
function BIcon({ name, size = 16, color = 'currentColor', strokeWidth = 1.7 }) {
  const c = color;
  const sw = strokeWidth;
  const paths = {
    'globe': (<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>),
    'eye': (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
    'more-horizontal': (<><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></>),
    'plus': <path d="M12 5v14M5 12h14"/>,
    'check': <path d="M5 13l4 4L19 7"/>,
    'x': <path d="M6 6l12 12M18 6L6 18"/>,
    'chevron-right': <path d="M9 6l6 6-6 6"/>,
    'chevron-left': <path d="M15 6l-6 6 6 6"/>,
    'edit-3': (<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></>),
    'image': (<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>),
    'utensils': (<><path d="M3 2v7a3 3 0 003 3v9M9 2v20M14 8c0-3 2-6 6-6v20"/></>),
    'mail': (<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/></>),
    'clock': (<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
    'file': (<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></>),
    'book-open': <path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2zM22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/>,
    'minus': <path d="M5 12h14"/>,
    'type': <path d="M4 7V5h16v2M9 5v14M15 19h-6"/>,
    'palette': (<><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 100 20c.6 0 1-.5 1-1.1 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 0-.6.4-1 1-1H15a5 5 0 005-5c0-5-4.5-9-9-9z"/></>),
    'upload-cloud': (<><path d="M16 16l-4-4-4 4M12 12v9"/><path d="M20 16.7A5 5 0 0018 7h-1.3A8 8 0 103 15.3"/><path d="M16 16l-4-4-4 4"/></>),
    'sparkles': <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2zM5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17zM19 14l.6 1.4L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.6L19 14z"/>,
    'external-link': <path d="M15 3h6v6M10 14L21 3M21 14v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h6"/>,
    'search': (<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>),
    'upload': <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>,
    'paperclip': <path d="M21 11l-9.5 9.5a5 5 0 11-7-7L13 4.5A3.5 3.5 0 1118 9.5L9 18a2 2 0 11-3-3l8-8"/>,
    'undo': <path d="M3 7v6h6M3 13a9 9 0 1015-6"/>,
    'redo': <path d="M21 7v6h-6M21 13a9 9 0 11-15-6"/>,
    'bold': <path d="M6 4h7a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h8a4 4 0 014 4 4 4 0 01-4 4H6z"/>,
    'italic': <path d="M19 4h-9M14 20H5M15 4l-6 16"/>,
    'align-left': <path d="M17 10H3M21 6H3M21 14H3M17 18H3"/>,
    'align-center': <path d="M19 10H5M21 6H3M21 14H3M19 18H5"/>,
    'refresh-cw': <path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0020.5 15"/>,
    'zap': <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>,
    'calendar': (<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></>),
    'share': <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>,
    'link': <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>,
    'copy': (<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>),
    'trash-2': <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>,
    'package': <path d="M16.5 9.4L7.5 4.2M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7zM3.3 7L12 12l8.7-5M12 22V12"/>,
    'users': <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/>,
    'settings': (<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></>),
    'layout-dashboard': (<><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>),
    'info': (<><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths[name] || <circle cx="12" cy="12" r="3"/>}
    </svg>
  );
}

// Status bar (slim)
function StatBar({ dark }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div style={{ height: 44, padding: '0 22px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: c, fontFamily: '-apple-system, system-ui' }}>
      <div>9:41</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="16" height="10" viewBox="0 0 16 10"><path d="M1 9h2V7H1v2zm4 0h2V5H5v4zm4 0h2V3H9v6zm4 0h2V1h-2v8z" fill={c}/></svg>
        <svg width="13" height="10" viewBox="0 0 13 10" fill={c}><path d="M6.5 1A6 6 0 011 4l-.7-.7A7 7 0 016.5 0a7 7 0 016.2 3.3L12 4a6 6 0 00-5.5-3z"/><circle cx="6.5" cy="8" r="1.5"/></svg>
        <svg width="22" height="10" viewBox="0 0 22 10"><rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke={c} strokeOpacity="0.4"/><rect x="2" y="2" width="15" height="6" rx="1" fill={c}/><rect x="20" y="3.5" width="1.2" height="3" rx="0.4" fill={c} fillOpacity="0.4"/></svg>
      </div>
    </div>
  );
}

function Phone({ children, bg = SB.bg }) {
  return (
    <div style={{ width: '100%', height: '100%', background: bg, color: SB.text, fontFamily: SB.font, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <StatBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

function MiniTab({ current = 'site' }) {
  const items = [{id:'dash',i:'layout-dashboard'},{id:'site',i:'globe'},{id:'inv',i:'package'},{id:'team',i:'users'},{id:'set',i:'settings'}];
  return (
    <div style={{ borderTop: `1px solid ${SB.border}`, background: SB.bg, display: 'flex', padding: '6px 4px 14px', flexShrink: 0 }}>
      {items.map(it => {
        const a = current === it.id;
        return (
          <div key={it.id} style={{ flex: 1, padding: '6px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: a ? SB.text : SB.ter }}>
            <div style={{ width: 36, height: 22, borderRadius: 999, background: a ? SB.muted : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BIcon name={it.i} size={15} strokeWidth={a ? 2 : 1.6} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Top app bar — small monochrome (tool-like). Renders large title + optional sub + right slot.
function SBTop({ title, sub, back, right }) {
  return (
    <div style={{ padding: '4px 8px 12px', display: 'flex', alignItems: 'flex-start', gap: 4, flexShrink: 0, borderBottom: `1px solid ${SB.border}`, background: 'inherit' }}>
      {back && <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BIcon name="chevron-left" size={18} color={SB.text2} /></button>}
      <div style={{ flex: 1, padding: back ? '4px 0 0' : '4px 6px 0' }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: SB.text, letterSpacing: -0.3 }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 1, fontFamily: title.includes('.') || sub.includes('.') ? SB.mono : SB.font }}>{sub}</div>}
      </div>
      {right && <div style={{ display: 'flex', gap: 2, padding: 2 }}>{right}</div>}
    </div>
  );
}

function SBIcon({ icon }) {
  return <button style={{ width: 32, height: 32, borderRadius: SB.radius, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BIcon name={icon} size={16} color={SB.text2}/></button>;
}

function SBLab({ children }) {
  return <div style={{ fontSize: 9.5, color: SB.sec, letterSpacing: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>{children}</div>;
}

function SBSect({ title, count, action, children }) {
  return (
    <div>
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <SBLab>{title}</SBLab>
          {count!=null && <span style={{ fontSize: 10, color: SB.ter, fontFamily: SB.mono }}>{count}</span>}
        </div>
        {action && <span style={{ fontSize: 11.5, color: SB.text2, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{action.l} <BIcon name={action.i} size={11}/></span>}
      </div>
      {children}
    </div>
  );
}

// Block row — drag handle optional, icon, title, meta, badge, last
function BlockRow({ icon, title, meta, drag, badge, last }) {
  return (
    <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${SB.border}`, borderBottom: last ? `1px solid ${SB.border}` : 'none', background: SB.bg, minHeight: 52 }}>
      {drag && <span style={{ display: 'flex', flexDirection: 'column', gap: 2, color: SB.ter, padding: '0 2px' }}>
        <span style={{ display: 'flex', gap: 2 }}><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/></span>
        <span style={{ display: 'flex', gap: 2 }}><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/></span>
        <span style={{ display: 'flex', gap: 2 }}><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/><span style={{ width: 2, height: 2, borderRadius: 999, background: 'currentColor' }}/></span>
      </span>}
      {icon && <div style={{ width: 28, height: 28, borderRadius: 5, background: SB.muted, border: `1px solid ${SB.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: SB.text2, flexShrink: 0 }}>
        <BIcon name={icon} size={14}/>
      </div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: SB.text, letterSpacing: -0.1 }}>{title}</div>
        {meta && <div style={{ fontSize: 11.5, color: SB.sec, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
      </div>
      {badge}
      <BIcon name="chevron-right" size={13} color={SB.ter}/>
    </div>
  );
}

// Publish state pill
function PubPill({ state = 'live', compact, accent }) {
  const map = {
    live: ['Live', SB.ok, '#f0fdf4', '#bbf7d0'],
    draft: ['Draft', SB.warn, '#fffbeb', '#fde68a'],
    scheduled: ['Scheduled', SB.text2, SB.muted, SB.border],
  };
  const [l,c,bg,br] = map[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: compact?20:22, padding: compact?'0 7px':'0 9px', borderRadius: 999, background: bg, color: c, fontSize: compact?10.5:11, fontWeight: 600, border: `1px solid ${br}` }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: c }}/>{l}{accent && ' v.43'}
    </span>
  );
}

// Tiny site preview — used inside artboards
function SitePreview({ w = 200, h = 250, theme = 'mono' }) {
  const palette = ({
    mono:   { bg: '#fafaf9', fg: '#1c1917', sec: '#78716c', card: '#fff', acc: '#1c1917' },
    cream:  { bg: '#f5ede4', fg: '#3d2c1f', sec: '#7a4a2a', card: '#faf3ea', acc: '#7a4a2a' },
    forest: { bg: '#1f2a23', fg: '#e8f0ea', sec: '#9bb0a3', card: '#293831', acc: '#7ab091' },
    paper:  { bg: '#ffffff', fg: '#1c1917', sec: '#78716c', card: '#f5ede4', acc: '#a16544' },
  })[theme] || { bg: '#fafaf9', fg: '#1c1917', sec: '#78716c', card: '#fff', acc: '#1c1917' };
  const ff = theme === 'cream' ? 'Georgia, serif' : SB.font;
  return (
    <div style={{ width: w, height: h, background: palette.bg, color: palette.fg, fontFamily: ff, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize: 7 }}>
      <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${palette.fg}1A` }}>
        <span style={{ fontWeight: 700, letterSpacing: 0.4, fontSize: 6 }}>MAPLE COFFEE</span>
        <span style={{ color: palette.sec }}>Menu · About</span>
      </div>
      <div style={{ padding: '12px 8px 8px' }}>
        <div style={{ fontSize: theme==='cream'?13:12, fontWeight: 600, lineHeight: 1.05, letterSpacing: -0.3 }}>Slow coffee,<br/>fast smiles.</div>
        <div style={{ marginTop: 6, fontSize: 6.5, color: palette.sec, lineHeight: 1.4 }}>Single-origin pour-overs and pastries baked daily.</div>
        <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 7px', background: palette.acc, color: palette.bg, fontSize: 6, fontWeight: 600, borderRadius: theme==='cream'?2:3 }}>See the menu →</div>
      </div>
      <div style={{ flex: 1, margin: '0 8px 6px', borderRadius: 3, background: palette.card, border: `1px solid ${palette.fg}1A`, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: 0.5, color: palette.sec }}>TODAY</div>
        {[['Drip','$4'],['Cortado','$5'],['Almond Latte','$6']].map(r=>(
          <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6.5 }}>
            <span>{r[0]}</span><span style={{ fontFamily: SB.mono }}>{r[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SB, BIcon, StatBar, Phone, MiniTab, SBTop, SBIcon, SBLab, SBSect, BlockRow, PubPill, SitePreview });
