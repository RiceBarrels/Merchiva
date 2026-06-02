// Desktop Date + Time popup pickers — BizOps system.
// 3 popup variations × 2 (date · time), each with a button trigger
// rendered inside a macOS window for context. Comfortable density.

const { useState: dpUS, useRef: dpUR, useEffect: dpUE } = React;

// ─── tokens (BizOps) ────────────────────────────────────────
const BZ = {
  bg:       '#ffffff',
  fg:       'oklch(0.145 0 0)',
  card:     '#ffffff',
  primary:  'oklch(0.205 0 0)',
  primaryFg:'oklch(0.985 0 0)',
  muted:    'oklch(0.97 0 0)',
  mutedFg:  'oklch(0.556 0 0)',
  border:   'oklch(0.922 0 0)',
  emerald:  '#059669',
  amber:    '#d97706',
  blue:     '#2563eb',
  stone50:  '#fafaf9',
  stone100: '#f5f5f4',
  stone200: '#e7e5e4',
  stone300: '#d6d3d1',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  stone700: '#44403c',
  stone800: '#292524',
  stone900: '#1c1917',
  fontUi:   'Inter, ui-sans-serif, system-ui, sans-serif',
  fontMono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
};

const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_S       = ['S','M','T','W','T','F','S'];
const DOW_3       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DP_TODAY    = new Date(2026, 3, 28);

const pad2  = n => String(n).padStart(2, '0');
const sameDay = (a,b) => a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
const fmtISO = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fmtTime12 = (h24, m) => {
  const ap = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ap}`;
};

// ─── Lucide-ish icons (1.75 stroke) ──────────────────────────
function Ic({ name, size = 14, color = 'currentColor', style }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'chevron-left':  return <svg {...p}><path d="M15 18l-6-6 6-6"/></svg>;
    case 'chevron-right': return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case 'chevron-down':  return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chevron-up':    return <svg {...p}><path d="M18 15l-6-6-6 6"/></svg>;
    case 'calendar':      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'clock':         return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    case 'minus':         return <svg {...p}><path d="M5 12h14"/></svg>;
    case 'plus':          return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'x':             return <svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case 'check':         return <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>;
    case 'sun':           return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    case 'moon':          return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'sunrise':       return <svg {...p}><path d="M17 18a5 5 0 00-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4"/></svg>;
    default:              return null;
  }
}

// ─── primitives ─────────────────────────────────────────────
const dpPrimaryBtn = {
  height: 32, padding: '0 14px', borderRadius: 6, border: '1px solid transparent',
  background: BZ.primary, color: BZ.primaryFg, fontSize: 13, fontWeight: 500,
  cursor: 'pointer', letterSpacing: -0.1, whiteSpace: 'nowrap',
};
const dpOutlineBtn = {
  height: 32, padding: '0 12px', borderRadius: 6, border: `1px solid ${BZ.border}`,
  background: BZ.bg, color: BZ.fg, fontSize: 13, fontWeight: 500,
  cursor: 'pointer', letterSpacing: -0.05, whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 8,
};
const dpGhostBtn = (active) => ({
  height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid transparent',
  background: active ? BZ.stone100 : 'transparent', color: BZ.fg,
  fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
});
const dpIconBtn = {
  width: 28, height: 28, borderRadius: 6, border: `1px solid ${BZ.border}`,
  background: BZ.bg, color: BZ.fg, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
function DPLabel({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase', letterSpacing: 0.6 }}>{children}</div>;
}

// ─── popup shell — floating panel with shadow + small arrow ─
function Popup({ width = 320, anchor, children, style }) {
  const arrow = anchor === 'top' ? null : (
    <div style={{
      position: 'absolute', top: -5, left: 24, width: 10, height: 10,
      background: BZ.bg, transform: 'rotate(45deg)',
      borderTop: `1px solid ${BZ.border}`, borderLeft: `1px solid ${BZ.border}`,
    }} />
  );
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', left: 0, width,
      background: BZ.bg, border: `1px solid ${BZ.border}`, borderRadius: 10,
      boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
      zIndex: 50, ...style,
    }}>
      {arrow}
      {children}
    </div>
  );
}

// ─── input-style trigger ───────────────────────────────────
function FieldTrigger({ icon, label, value, placeholder, open, onClick, width = 220, mono = true }) {
  return (
    <button onClick={onClick} style={{
      height: 36, width, padding: '0 10px',
      border: `1px solid ${open ? BZ.stone400 : BZ.border}`, borderRadius: 6,
      background: BZ.bg, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 8,
      boxShadow: open ? `0 0 0 3px ${BZ.stone200}` : 'none',
      transition: 'box-shadow 120ms, border-color 120ms',
    }}>
      {icon && <Ic name={icon} size={14} color={BZ.stone500} />}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        {label && <div style={{ fontSize: 10, color: BZ.stone500, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 1, marginBottom: 2 }}>{label}</div>}
        <div style={{
          fontFamily: mono ? BZ.fontMono : BZ.fontUi, fontVariantNumeric: 'tabular-nums',
          fontSize: 13, fontWeight: 500, color: value ? BZ.fg : BZ.stone400,
          lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {value || placeholder}
        </div>
      </div>
      <Ic name="chevron-down" size={14} color={BZ.stone500} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// CALENDAR — shared popup body
// ═══════════════════════════════════════════════════════════
function CalendarBody({ selected, onSelect, view, setView, dense }) {
  const y = view.getFullYear(), m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);

  const cellSz = dense ? 32 : 36;

  return (
    <div>
      {/* month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
        <button onClick={()=>setView(new Date(y, m-1, 1))} style={dpIconBtn}>
          <Ic name="chevron-left" size={14} color={BZ.stone600} />
        </button>
        <button style={{ ...dpGhostBtn(false), display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 }}>
          {MONTHS[m]} <span style={{ fontFamily: BZ.fontMono, color: BZ.stone500, fontWeight: 500 }}>{y}</span>
          <Ic name="chevron-down" size={12} color={BZ.stone500} />
        </button>
        <button onClick={()=>setView(new Date(y, m+1, 1))} style={dpIconBtn}>
          <Ic name="chevron-right" size={14} color={BZ.stone600} />
        </button>
      </div>

      {/* DOW header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DOW_S.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 600,
            color: BZ.stone500, letterSpacing: 0.6, textTransform: 'uppercase',
            padding: '4px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          const empty = !d;
          const isSel = d && sameDay(d, selected);
          const isToday = d && sameDay(d, DP_TODAY);
          return (
            <button key={i} disabled={empty} onClick={()=> d && onSelect(d)}
              style={{
                height: cellSz, border: 'none', borderRadius: 6,
                background: isSel ? BZ.primary : (isToday ? BZ.stone100 : 'transparent'),
                color: isSel ? BZ.primaryFg : BZ.fg,
                cursor: empty ? 'default' : 'pointer',
                fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 13,
                fontWeight: isSel ? 600 : 400, padding: 0, position: 'relative',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!isSel && d) e.currentTarget.style.background = BZ.stone50; }}
              onMouseLeave={e => { if (!isSel && d) e.currentTarget.style.background = isToday ? BZ.stone100 : 'transparent'; }}
            >
              {d && d.getDate()}
              {isToday && !isSel && (
                <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: 9999, background: BZ.fg }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATE A — Pure calendar popup (single column, no presets)
// Trigger: simple input field. Confirm/cancel footer.
// ═══════════════════════════════════════════════════════════
function DatePopupA() {
  const [open, setOpen] = dpUS(true);
  const [selected, setSelected] = dpUS(new Date(DP_TODAY));
  const [view, setView] = dpUS(new Date(DP_TODAY.getFullYear(), DP_TODAY.getMonth(), 1));

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="calendar" label="Date" value={fmtISO(selected)} open={open} onClick={()=>setOpen(o=>!o)} width={220} />
      {open && (
        <Popup width={300}>
          <div style={{ padding: 12 }}>
            <CalendarBody selected={selected} onSelect={setSelected} view={view} setView={setView} />
          </div>
          <div style={{ borderTop: `1px solid ${BZ.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: BZ.stone50, borderRadius: '0 0 10px 10px' }}>
            <div style={{ fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 12, color: BZ.stone600 }}>
              {fmtISO(selected)} <span style={{ color: BZ.stone400 }}>· {DOW_3[selected.getDay()]}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...dpOutlineBtn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={()=>setOpen(false)}>Cancel</button>
              <button style={{ ...dpPrimaryBtn, height: 28, padding: '0 12px', fontSize: 12 }} onClick={()=>setOpen(false)}>Apply</button>
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATE B — Calendar + presets rail (left)
// Trigger: button styled. No footer — click-to-apply.
// ═══════════════════════════════════════════════════════════
function DatePopupB() {
  const [open, setOpen] = dpUS(true);
  const [selected, setSelected] = dpUS(new Date(DP_TODAY));
  const [view, setView] = dpUS(new Date(DP_TODAY.getFullYear(), DP_TODAY.getMonth(), 1));

  const presets = [
    { l: 'Today',         d: DP_TODAY },
    { l: 'Tomorrow',      d: addDays(DP_TODAY, 1) },
    { l: 'In 3 days',     d: addDays(DP_TODAY, 3) },
    { l: 'Next Monday',   d: addDays(DP_TODAY, (1 + 7 - DP_TODAY.getDay()) % 7 || 7) },
    { l: 'Next week',     d: addDays(DP_TODAY, 7) },
    { l: 'In 2 weeks',    d: addDays(DP_TODAY, 14) },
    { l: 'Next month',    d: addDays(DP_TODAY, 30) },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="calendar" label="Due date" value={fmtISO(selected)} open={open} onClick={()=>setOpen(o=>!o)} width={240} />
      {open && (
        <Popup width={460}>
          <div style={{ display: 'flex' }}>
            {/* presets rail */}
            <div style={{
              width: 150, padding: 8, borderRight: `1px solid ${BZ.border}`,
              display: 'flex', flexDirection: 'column', gap: 1, background: BZ.stone50,
              borderRadius: '10px 0 0 10px',
            }}>
              <DPLabel>Quick</DPLabel>
              <div style={{ height: 6 }} />
              {presets.map((p, i) => {
                const active = sameDay(selected, p.d);
                return (
                  <button key={i} onClick={()=>{ setSelected(p.d); setView(new Date(p.d.getFullYear(), p.d.getMonth(), 1)); }}
                    style={{
                      height: 26, padding: '0 8px', textAlign: 'left',
                      border: 'none', borderRadius: 6,
                      background: active ? BZ.bg : 'transparent',
                      color: BZ.fg, fontSize: 12, fontWeight: active ? 600 : 500,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                      boxShadow: active ? `inset 0 0 0 1px ${BZ.border}` : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = BZ.stone100; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.l}</span>
                    <span style={{ fontFamily: BZ.fontMono, fontSize: 10, color: BZ.stone500, flexShrink: 0 }}>{pad2(p.d.getMonth()+1)}-{pad2(p.d.getDate())}</span>
                  </button>
                );
              })}
            </div>
            {/* calendar */}
            <div style={{ flex: 1, padding: 12 }}>
              <CalendarBody selected={selected} onSelect={(d)=>{ setSelected(d); }} view={view} setView={setView} />
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATE C — Two-month side-by-side, big and explorable
// Trigger: button. Apply/cancel footer.
// ═══════════════════════════════════════════════════════════
function DatePopupC() {
  const [open, setOpen] = dpUS(true);
  const [selected, setSelected] = dpUS(new Date(DP_TODAY));
  const [view, setView] = dpUS(new Date(DP_TODAY.getFullYear(), DP_TODAY.getMonth(), 1));

  const y2 = view.getMonth() === 11 ? view.getFullYear() + 1 : view.getFullYear();
  const m2 = (view.getMonth() + 1) % 12;
  const view2 = new Date(y2, m2, 1);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="calendar" label="Pick date" value={fmtISO(selected)} open={open} onClick={()=>setOpen(o=>!o)} width={240} />
      {open && (
        <Popup width={580}>
          {/* nav row spanning both */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 4px' }}>
            <button onClick={()=>setView(new Date(view.getFullYear(), view.getMonth()-1, 1))} style={dpIconBtn}>
              <Ic name="chevron-left" size={14} color={BZ.stone600} />
            </button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 32, fontSize: 13, fontWeight: 600 }}>
              <span>{MONTHS[view.getMonth()]} <span style={{ fontFamily: BZ.fontMono, color: BZ.stone500, fontWeight: 500 }}>{view.getFullYear()}</span></span>
              <span>{MONTHS[m2]} <span style={{ fontFamily: BZ.fontMono, color: BZ.stone500, fontWeight: 500 }}>{y2}</span></span>
            </div>
            <button onClick={()=>setView(new Date(view.getFullYear(), view.getMonth()+1, 1))} style={dpIconBtn}>
              <Ic name="chevron-right" size={14} color={BZ.stone600} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', padding: '0 12px 12px', gap: 0 }}>
            <CalendarBodyHeadless selected={selected} onSelect={setSelected} view={view} />
            <div style={{ background: BZ.border, margin: '8px 8px' }} />
            <CalendarBodyHeadless selected={selected} onSelect={setSelected} view={view2} />
          </div>

          <div style={{ borderTop: `1px solid ${BZ.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: BZ.stone50, borderRadius: '0 0 10px 10px' }}>
            <div>
              <div style={{ fontSize: 10.5, color: BZ.stone500, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Selected</div>
              <div style={{ fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 500, marginTop: 1 }}>
                {fmtISO(selected)} <span style={{ color: BZ.stone500 }}>· {DOW_3[selected.getDay()]}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...dpOutlineBtn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={()=>setOpen(false)}>Cancel</button>
              <button style={{ ...dpPrimaryBtn, height: 28, padding: '0 12px', fontSize: 12 }} onClick={()=>setOpen(false)}>Apply</button>
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}

function CalendarBodyHeadless({ selected, onSelect, view }) {
  const y = view.getFullYear(), m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DOW_S.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: BZ.stone500, letterSpacing: 0.6, textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          const empty = !d;
          const isSel = d && sameDay(d, selected);
          const isToday = d && sameDay(d, DP_TODAY);
          return (
            <button key={i} disabled={empty} onClick={()=> d && onSelect(d)}
              style={{
                height: 32, border: 'none', borderRadius: 6,
                background: isSel ? BZ.primary : (isToday ? BZ.stone100 : 'transparent'),
                color: isSel ? BZ.primaryFg : BZ.fg,
                cursor: empty ? 'default' : 'pointer',
                fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 12.5,
                fontWeight: isSel ? 600 : 400, padding: 0, position: 'relative',
              }}
              onMouseEnter={e => { if (!isSel && d) e.currentTarget.style.background = BZ.stone50; }}
              onMouseLeave={e => { if (!isSel && d) e.currentTarget.style.background = isToday ? BZ.stone100 : 'transparent'; }}
            >
              {d && d.getDate()}
              {isToday && !isSel && (
                <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: 9999, background: BZ.fg }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TIME A — Numeric stepper (compact, dense)
// HH : MM with chevron up/down + AM/PM toggle + increment chip
// ═══════════════════════════════════════════════════════════
function TimePopupA() {
  const [open, setOpen] = dpUS(true);
  const [h, setH] = dpUS(9);    // 1..12
  const [m, setM] = dpUS(0);    // 0..59
  const [ap, setAp] = dpUS('AM');
  const [step, setStep] = dpUS(15); // 1, 5, 15, 30

  const bumpH = (dir) => setH(v => ((v - 1 + dir + 12) % 12) + 1);
  const bumpM = (dir) => setM(v => (v + dir * step + 60) % 60);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="clock" label="Time" value={`${pad2(h)}:${pad2(m)} ${ap}`} open={open} onClick={()=>setOpen(o=>!o)} width={220} />
      {open && (
        <Popup width={300}>
          <div style={{ padding: 14 }}>
            {/* big readout */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr 64px', gap: 8,
              alignItems: 'center', marginBottom: 12,
            }}>
              <Stepper value={pad2(h)} onUp={()=>bumpH(1)} onDown={()=>bumpH(-1)} />
              <div style={{ fontFamily: BZ.fontMono, fontSize: 28, color: BZ.stone300, fontWeight: 500, textAlign: 'center', userSelect: 'none' }}>:</div>
              <Stepper value={pad2(m)} onUp={()=>bumpM(1)} onDown={()=>bumpM(-1)} />
              <AmPmToggle value={ap} onChange={setAp} />
            </div>

            {/* increment row */}
            <div style={{ marginBottom: 12 }}>
              <DPLabel>Increment</DPLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 6, padding: 2, background: BZ.stone100, borderRadius: 7 }}>
                {[1, 5, 15, 30].map(s => (
                  <button key={s} onClick={()=>setStep(s)} style={{
                    height: 26, border: 'none', borderRadius: 5,
                    background: step === s ? BZ.bg : 'transparent',
                    color: BZ.fg, fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums',
                    fontSize: 12, fontWeight: step === s ? 600 : 500, cursor: 'pointer',
                    boxShadow: step === s ? `0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px ${BZ.border}` : 'none',
                  }}>{s}m</button>
                ))}
              </div>
            </div>

            {/* common-time presets */}
            <DPLabel>Common</DPLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6 }}>
              {[
                { l: 'Open',  t: '7:00 AM',  v: [7, 0, 'AM'],  ic: 'sunrise' },
                { l: 'Lunch', t: '12:00 PM', v: [12, 0, 'PM'], ic: 'sun' },
                { l: 'Close', t: '9:00 PM',  v: [9, 0, 'PM'],  ic: 'moon' },
              ].map((p, i) => (
                <button key={i} onClick={()=>{ setH(p.v[0]); setM(p.v[1]); setAp(p.v[2]); }} style={{
                  border: `1px solid ${BZ.border}`, borderRadius: 6, padding: '6px 8px',
                  background: BZ.bg, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic name={p.ic} size={11} color={BZ.stone500} />
                    <span style={{ fontSize: 10.5, color: BZ.stone500, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{p.l}</span>
                  </div>
                  <span style={{ fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500 }}>{p.t}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${BZ.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: BZ.stone50, borderRadius: '0 0 10px 10px', gap: 6 }}>
            <button style={{ ...dpOutlineBtn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={()=>setOpen(false)}>Cancel</button>
            <button style={{ ...dpPrimaryBtn, height: 28, padding: '0 12px', fontSize: 12 }} onClick={()=>setOpen(false)}>Set time</button>
          </div>
        </Popup>
      )}
    </div>
  );
}

function Stepper({ value, onUp, onDown }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '20px 44px 20px', border: `1px solid ${BZ.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onUp} style={{ border: 'none', borderBottom: `1px solid ${BZ.border}`, background: BZ.stone50, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic name="chevron-up" size={12} color={BZ.stone600} />
      </button>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 28,
        fontWeight: 500, background: BZ.bg, letterSpacing: -0.5,
      }}>{value}</div>
      <button onClick={onDown} style={{ border: 'none', borderTop: `1px solid ${BZ.border}`, background: BZ.stone50, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic name="chevron-down" size={12} color={BZ.stone600} />
      </button>
    </div>
  );
}
function AmPmToggle({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', height: 84, border: `1px solid ${BZ.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {['AM', 'PM'].map((v, i) => (
        <button key={v} onClick={()=>onChange(v)} style={{
          border: 'none', borderBottom: i === 0 ? `1px solid ${BZ.border}` : 'none',
          background: value === v ? BZ.primary : BZ.bg, color: value === v ? BZ.primaryFg : BZ.fg,
          fontFamily: BZ.fontUi, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          letterSpacing: 0.4,
        }}>{v}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TIME B — Hour grid + minute strip (calendar-feeling)
// 4×6 hour grid (12 AM..11 PM) split AM/PM. Minute strip below.
// ═══════════════════════════════════════════════════════════
function TimePopupB() {
  const [open, setOpen] = dpUS(true);
  const [h24, setH24] = dpUS(9);
  const [m, setM] = dpUS(30);

  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="clock" label="Start time" value={fmtTime12(h24, m)} open={open} onClick={()=>setOpen(o=>!o)} width={220} />
      {open && (
        <Popup width={340}>
          <div style={{ padding: 12 }}>
            <DPLabel>Hour</DPLabel>
            <div style={{ marginTop: 6 }}>
              {/* AM row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: BZ.stone500, fontWeight: 600, width: 22, fontFamily: BZ.fontMono }}>AM</span>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                  {Array.from({length: 12}).map((_, i) => {
                    const sel = h24 === i;
                    return (
                      <button key={i} onClick={()=>setH24(i)} style={{
                        height: 28, border: 'none', borderRadius: 5,
                        background: sel ? BZ.primary : 'transparent',
                        color: sel ? BZ.primaryFg : BZ.fg,
                        fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 11.5,
                        fontWeight: sel ? 600 : 500, cursor: 'pointer', padding: 0,
                      }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = BZ.stone100; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                      >{pad2(i)}</button>
                    );
                  })}
                </div>
              </div>
              {/* PM row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: BZ.stone500, fontWeight: 600, width: 22, fontFamily: BZ.fontMono }}>PM</span>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                  {Array.from({length: 12}).map((_, i) => {
                    const v = i + 12;
                    const sel = h24 === v;
                    return (
                      <button key={i} onClick={()=>setH24(v)} style={{
                        height: 28, border: 'none', borderRadius: 5,
                        background: sel ? BZ.primary : 'transparent',
                        color: sel ? BZ.primaryFg : BZ.fg,
                        fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 11.5,
                        fontWeight: sel ? 600 : 500, cursor: 'pointer', padding: 0,
                      }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = BZ.stone100; }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                      >{pad2(v)}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <DPLabel>Minutes · 5m</DPLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2, marginTop: 6 }}>
                {minutes.map(mn => {
                  const sel = m === mn;
                  return (
                    <button key={mn} onClick={()=>setM(mn)} style={{
                      height: 28, border: 'none', borderRadius: 5,
                      background: sel ? BZ.primary : 'transparent',
                      color: sel ? BZ.primaryFg : BZ.fg,
                      fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 11.5,
                      fontWeight: sel ? 600 : 500, cursor: 'pointer', padding: 0,
                    }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = BZ.stone100; }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                    >{pad2(mn)}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 14, padding: '10px 12px', background: BZ.stone50, border: `1px solid ${BZ.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10.5, color: BZ.stone500, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Selected</div>
                <div style={{ fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 500, marginTop: 2, letterSpacing: -0.3 }}>
                  {pad2(h24)}:{pad2(m)}
                  <span style={{ fontSize: 11, color: BZ.stone500, marginLeft: 8 }}>{fmtTime12(h24, m)}</span>
                </div>
              </div>
              <button style={{ ...dpPrimaryBtn, height: 30, padding: '0 14px', fontSize: 12.5 }} onClick={()=>setOpen(false)}>Set</button>
            </div>
          </div>
        </Popup>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TIME C — Native-style inline list (Linear/Stripe pattern)
// Type-to-search field + scrolling list of 15-min slots.
// ═══════════════════════════════════════════════════════════
function TimePopupC() {
  const [open, setOpen] = dpUS(true);
  const [selected, setSelected] = dpUS(9 * 60); // minutes since 00:00
  const [query, setQuery] = dpUS('');

  // Build 15-min slots
  const slots = [];
  for (let i = 0; i < 24 * 4; i++) slots.push(i * 15);

  const matches = query.trim()
    ? slots.filter(s => fmtTime12(Math.floor(s/60), s%60).toLowerCase().replace(' ', '').includes(query.toLowerCase().replace(' ', '')))
    : slots;

  const listRef = dpUR(null);
  dpUE(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    if (el) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2;
  }, [open]);

  const h24 = Math.floor(selected / 60), m = selected % 60;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FieldTrigger icon="clock" label="Time" value={fmtTime12(h24, m)} open={open} onClick={()=>setOpen(o=>!o)} width={220} />
      {open && (
        <Popup width={240}>
          <div style={{ padding: 8, borderBottom: `1px solid ${BZ.border}` }}>
            <div style={{ position: 'relative' }}>
              <Ic name="clock" size={13} color={BZ.stone500} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Type a time…"
                style={{
                  width: '100%', height: 32, padding: '0 8px 0 28px',
                  border: `1px solid ${BZ.border}`, borderRadius: 6,
                  background: BZ.bg, color: BZ.fg,
                  fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums',
                  fontSize: 13, fontWeight: 500, outline: 'none',
                }}
                onFocus={e => e.currentTarget.style.boxShadow = `0 0 0 3px ${BZ.stone200}`}
                onBlur={e => e.currentTarget.style.boxShadow = 'none'}
              />
            </div>
          </div>
          <div ref={listRef} style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {matches.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: BZ.stone500 }}>No match</div>
            ) : matches.map(s => {
              const sh = Math.floor(s/60), sm = s%60;
              const isSel = s === selected;
              const isHour = sm === 0;
              return (
                <button
                  key={s} data-selected={isSel}
                  onClick={()=>{ setSelected(s); setOpen(false); }}
                  style={{
                    width: '100%', height: 30, padding: '0 8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: 'none', borderRadius: 5,
                    background: isSel ? BZ.stone100 : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = BZ.stone50; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 13, fontWeight: isSel || isHour ? 600 : 500, color: BZ.fg }}>
                    {fmtTime12(sh, sm)}
                  </span>
                  {isSel && <Ic name="check" size={13} color={BZ.fg} />}
                </button>
              );
            })}
          </div>
        </Popup>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAC WINDOW STAGE — mounts a popup inside a faux desktop scene
// ═══════════════════════════════════════════════════════════
function MacStage({ title, formLabel, children, height = 720, width = 820 }) {
  return (
    <div style={{
      width, height, borderRadius: 14, overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.18)',
      display: 'flex', flexDirection: 'column',
      fontFamily: BZ.fontUi,
    }}>
      {/* titlebar */}
      <div style={{
        height: 38, display: 'flex', alignItems: 'center', padding: '0 12px',
        borderBottom: `1px solid ${BZ.border}`, background: BZ.stone50,
        flexShrink: 0,
      }}>
        <MacTrafficLights />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: BZ.stone700, letterSpacing: -0.1 }}>
          {title}
        </div>
        <div style={{ width: 52 }} />
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: '28px 32px', background: BZ.bg, position: 'relative', overflow: 'visible' }}>
        {/* fake form context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>New shift</div>
            <div style={{ fontSize: 12.5, color: BZ.stone500, marginTop: 2 }}>Schedule a shift for an employee</div>
          </div>

          {/* employee row (decoration) */}
          <FormRow label="Employee">
            <div style={{ height: 36, padding: '0 10px', border: `1px solid ${BZ.border}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8, width: 220, background: BZ.bg }}>
              <div style={{ width: 22, height: 22, borderRadius: 9999, background: BZ.stone200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: BZ.stone700 }}>JD</div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Jamie Diaz</span>
            </div>
          </FormRow>

          {/* the picker row */}
          <FormRow label={formLabel}>
            {children}
          </FormRow>

          {/* role row (decoration) */}
          <FormRow label="Role">
            <div style={{ height: 36, padding: '0 10px', border: `1px solid ${BZ.border}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8, width: 220, background: BZ.bg, color: BZ.stone400 }}>
              <span style={{ fontSize: 13 }}>Select role…</span>
            </div>
          </FormRow>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 16, alignItems: 'flex-start', position: 'relative' }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: BZ.stone600, paddingTop: 9 }}>{label}</div>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// ─── MacTrafficLights (local, not depending on starter export) ──
function MacTrafficLights() {
  const dot = (bg) => <div style={{ width: 12, height: 12, borderRadius: '50%', background: bg, border: '0.5px solid rgba(0,0,0,0.12)' }} />;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {dot('#ff5f57')}{dot('#febc2e')}{dot('#28c840')}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showAll": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  return (
    <>
      <DesignCanvas>
        <DCSection id="dates" title="Date popups" subtitle="3 layouts · macOS window context · click trigger to toggle">
          <DCArtboard id="date-a" label="A · Compact calendar" width={900} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Date">
                <DatePopupA />
              </MacStage>
            </Stage>
          </DCArtboard>
          <DCArtboard id="date-b" label="B · Calendar + presets" width={900} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Due date">
                <DatePopupB />
              </MacStage>
            </Stage>
          </DCArtboard>
          <DCArtboard id="date-c" label="C · Two-month view" width={1020} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Pick date" width={940}>
                <DatePopupC />
              </MacStage>
            </Stage>
          </DCArtboard>
        </DCSection>

        <DCSection id="times" title="Time popups" subtitle="3 layouts · stepper · grid · searchable list">
          <DCArtboard id="time-a" label="A · Numeric stepper" width={900} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Time">
                <TimePopupA />
              </MacStage>
            </Stage>
          </DCArtboard>
          <DCArtboard id="time-b" label="B · Hour + minute grid" width={900} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Start time">
                <TimePopupB />
              </MacStage>
            </Stage>
          </DCArtboard>
          <DCArtboard id="time-c" label="C · Searchable list" width={900} height={780}>
            <Stage>
              <MacStage title="Schedule · Add shift" formLabel="Time">
                <TimePopupC />
              </MacStage>
            </Stage>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Demo" />
        <div style={{ fontSize: 11.5, color: BZ.stone600, lineHeight: 1.5 }}>
          All popups are open by default for review.
          Click any trigger field to toggle its popup.
        </div>
      </TweaksPanel>
    </>
  );
}

// Stage — centers content with neutral page bg; gives popup room to extend below
function Stage({ children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#e7e5e4',
      padding: 20,
    }}>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
