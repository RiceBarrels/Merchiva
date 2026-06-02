// Mobile Date + Time selectors — 3 variants each.
// All variants live inside <IOSDevice 402×874> and follow the existing
// bizops mobile design language (M tokens, system stack, stone palette).

const { useState: dtUS, useRef: dtUR, useEffect: dtUE } = React;

// ─── helpers ─────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_S = ['S','M','T','W','T','F','S'];
const DOW_3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const DT_TODAY = new Date(2026, 3, 28); // Apr 28 2026 (Tue)

function pad2(n) { return String(n).padStart(2, '0'); }
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fmtTime12(h24, m) {
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12; if (h === 0) h = 12;
  return { h, m, ampm, str: `${h}:${pad2(m)} ${ampm}` };
}

// ═══════════════════════════════════════════════════════════════════
// SCREEN SHELL — every variant uses this. Top: small header with cancel /
// title / save. Body: variant-specific. Bottom: result preview row.
// ═══════════════════════════════════════════════════════════════════
function DTShell({ title, onCancel, onSave, children, footerValue, footerLabel = 'Selected', accent = M.label, dark = false }) {
  const surface = dark ? '#1c1c1e' : M.surface;
  const bg = dark ? '#000' : M.bg;
  const label = dark ? '#fff' : M.label;
  const sec = dark ? 'rgba(235,235,245,0.6)' : M.sec;
  const sep = dark ? 'rgba(84,84,88,0.5)' : M.sep;

  return (
    <div style={{ background: bg, minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: M.font, color: label }}>
      {/* nav bar */}
      <div style={{ paddingTop: 54, paddingBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', minHeight: 44 }}>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: M.font, fontSize: 17, color: sec, padding: 0, letterSpacing: -0.43 }}>Cancel</button>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.43 }}>{title}</div>
          <button onClick={onSave} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: M.font, fontSize: 17, fontWeight: 600, color: accent, padding: 0, letterSpacing: -0.43 }}>Save</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>

      {/* result preview */}
      {footerValue !== undefined && (
        <div style={{ borderTop: `0.5px solid ${sep}`, padding: '14px 20px 30px', background: surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: sec }}>{footerLabel}</div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{footerValue}</div>
          </div>
          <button onClick={onSave} style={{
            background: accent, color: dark ? '#000' : '#fff', border: 'none', cursor: 'pointer',
            padding: '10px 20px', borderRadius: 9999, fontSize: 15, fontWeight: 600, letterSpacing: -0.2, fontFamily: M.font,
          }}>Done</button>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// DATE A — Calendar grid (classic iOS-style month picker)
// ═══════════════════════════════════════════════════════════════════
function DateCalendarGrid() {
  const [view, setView] = dtUS(new Date(DT_TODAY.getFullYear(), DT_TODAY.getMonth(), 1));
  const [selected, setSelected] = dtUS(new Date(DT_TODAY));

  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const lead = first.getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);

  const monthLabel = MONTHS[m] + ' ' + y;
  const fmtFooter = selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <DTShell title="Date" footerValue={fmtFooter} footerLabel="Selected date" accent={M.tint}>
      <div style={{ padding: '0 16px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 6px 12px' }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5 }}>{monthLabel}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setView(new Date(y, m - 1, 1))} style={navBtn}>
              <svg width="9" height="15" viewBox="0 0 9 15"><path d="M7.5 1L1.5 7.5l6 6.5" stroke={M.tint} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={() => setView(new Date(y, m + 1, 1))} style={navBtn}>
              <svg width="9" height="15" viewBox="0 0 9 15"><path d="M1.5 1l6 6.5-6 6.5" stroke={M.tint} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>

        {/* DOW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, padding: '0 2px 6px' }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: M.sec, letterSpacing: -0.08 }}>{d}</div>
          ))}
        </div>

        {/* day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={{ height: 44 }} />;
            const isToday = sameDay(d, DT_TODAY);
            const isSel = sameDay(d, selected);
            return (
              <button key={i} onClick={() => setSelected(d)}
                style={{
                  height: 44, borderRadius: 9999, border: 'none', background: isSel ? M.tint : 'transparent', cursor: 'pointer',
                  fontFamily: M.font, fontSize: 18, fontWeight: isToday ? 600 : 400,
                  color: isSel ? '#fff' : (isToday ? M.tint : M.label),
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                {d.getDate()}
                {isToday && !isSel && <div style={{ position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 9999, background: M.tint }} />}
              </button>
            );
          })}
        </div>

        {/* quick chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          {[
            { l: 'Today', d: DT_TODAY },
            { l: 'Tomorrow', d: addDays(DT_TODAY, 1) },
            { l: 'Next Mon', d: (() => { const x = new Date(DT_TODAY); x.setDate(x.getDate() + ((1 - x.getDay() + 7) % 7 || 7)); return x; })() },
            { l: 'In a week', d: addDays(DT_TODAY, 7) },
          ].map((c, i) => (
            <button key={i} onClick={() => { setSelected(c.d); setView(new Date(c.d.getFullYear(), c.d.getMonth(), 1)); }}
              style={chipStyle(sameDay(selected, c.d))}>{c.l}</button>
          ))}
        </div>
      </div>
    </DTShell>
  );
}


// ═══════════════════════════════════════════════════════════════════
// DATE B — Horizontal week strip + agenda. Scroll a continuous ribbon
// of days; selected week highlights; below: month dots & quick stats.
// ═══════════════════════════════════════════════════════════════════
function DateWeekStrip() {
  // Build 4 weeks centered around today.
  const center = DT_TODAY;
  const start = addDays(center, -14);
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const [selected, setSelected] = dtUS(new Date(DT_TODAY));

  // Group by week
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const monthOfSelected = MONTHS[selected.getMonth()] + ' ' + selected.getFullYear();
  const fmtFooter = selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <DTShell title="Pick a day" footerValue={fmtFooter} footerLabel="Selected" accent="#0a84ff">
      <div style={{ padding: '4px 0 0' }}>
        <div style={{ padding: '4px 20px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: M.sec, letterSpacing: 0.6, textTransform: 'uppercase' }}>Month</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, marginTop: 2 }}>{monthOfSelected}</div>
        </div>

        {/* week strips */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {weeks.map((w, wi) => {
            const hasSel = w.some(d => sameDay(d, selected));
            return (
              <div key={wi} style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6,
                padding: 6, borderRadius: 14,
                background: hasSel ? 'rgba(10,132,255,0.08)' : 'transparent',
                transition: 'background .15s',
              }}>
                {w.map((d, di) => {
                  const isSel = sameDay(d, selected);
                  const isToday = sameDay(d, DT_TODAY);
                  const otherMonth = d.getMonth() !== selected.getMonth();
                  return (
                    <button key={di} onClick={() => setSelected(d)}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: 11,
                        background: isSel ? '#0a84ff' : (isToday ? 'rgba(10,132,255,0.12)' : 'transparent'),
                        color: isSel ? '#fff' : (isToday ? '#0a84ff' : (otherMonth ? M.ter : M.label)),
                        padding: '8px 0 9px', fontFamily: M.font, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, opacity: isSel ? 0.85 : 0.6 }}>{DOW_S[d.getDay()]}</span>
                      <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* preview card */}
        <div style={{ margin: '18px 16px 0', background: M.surface, borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{selected.getDate()}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>{DOW_3[selected.getDay()]}</div>
              <div style={{ fontSize: 13, color: M.sec, marginTop: 1 }}>{MONTHS_SHORT[selected.getMonth()]} · wk {Math.ceil((selected.getDate() + new Date(selected.getFullYear(), selected.getMonth(), 1).getDay()) / 7)}</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: M.sec, fontWeight: 500 }}>{Math.round((selected - DT_TODAY) / 86400000)} d</div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <Stat k="Shifts" v="3" />
            <Stat k="Hours"  v="22" />
            <Stat k="Open"   v="1" tone="amber" />
          </div>
        </div>
      </div>
    </DTShell>
  );
}

function Stat({ k, v, tone }) {
  const fg = tone === 'amber' ? '#a65800' : M.label;
  return (
    <div style={{ flex: 1, background: M.bg, borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: M.sec, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: fg, letterSpacing: -0.3, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// DATE C — Range picker (start → end on the same calendar). Useful for
// time-off, schedule windows, payroll periods. Tap once for start, tap
// again for end; tap again to restart.
// ═══════════════════════════════════════════════════════════════════
function DateRangePicker() {
  const [view] = dtUS(new Date(DT_TODAY.getFullYear(), DT_TODAY.getMonth(), 1));
  const [range, setRange] = dtUS({ start: DT_TODAY, end: addDays(DT_TODAY, 4) });

  const tap = (d) => {
    if (range.start && range.end) { setRange({ start: d, end: null }); return; }
    if (range.start && !range.end) {
      if (d < range.start) setRange({ start: d, end: range.start });
      else setRange({ start: range.start, end: d });
    }
  };

  const inRange = (d) => {
    if (!range.start || !range.end) return false;
    return d >= range.start && d <= range.end;
  };
  const isStart = (d) => range.start && sameDay(d, range.start);
  const isEnd = (d) => range.end && sameDay(d, range.end);

  // build 6 weeks from view
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const lead = first.getDay();
  const days = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push({ d: addDays(first, i - lead), out: true });
  for (let d = 1; d <= days; d++) cells.push({ d: new Date(y, m, d), out: false });
  while (cells.length % 7) cells.push({ d: addDays(new Date(y, m, days), cells.length - lead - days + 1), out: true });

  const totalDays = range.end ? Math.round((range.end - range.start) / 86400000) + 1 : 1;
  const fmtRange = range.end
    ? `${MONTHS_SHORT[range.start.getMonth()]} ${range.start.getDate()} – ${MONTHS_SHORT[range.end.getMonth()]} ${range.end.getDate()}`
    : `${MONTHS_SHORT[range.start.getMonth()]} ${range.start.getDate()} → pick end`;

  return (
    <DTShell title="Date range" footerValue={`${fmtRange} · ${totalDays}d`} footerLabel="Range" accent={M.tint}>
      <div style={{ padding: '4px 16px 0' }}>
        {/* big numeric range header */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '6px 4px 18px' }}>
          <RangeChip label="Start" date={range.start} active={!range.end ? false : false} highlight />
          <div style={{ display: 'flex', alignItems: 'center', color: M.ter }}>
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <RangeChip label="End" date={range.end} active={!range.end} placeholder="Tap a day" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px' }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>{MONTHS[m]} {y}</div>
          <div style={{ fontSize: 12, color: M.sec }}>{totalDays} day{totalDays === 1 ? '' : 's'} selected</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 0 6px' }}>
          {DOW_S.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: M.sec }}>{d}</div>)}
        </div>

        {/* range grid — connected pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((c, i) => {
            const inR = inRange(c.d);
            const start = isStart(c.d);
            const end = isEnd(c.d);
            const single = start && end;
            const col = i % 7;
            // connector backgrounds
            let bg = 'transparent';
            if (inR && !start && !end) bg = 'rgba(28,25,23,0.10)';
            const pillBg = (start || end) ? M.tint : 'transparent';
            const radL = (start || single || col === 0 || (inR && i > 0 && !inRange(cells[i-1]?.d))) ? 9999 : 0;
            const radR = (end || single || col === 6 || (inR && i < cells.length - 1 && !inRange(cells[i+1]?.d))) ? 9999 : 0;

            return (
              <div key={i} style={{ height: 44, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {inR && (
                  <div style={{
                    position: 'absolute', top: 4, bottom: 4, left: 0, right: 0,
                    background: bg,
                    borderTopLeftRadius: radL, borderBottomLeftRadius: radL,
                    borderTopRightRadius: radR, borderBottomRightRadius: radR,
                  }} />
                )}
                <button onClick={() => !c.out && tap(c.d)}
                  style={{
                    position: 'relative', width: 36, height: 36, borderRadius: 9999, border: 'none',
                    background: pillBg, cursor: c.out ? 'default' : 'pointer',
                    fontFamily: M.font, fontSize: 16, fontWeight: (start || end) ? 700 : 400,
                    color: (start || end) ? '#fff' : (c.out ? M.ter : M.label),
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                  {c.d.getDate()}
                </button>
              </div>
            );
          })}
        </div>

        {/* presets */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { l: 'This week', s: addDays(DT_TODAY, -DT_TODAY.getDay()), e: addDays(DT_TODAY, 6 - DT_TODAY.getDay()) },
            { l: 'Next 7 days', s: DT_TODAY, e: addDays(DT_TODAY, 6) },
            { l: 'Next 14 days', s: DT_TODAY, e: addDays(DT_TODAY, 13) },
            { l: 'This month', s: new Date(DT_TODAY.getFullYear(), DT_TODAY.getMonth(), 1), e: new Date(DT_TODAY.getFullYear(), DT_TODAY.getMonth() + 1, 0) },
          ].map((c, i) => (
            <button key={i} onClick={() => setRange({ start: c.s, end: c.e })} style={chipStyle(false)}>{c.l}</button>
          ))}
        </div>
      </div>
    </DTShell>
  );
}

function RangeChip({ label, date, highlight, active, placeholder }) {
  const has = !!date;
  return (
    <div style={{
      flex: 1, padding: '10px 14px', borderRadius: 12,
      background: M.surface,
      boxShadow: active ? `inset 0 0 0 2px ${M.tint}` : 'inset 0 0 0 0.5px rgba(60,60,67,0.18)',
    }}>
      <div style={{ fontSize: 11, color: M.sec, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
      {has ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{date.getDate()}</div>
          <div style={{ fontSize: 13, color: M.sec, fontWeight: 600 }}>{MONTHS_SHORT[date.getMonth()]}</div>
        </div>
      ) : (
        <div style={{ fontSize: 14, color: M.ter, marginTop: 4, fontStyle: 'italic' }}>{placeholder}</div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// TIME A — Spinning wheel (classic iOS). Hours / minutes / AM-PM
// columns; tap a row to snap to it.
// ═══════════════════════════════════════════════════════════════════
function TimeWheel() {
  const [h, setH] = dtUS(7);   // 1..12
  const [m, setM] = dtUS(30);  // 0..59
  const [ap, setAp] = dtUS('AM');

  const h24 = (ap === 'PM' ? (h % 12) + 12 : (h === 12 ? 0 : h));
  const footer = `${h}:${pad2(m)} ${ap}`;

  return (
    <DTShell title="Time" footerValue={footer} footerLabel="Selected time" accent={M.tint}>
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{ background: M.surface, borderRadius: 16, padding: '10px 8px', position: 'relative' }}>
          {/* center selection band */}
          <div style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 36, transform: 'translateY(-50%)', background: 'rgba(120,120,128,0.12)', borderRadius: 8, pointerEvents: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Wheel values={Array.from({length:12},(_,i)=>i+1)} value={h} onChange={setH} fmt={v=>String(v)} />
            <Wheel values={Array.from({length:60},(_,i)=>i)} value={m} onChange={setM} fmt={v=>pad2(v)} />
            <Wheel values={['AM','PM']} value={ap} onChange={setAp} fmt={v=>v} />
          </div>
        </div>

        {/* quick chips */}
        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { l: 'Now', h: 9, m: 41, a: 'AM' },
            { l: 'Open · 7:00', h: 7, m: 0, a: 'AM' },
            { l: 'Lunch · 12:00', h: 12, m: 0, a: 'PM' },
            { l: 'Close · 9:00', h: 9, m: 0, a: 'PM' },
          ].map((c, i) => (
            <button key={i} onClick={() => { setH(c.h); setM(c.m); setAp(c.a); }} style={chipStyle(h === c.h && m === c.m && ap === c.a)}>{c.l}</button>
          ))}
        </div>
      </div>
    </DTShell>
  );
}

function Wheel({ values, value, onChange, fmt }) {
  // Visible window of 5 rows. Center index = current value.
  const ROW = 36;
  const idx = values.indexOf(value);
  const view = [];
  for (let off = -2; off <= 2; off++) {
    const i = ((idx + off) % values.length + values.length) % values.length;
    view.push({ v: values[i], off });
  }
  return (
    <div style={{ height: ROW * 5, position: 'relative', overflow: 'hidden' }}>
      {/* gradient masks */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.92))', pointerEvents: 'none', zIndex: 2 }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {view.map((r, i) => {
          const dist = Math.abs(r.off);
          const opa = dist === 0 ? 1 : (dist === 1 ? 0.55 : 0.25);
          const sz  = dist === 0 ? 22 : (dist === 1 ? 19 : 17);
          const wt  = dist === 0 ? 600 : 500;
          return (
            <button key={i} onClick={() => onChange(r.v)}
              style={{
                height: ROW, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: M.font, fontSize: sz, fontWeight: wt, color: M.label,
                opacity: opa, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
              }}>{fmt(r.v)}</button>
          );
        })}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// TIME B — Analog clock dial. Drag the hour hand, then the minute hand;
// big numeric readout above. Toggle AM/PM with a segmented control.
// ═══════════════════════════════════════════════════════════════════
function TimeDial() {
  const [mode, setMode] = dtUS('hour'); // 'hour' | 'minute'
  const [h, setH] = dtUS(7);            // 1..12
  const [m, setM] = dtUS(30);           // 0..59
  const [ap, setAp] = dtUS('AM');
  const ringRef = dtUR(null);

  const handleAngle = (e) => {
    const r = ringRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const t = (e.touches ? e.touches[0] : e);
    const dx = t.clientX - cx, dy = t.clientY - cy;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    if (ang < 0) ang += 360;
    if (mode === 'hour') {
      const v = Math.round(ang / 30) % 12;
      setH(v === 0 ? 12 : v);
    } else {
      const v = Math.round(ang / 6) % 60;
      setM(v);
    }
  };

  const onDown = (e) => {
    handleAngle(e);
    const move = (ev) => handleAngle(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ringSize = 280;
  const cx = ringSize / 2, cy = ringSize / 2;
  const hAng = (h % 12) * 30 - 90;
  const mAng = m * 6 - 90;
  const r = ringSize / 2 - 28;
  const handAng = mode === 'hour' ? hAng : mAng;
  const handX = cx + Math.cos(handAng * Math.PI / 180) * r;
  const handY = cy + Math.sin(handAng * Math.PI / 180) * r;

  const tickValues = mode === 'hour'
    ? Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 12 : i, ang: i * 30 - 90 }))
    : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, ang: i * 30 - 90 }));

  const footer = `${h}:${pad2(m)} ${ap}`;

  return (
    <DTShell title="Time" footerValue={footer} footerLabel="Selected time" accent="#0a84ff">
      <div style={{ padding: '4px 16px 0' }}>
        {/* Big readout */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, padding: '8px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
          <button onClick={() => setMode('hour')} style={readoutNum(mode === 'hour')}>{h}</button>
          <span style={{ fontSize: 56, fontWeight: 300, color: M.ter, lineHeight: 1, letterSpacing: -2 }}>:</span>
          <button onClick={() => setMode('minute')} style={readoutNum(mode === 'minute')}>{pad2(m)}</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 10, fontFamily: M.font }}>
            <button onClick={() => setAp('AM')} style={apBtn(ap === 'AM')}>AM</button>
            <button onClick={() => setAp('PM')} style={apBtn(ap === 'PM')}>PM</button>
          </div>
        </div>

        {/* dial */}
        <div ref={ringRef} onPointerDown={onDown}
          style={{ width: ringSize, height: ringSize, margin: '4px auto 0', borderRadius: 9999, background: M.surface, position: 'relative', touchAction: 'none', userSelect: 'none' }}>
          {/* hand */}
          <svg width={ringSize} height={ringSize} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <line x1={cx} y1={cy} x2={handX} y2={handY} stroke="#0a84ff" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={4} fill="#0a84ff" />
            <circle cx={handX} cy={handY} r={18} fill="#0a84ff" />
          </svg>
          {/* numbers */}
          {tickValues.map((t, i) => {
            const x = cx + Math.cos(t.ang * Math.PI / 180) * r;
            const y = cy + Math.sin(t.ang * Math.PI / 180) * r;
            const isSel = (mode === 'hour' && t.v === h) || (mode === 'minute' && t.v === m);
            return (
              <div key={i} style={{
                position: 'absolute', left: x - 18, top: y - 18, width: 36, height: 36, borderRadius: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: M.font, fontSize: 16, fontWeight: 600,
                color: isSel ? '#fff' : M.label, fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none', zIndex: 2,
                letterSpacing: -0.2,
              }}>{pad2(t.v).replace(/^0/,'')}</div>
            );
          })}
          {/* mode hint */}
          <div style={{ position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: M.sec, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', pointerEvents: 'none' }}>
            {mode === 'hour' ? 'Drag to set hour' : 'Drag to set minute'}
          </div>
        </div>
      </div>
    </DTShell>
  );
}

function readoutNum(active) {
  return {
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px',
    fontFamily: M.font, fontSize: 56, fontWeight: 300, lineHeight: 1, letterSpacing: -2,
    color: active ? '#0a84ff' : M.label,
  };
}
function apBtn(active) {
  return {
    border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    background: active ? '#0a84ff' : 'rgba(120,120,128,0.12)',
    color: active ? '#fff' : M.label,
    fontFamily: M.font, fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
  };
}


// ═══════════════════════════════════════════════════════════════════
// TIME C — Time RANGE on a 24h ribbon. Drag the start handle and end
// handle along a horizontal hour bar; live duration above.
// ═══════════════════════════════════════════════════════════════════
function TimeRange() {
  const TOTAL_MIN = 24 * 60;
  const [start, setStart] = dtUS(7 * 60);    // minutes from 0:00
  const [end, setEnd]     = dtUS(15 * 60);
  const STEP = 15;

  const trackRef = dtUR(null);

  const minToX = (min) => (min / TOTAL_MIN) * 100;
  const xToMin = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round((pct * TOTAL_MIN) / STEP) * STEP;
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

  const fmt = (min) => {
    const h24 = Math.floor(min / 60), mm = min % 60;
    const t = fmtTime12(h24, mm);
    return t.str;
  };

  const dur = end - start;
  const durH = Math.floor(dur / 60), durM = dur % 60;

  // hour ticks (6,9,12,15,18,21)
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <DTShell title="Shift hours" footerValue={`${fmt(start)} → ${fmt(end)}`} footerLabel="Range" accent={M.tint}>
      <div style={{ padding: '4px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '6px 0 18px' }}>
          <TimeChip label="Start" value={fmt(start)} active />
          <div style={{ textAlign: 'center', padding: '0 8px', flex: '0 0 auto' }}>
            <div style={{ fontSize: 11, color: M.sec, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Duration</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {durH}h {pad2(durM)}m
            </div>
          </div>
          <TimeChip label="End" value={fmt(end)} active />
        </div>

        {/* track */}
        <div ref={trackRef}
          style={{ position: 'relative', height: 86, padding: '24px 0', userSelect: 'none', touchAction: 'none' }}
        >
          {/* base bar */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 24, height: 38, background: M.surface, borderRadius: 12 }} />
          {/* selected fill */}
          <div style={{
            position: 'absolute', top: 24, height: 38,
            left: `${minToX(start)}%`, width: `${minToX(end) - minToX(start)}%`,
            background: M.tint, borderRadius: 12,
          }}>
            {/* shimmer of hour ticks inside fill */}
          </div>
          {/* tick marks below */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 64, display: 'flex', justifyContent: 'space-between' }}>
            {hourLabels.map((h, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: 1, height: 4, background: M.ter }} />
                <div style={{ fontSize: 10, color: M.sec, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h-12}p`}
                </div>
              </div>
            ))}
          </div>

          {/* handles */}
          <Handle pct={minToX(start)} onDown={drag('start')} label="Start" />
          <Handle pct={minToX(end)} onDown={drag('end')} label="End" />
        </div>

        {/* shift type chips */}
        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { l: 'Morning', s: 7*60, e: 15*60 },
            { l: 'Mid', s: 11*60, e: 19*60 },
            { l: 'Close', s: 15*60, e: 23*60 },
            { l: 'Overnight', s: 22*60, e: 6*60 + 24*60 }, // wrap not handled; keep within
          ].filter(c => c.e <= TOTAL_MIN).map((c, i) => (
            <button key={i} onClick={() => { setStart(c.s); setEnd(c.e); }}
              style={chipStyle(start === c.s && end === c.e)}>{c.l} · {fmt(c.s).replace(/:00 /,'')} – {fmt(c.e).replace(/:00 /,'')}</button>
          ))}
        </div>

        {/* break sub-card */}
        <div style={{ marginTop: 18, background: M.surface, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>Unpaid break</div>
            <div style={{ fontSize: 12, color: M.sec, marginTop: 1 }}>Auto-deducted from total</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: M.font, fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.2 }}>
            <button style={stepBtn}>−</button>
            <span style={{ minWidth: 44, textAlign: 'center' }}>30 min</span>
            <button style={stepBtn}>+</button>
          </div>
        </div>
      </div>
    </DTShell>
  );
}

function TimeChip({ label, value, active }) {
  return (
    <div style={{
      flex: '1 1 0', maxWidth: 130, padding: '8px 12px', borderRadius: 12, background: M.surface,
      boxShadow: active ? `inset 0 0 0 1.5px ${M.tint}` : 'inset 0 0 0 0.5px rgba(60,60,67,0.18)',
    }}>
      <div style={{ fontSize: 10, color: M.sec, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function Handle({ pct, onDown, label }) {
  return (
    <div onPointerDown={onDown}
      style={{
        position: 'absolute', top: 18, left: `calc(${pct}% - 14px)`,
        width: 28, height: 50, borderRadius: 8, background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(60,60,67,0.2)',
        cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3,
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ width: 2, height: 12, background: M.ter, borderRadius: 1 }} />
        <div style={{ width: 2, height: 12, background: M.ter, borderRadius: 1, marginTop: -10, marginLeft: 4 }} />
      </div>
    </div>
  );
}

const stepBtn = {
  width: 28, height: 28, borderRadius: 9999, border: 'none', cursor: 'pointer',
  background: 'rgba(120,120,128,0.12)', fontFamily: M.font, fontSize: 17, fontWeight: 500, color: M.label,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// ─── shared chip + nav button styles ─────────────────────────
const navBtn = {
  width: 34, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer',
  background: 'rgba(120,120,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
function chipStyle(active) {
  return {
    background: active ? M.label : M.surface,
    color: active ? '#fff' : M.label,
    border: active ? 'none' : '0.5px solid rgba(60,60,67,0.18)',
    borderRadius: 9999, padding: '8px 14px', cursor: 'pointer',
    fontFamily: M.font, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
  };
}


Object.assign(window, {
  DateCalendarGrid, DateWeekStrip, DateRangePicker,
  TimeWheel, TimeDial, TimeRange,
});
