// Mobile punch-in variants — three directions for clocking in/out.
// All rendered inside IOSDevice 402×874. Uses M palette + MIcon from mobile-shared.
//
// Variants:
//   A · Hero Clock    — large clock + primary button, upcoming shift context
//   B · Card Stack    — status card flipping between Clocked-out / On shift / On break
//   C · Hold-to-Punch — novel tactile variant (press & hold arc to commit)
//
// All variants share the same underlying state machine:
//   'out' → 'in' → 'break' → 'in' → 'out' (summary)

const { useState: puS, useEffect: puE, useRef: puR } = React;

// ─── Shared helpers ─────────────────────────────────────────
const PUNCH_FALLBACK_SHIFT = { startTime: '07:00', endTime: '15:00', shiftType: 'morning', staffRoles: ['Shift Lead'] };
const PUNCH_TODAY_ISO = (() => {
  // Try several candidates; fall back to whatever Tuesday m1 shift exists.
  const cand = SHIFTS_SEED.filter(s => s.memberId === 'm1').map(s => s.date);
  const iso = isoDate(TODAY);
  if (cand.includes(iso)) return iso;
  // pick a Tuesday (index 1) equivalent — second m1 shift (data.jsx seeds Mon 0, Tue 1, Thu 3, Sat 5)
  return cand[1] || cand[0] || iso;
})();
const PUNCH = {
  you: TEAM[0],
  shift: SHIFTS_SEED.find(s => s.memberId === 'm1' && s.date === PUNCH_TODAY_ISO) || PUNCH_FALLBACK_SHIFT,
  peers: (() => {
    const peers = SHIFTS_SEED
      .filter(s => s.date === PUNCH_TODAY_ISO && s.memberId !== 'm1')
      .map(s => TEAM.find(t => t.id === s.memberId))
      .filter(Boolean);
    if (peers.length >= 2) return peers.slice(0, 4);
    // fallback: grab any 4 teammates so the peer stack always renders
    return TEAM.filter(t => t.id !== 'm1').slice(0, 4);
  })(),
};

function fmtClock(d) {
  let h = d.getHours(), m = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { h: String(h), m: String(m).padStart(2, '0'), p };
}
function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(ss).padStart(2, '0'),
  };
}

// ticking clock hook — updates every 1s, demo-frozen offset supported
function usePunchClock() {
  // Freeze "now" at 7:02 AM on the pinned TODAY so all 3 variants tell a
  // consistent story (shift starts at 7:00, you're 2 min past).
  const base = puR(new Date(2026, 3, 22, 7, 2, 14)).current;
  const [t, setT] = puS(base);
  puE(() => {
    const id = setInterval(() => setT(prev => new Date(prev.getTime() + 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// ─── Small primitives (variant-scoped, not exported) ────────
function PButton({ children, onClick, variant = 'primary', icon, size = 'lg', style }) {
  const sizes = {
    lg: { h: 56, fs: 17, fw: 600, px: 24, r: 28 },
    md: { h: 44, fs: 15, fw: 600, px: 18, r: 22 },
    sm: { h: 34, fs: 13, fw: 600, px: 14, r: 17 },
  }[size];
  const variants = {
    primary:   { bg: M.tint, fg: '#fff', border: 'none' },
    secondary: { bg: 'rgba(120,120,128,0.12)', fg: M.tint, border: 'none' },
    danger:    { bg: '#b91c1c', fg: '#fff', border: 'none' },
    ghost:     { bg: 'transparent', fg: M.tint, border: `1px solid ${M.sep2}` },
  }[variant];
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, height: sizes.h, padding: `0 ${sizes.px}px`, borderRadius: sizes.r,
      background: variants.bg, color: variants.fg, border: variants.border,
      fontFamily: M.font, fontSize: sizes.fs, fontWeight: sizes.fw, letterSpacing: -0.2,
      cursor: 'pointer', width: '100%',
      ...style,
    }}>
      {icon && <MIcon name={icon} size={18} color={variants.fg} />}
      {children}
    </button>
  );
}

// A divider with centered "label" pill
function LabelDivider({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px 10px' }}>
      <div style={{ flex: 1, height: 0.5, background: M.sep }} />
      <div style={{ fontSize: 11, color: M.sec, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>
        {children}
      </div>
      <div style={{ flex: 1, height: 0.5, background: M.sep }} />
    </div>
  );
}

// pulsing "recording" dot
function LiveDot({ color = '#ef4444', size = 8 }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: 9999, background: color,
        animation: 'punchPulse 1.6s ease-out infinite',
      }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 9999, background: color }} />
    </span>
  );
}

// Inject once
if (typeof document !== 'undefined' && !document.getElementById('punch-kf')) {
  const st = document.createElement('style');
  st.id = 'punch-kf';
  st.textContent = `
    @keyframes punchPulse { 0% { transform: scale(1); opacity: .6 } 100% { transform: scale(2.6); opacity: 0 } }
    @keyframes punchArc { 0% { stroke-dashoffset: 816 } 100% { stroke-dashoffset: 0 } }
    @keyframes punchRing { 0%,100% { transform: scale(1) } 50% { transform: scale(1.02) } }
    .punch-tap:active { transform: scale(0.985); transition: transform .08s }
    .punch-hold-ring { transition: stroke-dashoffset .15s linear }
  `;
  document.head.appendChild(st);
}

// ═══════════════════════════════════════════════════════════════════
// Shared footer with peers ("Working right now")
// ═══════════════════════════════════════════════════════════════════
function PeerStack({ members = PUNCH.peers, title = 'Working right now' }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{
        fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
        color: M.sec, fontWeight: 600, marginBottom: 10,
      }}>{title}</div>
      <div style={{
        background: M.surface, borderRadius: 16, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex' }}>
          {members.slice(0, 4).map((m, i) => (
            <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, border: `2px solid ${M.surface}`, borderRadius: 9999 }}>
              <MAvatar name={m.name} size={30} color={m.color} />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: M.label, fontWeight: 500, letterSpacing: -0.1 }}>
            {members[0]?.name.split(' ')[0]}, {members[1]?.name.split(' ')[0]} & {members.length - 2} more
          </div>
          <div style={{ fontSize: 12, color: M.sec, marginTop: 1 }}>4 on the floor · opening shift</div>
        </div>
        <MIcon name="chevron-right" size={16} color={M.ter} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// A · Hero Clock
//   – Oversized live clock as hero (numeric focus)
//   – Shift context chip below
//   – Single primary button: Clock in / Start break / End break / Clock out
//   – Minimal, dignified, monochrome
// ═══════════════════════════════════════════════════════════════════
function PunchVariantA({ state = 'out', onState, elapsedMs = 0 }) {
  const now = usePunchClock();
  const { h, m, p } = fmtClock(now);
  const shift = PUNCH.shift;
  const early = state === 'out';
  const heroNote =
    state === 'out'    ? `You're scheduled 7:00 AM — 3:00 PM` :
    state === 'in'     ? `Clocked in at 7:02 AM` :
    state === 'break'  ? `Break started at 10:45 AM` :
    `Clocked out · shift complete`;

  const cta = {
    out:    { label: 'Clock In',        variant: 'primary', icon: 'clock',  next: 'in' },
    in:     { label: 'Start Break',     variant: 'secondary', icon: 'coffee', next: 'break' },
    break:  { label: 'End Break',       variant: 'primary', icon: 'refresh', next: 'in' },
    summary:{ label: 'View Summary',    variant: 'secondary', icon: 'arrow-right', next: 'out' },
  }[state];

  const second = {
    in:     { label: 'Clock Out', variant: 'danger',  icon: 'logout',  next: 'summary' },
    break:  { label: 'Clock Out', variant: 'ghost',   icon: 'logout',  next: 'summary' },
  }[state];

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 110, fontFamily: M.font }}>
      {/* Top chrome */}
      <div style={{ paddingTop: 54, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '54px 20px 4px' }}>
        <div>
          <div style={{ fontSize: 13, color: M.sec, letterSpacing: -0.08 }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, marginTop: 2 }}>
            Good morning, {PUNCH.you.name.split(' ')[0]}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9999, background: M.surface }}>
          <MIcon name="mappin" size={12} color={M.sec} />
          <span style={{ fontSize: 11, color: M.sec, fontWeight: 500 }}>Oakland</span>
        </div>
      </div>

      {/* HERO clock */}
      <div style={{
        margin: '28px 20px 0', padding: '28px 20px 22px',
        background: M.surface, borderRadius: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        {state !== 'out' && (
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LiveDot color={state === 'break' ? '#f59e0b' : '#10b981'} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: state === 'break' ? '#a16207' : '#047857', textTransform: 'uppercase' }}>
              {state === 'break' ? 'On break' : 'On shift'}
            </span>
          </div>
        )}

        <div style={{ fontSize: 11, color: M.sec, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>
          Local time
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 96, fontWeight: 300, letterSpacing: -4, lineHeight: '1', color: M.label }}>{h}</span>
          <span style={{ fontSize: 96, fontWeight: 300, color: M.ter, lineHeight: '1' }}>:</span>
          <span style={{ fontSize: 96, fontWeight: 300, letterSpacing: -4, lineHeight: '1', color: M.label }}>{m}</span>
          <span style={{ fontSize: 24, fontWeight: 600, color: M.sec, marginLeft: 8 }}>{p}</span>
        </div>

        {/* Elapsed timer when on shift */}
        {(state === 'in' || state === 'break') && (
          <div style={{ marginTop: 14, display: 'flex', gap: 20 }}>
            <TimerBlock label="On shift"  value={fmtHMS(elapsedMs).h + ':' + fmtHMS(elapsedMs).m + ':' + fmtHMS(elapsedMs).s} />
            <TimerBlock label="Break used" value={state === 'break' ? '00:06:42' : '00:00:00'} muted={state !== 'break'} />
          </div>
        )}

        {/* Shift context */}
        {state === 'out' && shift && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: `0.5px solid ${M.sep}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 34, borderRadius: 2, background: SHIFT_COLORS.morning }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: M.sec, fontWeight: 500 }}>Today's shift</div>
                <div style={{ fontSize: 15, color: M.label, fontWeight: 600, letterSpacing: -0.2 }}>
                  {formatTime(shift.startTime)} — {formatTime(shift.endTime)} · Shift Lead
                </div>
              </div>
              <div style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(234,88,12,0.1)', color: '#9a3412', fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
                IN 2M
              </div>
            </div>
          </div>
        )}

        {state === 'summary' && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${M.sep}` }}>
            <div style={{ display: 'flex', gap: 18, fontVariantNumeric: 'tabular-nums' }}>
              <TimerBlock label="Worked"  value="7h 48m" />
              <TimerBlock label="Breaks"  value="30m" />
              <TimerBlock label="Est. pay" value="$148.20" />
            </div>
          </div>
        )}
      </div>

      {/* Primary / Secondary actions */}
      <div style={{ padding: '20px 20px 14px' }}>
        <PButton onClick={() => onState && onState(cta.next)} variant={cta.variant} icon={cta.icon}>
          {cta.label}
        </PButton>
        {second && (
          <div style={{ marginTop: 10 }}>
            <PButton onClick={() => onState && onState(second.next)} variant={second.variant} icon={second.icon} size="md">
              {second.label}
            </PButton>
          </div>
        )}
      </div>

      {/* Supplementary */}
      {state === 'out' && (
        <>
          <LabelDivider>Before you clock in</LabelDivider>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MiniRow icon="users" title="Opening checklist" meta="4 items · ~6 min" tint="#0f766e" />
            <MiniRow icon="swap"  title="Trade request from Marcus" meta="Cover 11 AM — 7 PM"  tint="#7c3aed" badge="NEW" />
          </div>
        </>
      )}

      {state === 'in' && (
        <>
          <div style={{ height: 12 }} />
          <PeerStack />
        </>
      )}

      {state === 'break' && (
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <MIcon name="coffee" size={18} color="#a16207" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#78350f', letterSpacing: -0.1 }}>
                Paid break · 10 min remaining
              </div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
                Auto-resume at 10:55 AM if you don't end it manually.
              </div>
            </div>
          </div>
        </div>
      )}

      {state === 'summary' && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ background: M.surface, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: M.sec, letterSpacing: 0.6, fontWeight: 600, textTransform: 'uppercase' }}>Timeline</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { t: '7:02 AM',  l: 'Clocked in',   c: '#10b981' },
                { t: '10:45 AM', l: 'Break start',  c: '#f59e0b' },
                { t: '11:15 AM', l: 'Break end',    c: '#f59e0b' },
                { t: '2:50 PM',  l: 'Clocked out',  c: '#6b7280' },
              ].map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 9999, background: e.c }} />
                  <div style={{ fontSize: 13, color: M.sec, width: 72, fontVariantNumeric: 'tabular-nums' }}>{e.t}</div>
                  <div style={{ fontSize: 14, color: M.label, fontWeight: 500 }}>{e.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimerBlock({ label, value, muted }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: M.sec, fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3, color: muted ? M.ter : M.label, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function MiniRow({ icon, title, meta, tint, badge }) {
  return (
    <div style={{
      background: M.surface, borderRadius: 16, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: `${tint}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MIcon name={icon} size={17} color={tint} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: M.label, letterSpacing: -0.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: M.sec, marginTop: 1 }}>{meta}</div>
      </div>
      {badge && (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: '#7c3aed', padding: '3px 7px', borderRadius: 5, background: 'rgba(124,58,237,0.1)' }}>{badge}</span>
      )}
      <MIcon name="chevron-right" size={16} color={M.ter} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// B · Card Stack
//   – Single full-bleed status card fills the viewport
//   – Card background color is the state's temperature:
//       out: stone-white (calm)   in: emerald (running)
//       break: amber (paused)     summary: stone-dark (done)
//   – Big timestamp + clear primary action inside card
//   – Outside the card, a slim stats dock + peer strip
// ═══════════════════════════════════════════════════════════════════
function PunchVariantB({ state = 'out', onState, elapsedMs = 0 }) {
  const now = usePunchClock();
  const shift = PUNCH.shift;
  const { h, m, p } = fmtClock(now);

  const palette = {
    out:    { bg: '#ffffff',      fg: M.label, accent: M.tint,     sub: M.sec,  badge: null },
    in:     { bg: '#0b4f3f',      fg: '#ecfdf5', accent: '#fff',   sub: 'rgba(236,253,245,0.7)', badge: { t: 'ON SHIFT', c: '#34d399' } },
    break:  { bg: '#7c2d12',      fg: '#fff7ed', accent: '#fff',   sub: 'rgba(255,247,237,0.75)', badge: { t: 'ON BREAK',  c: '#fb923c' } },
    summary:{ bg: '#1c1917',      fg: '#fafaf9', accent: '#fff',   sub: 'rgba(250,250,249,0.65)', badge: { t: 'COMPLETE',  c: '#a8a29e' } },
  }[state];

  const cta = {
    out:    'Clock in',
    in:     'Start break',
    break:  'End break',
    summary:'Start new day',
  }[state];
  const ctaNext = { out: 'in', in: 'break', break: 'in', summary: 'out' }[state];
  const ctaIcon = { out: 'clock', in: 'coffee', break: 'refresh', summary: 'refresh' }[state];

  const elapsedStr = fmtHMS(elapsedMs);

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 110, fontFamily: M.font }}>
      {/* Minimal top */}
      <div style={{ paddingTop: 58, paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '58px 20px 8px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MAvatar name={PUNCH.you.name} size={32} color={PUNCH.you.color} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: M.label, letterSpacing: -0.1 }}>{PUNCH.you.name}</div>
            <div style={{ fontSize: 11, color: M.sec }}>{PUNCH.you.roleTitle} · Oakland</div>
          </div>
        </div>
        <MIcon name="more" size={22} color={M.tint} />
      </div>

      {/* Status card */}
      <div style={{
        margin: '12px 16px 0', borderRadius: 32,
        background: palette.bg,
        color: palette.fg,
        padding: '22px 22px 20px',
        boxShadow: state === 'out' ? '0 1px 2px rgba(0,0,0,0.03)' : '0 12px 30px rgba(0,0,0,0.1)',
        minHeight: 420,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: palette.sub, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>
              {state === 'out' ? 'Next shift' : state === 'summary' ? "Today's shift" : 'Current shift'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4, letterSpacing: -0.2, color: palette.fg }}>
              {formatTime(shift.startTime)} — {formatTime(shift.endTime)}
            </div>
            <div style={{ fontSize: 13, color: palette.sub, marginTop: 2 }}>Shift Lead · {now.toLocaleDateString('en-US', { weekday: 'long' })}</div>
          </div>
          {palette.badge && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <LiveDot color={palette.badge.c} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: palette.fg }}>{palette.badge.t}</span>
            </div>
          )}
        </div>

        {/* Big number */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 20, paddingBottom: 10 }}>
          {state === 'out' && (
            <>
              <div style={{ fontSize: 13, color: palette.sub, fontWeight: 500 }}>Ready to start</div>
              <div style={{ fontSize: 96, fontWeight: 300, letterSpacing: -4, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: palette.fg, marginTop: 4 }}>
                {h}:{m}
                <span style={{ fontSize: 24, fontWeight: 600, color: palette.sub, marginLeft: 8, letterSpacing: 0 }}>{p}</span>
              </div>
              <div style={{ fontSize: 13, color: palette.sub, marginTop: 10 }}>
                Shift begins in <span style={{ color: palette.fg, fontWeight: 600 }}>2 min</span>. You can clock in up to 5 min early.
              </div>
            </>
          )}

          {state === 'in' && (
            <>
              <div style={{ fontSize: 13, color: palette.sub, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Elapsed</div>
              <div style={{ fontSize: 92, fontWeight: 300, letterSpacing: -4, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: palette.fg, marginTop: 4 }}>
                {elapsedStr.h}:{elapsedStr.m}
                <span style={{ fontSize: 36, color: palette.sub }}>:{elapsedStr.s}</span>
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 18 }}>
                <MiniStat label="Started"     value="7:02 AM"  fg={palette.fg} sub={palette.sub} />
                <MiniStat label="Break left"  value="30m"      fg={palette.fg} sub={palette.sub} />
                <MiniStat label="Est. pay"    value="$58"      fg={palette.fg} sub={palette.sub} />
              </div>
            </>
          )}

          {state === 'break' && (
            <>
              <div style={{ fontSize: 13, color: palette.sub, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Break ends in</div>
              <div style={{ fontSize: 92, fontWeight: 300, letterSpacing: -4, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: palette.fg, marginTop: 4 }}>
                09:42
              </div>
              <div style={{ marginTop: 14, fontSize: 13, color: palette.sub }}>
                Paid break · auto-resume at <span style={{ color: palette.fg, fontWeight: 600 }}>10:55 AM</span>
              </div>
            </>
          )}

          {state === 'summary' && (
            <>
              <div style={{ fontSize: 13, color: palette.sub, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Total worked</div>
              <div style={{ fontSize: 92, fontWeight: 300, letterSpacing: -4, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: palette.fg, marginTop: 4 }}>
                7<span style={{ fontSize: 40, color: palette.sub, fontWeight: 500 }}>h</span> 48<span style={{ fontSize: 40, color: palette.sub, fontWeight: 500 }}>m</span>
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 18 }}>
                <MiniStat label="Breaks"   value="30m"     fg={palette.fg} sub={palette.sub} />
                <MiniStat label="Gross"    value="$148.20" fg={palette.fg} sub={palette.sub} />
                <MiniStat label="Overtime" value="—"       fg={palette.fg} sub={palette.sub} />
              </div>
            </>
          )}
        </div>

        {/* In-card CTA */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={() => onState && onState(ctaNext)} className="punch-tap" style={{
            flex: 1, height: 58, borderRadius: 32, border: 'none',
            background: state === 'out' ? M.tint : 'rgba(255,255,255,0.96)',
            color: state === 'out' ? '#fff' : '#111',
            fontFamily: M.font, fontSize: 17, fontWeight: 600, letterSpacing: -0.2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}>
            <MIcon name={ctaIcon} size={18} color={state === 'out' ? '#fff' : '#111'} />
            {cta}
          </button>
          {(state === 'in' || state === 'break') && (
            <button onClick={() => onState && onState('summary')} className="punch-tap" style={{
              width: 58, height: 58, borderRadius: 32, border: '1px solid rgba(255,255,255,0.25)',
              background: 'transparent', color: palette.fg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MIcon name="logout" size={18} color={palette.fg} />
            </button>
          )}
        </div>
      </div>

      {/* Outside card */}
      <div style={{ height: 18 }} />
      {state === 'out' && (
        <PeerStack title="Opening with you" />
      )}
      {state === 'in' && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: M.sec, fontWeight: 600, marginBottom: 10 }}>Quick tasks</div>
          <div style={{ background: M.surface, borderRadius: 16, overflow: 'hidden' }}>
            <QuickRow done icon="check" label="Unlock front door" meta="7:04 AM" />
            <QuickRow done icon="check" label="Start brew cycle" meta="7:09 AM" />
            <QuickRow icon="coffee" label="Pull milk from walk-in" meta="Due 7:30" accent />
            <QuickRow icon="package" label="Restock pastry case" meta="Due 7:45" last />
          </div>
        </div>
      )}
      {state === 'break' && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ background: M.surface, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MIcon name="coffee" size={18} color="#b45309" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: M.label, letterSpacing: -0.1 }}>Heads up — break is paid</div>
              <div style={{ fontSize: 12, color: M.sec }}>California · meal break required by 11:30 AM.</div>
            </div>
          </div>
        </div>
      )}
      {state === 'summary' && (
        <div style={{ padding: '0 20px' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: M.sec, fontWeight: 600, marginBottom: 10 }}>Nice work</div>
          <div style={{ background: M.surface, borderRadius: 16, padding: '14px 16px' }}>
            <div style={{ fontSize: 14, color: M.label, fontWeight: 500, letterSpacing: -0.1 }}>Timesheet submitted automatically</div>
            <div style={{ fontSize: 12, color: M.sec, marginTop: 2 }}>Payable on Friday, May 1 · review until Wed 6 PM.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, fg, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: sub, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, color: fg, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function QuickRow({ icon, label, meta, done, accent, last }) {
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: last ? 'none' : `0.5px solid ${M.sep}`,
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: done ? '#10b981' : (accent ? 'rgba(234,88,12,0.14)' : 'rgba(120,120,128,0.12)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MIcon name={done ? 'check' : icon} size={13} color={done ? '#fff' : (accent ? '#c2410c' : M.sec)} />
      </div>
      <div style={{ flex: 1, fontSize: 14, color: M.label, textDecoration: done ? 'line-through' : 'none', letterSpacing: -0.1 }}>{label}</div>
      <div style={{ fontSize: 12, color: M.sec, fontVariantNumeric: 'tabular-nums' }}>{meta}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// C · Hold-to-Punch
//   – Novel primary action: press-and-hold a large concentric ring
//     for ~1.2s to commit. Arc fills as you hold; release cancels.
//   – Makes accidental punches impossible; feels tactile on mobile.
//   – Card background stays monochrome; the ring is the feature.
// ═══════════════════════════════════════════════════════════════════
function PunchVariantC({ state = 'out', onState, elapsedMs = 0 }) {
  const now = usePunchClock();
  const [progress, setProgress] = puS(0); // 0-1 while holding
  const holdRef = puR(null);
  const { h, m, p } = fmtClock(now);

  const startHold = () => {
    const start = Date.now();
    const DURATION = 1100;
    const id = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / DURATION);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(id);
        holdRef.current = null;
        setTimeout(() => {
          setProgress(0);
          onState && onState({ out: 'in', in: 'break', break: 'in', summary: 'out' }[state]);
        }, 150);
      }
    }, 16);
    holdRef.current = id;
  };
  const endHold = () => {
    if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; }
    setProgress(0);
  };

  const ringLabel = {
    out:    { verb: 'HOLD TO CLOCK IN',  sub: 'Scheduled 7:00 AM — 3:00 PM' },
    in:     { verb: 'HOLD TO START BREAK', sub: `Elapsed ${fmtHMS(elapsedMs).h}:${fmtHMS(elapsedMs).m}:${fmtHMS(elapsedMs).s}` },
    break:  { verb: 'HOLD TO RESUME',    sub: 'Break started 10:45 AM' },
    summary:{ verb: 'HOLD TO CONFIRM',   sub: '7h 48m · $148.20' },
  }[state];

  const accent = {
    out:    '#1c1917',
    in:     '#059669',
    break:  '#d97706',
    summary:'#1c1917',
  }[state];

  const RADIUS = 130;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - progress);

  return (
    <div style={{ background: M.bg, minHeight: '100%', paddingBottom: 110, fontFamily: M.font, display: 'flex', flexDirection: 'column' }}>
      {/* Top */}
      <div style={{ paddingTop: 58, padding: '58px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MAvatar name={PUNCH.you.name} size={34} color={PUNCH.you.color} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{PUNCH.you.name.split(' ')[0]}</div>
            <div style={{ fontSize: 11, color: M.sec }}>Shift Lead · Oakland</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 9999, background: M.surface, border: `0.5px solid ${M.sep}` }}>
          <LiveDot color={state === 'out' ? M.ter : state === 'in' ? '#10b981' : state === 'break' ? '#f59e0b' : '#6b7280'} size={6} />
          <span style={{ fontSize: 11, color: M.sec, fontWeight: 600, letterSpacing: 0.4 }}>
            {{ out: 'OFF DUTY', in: 'ON SHIFT', break: 'ON BREAK', summary: 'DAY CLOSED' }[state]}
          </span>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '10px 20px 0' }}>
        <div style={{ fontSize: 12, color: M.sec, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>
          {now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: -1.5, color: M.label, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
          {h}:{m}<span style={{ fontSize: 18, color: M.sec, marginLeft: 6, fontWeight: 500 }}>{p}</span>
        </div>
      </div>

      {/* Ring — hero */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0 12px' }}>
        <div
          className="punch-tap"
          onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold}
          onTouchStart={(e) => { e.preventDefault(); startHold(); }} onTouchEnd={endHold}
          style={{
            position: 'relative', width: 300, height: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', userSelect: 'none', touchAction: 'none',
          }}
        >
          {/* Background ring */}
          <svg width="300" height="300" viewBox="0 0 300 300" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="150" cy="150" r={RADIUS} stroke={M.sep2} strokeWidth="2" fill="none" />
            <circle
              cx="150" cy="150" r={RADIUS}
              stroke={accent} strokeWidth="6" fill="none"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="punch-hold-ring"
            />
          </svg>
          {/* Inner filled disk */}
          <div style={{
            width: 218, height: 218, borderRadius: 9999,
            background: state === 'summary' ? '#1c1917' : '#ffffff',
            color: state === 'summary' ? '#fff' : M.label,
            boxShadow: '0 20px 50px rgba(0,0,0,0.08)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', padding: 20,
            transform: progress > 0 ? `scale(${1 - progress * 0.02})` : 'scale(1)',
            transition: progress === 0 ? 'transform .3s' : 'none',
          }}>
            <MIcon
              name={{ out: 'clock', in: 'coffee', break: 'refresh', summary: 'check' }[state]}
              size={32}
              color={accent}
            />
            <div style={{ fontSize: 12, letterSpacing: 1.2, fontWeight: 700, marginTop: 12, color: accent }}>
              {ringLabel.verb}
            </div>
            <div style={{ fontSize: 12, color: state === 'summary' ? 'rgba(255,255,255,0.6)' : M.sec, marginTop: 6, maxWidth: 170, lineHeight: 1.3 }}>
              {ringLabel.sub}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom context */}
      <div style={{ padding: '0 20px' }}>
        {state === 'out' && (
          <div style={{
            background: M.surface, borderRadius: 18, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 4, height: 38, borderRadius: 2, background: SHIFT_COLORS.morning }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: M.sec, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>Scheduled</div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>7:00 AM — 3:00 PM · Shift Lead</div>
            </div>
            <button style={{ background: 'transparent', border: 'none', color: M.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 4 }}>Details</button>
          </div>
        )}

        {state === 'in' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { l: 'STARTED', v: '7:02 AM' },
              { l: 'BREAK',   v: '30m left' },
              { l: 'PAY',     v: '$58.50' },
            ].map((k, i) => (
              <div key={i} style={{ background: M.surface, borderRadius: 14, padding: '12px 12px' }}>
                <div style={{ fontSize: 10, letterSpacing: 0.6, color: M.sec, fontWeight: 700 }}>{k.l}</div>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
              </div>
            ))}
          </div>
        )}

        {state === 'break' && (
          <div style={{ background: M.surface, borderRadius: 18, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: M.sec, fontWeight: 500 }}>Break used</div>
              <div style={{ fontSize: 13, color: M.sec }}>20 / 30 min</div>
            </div>
            <div style={{ height: 6, borderRadius: 9999, background: 'rgba(120,120,128,0.14)', overflow: 'hidden' }}>
              <div style={{ width: '67%', height: '100%', background: '#f59e0b', borderRadius: 9999 }} />
            </div>
            <div style={{ fontSize: 12, color: M.sec, marginTop: 10 }}>
              Auto-resume at <span style={{ color: M.label, fontWeight: 600 }}>10:55 AM</span>.
            </div>
          </div>
        )}

        {state === 'summary' && (
          <div style={{ background: M.surface, borderRadius: 18, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: M.sec, fontWeight: 700 }}>Today</div>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 8 }}>
              <KV2 k="Worked"   v="7h 48m" />
              <KV2 k="Break"    v="30m" />
              <KV2 k="Clock in" v="7:02 AM" />
              <KV2 k="Clock out" v="2:50 PM" />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '14px 20px 0', display: 'flex', justifyContent: 'center', gap: 18 }}>
        <button style={{ background: 'transparent', border: 'none', color: M.sec, fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MIcon name="edit" size={14} color={M.sec} /> Manual entry
        </button>
        <div style={{ width: 1, background: M.sep }} />
        <button style={{ background: 'transparent', border: 'none', color: M.sec, fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MIcon name="inbox" size={14} color={M.sec} /> Timesheet
        </button>
      </div>
    </div>
  );
}

function KV2({ k, v }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 0.3, color: M.sec, fontWeight: 500 }}>{k}</div>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2, marginTop: 1, fontVariantNumeric: 'tabular-nums', color: M.label }}>{v}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Artboard wrapper — holds the state machine + prev/next chips so the
// user can step through (out → in → break → in → summary → out).
// ═══════════════════════════════════════════════════════════════════
function PunchArtboard({ Variant, initialState = 'out' }) {
  const [state, setState] = puS(initialState);
  const [startedAt, setStartedAt] = puS(null);
  const [elapsedMs, setElapsedMs] = puS(0);

  // Fake elapsed counter when on shift
  puE(() => {
    if (state === 'in' || state === 'break') {
      if (!startedAt) setStartedAt(Date.now() - 2 * 60 * 1000); // started 2 min ago
      const id = setInterval(() => {
        setElapsedMs(Date.now() - (startedAt || Date.now()));
      }, 1000);
      return () => clearInterval(id);
    }
  }, [state, startedAt]);

  const ORDER = ['out', 'in', 'break', 'in', 'summary'];
  const step = (dir) => {
    const cur = ORDER.indexOf(state);
    const nx = cur === -1 ? 0 : Math.max(0, Math.min(ORDER.length - 1, cur + dir));
    setState(ORDER[nx]);
    if (ORDER[nx] === 'out') { setStartedAt(null); setElapsedMs(0); }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <IOSDevice width={402} height={874}>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: M.bg, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }} className="no-scrollbar">
            <Variant state={state} onState={setState} elapsedMs={elapsedMs} />
          </div>
          {/* Shared bottom tab bar (so variants feel embedded in the app) */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            <MTabBar
              current="punch"
              onTab={() => {}}
              items={[
                { id: 'home',     icon: 'building', label: 'Home' },
                { id: 'staffing', icon: 'calendar', label: 'Staffing' },
                { id: 'punch',    icon: 'clock',    label: 'Punch' },
                { id: 'chat',     icon: 'msgs',     label: 'Chat' },
                { id: 'more',     icon: 'more',     label: 'More' },
              ]}
            />
          </div>
        </div>
      </IOSDevice>

      {/* State stepper (outside the device frame so canvas label never blocks the design) */}
      <div style={{
        position: 'absolute', bottom: -40, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 8,
      }}>
        <StateChip onClick={() => step(-1)} icon="chevron-left" />
        <div style={{
          padding: '6px 12px', borderRadius: 9999,
          background: 'rgba(0,0,0,0.06)', color: 'rgba(40,30,20,0.8)',
          fontFamily: M.font, fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
          minWidth: 90, textAlign: 'center',
        }}>
          {{ out: 'Off duty', in: 'On shift', break: 'On break', summary: 'Day closed' }[state]}
        </div>
        <StateChip onClick={() => step(+1)} icon="chevron-right" />
      </div>
    </div>
  );
}

function StateChip({ icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 9999,
      background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <MIcon name={icon} size={14} color="rgba(40,30,20,0.8)" />
    </button>
  );
}

Object.assign(window, { PunchVariantA, PunchVariantB, PunchVariantC, PunchArtboard });
