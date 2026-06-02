// Mobile Date + Time selectors — BizOps design system.
// Achromatic stone palette · 1px borders, no shadows · 3px radius (rounded-lg)
// Inter for UI, Geist Mono + tabular-nums for all data.
// All variants render inside <IOSDevice 402×874> (the device frame is the
// physical bezel; the in-app surfaces use BizOps tokens).

const { useState: bzUS, useRef: bzUR } = React;

// ─── tokens ──────────────────────────────────────────────────
const BZ = {
  bg:       '#ffffff',                  // --background
  fg:       'oklch(0.145 0 0)',         // --foreground
  card:     '#ffffff',                  // --card
  primary:  'oklch(0.205 0 0)',         // --primary (dark stone)
  primaryFg:'oklch(0.985 0 0)',         // --primary-foreground
  secondary:'oklch(0.97 0 0)',          // --secondary / --muted
  muted:    'oklch(0.97 0 0)',
  mutedFg:  'oklch(0.556 0 0)',         // --muted-foreground
  border:   'oklch(0.922 0 0)',         // --border
  ring:     'oklch(0.708 0 0)',
  destructive:'oklch(0.577 0.245 27.325)',
  emerald:  '#059669',                  // emerald-600
  amber:    '#d97706',                  // amber-600
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

// ─── constants ──────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_S = ['S','M','T','W','T','F','S'];
const DOW_3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const BZ_TODAY = new Date(2026, 3, 28); // Tue Apr 28 2026

// ─── tiny lucide-ish icons (1.75 stroke, h-4 w-4 default) ───
function Ic({ name, size = 16, color = 'currentColor', style }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  switch (name) {
    case 'chevron-left':  return <svg {...p}><path d="M15 18l-6-6 6-6"/></svg>;
    case 'chevron-right': return <svg {...p}><path d="M9 18l6-6-6-6"/></svg>;
    case 'chevron-down':  return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'x':             return <svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>;
    case 'check':         return <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>;
    case 'calendar':      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>;
    case 'clock':         return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    case 'arrow-right':   return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'minus':         return <svg {...p}><path d="M5 12h14"/></svg>;
    case 'plus':          return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'sunrise':       return <svg {...p}><path d="M17 18a5 5 0 00-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4"/></svg>;
    case 'sun':           return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    case 'moon':          return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    default:              return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN SHELL — header (back · title · save) + body + footer summary
// ═══════════════════════════════════════════════════════════════════
function BZShell({ icon, title, subtitle, onCancel, onSave, children, summary }) {
  return (
    <div style={{
      background: BZ.bg, color: BZ.fg, fontFamily: BZ.fontUi,
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      fontSize: 14,
    }}>
      {/* status-bar safe area */}
      <div style={{ height: 47 }} />

      {/* page header — h-14, border-b, dense */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', borderBottom: `1px solid ${BZ.border}`,
        background: BZ.bg, flexShrink: 0,
      }}>
        <button onClick={onCancel} style={iconBtn}>
          <Ic name="x" size={16} color={BZ.stone600} />
        </button>
        <div style={{ flex: 1, textAlign: 'left', paddingLeft: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {icon && <Ic name={icon} size={14} color={BZ.stone500} />}
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.1 }}>{title}</div>
          </div>
          {subtitle && <div style={{ fontSize: 11.5, color: BZ.stone500, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onSave} style={primaryBtn}>Save</button>
      </div>

      {/* body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>

      {/* sticky summary */}
      {summary && (
        <div style={{
          borderTop: `1px solid ${BZ.border}`, background: BZ.stone50,
          padding: '10px 12px 28px', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ─── primitives ──────────────────────────────────────────────
const iconBtn = {
  width: 32, height: 32, borderRadius: 3, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const primaryBtn = {
  height: 32, padding: '0 10px', borderRadius: 3, border: '1px solid transparent',
  background: BZ.primary, color: BZ.primaryFg, fontFamily: BZ.fontUi,
  fontSize: 13, fontWeight: 500, cursor: 'pointer', letterSpacing: -0.1,
  whiteSpace: 'nowrap', flexShrink: 0,
};
const outlineBtn = {
  height: 28, padding: '0 10px', borderRadius: 3, border: `1px solid ${BZ.border}`,
  background: BZ.bg, color: BZ.fg, fontFamily: BZ.fontUi,
  fontSize: 12.5, fontWeight: 500, cursor: 'pointer', letterSpacing: -0.05,
};
const ghostBtn = (active) => ({
  height: 28, padding: '0 10px', borderRadius: 3, border: '1px solid transparent',
  background: active ? BZ.stone100 : 'transparent', color: BZ.fg, fontFamily: BZ.fontUi,
  fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
});

function BZLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase',
      letterSpacing: 0.6, ...style,
    }}>{children}</div>
  );
}

function BZCard({ children, style }) {
  return (
    <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 3, background: BZ.card, ...style }}>
      {children}
    </div>
  );
}

function BZBadge({ children, tone = 'secondary' }) {
  const tones = {
    default:   { bg: BZ.primary, fg: BZ.primaryFg, bd: 'transparent' },
    secondary: { bg: BZ.secondary, fg: BZ.fg, bd: 'transparent' },
    outline:   { bg: 'transparent', fg: BZ.fg, bd: BZ.border },
    success:   { bg: 'transparent', fg: BZ.emerald, bd: BZ.border },
    warning:   { bg: 'transparent', fg: BZ.amber, bd: BZ.border },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: 20,
      padding: '0 8px', borderRadius: 3, fontSize: 11, fontWeight: 500,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
    }}>{children}</span>
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }
function sameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function daysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
function fmtTime12(h24, m) {
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)} ${ampm}`;
}


// ═══════════════════════════════════════════════════════════════════
// DATE A — Compact calendar grid. Dense rows, mono numerals, day cells
// are 36px squares with sharp borders. Quick-jump segmented control.
// ═══════════════════════════════════════════════════════════════════
function BZDateGrid() {
  const [view, setView] = bzUS(new Date(BZ_TODAY.getFullYear(), BZ_TODAY.getMonth(), 1));
  const [selected, setSelected] = bzUS(new Date(BZ_TODAY));

  const y = view.getFullYear(), m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);

  const diffDays = Math.round((selected - BZ_TODAY) / 86400000);
  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Selected</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {selected.getFullYear()}-{pad2(selected.getMonth()+1)}-{pad2(selected.getDate())}
          <span style={{ color: BZ.stone500, marginLeft: 6 }}>· {DOW_3[selected.getDay()]}</span>
        </div>
      </div>
      <BZBadge tone="outline">{diffDays >= 0 ? '+' : ''}{diffDays}d</BZBadge>
    </div>
  );

  return (
    <BZShell icon="calendar" title="Pick date" subtitle="Single day" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={()=>setView(new Date(y, m-1, 1))} style={{ ...outlineBtn, width: 28, padding: 0 }}>
            <Ic name="chevron-left" size={14} color={BZ.stone600} />
          </button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}>{MONTHS[m]}</div>
            <div style={{ fontFamily: BZ.fontMono, fontSize: 12, color: BZ.stone500, fontVariantNumeric: 'tabular-nums' }}>{y}</div>
          </div>
          <button onClick={()=>setView(new Date(y, m+1, 1))} style={{ ...outlineBtn, width: 28, padding: 0 }}>
            <Ic name="chevron-right" size={14} color={BZ.stone600} />
          </button>
        </div>

        {/* calendar shell — soft outer corners */}
        <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {/* DOW header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: BZ.stone50, borderBottom: `1px solid ${BZ.border}` }}>
            {DOW_S.map((d, i) => (
              <div key={i} style={{
                padding: '6px 0', textAlign: 'center',
                fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
                color: BZ.stone500,
              }}>{d}</div>
            ))}
          </div>

          {/* grid — borderless cells, rounded selection pill */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: 4, gap: 2 }}>
            {cells.map((d, i) => {
              const empty = !d;
              const isSel = d && sameDay(d, selected);
              const isToday = d && sameDay(d, BZ_TODAY);
              return (
                <button key={i} disabled={empty} onClick={()=>setSelected(d)}
                  style={{
                    height: 38, border: 'none', borderRadius: 6,
                    background: isSel ? BZ.primary : (isToday ? BZ.stone100 : 'transparent'),
                    color: isSel ? BZ.primaryFg : BZ.fg,
                    cursor: empty ? 'default' : 'pointer',
                    fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums', fontSize: 13,
                    fontWeight: isSel ? 600 : 400, padding: 0, position: 'relative',
                    transition: 'background 120ms',
                  }}>
                  {d && d.getDate()}
                  {isToday && !isSel && (
                    <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: 9999, background: BZ.fg }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* quick jump */}
        <div style={{ marginTop: 14 }}>
          <BZLabel style={{ marginBottom: 6 }}>Quick jump</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${BZ.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {[
              { l: 'Today', d: BZ_TODAY },
              { l: 'Tomorrow', d: addDays(BZ_TODAY, 1) },
              { l: '+ 7d', d: addDays(BZ_TODAY, 7) },
              { l: '+ 30d', d: addDays(BZ_TODAY, 30) },
            ].map((c, i) => (
              <button key={i} onClick={()=>{ setSelected(c.d); setView(new Date(c.d.getFullYear(), c.d.getMonth(), 1)); }}
                style={{
                  height: 34, border: 'none', borderRight: i < 3 ? `1px solid ${BZ.border}` : 'none',
                  background: sameDay(selected, c.d) ? BZ.stone100 : BZ.bg,
                  color: BZ.fg, fontFamily: BZ.fontUi, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  letterSpacing: -0.1,
                }}>{c.l}</button>
            ))}
          </div>
        </div>

        {/* numeric input row */}
        <div style={{ marginTop: 14 }}>
          <BZLabel style={{ marginBottom: 6 }}>Or type</BZLabel>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <NumInput value={selected.getFullYear()} width={62} mono />
            <span style={{ color: BZ.stone400 }}>-</span>
            <NumInput value={pad2(selected.getMonth()+1)} width={48} mono />
            <span style={{ color: BZ.stone400 }}>-</span>
            <NumInput value={pad2(selected.getDate())} width={48} mono />
          </div>
        </div>
      </div>
    </BZShell>
  );
}

function NumInput({ value, width = 60, mono }) {
  return (
    <div style={{
      height: 34, width, border: `1px solid ${BZ.border}`, borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: mono ? BZ.fontMono : BZ.fontUi, fontVariantNumeric: 'tabular-nums',
      fontSize: 13, background: BZ.bg, color: BZ.fg,
    }}>{value}</div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// DATE B — Schedule list. Day rows in a compact table with mono dates,
// shift counts, and inline indicators. Click a row to select.
// ═══════════════════════════════════════════════════════════════════
function BZDateList() {
  const start = addDays(BZ_TODAY, -3);
  const days = Array.from({ length: 21 }, (_, i) => addDays(start, i));
  const [selected, setSelected] = bzUS(new Date(BZ_TODAY));

  // Deterministic per-row data (stable across re-renders)
  const dayData = (d) => {
    const seed = d.getDate() * 7 + d.getMonth() * 31;
    const shifts = (seed % 5);
    const open = (seed % 7) === 0 ? 1 : 0;
    return { shifts, open, hours: shifts * 8 };
  };

  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Selected date</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {selected.toISOString().slice(0,10)} <span style={{ color: BZ.stone500 }}>· {DOW_3[selected.getDay()]}</span>
        </div>
      </div>
      <button style={primaryBtn}>Confirm</button>
    </div>
  );

  return (
    <BZShell icon="calendar" title="Schedule day" subtitle="Pick from upcoming dates" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* search + filter row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <div style={{
            flex: 1, height: 32, border: `1px solid ${BZ.border}`, borderRadius: 3,
            display: 'flex', alignItems: 'center', padding: '0 10px',
            fontSize: 12.5, color: BZ.stone400,
          }}>Search dates…</div>
          <button style={{ ...outlineBtn, height: 32, gap: 4, display: 'inline-flex', alignItems: 'center' }}>
            All
            <Ic name="chevron-down" size={12} color={BZ.stone500} />
          </button>
        </div>

        {/* dense table */}
        <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
          {/* head */}
          <div style={{
            display: 'grid', gridTemplateColumns: '76px 1fr 56px 48px 14px',
            borderBottom: `1px solid ${BZ.border}`, background: BZ.stone50,
            padding: '0 10px', height: 28, alignItems: 'center', gap: 8,
            fontSize: 10, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase', letterSpacing: 0.6,
          }}>
            <div>Date</div>
            <div>Day</div>
            <div style={{ textAlign: 'right' }}>Shifts</div>
            <div style={{ textAlign: 'right' }}>Hrs</div>
            <div></div>
          </div>

          {days.map((d, i) => {
            const isSel = sameDay(d, selected);
            const isToday = sameDay(d, BZ_TODAY);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const data = dayData(d);
            return (
              <div key={i} onClick={()=>setSelected(d)}
                style={{
                  display: 'grid', gridTemplateColumns: '76px 1fr 56px 48px 14px',
                  alignItems: 'center', gap: 8, padding: '0 10px', height: 36,
                  borderBottom: i < days.length-1 ? `1px solid ${BZ.border}` : 'none',
                  background: isSel ? BZ.stone100 : BZ.bg, cursor: 'pointer',
                  borderLeft: isSel ? `2px solid ${BZ.fg}` : '2px solid transparent',
                }}>
                <div style={{ fontFamily: BZ.fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: isWeekend ? BZ.stone400 : BZ.fg, fontWeight: isToday ? 600 : 400 }}>
                  {pad2(d.getMonth()+1)}-{pad2(d.getDate())}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: isWeekend ? BZ.stone500 : BZ.fg, fontWeight: isToday ? 600 : 400 }}>{DOW_3[d.getDay()]}</span>
                  {isToday && <BZBadge tone="outline">Today</BZBadge>}
                  {data.open > 0 && <BZBadge tone="warning">Open</BZBadge>}
                </div>
                <div style={{ fontFamily: BZ.fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: data.shifts ? BZ.fg : BZ.stone400 }}>
                  {data.shifts || '—'}
                </div>
                <div style={{ fontFamily: BZ.fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: data.hours ? BZ.fg : BZ.stone400 }}>
                  {data.hours || '—'}
                </div>
                <Ic name="chevron-right" size={12} color={BZ.stone400} />
              </div>
            );
          })}
        </div>
      </div>
    </BZShell>
  );
}


// ═══════════════════════════════════════════════════════════════════
// DATE C — Range. Connected pill range + dense range stats card.
// ═══════════════════════════════════════════════════════════════════
function BZDateRange() {
  const [view] = bzUS(new Date(BZ_TODAY.getFullYear(), BZ_TODAY.getMonth(), 1));
  const [range, setRange] = bzUS({ start: BZ_TODAY, end: addDays(BZ_TODAY, 6) });
  const [pickEnd, setPickEnd] = bzUS(false);

  const tap = (d) => {
    if (range.start && range.end && !pickEnd) { setRange({ start: d, end: null }); setPickEnd(true); return; }
    if (pickEnd && range.start) {
      if (d < range.start) setRange({ start: d, end: range.start });
      else setRange({ start: range.start, end: d });
      setPickEnd(false);
    }
  };

  const y = view.getFullYear(), m = view.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ d: addDays(new Date(y, m, 1), i - lead), out: true });
  for (let d = 1; d <= days; d++) cells.push({ d: new Date(y, m, d), out: false });
  while (cells.length % 7) {
    const last = cells[cells.length - 1].d;
    cells.push({ d: addDays(last, 1), out: true });
  }

  const inR = (d) => range.start && range.end && d >= range.start && d <= range.end;
  const isStart = (d) => range.start && sameDay(d, range.start);
  const isEnd = (d) => range.end && sameDay(d, range.end);

  const totalDays = range.end ? Math.round((range.end - range.start) / 86400000) + 1 : 1;

  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Range · {totalDays}d</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 12, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {pad2(range.start.getMonth()+1)}-{pad2(range.start.getDate())} → {range.end ? `${pad2(range.end.getMonth()+1)}-${pad2(range.end.getDate())}` : '—'}
        </div>
      </div>
      <button style={primaryBtn}>Apply</button>
    </div>
  );

  return (
    <BZShell icon="calendar" title="Date range" subtitle="Time-off · payroll · reports" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* start / end fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 16px 1fr', alignItems: 'stretch', gap: 0, marginBottom: 12 }}>
          <RangeField label="Start" date={range.start} active={!pickEnd} onClick={() => setPickEnd(false)} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: BZ.stone400 }}>
            <Ic name="arrow-right" size={14} color={BZ.stone400} />
          </div>
          <RangeField label="End" date={range.end} active={pickEnd} onClick={() => setPickEnd(true)} placeholder="Pick…" />
        </div>

        {/* month label */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{MONTHS[m]}</div>
          <div style={{ fontFamily: BZ.fontMono, fontSize: 11, color: BZ.stone500, fontVariantNumeric: 'tabular-nums' }}>{y}</div>
        </div>

        {/* DOW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DOW_S.map((d, i) => (
            <div key={i} style={{
              padding: '4px 0', textAlign: 'center',
              fontSize: 10, fontWeight: 600, color: BZ.stone500, letterSpacing: 0.6, textTransform: 'uppercase',
            }}>{d}</div>
          ))}
        </div>

        {/* range grid — connected highlight */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
          {cells.map((c, i) => {
            const r = inR(c.d), s = isStart(c.d), e = isEnd(c.d);
            const col = i % 7;
            const inRowL = i > 0 && inR(cells[i-1]?.d);
            const inRowR = i < cells.length - 1 && inR(cells[i+1]?.d);
            // Inner highlight bar
            const showBar = r;
            const radL = (s || col === 0 || !inRowL) ? 3 : 0;
            const radR = (e || col === 6 || !inRowR) ? 3 : 0;

            return (
              <button key={i} onClick={()=>!c.out && tap(c.d)}
                style={{
                  position: 'relative', height: 40,
                  border: 'none', borderRight: col < 6 ? `1px solid ${BZ.border}` : 'none',
                  borderBottom: i < cells.length - 7 ? `1px solid ${BZ.border}` : 'none',
                  background: BZ.bg, cursor: c.out ? 'default' : 'pointer', padding: 0,
                  fontFamily: BZ.fontMono, fontVariantNumeric: 'tabular-nums',
                }}>
                {showBar && (
                  <div style={{
                    position: 'absolute', top: 4, bottom: 4, left: 0, right: 0,
                    background: (s || e) ? BZ.primary : BZ.stone200,
                    borderTopLeftRadius: radL, borderBottomLeftRadius: radL,
                    borderTopRightRadius: radR, borderBottomRightRadius: radR,
                  }} />
                )}
                <span style={{
                  position: 'relative',
                  fontSize: 12.5, fontWeight: (s||e) ? 600 : 400,
                  color: (s||e) ? BZ.primaryFg : (c.out ? BZ.stone300 : BZ.fg),
                }}>{c.d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* presets — segmented */}
        <div style={{ marginTop: 12 }}>
          <BZLabel style={{ marginBottom: 6 }}>Presets</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {[
              { l: 'This week', s: addDays(BZ_TODAY, -BZ_TODAY.getDay()), e: addDays(BZ_TODAY, 6 - BZ_TODAY.getDay()) },
              { l: 'Next 7 days', s: BZ_TODAY, e: addDays(BZ_TODAY, 6) },
              { l: 'Next 14 days', s: BZ_TODAY, e: addDays(BZ_TODAY, 13) },
              { l: 'This month', s: new Date(BZ_TODAY.getFullYear(), BZ_TODAY.getMonth(), 1), e: new Date(BZ_TODAY.getFullYear(), BZ_TODAY.getMonth()+1, 0) },
            ].map((p, i) => {
              const days = Math.round((p.e - p.s) / 86400000) + 1;
              return (
                <button key={i} onClick={() => setRange({ start: p.s, end: p.e })}
                  style={{
                    height: 36, padding: '0 10px', textAlign: 'left',
                    border: `1px solid ${BZ.border}`, borderRadius: 3, background: BZ.bg, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: BZ.fontUi, color: BZ.fg,
                  }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{p.l}</span>
                  <span style={{ fontFamily: BZ.fontMono, fontSize: 11, color: BZ.stone500, fontVariantNumeric: 'tabular-nums' }}>{days}d</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BZShell>
  );
}

function RangeField({ label, date, active, onClick, placeholder }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 10px', height: 52, textAlign: 'left',
      border: `1px solid ${active ? BZ.fg : BZ.border}`,
      borderRadius: 3, background: BZ.bg, cursor: 'pointer',
      boxShadow: active ? `inset 0 0 0 1px ${BZ.fg}` : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      {date ? (
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500 }}>
          {date.toISOString().slice(0,10)}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: BZ.stone400, marginTop: 4 }}>{placeholder}</div>
      )}
    </button>
  );
}


// ═══════════════════════════════════════════════════════════════════
// TIME A — Numeric stepper. Two big mono numerals (HH : MM) with up/down
// chevrons, plus AM/PM toggle. Sharp, dense, instant.
// ═══════════════════════════════════════════════════════════════════
function BZTimeStepper() {
  const [h, setH] = bzUS(7);    // 1..12
  const [m, setM] = bzUS(30);   // 0..59
  const [ap, setAp] = bzUS('AM');
  const [step, setStep] = bzUS(15);

  const bumpH = (n) => setH(((h - 1 + n + 12) % 12) + 1);
  const bumpM = (n) => {
    let nm = m + n;
    if (nm >= 60) { nm -= 60; bumpH(1); }
    if (nm < 0)   { nm += 60; bumpH(-1); }
    setM(nm);
  };

  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Selected time</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {pad2(h)}:{pad2(m)} {ap} <span style={{ color: BZ.stone500, marginLeft: 6 }}>· {pad2(ap === 'PM' ? (h%12)+12 : (h===12?0:h))}:{pad2(m)}</span>
        </div>
      </div>
      <button style={primaryBtn}>Set</button>
    </div>
  );

  return (
    <BZShell icon="clock" title="Pick time" subtitle="Single time of day" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* big HH:MM card */}
        <BZCard style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 8 }}>
            <Stepper value={pad2(h)} onUp={()=>bumpH(1)} onDown={()=>bumpH(-1)} />
            <div style={{ display: 'flex', alignItems: 'center', fontFamily: BZ.fontMono, fontSize: 44, fontWeight: 300, color: BZ.stone300, lineHeight: 1 }}>:</div>
            <Stepper value={pad2(m)} onUp={()=>bumpM(step)} onDown={()=>bumpM(-step)} />
            {/* AM/PM segmented */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
                {['AM','PM'].map((v, i) => (
                  <button key={v} onClick={()=>setAp(v)} style={{
                    width: 44, height: 36,
                    border: 'none', borderTop: i ? `1px solid ${BZ.border}` : 'none',
                    background: ap === v ? BZ.primary : BZ.bg,
                    color: ap === v ? BZ.primaryFg : BZ.fg,
                    fontFamily: BZ.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.6,
                    cursor: 'pointer',
                  }}>{v}</button>
                ))}
              </div>
            </div>
          </div>
        </BZCard>

        {/* step granularity */}
        <div style={{ marginTop: 14 }}>
          <BZLabel style={{ marginBottom: 6 }}>Increment</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
            {[1, 5, 15, 30].map((s, i) => (
              <button key={s} onClick={()=>setStep(s)} style={{
                height: 32, border: 'none', borderRight: i < 3 ? `1px solid ${BZ.border}` : 'none',
                background: step === s ? BZ.stone100 : BZ.bg, color: BZ.fg,
                fontFamily: BZ.fontMono, fontSize: 12, fontWeight: step === s ? 600 : 500, cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}>{s}m</button>
            ))}
          </div>
        </div>

        {/* common times */}
        <div style={{ marginTop: 14 }}>
          <BZLabel style={{ marginBottom: 6 }}>Common</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { l: 'Open', t: '07:00', a: 'AM', icon: 'sunrise' },
              { l: 'Lunch', t: '12:00', a: 'PM', icon: 'sun' },
              { l: 'Close', t: '09:00', a: 'PM', icon: 'moon' },
            ].map(c => (
              <button key={c.l} onClick={()=>{ const [hh,mm]=c.t.split(':').map(Number); setH(hh); setM(mm); setAp(c.a); }}
                style={{
                  height: 56, padding: '8px 10px', border: `1px solid ${BZ.border}`, borderRadius: 3,
                  background: BZ.bg, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: BZ.stone500 }}>
                  <Ic name={c.icon} size={12} color={BZ.stone500} />
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{c.l}</span>
                </div>
                <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: BZ.fg }}>
                  {c.t} {c.a}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </BZShell>
  );
}

function Stepper({ value, onUp, onDown }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden',
    }}>
      <button onClick={onUp} style={stepIconBtn}>
        <Ic name="chevron-down" size={12} color={BZ.stone500} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <div style={{
        height: 56, width: 78, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: BZ.stone50, borderTop: `1px solid ${BZ.border}`, borderBottom: `1px solid ${BZ.border}`,
        fontFamily: BZ.fontMono, fontSize: 36, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        letterSpacing: -1, color: BZ.fg,
      }}>{value}</div>
      <button onClick={onDown} style={stepIconBtn}>
        <Ic name="chevron-down" size={12} color={BZ.stone500} />
      </button>
    </div>
  );
}
const stepIconBtn = {
  width: 78, height: 24, border: 'none', background: BZ.bg, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};


// ═══════════════════════════════════════════════════════════════════
// TIME B — 24-hour grid. 24 cells of 1h, tap to select; fine-tune with
// 15-min sub-ticks beneath. Mono everything.
// ═══════════════════════════════════════════════════════════════════
function BZTimeGrid() {
  const [h24, setH24] = bzUS(9);
  const [m, setM] = bzUS(0);

  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Selected time</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {pad2(h24)}:{pad2(m)} <span style={{ color: BZ.stone500, marginLeft: 6 }}>· {fmtTime12(h24, m)}</span>
        </div>
      </div>
      <button style={primaryBtn}>Set</button>
    </div>
  );

  // Group hours into 4 rows of 6
  const rows = [[0,1,2,3,4,5],[6,7,8,9,10,11],[12,13,14,15,16,17],[18,19,20,21,22,23]];

  return (
    <BZShell icon="clock" title="Pick time" subtitle="24-hour grid" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* AM/PM row labels for context */}
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {['AM','AM','PM','PM'].map((l, i) => (
              <div key={i} style={{
                flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600, color: BZ.stone500, letterSpacing: 0.6,
              }}>{l}</div>
            ))}
          </div>
          <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: ri < 3 ? `1px solid ${BZ.border}` : 'none' }}>
                {row.map((H, ci) => {
                  const isSel = H === h24;
                  return (
                    <button key={H} onClick={()=>setH24(H)}
                      style={{
                        height: 36, border: 'none', borderRight: ci < 5 ? `1px solid ${BZ.border}` : 'none',
                        background: isSel ? BZ.primary : BZ.bg,
                        color: isSel ? BZ.primaryFg : BZ.fg,
                        cursor: 'pointer', padding: 0,
                        fontFamily: BZ.fontMono, fontSize: 12, fontWeight: isSel ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                      {pad2(H)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* minute sub-row */}
        <div style={{ marginTop: 14 }}>
          <BZLabel style={{ marginBottom: 6 }}>Minutes</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
            {Array.from({ length: 12 }, (_, i) => i * 5).map((mm, i) => {
              const isSel = mm === m;
              return (
                <button key={mm} onClick={()=>setM(mm)}
                  style={{
                    height: 32, border: 'none', borderRight: i < 11 ? `1px solid ${BZ.border}` : 'none',
                    background: isSel ? BZ.stone900 : BZ.bg,
                    color: isSel ? '#fff' : BZ.fg,
                    cursor: 'pointer', padding: 0,
                    fontFamily: BZ.fontMono, fontSize: 11, fontWeight: isSel ? 600 : 400,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{pad2(mm)}</button>
              );
            })}
          </div>
          {/* fine slider for 1-min */}
          <div style={{
            marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(60, 1fr)', height: 12,
            border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden',
          }}>
            {Array.from({ length: 60 }, (_, i) => i).map(i => (
              <button key={i} onClick={()=>setM(i)}
                style={{
                  height: 10, border: 'none', padding: 0, cursor: 'pointer',
                  background: i === m ? BZ.fg : (i % 5 === 0 ? BZ.stone200 : BZ.bg),
                  borderRight: i < 59 ? `1px solid ${BZ.border}` : 'none',
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: BZ.fontMono, fontSize: 9, color: BZ.stone400, fontVariantNumeric: 'tabular-nums' }}>
            <span>:00</span><span>:15</span><span>:30</span><span>:45</span><span>:59</span>
          </div>
        </div>

        {/* Live readout big */}
        <div style={{ marginTop: 16, border: `1px solid ${BZ.border}`, borderRadius: 3, padding: '14px 16px', background: BZ.stone50 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: BZ.fontMono, fontSize: 36, fontWeight: 500, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {pad2(h24)}<span style={{ color: BZ.stone300 }}>:</span>{pad2(m)}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase', letterSpacing: 0.6 }}>12-hour</div>
              <div style={{ fontFamily: BZ.fontMono, fontSize: 13, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtTime12(h24, m)}</div>
            </div>
          </div>
        </div>
      </div>
    </BZShell>
  );
}


// ═══════════════════════════════════════════════════════════════════
// TIME C — Shift range. Two HH:MM mono fields + a horizontal 24h
// scrubber with two handles. Inline duration + break breakdown.
// ═══════════════════════════════════════════════════════════════════
function BZTimeRange() {
  const TOTAL = 24 * 60;
  const STEP = 15;
  const [start, setStart] = bzUS(7 * 60);
  const [end, setEnd]     = bzUS(15 * 60);
  const trackRef = bzUR(null);

  const minToX = (min) => (min / TOTAL) * 100;
  const xToMin = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round((pct * TOTAL) / STEP) * STEP;
  };
  const drag = (which) => (e) => {
    e.stopPropagation();
    const move = (ev) => {
      const t = ev.touches ? ev.touches[0] : ev;
      const v = xToMin(t.clientX);
      if (which === 'start') setStart(Math.min(v, end - STEP));
      else                    setEnd(Math.max(v, start + STEP));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fmt = (min) => `${pad2(Math.floor(min/60))}:${pad2(min%60)}`;
  const dur = end - start;
  const durH = Math.floor(dur / 60), durM = dur % 60;
  const breakMin = 30;
  const paid = dur - breakMin;
  const payH = Math.floor(paid/60), payM = paid % 60;

  const summary = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <BZLabel>Shift · {durH}h {pad2(durM)}m</BZLabel>
        <div style={{ fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums', marginTop: 2, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {fmt(start)} – {fmt(end)}
        </div>
      </div>
      <button style={primaryBtn}>Save</button>
    </div>
  );

  return (
    <BZShell icon="clock" title="Shift hours" subtitle="Start, end, break" onCancel={()=>{}} onSave={()=>{}} summary={summary}>
      <div style={{ padding: 12 }}>
        {/* start / end mono fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <TimeField label="Start" value={fmt(start)} />
          <TimeField label="End"   value={fmt(end)} />
        </div>

        {/* track */}
        <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 3, padding: '14px 12px 10px', background: BZ.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <BZLabel>24-hour scrubber</BZLabel>
            <span style={{ fontFamily: BZ.fontMono, fontSize: 11, color: BZ.stone500, fontVariantNumeric: 'tabular-nums' }}>{STEP}-min snap</span>
          </div>

          <div ref={trackRef} style={{ position: 'relative', height: 36, userSelect: 'none', touchAction: 'none' }}>
            {/* base */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 12, background: BZ.stone100, border: `1px solid ${BZ.border}`, borderRadius: 3 }} />
            {/* fill */}
            <div style={{
              position: 'absolute', top: 12, height: 12,
              left: `${minToX(start)}%`, width: `${minToX(end) - minToX(start)}%`,
              background: BZ.primary, borderRadius: 3,
            }} />
            {/* handles */}
            <Handle pct={minToX(start)} onDown={drag('start')} />
            <Handle pct={minToX(end)} onDown={drag('end')} />
          </div>

          {/* tick labels */}
          <div style={{ position: 'relative', height: 18, marginTop: 4 }}>
            {[0,3,6,9,12,15,18,21,24].map(h => (
              <div key={h} style={{
                position: 'absolute', left: `${(h/24)*100}%`, transform: 'translateX(-50%)',
                fontFamily: BZ.fontMono, fontSize: 9, color: BZ.stone400, fontVariantNumeric: 'tabular-nums',
              }}>{pad2(h)}</div>
            ))}
          </div>
        </div>

        {/* break + breakdown table */}
        <div style={{ marginTop: 12, border: `1px solid ${BZ.border}`, borderRadius: 3, overflow: 'hidden' }}>
          <BreakdownRow k="Total time" v={`${durH}h ${pad2(durM)}m`} />
          <BreakdownRow k="Unpaid break" v={`-0h ${pad2(breakMin)}m`} muted />
          <BreakdownRow k="Paid hours" v={`${payH}h ${pad2(payM)}m`} bold />
        </div>

        {/* shift presets */}
        <div style={{ marginTop: 12 }}>
          <BZLabel style={{ marginBottom: 6 }}>Shift presets</BZLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { l: 'Morning', s: 7*60,  e: 15*60, ic: 'sunrise' },
              { l: 'Mid',     s: 11*60, e: 19*60, ic: 'sun' },
              { l: 'Close',   s: 15*60, e: 23*60, ic: 'moon' },
            ].map((c, i) => {
              const active = start === c.s && end === c.e;
              return (
                <button key={i} onClick={()=>{ setStart(c.s); setEnd(c.e); }}
                  style={{
                    height: 56, padding: '8px 10px', border: `1px solid ${active ? BZ.fg : BZ.border}`,
                    borderRadius: 3, background: active ? BZ.stone100 : BZ.bg, cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: BZ.stone500 }}>
                    <Ic name={c.ic} size={12} color={BZ.stone500} />
                    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>{c.l}</span>
                  </div>
                  <div style={{ fontFamily: BZ.fontMono, fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: BZ.fg }}>
                    {fmt(c.s)}–{fmt(c.e)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BZShell>
  );
}

function TimeField({ label, value }) {
  return (
    <div style={{ border: `1px solid ${BZ.border}`, borderRadius: 3, padding: '8px 12px', background: BZ.bg }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: BZ.stone500, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{
        fontFamily: BZ.fontMono, fontSize: 22, fontVariantNumeric: 'tabular-nums',
        marginTop: 2, fontWeight: 500, letterSpacing: -0.5, color: BZ.fg,
      }}>{value}</div>
    </div>
  );
}

function Handle({ pct, onDown }) {
  return (
    <div onPointerDown={onDown}
      style={{
        position: 'absolute', top: 4, left: `calc(${pct}% - 7px)`,
        width: 14, height: 28, background: BZ.bg,
        border: `1px solid ${BZ.fg}`, borderRadius: 3,
        cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2,
      }}>
      <div style={{ width: 1, height: 12, background: BZ.fg }} />
    </div>
  );
}

function BreakdownRow({ k, v, muted, bold }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px', height: 36, gap: 8,
      borderBottom: bold ? 'none' : `1px solid ${BZ.border}`,
      background: bold ? BZ.stone50 : BZ.bg,
    }}>
      <span style={{
        fontSize: 12.5, color: muted ? BZ.stone500 : BZ.fg,
        fontWeight: bold ? 600 : 400, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{k}</span>
      <span style={{
        fontFamily: BZ.fontMono, fontSize: 13, fontVariantNumeric: 'tabular-nums',
        color: muted ? BZ.stone500 : BZ.fg, fontWeight: bold ? 600 : 500,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>{v}</span>
    </div>
  );
}


Object.assign(window, {
  BZDateGrid, BZDateList, BZDateRange,
  BZTimeStepper, BZTimeGrid, BZTimeRange,
});
