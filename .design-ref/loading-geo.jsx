// ═══════════════════════════════════════════════════════════
// Merchiva — Loading variants on squares + triangles
// Theme: chaotic / off-grid / unsynced
// ═══════════════════════════════════════════════════════════

const GL = {
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
  warn:    'oklch(0.62 0.13 55)',
  mono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:    "'Inter', ui-sans-serif, system-ui, sans-serif",
};

(function injectKF() {
  if (document.getElementById('mv-geo-kf')) return;
  const s = document.createElement('style');
  s.id = 'mv-geo-kf';
  s.textContent = `
    @keyframes geoSpinCW  { to { transform: rotate(360deg); } }
    @keyframes geoSpinCCW { to { transform: rotate(-360deg); } }
    @keyframes geoFloat1 { 0%,100% { transform: translate(0,0) rotate(8deg); } 50% { transform: translate(4px,-6px) rotate(-3deg); } }
    @keyframes geoFloat2 { 0%,100% { transform: translate(0,0) rotate(-12deg); } 50% { transform: translate(-5px,4px) rotate(6deg); } }
    @keyframes geoFloat3 { 0%,100% { transform: translate(0,0) rotate(22deg); } 50% { transform: translate(6px,3px) rotate(-9deg); } }
    @keyframes geoBlink { 0%, 60% { opacity: 1; } 60.01%, 100% { opacity: .15; } }
    @keyframes geoPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
    @keyframes geoJitter {
      0%   { transform: translate(0,0) rotate(0deg); }
      25%  { transform: translate(-1px,1px) rotate(-2deg); }
      50%  { transform: translate(1px,-2px) rotate(3deg); }
      75%  { transform: translate(2px,1px) rotate(-1deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
  `;
  document.head.appendChild(s);
})();

const { useState, useEffect, useRef, useMemo } = React;

// ─── tick at fps ───────────────────────────────────────────
function useTick(fps = 30, run = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const interval = 1000 / fps;
    let last = performance.now();
    let raf;
    const loop = (t) => {
      if (t - last >= interval) { last = t; setTick(x => (x + 1) % 1e9); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, run]);
}

// PRNG: deterministic noise
function rng(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// shape primitive
function Square({ s = 24, fill, stroke, sw = 2, rot = 0, style }) {
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      <rect x={sw/2} y={sw/2} width={s - sw} height={s - sw}
        fill={fill || 'none'} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}
function Triangle({ s = 24, fill, stroke, sw = 2, rot = 0, style }) {
  const h = s * 0.866;
  const pad = sw / 2 + 1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      <polygon points={`${s/2},${pad} ${s - pad},${s - pad} ${pad},${s - pad}`}
        fill={fill || 'none'} stroke={stroke} strokeWidth={sw} strokeLinejoin="miter" />
    </svg>
  );
}

// ─── 01 · Static scatter ───────────────────────────────────
// fixed set of shapes, each with its own float/spin keyframe.
function LoaderScatter({ size = 1, color = GL.ink }) {
  const r = useMemo(() => rng(11), []);
  const shapes = useMemo(() => Array.from({ length: 14 }).map((_, i) => {
    const isTri = r() > 0.55;
    return {
      isTri,
      s: (10 + r() * 22) * size,
      x: r() * 100,
      y: r() * 100,
      rot: r() * 360,
      filled: r() > 0.6,
      anim: ['geoFloat1', 'geoFloat2', 'geoFloat3'][i % 3],
      dur: (1.2 + r() * 2.4).toFixed(2),
      delay: (r() * 1.5).toFixed(2),
    };
  }), []);
  return (
    <div style={{ position: 'relative', width: 220 * size, height: 110 * size }}>
      {shapes.map((sh, i) => {
        const Comp = sh.isTri ? Triangle : Square;
        return (
          <div key={i} style={{
            position: 'absolute', left: `${sh.x}%`, top: `${sh.y}%`,
            animation: `${sh.anim} ${sh.dur}s ease-in-out ${sh.delay}s infinite`,
          }}>
            <Comp s={sh.s} stroke={color} fill={sh.filled ? color : 'none'} sw={1.5} rot={sh.rot} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 02 · Tumble row ───────────────────────────────────────
// shapes drift across, each spinning at a different rate.
function LoaderTumble({ size = 1, color = GL.ink, width = 280 }) {
  useTick(30);
  const W = width * size;
  const H = 80 * size;
  const t = performance.now() / 1000;
  const N = 9;
  const r = useMemo(() => rng(37), []);
  const items = useMemo(() => Array.from({ length: N }).map((_, i) => ({
    isTri: r() > 0.45,
    s: (12 + r() * 16) * size,
    speed: 30 + r() * 50,
    spin: (r() - 0.5) * 320,
    yPhase: r() * Math.PI * 2,
    yAmp: 6 + r() * 16,
    filled: r() > 0.5,
    offset: r(),
  })), [size]);
  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      border: `1px solid ${GL.border}`, background: GL.surface,
    }}>
      {items.map((it, i) => {
        const pos = ((t * it.speed) + it.offset * (W + 40)) % (W + 40) - 20;
        const yMid = H / 2 - it.s / 2;
        const y = yMid + Math.sin(t * 2 + it.yPhase) * it.yAmp;
        const Comp = it.isTri ? Triangle : Square;
        return (
          <div key={i} style={{
            position: 'absolute', left: pos, top: y,
            transform: `rotate(${(t * it.spin) % 360}deg)`,
          }}>
            <Comp s={it.s} stroke={color} fill={it.filled ? color : 'none'} sw={1.6} />
          </div>
        );
      })}
      <div style={{
        position: 'absolute', left: 8, top: 6,
        fontFamily: GL.mono, fontSize: 9 * size, color: GL.sec, letterSpacing: 0.4,
      }}>PROCESSING</div>
    </div>
  );
}

// ─── 03 · Glitch grid ──────────────────────────────────────
// regular grid of cells; each cell flips between square/triangle, filled/empty.
function LoaderGlitch({ size = 1, color = GL.ink }) {
  useTick(8);
  const t = Math.floor(performance.now() / 120);
  const cols = 8, rows = 4;
  const cell = 24 * size;
  const r = useMemo(() => rng(91), []);
  const seeds = useMemo(() => Array.from({ length: cols * rows }).map(() => Math.floor(r() * 1000)), []);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
      gridTemplateRows: `repeat(${rows}, ${cell}px)`,
      gap: 3 * size,
    }}>
      {seeds.map((seed, i) => {
        const v = (seed + t * 7) % 6;
        const isTri = v % 2 === 0;
        const filled = v > 2;
        const rot = (v * 47) % 360;
        const Comp = isTri ? Triangle : Square;
        const blank = v === 5 && (i % 7 === 0);
        if (blank) return <div key={i} style={{ width: cell, height: cell }} />;
        return (
          <div key={i} style={{ width: cell, height: cell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Comp s={cell - 6 * size} stroke={color} fill={filled ? color : 'none'} sw={1.4} rot={rot} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 04 · Crash stack ──────────────────────────────────────
// shapes "fall" and pile chaotically; reset after fill.
function LoaderCrash({ size = 1, color = GL.ink }) {
  useTick(24);
  const W = 200 * size, H = 110 * size;
  const cycle = 3200;
  const phase = (performance.now() % cycle) / cycle;
  const N = 11;
  const r = useMemo(() => rng(53), []);
  const items = useMemo(() => Array.from({ length: N }).map((_, i) => ({
    isTri: r() > 0.5,
    s: (14 + r() * 12) * size,
    x: 8 + r() * (W - 30 * size),
    yEnd: H - 8 * size - (10 + r() * 18) * size,
    rotEnd: (r() - 0.5) * 60,
    start: i / (N + 2),
    filled: r() > 0.55,
  })), [size]);
  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      borderBottom: `2px solid ${color}`,
    }}>
      {items.map((it, i) => {
        const localT = Math.max(0, Math.min(1, (phase - it.start) / 0.35));
        const eased = 1 - Math.pow(1 - localT, 2.6);
        const y = -20 * size + (it.yEnd + 20 * size) * eased;
        const rot = it.rotEnd * eased + (1 - eased) * (it.rotEnd + 220);
        const Comp = it.isTri ? Triangle : Square;
        return (
          <div key={i} style={{ position: 'absolute', left: it.x, top: y, transform: `rotate(${rot}deg)` }}>
            <Comp s={it.s} stroke={color} fill={it.filled ? color : 'none'} sw={1.6} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 05 · Orbit chaos ──────────────────────────────────────
// shapes orbit center at different radii / speeds; off-center axis.
function LoaderOrbit({ size = 1, color = GL.ink }) {
  useTick(30);
  const W = 160 * size, H = 160 * size;
  const t = performance.now() / 1000;
  const r = useMemo(() => rng(71), []);
  const items = useMemo(() => Array.from({ length: 10 }).map((_, i) => ({
    isTri: r() > 0.5,
    s: (10 + r() * 14) * size,
    radius: (20 + i * 6 + r() * 4) * size,
    speed: 0.4 + r() * 1.6,
    phase: r() * Math.PI * 2,
    filled: r() > 0.6,
    spin: (r() - 0.5) * 400,
    offsetCenter: { x: (r() - 0.5) * 6, y: (r() - 0.5) * 6 },
  })), [size]);
  return (
    <div style={{ width: W, height: H, position: 'relative' }}>
      {items.map((it, i) => {
        const ang = t * it.speed + it.phase;
        const cx = W / 2 + it.offsetCenter.x;
        const cy = H / 2 + it.offsetCenter.y;
        const x = cx + Math.cos(ang) * it.radius - it.s / 2;
        const y = cy + Math.sin(ang) * it.radius - it.s / 2;
        const Comp = it.isTri ? Triangle : Square;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y,
            transform: `rotate(${(t * it.spin) % 360}deg)`,
          }}>
            <Comp s={it.s} stroke={color} fill={it.filled ? color : 'none'} sw={1.4} />
          </div>
        );
      })}
      {/* central dot */}
      <div style={{
        position: 'absolute', left: W/2 - 2, top: H/2 - 2, width: 4, height: 4,
        background: color,
      }} />
    </div>
  );
}

// ─── 06 · Build & destroy ──────────────────────────────────
// shapes build a neat row, then scatter into chaos, reset.
function LoaderBuild({ size = 1, color = GL.ink }) {
  useTick(30);
  const N = 9;
  const cycle = 3600;
  const phase = (performance.now() % cycle) / cycle;
  const r = useMemo(() => rng(19), []);
  const targets = useMemo(() => Array.from({ length: N }).map((_, i) => ({
    x: 12 + i * 26,
    y: 40,
    rot: 0,
    isTri: i % 2 === 0,
    filled: i % 3 === 1,
  })), []);
  const chaos = useMemo(() => Array.from({ length: N }).map(() => ({
    dx: (r() - 0.5) * 160,
    dy: (r() - 0.5) * 80,
    drot: (r() - 0.5) * 400,
  })), []);

  // phase mapping: 0→0.4 build (0..1 lerp from chaos→target), 0.4→0.6 hold,
  // 0.6→1 scatter (lerp target→chaos)
  let p;
  if (phase < 0.4) p = phase / 0.4;       // 0→1 settle
  else if (phase < 0.6) p = 1;            // settled
  else p = 1 - (phase - 0.6) / 0.4;       // 1→0 scatter
  const eased = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;

  const W = N * 26 + 12, H = 80 * size;
  return (
    <div style={{ width: W * size, height: H, position: 'relative' }}>
      {targets.map((t, i) => {
        const x = t.x * size + chaos[i].dx * (1 - eased) * size * 0.5;
        const y = t.y * size + chaos[i].dy * (1 - eased) * size * 0.5;
        const rot = t.rot + chaos[i].drot * (1 - eased);
        const Comp = t.isTri ? Triangle : Square;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `rotate(${rot}deg)` }}>
            <Comp s={18 * size} stroke={color} fill={t.filled ? color : 'none'} sw={1.6} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 07 · Stamp pulse ──────────────────────────────────────
// triangles + squares appear one by one in a 3x3 grid with random
// fill states and rotation; tasteful chaos.
function LoaderStamp({ size = 1, color = GL.ink }) {
  useTick(10);
  const t = Math.floor(performance.now() / 130);
  const cells = 9;
  const cell = 30 * size;
  const r = useMemo(() => rng(101), []);
  const meta = useMemo(() => Array.from({ length: cells }).map((_, i) => ({
    isTri: r() > 0.45,
    rot: r() * 360,
    filled: r() > 0.55,
  })), []);
  // ordering: zig-zag pattern with t offset
  const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
  const visibleCount = (t % (cells + 2));
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${cell}px)`,
      gridTemplateRows: `repeat(3, ${cell}px)`,
      gap: 4 * size,
    }}>
      {meta.map((m, i) => {
        const orderIdx = order.indexOf(i);
        const shown = orderIdx < visibleCount;
        const Comp = m.isTri ? Triangle : Square;
        return (
          <div key={i} style={{
            width: cell, height: cell,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: shown ? 1 : 0,
            transform: `scale(${shown ? 1 : 0.5})`,
            transition: 'none',
          }}>
            <Comp s={cell - 6 * size} stroke={color} fill={m.filled ? color : 'none'} sw={1.5} rot={m.rot} />
          </div>
        );
      })}
    </div>
  );
}

// ─── 08 · Stack tilt ───────────────────────────────────────
// shapes stack vertically but each lays at a slightly different
// tilt, the stack itself wobbles. Like a Jenga tower.
function LoaderStack({ size = 1, color = GL.ink }) {
  useTick(20);
  const t = performance.now() / 1000;
  const wobble = Math.sin(t * 1.6) * 4;
  const r = useMemo(() => rng(13), []);
  const items = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({
    isTri: r() > 0.5,
    rot: (r() - 0.5) * 28,
    filled: r() > 0.55,
    offx: (r() - 0.5) * 14,
  })), []);
  return (
    <div style={{
      position: 'relative', width: 80 * size, height: 200 * size,
      transform: `rotate(${wobble * 0.4}deg) translateX(${wobble}px)`,
      transformOrigin: 'bottom center',
    }}>
      {items.map((it, i) => {
        const Comp = it.isTri ? Triangle : Square;
        const y = 200 * size - (i + 1) * 24 * size;
        return (
          <div key={i} style={{
            position: 'absolute', left: 18 * size + it.offx, top: y,
            transform: `rotate(${it.rot + Math.sin(t * 2 + i) * 2}deg)`,
          }}>
            <Comp s={22 * size} stroke={color} fill={it.filled ? color : 'none'} sw={1.6} />
          </div>
        );
      })}
      {/* ground */}
      <div style={{ position: 'absolute', left: -10, right: -10, bottom: 0, height: 1, background: color, opacity: 0.4 }} />
    </div>
  );
}

// ─── 09 · Static / TV ──────────────────────────────────────
// dense grid of tiny squares + triangles flickering on/off randomly.
function LoaderStatic({ size = 1, color = GL.ink, width = 220, height = 100 }) {
  useTick(14);
  const W = width * size, H = height * size;
  const cell = 10 * size;
  const cols = Math.floor(W / cell);
  const rows = Math.floor(H / cell);
  const t = Math.floor(performance.now() / 70);
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const v = ((i * 31 + t * 17) % 91);
    const shown = v < 60;
    if (!shown) continue;
    const isTri = v % 2 === 0;
    const filled = v % 5 === 0;
    cells.push({ i, isTri, filled, rot: (v * 13) % 360 });
  }
  return (
    <div style={{
      width: W, height: H, position: 'relative', overflow: 'hidden',
      background: GL.ink,
    }}>
      <div style={{
        display: 'grid', width: '100%', height: '100%',
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gridTemplateRows: `repeat(${rows}, ${cell}px)`,
      }}>
        {Array.from({ length: cols * rows }).map((_, i) => {
          const c = cells.find(c => c.i === i);
          if (!c) return <div key={i} />;
          const Comp = c.isTri ? Triangle : Square;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Comp s={cell - 2} stroke="#fafaf9" fill={c.filled ? '#fafaf9' : 'none'} sw={1} rot={c.rot} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card chrome ───────────────────────────────────────────
function GCard({ id, name, sub, footer, dark = false, children, pad = 24 }) {
  const bg = dark ? GL.ink : GL.bg;
  const surf = dark ? '#17120f' : GL.surface;
  const txt = dark ? '#fafaf9' : GL.text;
  const sec = dark ? '#78716c' : GL.sec;
  const bd  = dark ? '#292524' : GL.border;
  return (
    <div style={{
      background: bg, border: `1px solid ${bd}`, borderRadius: 3,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: GL.sans, height: '100%',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${bd}`, background: surf,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontFamily: GL.mono, color: sec, letterSpacing: 0.4 }}>{id}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: txt, letterSpacing: -0.1 }}>{name}</span>
        </div>
        <span style={{
          fontSize: 9.5, fontFamily: GL.mono, color: sec,
          border: `1px solid ${bd}`, padding: '2px 5px', borderRadius: 2,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>{sub}</span>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', padding: pad, overflow: 'hidden',
      }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: '8px 12px', borderTop: `1px solid ${bd}`,
          fontFamily: GL.mono, fontSize: 10, color: sec, letterSpacing: 0.2,
        }}>{footer}</div>
      )}
    </div>
  );
}

// ─── Grid of all variants ──────────────────────────────────
function GVariantsGrid() {
  const items = [
    { id: 'G01', name: 'Scatter',  sub: 'float',  foot: '14 shapes · individual float keyframes',     C: () => <LoaderScatter /> },
    { id: 'G02', name: 'Tumble',   sub: 'stream', foot: 'right→left drift · each spins its own rate', C: () => <LoaderTumble /> },
    { id: 'G03', name: 'Glitch',   sub: 'grid',   foot: '8×4 cells · flip shape + fill on tick',      C: () => <LoaderGlitch /> },
    { id: 'G04', name: 'Crash',    sub: 'fall',   foot: 'shapes rain down, pile, reset · 3.2s',       C: () => <LoaderCrash /> },
    { id: 'G05', name: 'Orbit',    sub: 'rotate', foot: '10 shapes · own radius / speed / offset',    C: () => <LoaderOrbit /> },
    { id: 'G06', name: 'Build',    sub: 'settle', foot: 'chaos → aligned row → chaos · 3.6s loop',    C: () => <LoaderBuild /> },
    { id: 'G07', name: 'Stamp',    sub: 'reveal', foot: '3×3 grid · zigzag pop-in, random tilt',      C: () => <LoaderStamp /> },
    { id: 'G08', name: 'Stack',    sub: 'wobble', foot: 'tower of 8 · each tilted · sways',           C: () => <LoaderStack /> },
    { id: 'G09', name: 'Static',   sub: 'noise',  foot: 'dense flicker · TV-snow on ink bg',          C: () => <LoaderStatic /> },
  ];
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
      gap: 1, background: GL.border,
    }}>
      {items.map(it => (
        <GCard key={it.id} id={it.id} name={it.name} sub={it.sub} footer={it.foot}>
          <it.C />
        </GCard>
      ))}
    </div>
  );
}

// ─── Hero splash ───────────────────────────────────────────
function GHeroSplash({ pick = 'scatter', dark = false }) {
  const bg   = dark ? GL.ink : GL.bg;
  const fg   = dark ? '#fafaf9' : GL.ink;
  const sec  = dark ? '#78716c' : GL.sec;
  const ter  = dark ? '#57534e' : GL.ter;
  const bd   = dark ? '#292524' : GL.border;

  // background scatter for ambiance — sparse, behind everything
  const r = useMemo(() => rng(7), []);
  const bgShapes = useMemo(() => Array.from({ length: 22 }).map((_, i) => ({
    isTri: r() > 0.5,
    s: 10 + r() * 30,
    x: r() * 100, y: r() * 100,
    rot: r() * 360,
    filled: r() > 0.85,
    anim: ['geoFloat1', 'geoFloat2', 'geoFloat3'][i % 3],
    dur: (3 + r() * 5).toFixed(2),
    delay: (r() * 3).toFixed(2),
  })), []);

  const renderLoader = () => {
    if (pick === 'scatter')  return <LoaderScatter size={1.6} color={fg} />;
    if (pick === 'orbit')    return <LoaderOrbit size={1.4} color={fg} />;
    if (pick === 'crash')    return <LoaderCrash size={1.5} color={fg} />;
    if (pick === 'build')    return <LoaderBuild size={1.5} color={fg} />;
    if (pick === 'tumble')   return <LoaderTumble size={1.4} color={fg} width={420} />;
    if (pick === 'stamp')    return <LoaderStamp size={1.5} color={fg} />;
    if (pick === 'static')   return <LoaderStatic size={1.4} color={fg} width={340} height={140} />;
    return <LoaderScatter size={1.6} color={fg} />;
  };

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: fg,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: GL.sans, overflow: 'hidden',
    }}>
      {/* sparse background scatter */}
      <div style={{ position: 'absolute', inset: 0, opacity: dark ? 0.18 : 0.16, pointerEvents: 'none' }}>
        {bgShapes.map((sh, i) => {
          const Comp = sh.isTri ? Triangle : Square;
          return (
            <div key={i} style={{
              position: 'absolute', left: `${sh.x}%`, top: `${sh.y}%`,
              animation: `${sh.anim} ${sh.dur}s ease-in-out ${sh.delay}s infinite`,
            }}>
              <Comp s={sh.s} stroke={fg} fill={sh.filled ? fg : 'none'} sw={1.2} rot={sh.rot} />
            </div>
          );
        })}
      </div>

      {/* topbar */}
      <div style={{
        height: 44, borderBottom: `1px solid ${bd}`,
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
        fontFamily: GL.mono, fontSize: 11, color: sec, position: 'relative',
        background: dark ? 'rgba(12,10,9,0.6)' : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{ fontWeight: 600, letterSpacing: 1.4, color: fg }}>MERCHIVA</span>
        <span style={{ color: ter }}>·</span>
        <span>booting workspace</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399' }} />
          <span style={{ color: '#34d399', letterSpacing: 0.8 }}>CONNECTING</span>
        </div>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 32, position: 'relative',
        zIndex: 1,
      }}>
        {renderLoader()}
        <div style={{ fontFamily: GL.mono, fontSize: 11.5, color: sec, letterSpacing: 0.3, textAlign: 'center' }}>
          assembling workspace · 248 records · 3 stores
        </div>
        <div style={{
          display: 'flex', gap: 24, fontFamily: GL.mono, fontSize: 10, color: ter, letterSpacing: 0.4,
        }}>
          <span>STEP 02 / 04</span>
          <span>~2s remaining</span>
        </div>
      </div>

      <div style={{
        height: 28, borderTop: `1px solid ${bd}`, padding: '0 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: GL.mono, fontSize: 10, color: ter, letterSpacing: 0.2,
        background: dark ? 'rgba(12,10,9,0.6)' : 'rgba(255,255,255,0.6)',
        zIndex: 1,
      }}>
        <span>v4.2.1</span><span>·</span><span>esc to skip</span>
      </div>
    </div>
  );
}

// ─── Hero splash · LOGO ASSEMBLY (parts → Notch M → welcome) ──────────
// Two logo parts (a square + a downward triangle) drift gently during loading,
// then snap together to FORM the Merchiva Notch M (filled square with a V
// notch cut from its top). Wordmark fades in, lockup lifts away, welcome appears.
function GHeroSplashFinish({ dark = true }) {
  useTick(30);
  const cycleMs = 6500;
  const t = performance.now();
  const p = (t % cycleMs) / cycleMs;

  const bg   = dark ? GL.ink : GL.bg;
  const fg   = dark ? '#fafaf9' : GL.ink;
  const sec  = dark ? '#78716c' : GL.sec;
  const ter  = dark ? '#57534e' : GL.ter;
  const bd   = dark ? '#292524' : GL.border;
  const good = '#34d399';

  // ─ logo geometry (200×200 svg) ─────────────────────────────
  // Notch M: solid 140×140 square at center, triangular notch
  // (base 40, depth 56) cut from the top center.
  const VB    = 200;
  const SQ_S  = 140;
  const SQ_FX = (VB - SQ_S) / 2;   // 30
  const SQ_FY = (VB - SQ_S) / 2;   // 30
  const TRI_W = 40;
  const TRI_H = 56;
  const TRI_FX = (VB - TRI_W) / 2; // 80
  const TRI_FY = SQ_FY - 1;        // tiny lift so triangle bites the top edge

  // ─ phase boundaries ────────────────────────────────────────
  const PH = { settle: 0.50, snap: 0.62, ready: 0.78, exit: 0.92 };

  // ─ ambient accent shapes (3 small, very subtle — not chaos) ─
  const ambient = useMemo(() => [
    { kind: 'sq', s: 14, baseX: 36, baseY: 28, freq: 0.7, phase: 0.0 },
    { kind: 'tr', s: 12, baseX: 72, baseY: 16, freq: 0.5, phase: 1.4 },
    { kind: 'sq', s: 10, baseX: 18, baseY: 70, freq: 0.6, phase: 2.7 },
  ], []);

  // ─ compute square + triangle state ─────────────────────────
  let sqX, sqY, sqRot;
  let triX, triY, triRot;
  let fillT = 0;   // 0 = outlined, 1 = filled solid
  let notchT = 0;  // 0 = fg-filled triangle, 1 = bg-colored cut-out

  if (p < PH.settle) {
    // gentle loading — two parts orbit their final spots, mostly upright
    const decay = 1 - (p / PH.snap);                // 1 → ~0.05 by snap
    const s1 = Math.sin(t / 700);
    const c1 = Math.cos(t / 800);
    sqX = SQ_FX + s1 * 12 * decay;
    sqY = SQ_FY + c1 * 9 * decay;
    sqRot = s1 * 8 * decay;
    // triangle floats above and to the side of the square
    triX = TRI_FX + Math.sin(t / 600 + 1.2) * 22 * decay;
    triY = TRI_FY - 38 * decay + Math.cos(t / 720 + 0.8) * 6 * decay;
    triRot = Math.sin(t / 540 + 0.4) * 24 * decay;
  } else if (p < PH.snap) {
    // SNAP — tighten to exact final positions, square fills in,
    // triangle docks into the notch slot and becomes a cutout
    const localT = (p - PH.settle) / (PH.snap - PH.settle);
    const eased = 1 - Math.pow(1 - localT, 3);
    // slight overshoot (decaying sinusoidal "click")
    const overshoot = Math.sin(localT * Math.PI) * (1 - localT) * 3;
    const decay = 1 - eased;
    const s1 = Math.sin(t / 700);
    const c1 = Math.cos(t / 800);
    sqX = SQ_FX + s1 * 12 * decay * 0.4;
    sqY = SQ_FY + c1 * 9 * decay * 0.4 - overshoot * 0.5;
    sqRot = s1 * 8 * decay * 0.4;
    triX = TRI_FX + Math.sin(t / 600 + 1.2) * 22 * decay * 0.4;
    triY = TRI_FY - 38 * decay + Math.cos(t / 720 + 0.8) * 6 * decay * 0.4 - overshoot;
    triRot = Math.sin(t / 540 + 0.4) * 24 * decay * 0.4;
    fillT  = eased;
    notchT = Math.max(0, (eased - 0.3) / 0.7);
  } else if (p < PH.ready) {
    // hold + dampened bounce
    const localT = (p - PH.snap) / (PH.ready - PH.snap);
    const bounce = Math.sin(localT * Math.PI * 1.5) * Math.exp(-localT * 4) * 3;
    sqX = SQ_FX; sqY = SQ_FY - bounce; sqRot = 0;
    triX = TRI_FX; triY = TRI_FY - bounce; triRot = 0;
    fillT = 1; notchT = 1;
  } else if (p < PH.exit) {
    // exit — lockup lifts up and fades (handled by shapesOp below)
    const localT = (p - PH.ready) / (PH.exit - PH.ready);
    const lift = -localT * 30;
    sqX = SQ_FX; sqY = SQ_FY + lift; sqRot = 0;
    triX = TRI_FX; triY = TRI_FY + lift; triRot = 0;
    fillT = 1; notchT = 1;
  } else {
    sqX = SQ_FX; sqY = SQ_FY - 30; sqRot = 0;
    triX = TRI_FX; triY = TRI_FY - 30; triRot = 0;
    fillT = 1; notchT = 1;
  }

  // ─ opacities ───────────────────────────────────────────────
  // logo opacity — visible until exit ends
  const shapesOp = p < PH.ready ? 1 :
    p < PH.exit ? 1 - (p - PH.ready) / (PH.exit - PH.ready) : 0;
  // wordmark — fades in during snap→ready, holds, fades with shapes
  const wordOp = p < PH.snap ? 0 :
    p < PH.ready ? (p - PH.snap) / (PH.ready - PH.snap) : shapesOp;
  // loading text block (subtext + progress) — fades out during snap
  const loadOp = p < PH.snap ? 1 :
    p < PH.ready ? 1 - (p - PH.snap) / (PH.ready - PH.snap) : 0;
  // ready text block — fades in during snap, fades with chrome
  const readyOp = wordOp;
  // ambient accents — fade out by snap
  const ambOp = Math.max(0, 1 - p / PH.snap) * (dark ? 0.35 : 0.30);
  // chrome (topbar + footer) — present until exit
  const chromeOp = p < PH.ready ? 1 :
    p < PH.exit ? 1 - (p - PH.ready) / (PH.exit - PH.ready) : 0;
  // welcome overlay
  let welcomeOp = 0;
  if (p >= PH.exit) {
    const tail = (p - PH.exit) / (1 - PH.exit);
    welcomeOp = tail < 0.75 ? Math.min(1, tail * 5) : 1 - (tail - 0.75) / 0.25;
  }

  // ─ status / copy ───────────────────────────────────────────
  const loadProg = p < PH.snap ? p / PH.snap : 1;
  const status = p < PH.snap
    ? { text: 'CONNECTING', tagline: 'booting workspace', dot: true }
    : { text: 'READY',      tagline: 'workspace ready',   dot: false };

  // ─ render ──────────────────────────────────────────────────
  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: fg,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: GL.sans, overflow: 'hidden',
    }}>
      {/* topbar */}
      <div style={{
        height: 44, borderBottom: `1px solid ${bd}`,
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
        fontFamily: GL.mono, fontSize: 11, color: sec, position: 'relative', zIndex: 2,
        background: dark ? 'rgba(12,10,9,0.6)' : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(6px)',
        opacity: chromeOp, transition: 'none',
      }}>
        <span style={{ fontWeight: 600, letterSpacing: 1.4, color: fg }}>MERCHIVA</span>
        <span style={{ color: ter }}>·</span>
        <span>{status.tagline}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999, background: good,
            animation: status.dot ? 'geoPulse 1.4s ease-in-out infinite' : 'none',
          }} />
          <span style={{ color: good, letterSpacing: 0.8 }}>{status.text}</span>
        </div>
      </div>

      {/* center stack */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28, position: 'relative',
        zIndex: 1,
      }}>
        {/* logo SVG — square + triangle layers */}
        <div style={{ width: 200, height: 200, position: 'relative', opacity: shapesOp }}>
          {/* ambient accents — fade out by snap */}
          {ambient.map((a, i) => {
            const dx = Math.sin(t / (700 + i * 50) + a.phase) * 4;
            const dy = Math.cos(t / (650 + i * 60) + a.phase) * 4;
            const rot = Math.sin(t / 800 + a.phase) * 14;
            return (
              <div key={i} style={{
                position: 'absolute', left: a.baseX + dx, top: a.baseY + dy,
                opacity: ambOp, pointerEvents: 'none', transition: 'none',
              }}>
                {a.kind === 'sq'
                  ? <Square s={a.s} stroke={fg} sw={1} rot={rot} />
                  : <Triangle s={a.s} stroke={fg} sw={1} rot={rot} />}
              </div>
            );
          })}

          <svg viewBox={`0 0 ${VB} ${VB}`} width="200" height="200" style={{ display: 'block' }}>
            {/* square — outlined (loading) */}
            <rect
              x={sqX} y={sqY} width={SQ_S} height={SQ_S}
              fill="none" stroke={fg} strokeWidth="2.5"
              opacity={1 - fillT}
              transform={`rotate(${sqRot} ${sqX + SQ_S / 2} ${sqY + SQ_S / 2})`}
            />
            {/* square — filled (snap onward) */}
            <rect
              x={sqX} y={sqY} width={SQ_S} height={SQ_S}
              fill={fg}
              opacity={fillT}
              transform={`rotate(${sqRot} ${sqX + SQ_S / 2} ${sqY + SQ_S / 2})`}
            />
            {/* triangle — fg-filled (loading) */}
            <polygon
              points={`${triX},${triY} ${triX + TRI_W},${triY} ${triX + TRI_W / 2},${triY + TRI_H}`}
              fill={fg}
              opacity={1 - notchT}
              transform={`rotate(${triRot} ${triX + TRI_W / 2} ${triY + TRI_H / 2})`}
            />
            {/* triangle — bg-colored "cutout" (after snap) */}
            <polygon
              points={`${triX},${triY} ${triX + TRI_W},${triY} ${triX + TRI_W / 2},${triY + TRI_H}`}
              fill={bg}
              opacity={notchT}
              transform={`rotate(${triRot} ${triX + TRI_W / 2} ${triY + TRI_H / 2})`}
            />
          </svg>
        </div>

        {/* text crossfade slot — loading vs ready */}
        <div style={{ position: 'relative', width: 360, height: 86 }}>
          {/* LOADING block */}
          <div style={{
            position: 'absolute', inset: 0, opacity: loadOp,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            transition: 'none', pointerEvents: 'none',
          }}>
            <div style={{
              fontFamily: GL.mono, fontSize: 11.5, color: sec,
              letterSpacing: 0.3, textAlign: 'center',
            }}>
              assembling workspace · 248 records · 3 stores
            </div>
            <div style={{ width: 320, height: 2, background: bd, position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                width: `${loadProg * 100}%`, background: fg, transition: 'none',
              }} />
            </div>
            <div style={{
              display: 'flex', gap: 24, fontFamily: GL.mono, fontSize: 10,
              color: ter, letterSpacing: 0.4,
            }}>
              <span>STEP 02 / 04</span>
              <span>{Math.floor(loadProg * 100).toString().padStart(2,'0')}%</span>
            </div>
          </div>

          {/* READY block — wordmark + tagline */}
          <div style={{
            position: 'absolute', inset: 0, opacity: readyOp * shapesOp,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            transition: 'none', pointerEvents: 'none',
            transform: `translateY(${(1 - readyOp) * 6}px)`,
          }}>
            <div style={{
              fontFamily: GL.sans, fontSize: 34, fontWeight: 600,
              color: fg, letterSpacing: -1.2, lineHeight: 1,
            }}>Merchiva</div>
            <div style={{
              fontFamily: GL.mono, fontSize: 10.5, color: sec,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>operations software · ready</div>
          </div>
        </div>
      </div>

      {/* welcome reveal */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 14,
        opacity: welcomeOp, pointerEvents: 'none', zIndex: 3,
        transform: `translateY(${(1 - welcomeOp) * 12}px)`,
        transition: 'none',
      }}>
        <NotchMSmall fg={fg} bg={bg} size={42} />
        <div style={{
          fontFamily: GL.sans, fontSize: 30, fontWeight: 600, color: fg,
          letterSpacing: -0.6, marginTop: 4,
        }}>Welcome back, Chris.</div>
        <div style={{
          fontFamily: GL.mono, fontSize: 11, color: sec, letterSpacing: 0.3,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>3 stores · 4 jobs in queue</span>
          <span style={{ color: ter }}>·</span>
          <span>press</span>
          <span style={{
            padding: '2px 8px', border: `1px solid ${bd}`,
            color: fg, fontSize: 10, letterSpacing: 0.6,
            borderRadius: 2, background: dark ? '#17120f' : GL.surface,
          }}>↵</span>
          <span>to enter</span>
        </div>
      </div>

      {/* footer */}
      <div style={{
        height: 28, borderTop: `1px solid ${bd}`, padding: '0 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: GL.mono, fontSize: 10, color: ter, letterSpacing: 0.2,
        background: dark ? 'rgba(12,10,9,0.6)' : 'rgba(255,255,255,0.6)',
        zIndex: 2, opacity: chromeOp, transition: 'none',
      }}>
        <span>v4.2.1</span><span>·</span><span>esc to skip</span>
        <span style={{ marginLeft: 'auto', color: ter }}>{(p * cycleMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}

// small Notch M for the welcome overlay
function NotchMSmall({ size = 42, fg = '#0c0a09', bg = '#fff' }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 100 100">
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

// ─── In-context placements ─────────────────────────────────
function GInContext() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 1, background: GL.border,
    }}>
      <GCard id="P1" name="Button" sub="inline" footer="3-shape mini orbit inline">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button style={{
            padding: '10px 16px', background: GL.ink, color: '#fafaf9',
            border: 'none', borderRadius: 3, fontFamily: GL.sans, fontSize: 13,
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <MiniSpin color="#fafaf9" />
            Reconciling
          </button>
          <button style={{
            padding: '10px 16px', background: '#fff', color: GL.ink,
            border: `1px solid ${GL.borderD}`, borderRadius: 3, fontFamily: GL.sans,
            fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <MiniSpin color={GL.ink} />
            Saving
          </button>
        </div>
      </GCard>

      <GCard id="P2" name="Empty state" sub="card" footer="orbit chaos · subtle">
        <div style={{
          width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12,
        }}>
          <LoaderOrbit size={0.7} />
          <span style={{ fontFamily: GL.mono, fontSize: 11, color: GL.sec, letterSpacing: 0.3 }}>
            building staffing schedule…
          </span>
        </div>
      </GCard>

      <GCard id="P3" name="Toast" sub="banner" footer="tumble strip · live process">
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontFamily: GL.mono, fontSize: 10.5, color: GL.sec, letterSpacing: 0.4 }}>
            LIVE · 4 jobs running
          </span>
          <LoaderTumble size={0.85} width={240} />
        </div>
      </GCard>
    </div>
  );
}

// tiny inline spinner: 1 square + 1 triangle counter-rotating
function MiniSpin({ color = GL.ink }) {
  return (
    <span style={{ position: 'relative', width: 16, height: 16, display: 'inline-block' }}>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'geoSpinCW 1.4s linear infinite',
      }}>
        <Square s={12} stroke={color} sw={1.5} />
      </span>
      <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'geoSpinCCW 1.8s linear infinite',
      }}>
        <Triangle s={8} stroke={color} sw={1.5} />
      </span>
    </span>
  );
}

Object.assign(window, {
  LoaderScatter, LoaderTumble, LoaderGlitch, LoaderCrash, LoaderOrbit,
  LoaderBuild, LoaderStamp, LoaderStack, LoaderStatic,
  GVariantsGrid, GHeroSplash, GHeroSplashFinish, GInContext, MiniSpin, GCard,
});
