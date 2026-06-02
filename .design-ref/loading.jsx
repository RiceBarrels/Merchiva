// ═══════════════════════════════════════════════════════════
// Merchiva — Novel looping loaders (no logo)
// All looping, mono-flavored, ops-software adjacent.
// ═══════════════════════════════════════════════════════════

const NL = {
  bg:      '#ffffff',
  surface: '#fafaf9',
  panel:   '#f5f5f4',
  ink:     '#0c0a09',
  text:    '#1c1917',
  sec:     '#78716c',
  ter:     '#a8a29e',
  border:  '#e7e5e4',
  borderD: '#d6d3d1',
  good:    '#059669',
  bad:     '#b91c1c',
  warn:    'oklch(0.55 0.09 55)',
  mono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:    "'Inter', ui-sans-serif, system-ui, sans-serif",
};

(function injectKF() {
  if (document.getElementById('mv-novel-kf')) return;
  const s = document.createElement('style');
  s.id = 'mv-novel-kf';
  s.textContent = `
    @keyframes nlBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    @keyframes nlPulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
    @keyframes nlSpin  { to { transform: rotate(360deg); } }
    @keyframes nlSlideX { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes nlConveyor { from { transform: translateX(120%); } to { transform: translateX(-120%); } }
    @keyframes nlScan {
      0%   { transform: translateY(-10%); }
      50%  { transform: translateY(110%); }
      100% { transform: translateY(-10%); }
    }
  `;
  document.head.appendChild(s);
})();

// React shorthand
const { useState, useEffect, useRef, useMemo, useId } = React;

// ─── Hook: animation frame at fps ──────────────────────────
function useTick(fps = 30, run = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const interval = 1000 / fps;
    let last = performance.now();
    let raf;
    const loop = (t) => {
      if (t - last >= interval) {
        last = t;
        setTick(x => (x + 1) % 1e9);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, run]);
}

// ─── 01 · Counting Reconcile ───────────────────────────────
// Two columns of numbers tick rapidly; pairs flash green when
// they match, red when they don't. Loops every ~3s.
function LoaderCount({ size = 1, color = NL.ink }) {
  useTick(12);
  const t = Math.floor(performance.now() / 80);
  const rows = 5;
  const items = [];
  for (let i = 0; i < rows; i++) {
    const seed = (t + i * 7) % 50;
    const a = (1248 + seed * 13 + i * 211) % 10000;
    const phase = Math.floor((t + i * 5) / 30) % 4;
    const matched = phase >= 2;
    const b = matched ? a : (a + ((seed * 31) % 90) - 45);
    items.push({ a, b, matched, settled: phase === 3 });
  }
  return (
    <div style={{
      fontFamily: NL.mono, fontSize: 11 * size, lineHeight: 1.5,
      color, display: 'flex', flexDirection: 'column', gap: 2 * size,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 * size }}>
          <span style={{ color: NL.sec, width: 18 * size, textAlign: 'right' }}>{String(i+1).padStart(2,'0')}</span>
          <span style={{ width: 50 * size, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${(it.a/100).toFixed(2)}</span>
          <span style={{ color: NL.ter }}>→</span>
          <span style={{
            width: 50 * size, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
            color: it.settled ? NL.good : (it.matched ? color : NL.bad),
          }}>${(it.b/100).toFixed(2)}</span>
          <span style={{
            width: 12 * size, color: it.settled ? NL.good : NL.ter,
          }}>{it.settled ? '✓' : (it.matched ? '·' : '×')}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 02 · Receipt Print ────────────────────────────────────
// A receipt prints line by line, fills, then tears off.
function LoaderReceipt({ size = 1, color = NL.ink, bg = NL.surface }) {
  useTick(20);
  const cycle = 2400; // ms per loop
  const phase = (performance.now() % cycle) / cycle; // 0..1
  // 8 lines, reveal one at a time over 0..0.85, tear at 0.85..1
  const lines = [
    { l: 'BLUE BOTTLE · XINTIANDI', mono: true, bold: true },
    { l: '────────────────────────' },
    { l: '2x  Espresso        ¥ 56' },
    { l: '1x  Croissant       ¥ 38' },
    { l: '1x  Almond Latte    ¥ 42' },
    { l: '────────────────────────' },
    { l: 'TOTAL              ¥ 136', bold: true },
    { l: '#0248 · 14:32 · CW' },
  ];
  const visible = Math.floor(phase * 11); // a bit overshoot, then tear
  const torn = phase > 0.88;
  const torNess = torn ? Math.min(1, (phase - 0.88) / 0.12) : 0;
  return (
    <div style={{
      fontFamily: NL.mono, fontSize: 10 * size, color,
      background: bg, border: `1px solid ${NL.border}`,
      width: 220 * size, padding: `${10 * size}px ${14 * size}px`,
      boxShadow: 'inset 0 -8px 12px -10px rgba(0,0,0,0.15)',
      transform: `translateY(${torNess * -40}px)`,
      opacity: 1 - torNess,
      transition: 'none',
      position: 'relative',
    }}>
      {lines.map((ln, i) => (
        <div key={i} style={{
          opacity: i < visible ? 1 : 0,
          fontWeight: ln.bold ? 600 : 400,
          letterSpacing: 0.2,
          height: `${1.4 * 10 * size}px`,
          whiteSpace: 'pre',
        }}>{ln.l}</div>
      ))}
      {/* perforated tear edge */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: -6,
        height: 8,
        background: `repeating-linear-gradient(45deg, ${bg} 0 4px, transparent 4px 8px)`,
        clipPath: 'polygon(0 0, 4% 100%, 8% 0, 12% 100%, 16% 0, 20% 100%, 24% 0, 28% 100%, 32% 0, 36% 100%, 40% 0, 44% 100%, 48% 0, 52% 100%, 56% 0, 60% 100%, 64% 0, 68% 100%, 72% 0, 76% 100%, 80% 0, 84% 100%, 88% 0, 92% 100%, 96% 0, 100% 100%, 0 100%)',
      }} />
    </div>
  );
}

// ─── 03 · Tally Marks ──────────────────────────────────────
// Hand-tally style: I, II, III, IIII, IIII\ ... fills 5 groups, resets.
function LoaderTally({ size = 1, color = NL.ink }) {
  useTick(8);
  const cycle = 3000;
  const phase = (performance.now() % cycle) / cycle;
  const totalTicks = 25; // 5 groups of 5
  const drawn = Math.floor(phase * (totalTicks + 4));
  return (
    <div style={{
      display: 'flex', gap: 14 * size, alignItems: 'center',
    }}>
      {Array.from({ length: 5 }).map((_, g) => (
        <svg key={g} width={36 * size} height={40 * size} viewBox="0 0 36 40">
          {[0,1,2,3].map(i => {
            const idx = g * 5 + i;
            return idx < drawn ? (
              <line key={i} x1={4 + i*7} y1="6" x2={4 + i*7} y2="34"
                stroke={color} strokeWidth="2.4" strokeLinecap="round" />
            ) : null;
          })}
          {(g * 5 + 4) < drawn && (
            <line x1="2" y1="32" x2="32" y2="8"
              stroke={color} strokeWidth="2.4" strokeLinecap="round" />
          )}
        </svg>
      ))}
      <span style={{
        fontFamily: NL.mono, fontSize: 12 * size, color: NL.sec,
        marginLeft: 6 * size, fontVariantNumeric: 'tabular-nums',
      }}>
        {String(Math.min(drawn, totalTicks)).padStart(2,'0')} / 25
      </span>
    </div>
  );
}

// ─── 04 · Sorting Bars ─────────────────────────────────────
// 8 bars of varying height swap pairs, eventually sorted, then shuffle.
function LoaderSort({ size = 1, color = NL.ink }) {
  const N = 8;
  // generate a fixed initial sequence; deterministic shuffle by phase
  const cycle = 4000;
  useTick(20);
  const phase = (performance.now() % cycle) / cycle; // 0..1
  // 7 swaps to bubble-sort an inversion; we precompute heights based on phase
  const heights = useMemo(() => {
    const base = [3, 7, 2, 5, 8, 1, 6, 4];
    return base;
  }, []);
  // Permutation evolves: a smooth interpolation between shuffled and sorted
  const sorted = [...heights].sort((a,b)=>a-b);
  const positions = heights.map((_, i) => {
    // each bar's target index
    const fromIdx = i;
    const val = heights[i];
    const toIdx = sorted.indexOf(val);
    // ease into sorted state, then back out
    const p = phase < 0.5 ? phase / 0.5 : 1 - (phase - 0.5) / 0.5;
    const eased = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;
    return fromIdx + (toIdx - fromIdx) * eased;
  });
  return (
    <div style={{
      position: 'relative',
      width: (N * 14 + (N-1) * 4) * size,
      height: 80 * size,
      display: 'flex', alignItems: 'flex-end',
    }}>
      {heights.map((h, i) => {
        const x = positions[i] * (14 + 4) * size;
        const isExtreme = h === 1 || h === 8;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, bottom: 0,
            width: 14 * size, height: (h * 9 + 8) * size,
            background: isExtreme ? color : NL.sec,
            transition: 'none',
          }} />
        );
      })}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: -2,
        height: 1, background: NL.border,
      }} />
    </div>
  );
}

// ─── 05 · Stock Ticker ─────────────────────────────────────
// Horizontal scrolling mono strip with prices going up/down.
function LoaderTicker({ size = 1, color = NL.ink, width = 280 }) {
  useTick(6);
  const t = Math.floor(performance.now() / 200);
  const items = ['ESP', 'LAT', 'CRO', 'AME', 'CAP', 'MAC', 'COR', 'FLW'];
  const data = items.map((sym, i) => {
    const v = (40 + ((t + i * 13) % 30)) / 10; // 4.0..6.9
    const dir = ((t + i * 3) % 5) > 2 ? 1 : -1;
    return { sym, v: v.toFixed(2), dir };
  });
  return (
    <div style={{
      width: width * size, height: 28 * size, overflow: 'hidden',
      border: `1px solid ${NL.border}`, background: '#000', color: '#fafaf9',
      display: 'flex', alignItems: 'center', position: 'relative',
      fontFamily: NL.mono, fontSize: 11 * size,
    }}>
      <div style={{
        display: 'flex', gap: 24 * size, whiteSpace: 'nowrap',
        animation: `nlSlideX 18s linear infinite`,
        paddingLeft: 12 * size,
      }}>
        {[...data, ...data, ...data].map((d, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 * size }}>
            <span style={{ color: '#a8a29e', letterSpacing: 1 }}>{d.sym}</span>
            <span>¥{d.v}</span>
            <span style={{ color: d.dir > 0 ? '#34d399' : '#fb7185' }}>
              {d.dir > 0 ? '▲' : '▼'}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 06 · Conveyor ─────────────────────────────────────────
// Boxes move along a conveyor, get scanned (line passes), turn from outline to filled.
function LoaderConveyor({ size = 1, color = NL.ink, width = 280 }) {
  useTick(20);
  const cycle = 3000;
  const W = width * size;
  const H = 60 * size;
  const boxN = 5;
  const t = (performance.now() % cycle) / cycle; // 0..1
  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: NL.surface, border: `1px solid ${NL.border}`,
    }}>
      {/* belt */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 8 * size,
        height: 6 * size, background: NL.border,
        backgroundImage: `repeating-linear-gradient(90deg, ${NL.border} 0 ${10 * size}px, ${NL.borderD} ${10 * size}px ${12 * size}px)`,
      }} />
      {/* scanner line */}
      <div style={{
        position: 'absolute', left: '60%', top: 0, bottom: 0, width: 1,
        background: NL.bad, opacity: 0.7,
      }} />
      <div style={{
        position: 'absolute', left: 'calc(60% - 16px)', top: 4 * size, fontSize: 8 * size,
        fontFamily: NL.mono, color: NL.bad, letterSpacing: 0.5,
      }}>SCAN</div>
      {/* boxes */}
      {Array.from({ length: boxN }).map((_, i) => {
        const offset = (t + i / boxN) % 1; // 0..1 across width
        const x = (1 - offset) * (W + 30 * size) - 15 * size;
        const scanned = (x / W) < 0.6;
        const sz = 22 * size;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, bottom: 14 * size,
            width: sz, height: sz,
            background: scanned ? color : 'transparent',
            border: `1.5px solid ${color}`,
            transition: 'none',
          }} />
        );
      })}
      {/* counter */}
      <div style={{
        position: 'absolute', top: 6 * size, right: 8 * size,
        fontFamily: NL.mono, fontSize: 9 * size, color: NL.sec, letterSpacing: 0.4,
      }}>SCANNED · {Math.floor((performance.now() / cycle) * boxN) % 999}</div>
    </div>
  );
}

// ─── 07 · Braille Cycle ────────────────────────────────────
// Cycles through Unicode braille glyphs — the classic terminal spinner
// but stylized + with a numeric counter.
function LoaderBraille({ size = 1, color = NL.ink }) {
  useTick(12);
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const t = Math.floor(performance.now() / 90);
  const f = frames[t % frames.length];
  const pct = (t * 3) % 100;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12 * size,
      fontFamily: NL.mono, color,
    }}>
      <span style={{ fontSize: 28 * size, lineHeight: 1, color: NL.warn }}>{f}</span>
      <span style={{ fontSize: 12 * size, color: NL.sec, letterSpacing: 0.4 }}>
        reconciling
      </span>
      <span style={{
        fontSize: 12 * size, fontVariantNumeric: 'tabular-nums',
        background: NL.surface, border: `1px solid ${NL.border}`,
        padding: `${2 * size}px ${6 * size}px`,
      }}>{String(pct).padStart(2,'0')}%</span>
    </div>
  );
}

// ─── 08 · Symbol Rain ──────────────────────────────────────
// Currency symbols falling in columns, the classic rain but tasteful.
function LoaderRain({ size = 1, color = NL.ink, width = 240, height = 100 }) {
  useTick(15);
  const W = width * size, H = height * size;
  const cols = 14;
  const colW = W / cols;
  const t = performance.now() / 1000;
  const symbols = ['$', '¥', '€', '£', '₩', '0', '1', '2', '·'];
  const columns = Array.from({ length: cols }).map((_, i) => {
    const speed = 0.6 + ((i * 13) % 7) / 10;
    const len = 4 + ((i * 7) % 5);
    const offset = ((t * speed * 30) + i * 11) % (H + len * 12);
    return { offset, len, i };
  });
  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: NL.ink, fontFamily: NL.mono, fontSize: 11 * size,
    }}>
      {columns.map(c => (
        <div key={c.i} style={{
          position: 'absolute', left: c.i * colW, top: c.offset - c.len * 14,
          width: colW, textAlign: 'center', lineHeight: '14px',
        }}>
          {Array.from({ length: c.len }).map((_, k) => {
            const sym = symbols[(k + c.i + Math.floor(t * 2)) % symbols.length];
            const opacity = (k + 1) / c.len;
            const head = k === c.len - 1;
            return (
              <div key={k} style={{
                color: head ? '#fafaf9' : '#34d399',
                opacity, height: 14,
              }}>{sym}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── 09 · Domino fall (bonus) ──────────────────────────────
// Vertical bars tip over one by one in a wave, like dominoes.
function LoaderDomino({ size = 1, color = NL.ink }) {
  useTick(20);
  const N = 9;
  const cycle = 2400;
  const t = (performance.now() % cycle) / cycle;
  const W = 200 * size, H = 50 * size;
  return (
    <div style={{
      width: W, height: H, position: 'relative',
      borderBottom: `1px solid ${NL.border}`,
    }}>
      {Array.from({ length: N }).map((_, i) => {
        // each domino's local phase (0..1)
        const start = i / (N + 2);
        const localT = Math.max(0, Math.min(1, (t - start) * (N + 2)));
        // 0..0.5 fall forward (rotate 0->75deg), 0.5..1 stay or recover
        let rot = 0;
        if (localT < 0.5) rot = localT * 2 * 75;
        else rot = 75 - (localT - 0.5) * 2 * 75;
        return (
          <div key={i} style={{
            position: 'absolute', left: 8 + i * 22 * size, bottom: 0,
            width: 6 * size, height: 36 * size,
            background: color,
            transformOrigin: 'bottom right',
            transform: `rotate(${rot}deg)`,
          }} />
        );
      })}
    </div>
  );
}

// ─── Card chrome ───────────────────────────────────────────
function NCard({ id, name, sub, footer, dark = false, children, pad = 24 }) {
  const bg = dark ? NL.ink : NL.bg;
  const surf = dark ? '#17120f' : NL.surface;
  const txt = dark ? '#fafaf9' : NL.text;
  const sec = dark ? '#78716c' : NL.sec;
  const bd  = dark ? '#292524' : NL.border;
  return (
    <div style={{
      background: bg, border: `1px solid ${bd}`, borderRadius: 3,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: NL.sans, height: '100%',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${bd}`, background: surf,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontFamily: NL.mono, color: sec, letterSpacing: 0.4 }}>{id}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: txt, letterSpacing: -0.1 }}>{name}</span>
        </div>
        <span style={{
          fontSize: 9.5, fontFamily: NL.mono, color: sec,
          border: `1px solid ${bd}`, padding: '2px 5px', borderRadius: 2,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>{sub}</span>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', padding: pad,
      }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: '8px 12px', borderTop: `1px solid ${bd}`,
          fontFamily: NL.mono, fontSize: 10, color: sec, letterSpacing: 0.2,
        }}>{footer}</div>
      )}
    </div>
  );
}

// ─── Variants grid ─────────────────────────────────────────
function VariantsGrid() {
  const items = [
    { id: '01', name: 'Reconcile',  sub: 'count',    foot: 'two columns tick · match→tick · mismatch→×',  C: () => <LoaderCount /> },
    { id: '02', name: 'Receipt',    sub: 'print',    foot: 'lines print top-down · tear · loop',          C: () => <LoaderReceipt /> },
    { id: '03', name: 'Tally',      sub: 'count',    foot: 'IIII\\ groups · 25 ticks · resets',           C: () => <LoaderTally /> },
    { id: '04', name: 'Sort',       sub: 'compute',  foot: 'bubble sort · sorts → shuffles · 4s loop',    C: () => <LoaderSort /> },
    { id: '05', name: 'Ticker',     sub: 'feed',     foot: 'horizontal scroll · price flicker · ▲▼',      C: () => <LoaderTicker /> },
    { id: '06', name: 'Conveyor',   sub: 'process',  foot: 'boxes pass scanner · outline → filled',       C: () => <LoaderConveyor /> },
    { id: '07', name: 'Braille',    sub: 'spinner',  foot: 'classic terminal · counter pill',             C: () => <LoaderBraille /> },
    { id: '08', name: 'Rain',       sub: 'data',     foot: 'currency symbols cascade · ink bg',           C: () => <LoaderRain /> },
    { id: '09', name: 'Domino',     sub: 'wave',     foot: 'bars tip in sequence · 2.4s cycle',           C: () => <LoaderDomino /> },
  ];
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
      gap: 1, background: NL.border,
    }}>
      {items.map(it => (
        <NCard key={it.id} id={it.id} name={it.name} sub={it.sub} footer={it.foot}>
          <it.C />
        </NCard>
      ))}
    </div>
  );
}

// ─── Hero splash with star pick ────────────────────────────
function HeroSplash({ pick = 'reconcile', dark = true }) {
  const bg   = dark ? NL.ink : NL.bg;
  const fg   = dark ? '#fafaf9' : NL.ink;
  const sec  = dark ? '#78716c' : NL.sec;
  const ter  = dark ? '#57534e' : NL.ter;
  const bd   = dark ? '#292524' : NL.border;

  const renderLoader = () => {
    if (pick === 'reconcile') return <LoaderCount size={1.4} color={fg} />;
    if (pick === 'receipt')   return <LoaderReceipt size={1.2} color={fg} bg={dark ? '#17120f' : NL.surface} />;
    if (pick === 'conveyor')  return <LoaderConveyor size={1.4} color={fg} width={360} />;
    if (pick === 'tally')     return <LoaderTally size={1.6} color={fg} />;
    return <LoaderCount size={1.4} color={fg} />;
  };

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: fg,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: NL.sans,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${bd} 1px, transparent 1px), linear-gradient(90deg, ${bd} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.35, pointerEvents: 'none',
      }} />
      {/* topbar */}
      <div style={{
        height: 44, borderBottom: `1px solid ${bd}`,
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
        fontFamily: NL.mono, fontSize: 11, color: sec, position: 'relative',
      }}>
        <span style={{ fontWeight: 600, letterSpacing: 1.4, color: fg }}>MERCHIVA</span>
        <span style={{ color: ter }}>·</span>
        <span>booting workspace</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399',
            animation: 'nlPulse 1.4s ease-in-out infinite' }} />
          <span style={{ color: '#34d399', letterSpacing: 0.8 }}>CONNECTING</span>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 32, position: 'relative',
      }}>
        {renderLoader()}
        <div style={{ fontFamily: NL.mono, fontSize: 11.5, color: sec, letterSpacing: 0.3, textAlign: 'center' }}>
          reconciling 248 transactions across 3 stores
        </div>
        <div style={{
          display: 'flex', gap: 24, fontFamily: NL.mono, fontSize: 10, color: ter, letterSpacing: 0.4,
        }}>
          <span>STEP 02 / 04</span>
          <span>~2s remaining</span>
        </div>
      </div>

      <div style={{
        height: 28, borderTop: `1px solid ${bd}`, padding: '0 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: NL.mono, fontSize: 10, color: ter, letterSpacing: 0.2,
      }}>
        <span>v4.2.1</span><span>·</span><span>esc to skip</span>
      </div>
    </div>
  );
}

// ─── In-context placements ─────────────────────────────────
function InContext() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 1, background: NL.border,
    }}>
      <NCard id="P1" name="Button" sub="inline" footer="braille spinner inline">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button style={{
            padding: '10px 16px', background: NL.ink, color: '#fafaf9',
            border: 'none', borderRadius: 3, fontFamily: NL.sans, fontSize: 13,
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <BrailleInline color="#fafaf9" />
            Reconciling
          </button>
          <button style={{
            padding: '10px 16px', background: '#fff', color: NL.ink,
            border: `1px solid ${NL.borderD}`, borderRadius: 3, fontFamily: NL.sans,
            fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <BrailleInline color={NL.ink} />
            Saving
          </button>
        </div>
      </NCard>

      <NCard id="P2" name="Empty state" sub="card" footer="domino wave + counter">
        <div style={{
          width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 16,
        }}>
          <LoaderDomino size={0.9} />
          <span style={{ fontFamily: NL.mono, fontSize: 11, color: NL.sec, letterSpacing: 0.3 }}>
            building staffing schedule…
          </span>
        </div>
      </NCard>

      <NCard id="P3" name="Toast" sub="ticker" footer="ticker as live notification">
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontFamily: NL.mono, fontSize: 10.5, color: NL.sec, letterSpacing: 0.4 }}>
            LIVE · prices syncing
          </span>
          <LoaderTicker size={1} width={240} />
        </div>
      </NCard>
    </div>
  );
}

function BrailleInline({ color }) {
  useTick(10);
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const t = Math.floor(performance.now() / 90);
  return (
    <span style={{ fontFamily: NL.mono, fontSize: 16, lineHeight: 1, color, width: 14, display: 'inline-block', textAlign: 'center' }}>
      {frames[t % frames.length]}
    </span>
  );
}

// Expose to global
Object.assign(window, {
  LoaderCount, LoaderReceipt, LoaderTally, LoaderSort, LoaderTicker,
  LoaderConveyor, LoaderBraille, LoaderRain, LoaderDomino,
  VariantsGrid, HeroSplash, InContext,
});
