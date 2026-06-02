// ═══════════════════════════════════════════════════════════
// Merchiva — Marketing homepage (fancy + animated)
// Reuses the Merchiva brand vocab: warm-stone, Notch M, mono captions.
// ═══════════════════════════════════════════════════════════

const { useState: hUS, useEffect: hUE, useRef: hUR, useMemo: hUM, useLayoutEffect: hUL } = React;

const H = {
  bg:       '#f0eee9',
  bgWarm:   '#e8e4dc',
  paper:    '#ffffff',
  surface:  '#fafaf9',
  panel:    '#f5f5f4',
  ink:      '#0c0a09',
  text:     '#1c1917',
  text2:    '#44403c',
  text3:    '#57534e',
  sec:      '#78716c',
  ter:      '#a8a29e',
  border:   '#e0ddd6',
  borderD:  '#cbc7bd',
  good:     '#059669',
  bad:      '#b91c1c',
  accent:   'oklch(0.55 0.09 55)',
  mono:     "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:     "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// ─── Inject keyframes once ──────────────────────────────────
(function injectKF() {
  if (document.getElementById('mv-home-kf')) return;
  const s = document.createElement('style');
  s.id = 'mv-home-kf';
  s.textContent = `
    @keyframes mvBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    @keyframes mvFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes mvDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-40px, -40px, 0); } }
    @keyframes mvMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes mvScanY { 0% { transform: translateY(-10%); opacity: .0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(110%); opacity: 0; } }
    @keyframes mvSpin  { to { transform: rotate(360deg); } }
    @keyframes mvDash { to { stroke-dashoffset: 0; } }
    @keyframes mvBarRise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes mvFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes mvLetterIn { from { opacity: 0; transform: translateY(40px) scale(0.96); filter: blur(8px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
    @keyframes mvShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes mvOrbit { from { transform: rotate(0deg) translateX(140px) rotate(0deg); } to { transform: rotate(360deg) translateX(140px) rotate(-360deg); } }
    @keyframes mvNotchPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
    @keyframes mvCellFlash { 0% { background: ${H.ink}; color: #fff; } 100% { background: transparent; color: ${H.text}; } }
    .mv-reveal { opacity: 0; transform: translateY(24px); transition: opacity 700ms cubic-bezier(.2,.8,.2,1), transform 700ms cubic-bezier(.2,.8,.2,1); }
    .mv-reveal.in { opacity: 1; transform: none; }
    .mv-reveal[data-d="1"] { transition-delay: 80ms; }
    .mv-reveal[data-d="2"] { transition-delay: 160ms; }
    .mv-reveal[data-d="3"] { transition-delay: 240ms; }
    .mv-reveal[data-d="4"] { transition-delay: 320ms; }
    .mv-reveal[data-d="5"] { transition-delay: 400ms; }
    html { scroll-behavior: smooth; }
    ::selection { background: ${H.ink}; color: ${H.bg}; }
  `;
  document.head.appendChild(s);
})();

// ─── Hooks ──────────────────────────────────────────────────
function useTick(fps = 30, run = true) {
  const [, setTick] = hUS(0);
  hUE(() => {
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

function useReveal() {
  hUE(() => {
    const els = document.querySelectorAll('.mv-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useMouse() {
  const [m, setM] = hUS({ x: 0.5, y: 0.5 });
  hUE(() => {
    const onMove = (e) => setM({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return m;
}

// ─── Notch M mark (from logo system) ────────────────────────
function NotchM({ size = 28, fg = H.ink, bg = 'transparent' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3, display: 'block' }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

function Wordmark({ size = 22, color = H.ink, weight = 600, ls = -1.2 }) {
  return <span style={{ fontFamily: H.sans, fontWeight: weight, fontSize: size, color, letterSpacing: ls, lineHeight: 1 }}>Merchiva</span>;
}

// ─── Mono caption pill ──────────────────────────────────────
function MonoTag({ children, color = H.sec, border = true }) {
  return (
    <span style={{
      fontFamily: H.mono, fontSize: 10.5, color, letterSpacing: 0.4, textTransform: 'uppercase',
      border: border ? `1px solid ${H.border}` : 'none',
      padding: border ? '4px 8px' : 0, borderRadius: 3, background: border ? H.paper : 'transparent',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</span>
  );
}

// ─── Dot leader ─────────────────────────────────────────────
function DotLeader({ color = H.borderD }) {
  return (
    <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${color}`, transform: 'translateY(-2px)' }} />
  );
}

// ═══════════════════════════════════════════════════════════
// 01 · TOP NAV
// ═══════════════════════════════════════════════════════════
function Nav() {
  const [scrolled, setScrolled] = hUS(false);
  hUE(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '14px 32px',
      transition: 'background 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease',
      background: scrolled ? 'rgba(240,238,233,0.78)' : 'transparent',
      backdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none',
      borderBottom: `1px solid ${scrolled ? H.border : 'transparent'}`,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32 }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: H.ink }}>
          <NotchM size={22} />
          <Wordmark size={17} ls={-0.8} />
        </a>
        <div style={{ display: 'flex', gap: 24, marginLeft: 24 }}>
          {['Product', 'Modules', 'Pricing', 'Customers', 'Changelog'].map(x => (
            <a key={x} href={`#${x.toLowerCase()}`} style={{
              fontSize: 13, color: H.text3, textDecoration: 'none', fontWeight: 500,
              letterSpacing: -0.1, transition: 'color 160ms',
            }} onMouseEnter={e => e.currentTarget.style.color = H.ink}
               onMouseLeave={e => e.currentTarget.style.color = H.text3}>
              {x}
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec, letterSpacing: 0.3 }}>
            v3.4 <span style={{ color: H.good }}>●</span> live
          </span>
          <a href="#login" style={{
            fontSize: 13, color: H.text2, textDecoration: 'none', fontWeight: 500, padding: '6px 10px',
          }}>Sign in</a>
          <a href="#start" style={{
            fontSize: 13, fontWeight: 500, color: '#fff', background: H.ink, textDecoration: 'none',
            padding: '8px 14px', borderRadius: 4, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Start free
            <span style={{ fontFamily: H.mono, fontSize: 11, opacity: 0.7 }}>→</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════
// 02 · HERO — animated wordmark, grid backdrop, ticker
// ═══════════════════════════════════════════════════════════

function AnimatedGrid() {
  const m = useMouse();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* moving dot grid */}
      <div style={{
        position: 'absolute', inset: '-40px',
        backgroundImage: `radial-gradient(${H.borderD} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        opacity: 0.6,
        animation: 'mvDrift 18s linear infinite',
        maskImage: 'radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)',
      }} />
      {/* cursor spotlight */}
      <div style={{
        position: 'absolute',
        left: `calc(${m.x * 100}% - 280px)`, top: `calc(${m.y * 100}% - 280px)`,
        width: 560, height: 560, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,119,6,0.07), transparent 60%)',
        transition: 'left 240ms ease-out, top 240ms ease-out',
      }} />
      {/* corner crosshairs */}
      {[
        { top: 24, left: 24 }, { top: 24, right: 24 }, { bottom: 24, left: 24 }, { bottom: 24, right: 24 },
      ].map((p, i) => (
        <div key={i} style={{ position: 'absolute', ...p, width: 14, height: 14, color: H.ter }}>
          <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: 'currentColor' }} />
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 1, background: 'currentColor' }} />
        </div>
      ))}
    </div>
  );
}

function HeroWordmark() {
  // Two-line headline: "know what / sells next." — letter-by-letter
  const lines = ['know what', 'sells next.'];
  let idx = 0;
  return (
    <h1 style={{
      margin: 0, fontFamily: H.sans, fontWeight: 600,
      fontSize: 'clamp(64px, 11vw, 168px)', lineHeight: 0.94,
      letterSpacing: '-0.055em', color: H.ink,
    }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: 'flex', flexWrap: 'nowrap' }}>
          {line.split('').map((c) => {
            const i = idx++;
            const accent = li === 1 && c === 's' && line.indexOf(c) === 0;
            return (
              <span key={i} style={{
                display: 'inline-block',
                color: accent ? H.accent : 'inherit',
                whiteSpace: 'pre',
                animation: `mvLetterIn 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 50}ms both`,
              }}>{c === ' ' ? '\u00A0' : c}</span>
            );
          })}
        </div>
      ))}
    </h1>
  );
}

function TypingLine() {
  const phrases = [
    'forecast.next("oat_milk", 7)',
    'predict.demand("croissant")',
    'reorder.suggest("beans_eth")',
    'stockout.risk("may_15")',
  ];
  const [pi, setPi] = hUS(0);
  const [shown, setShown] = hUS('');
  const [del, setDel] = hUS(false);
  hUE(() => {
    const target = phrases[pi];
    let t;
    if (!del && shown.length < target.length) {
      t = setTimeout(() => setShown(target.slice(0, shown.length + 1)), 55);
    } else if (!del && shown.length === target.length) {
      t = setTimeout(() => setDel(true), 1700);
    } else if (del && shown.length > 0) {
      t = setTimeout(() => setShown(target.slice(0, shown.length - 1)), 24);
    } else if (del && shown.length === 0) {
      setDel(false); setPi((pi + 1) % phrases.length);
    }
    return () => clearTimeout(t);
  }, [shown, del, pi]);
  return (
    <div style={{
      fontFamily: H.mono, fontSize: 13.5, color: H.text2,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', border: `1px solid ${H.border}`, background: H.paper, borderRadius: 4,
    }}>
      <span style={{ color: H.ter }}>$</span>
      <span style={{ color: H.text }}>merchiva </span>
      <span style={{ color: H.text2 }}>{shown}</span>
      <span style={{ width: 7, height: 14, background: H.ink, animation: 'mvBlink 1s steps(1) infinite' }} />
    </div>
  );
}

function HeroTicker() {
  // running counters
  useTick(8);
  const t = performance.now() / 1000;
  const stats = [
    { label: 'forecasts run · today', base: 184_612, drift: 0.92 },
    { label: 'stockouts prevented · 30d', base: 41_287, drift: 0.18 },
    { label: 'reorders auto-suggested', base: 612_408, drift: 0.41 },
    { label: 'forecast accuracy · MAPE', base: 0, drift: 0, fixed: '7.2%' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
      border: `1px solid ${H.border}`, borderRadius: 4, overflow: 'hidden',
      background: H.paper,
    }}>
      {stats.map((s, i) => {
        const v = Math.floor(s.base + t * s.drift * 60);
        return (
          <div key={i} style={{
            padding: '14px 18px',
            borderRight: i < stats.length - 1 ? `1px solid ${H.border}` : 'none',
            background: i % 2 === 0 ? H.paper : H.surface,
          }}>
            <div style={{
              fontFamily: H.mono, fontSize: 18, fontWeight: 600, color: H.ink,
              letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums',
            }}>{s.fixed ?? v.toLocaleString()}</div>
            <div style={{ fontFamily: H.mono, fontSize: 9.5, color: H.sec, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MagneticButton({ children, primary, href = '#' }) {
  const ref = hUR(null);
  const [d, setD] = hUS({ x: 0, y: 0 });
  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={e => {
        const r = ref.current.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        setD({ x: (e.clientX - cx) * 0.18, y: (e.clientY - cy) * 0.32 });
      }}
      onMouseLeave={() => setD({ x: 0, y: 0 })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '14px 22px', borderRadius: 4,
        background: primary ? H.ink : 'transparent',
        color: primary ? '#fff' : H.ink,
        border: primary ? `1px solid ${H.ink}` : `1px solid ${H.borderD}`,
        textDecoration: 'none', fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
        transform: `translate(${d.x}px, ${d.y}px)`,
        transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), background 160ms',
      }}
    >
      {children}
      <span style={{ fontFamily: H.mono, fontSize: 12, opacity: 0.8 }}>→</span>
    </a>
  );
}

function Hero() {
  return (
    <section id="top" style={{
      position: 'relative', minHeight: '100vh',
      paddingTop: 120, paddingBottom: 80,
      paddingLeft: 32, paddingRight: 32,
      overflow: 'hidden',
    }}>
      <AnimatedGrid />
      <div style={{ position: 'relative', maxWidth: 1280, margin: '0 auto' }}>
        {/* Top row: tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36, animation: 'mvFadeUp 700ms 60ms both' }}>
          <MonoTag>
            <span style={{ width: 6, height: 6, background: H.good, borderRadius: '50%' }} />
            new · v3.4 · forecasting engine
          </MonoTag>
          <span style={{ fontSize: 13, color: H.sec, letterSpacing: -0.1 }}>
            Inventory forecasting that pays back in week one.
          </span>
        </div>

        {/* Wordmark */}
        <HeroWordmark />

        {/* Subline grid */}
        <div style={{
          marginTop: 44, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, alignItems: 'end',
          animation: 'mvFadeUp 800ms 700ms both',
        }}>
          <p style={{
            margin: 0, fontSize: 22, lineHeight: 1.4, color: H.text2,
            letterSpacing: -0.3, maxWidth: 640, fontWeight: 400,
            textWrap: 'pretty',
          }}>
            Stop guessing. Merchiva watches your sales every minute and tells you <em style={{ color: H.ink, fontStyle: 'normal', fontWeight: 600 }}>exactly how much to order, and when</em> — for every SKU, every supplier, every location. Median forecast error: <strong style={{ color: H.ink, fontWeight: 600 }}>7.2%</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <TypingLine />
            <div style={{ display: 'flex', gap: 10 }}>
              <MagneticButton primary href="#start">Start free · 30 days</MagneticButton>
              <MagneticButton href="#demo">Watch 2-min demo</MagneticButton>
            </div>
            <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec, letterSpacing: 0.3 }}>
              no card · 2-minute setup · cancel anytime
            </span>
          </div>
        </div>

        {/* Bottom ticker */}
        <div style={{ marginTop: 64, animation: 'mvFadeUp 900ms 1100ms both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <MonoTag border={false}>live · across {(2841).toLocaleString()} businesses</MonoTag>
            <DotLeader />
            <MonoTag border={false}>updated every 30s</MonoTag>
          </div>
          <HeroTicker />
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 03 · LIVE PRODUCT PREVIEW — auto-cycling dashboard
// ═══════════════════════════════════════════════════════════

const VIEWS = [
  { id: 'forecast', label: 'Forecast',  icon: '⌇', tag: '/forecast/sku',     sub: 'Oat milk · 1L · 14-day window' },
  { id: 'reorder',  label: 'Reorder',   icon: '⊞', tag: '/forecast/reorder', sub: 'Auto-suggested · 6 vendors' },
  { id: 'inv',      label: 'Inventory', icon: '◫', tag: '/inventory',        sub: 'Stockroom · 124 SKUs' },
  { id: 'sales',    label: 'Signal',    icon: '◴', tag: '/forecast/signal',  sub: 'Drivers · weather · payday · holiday' },
];

function ViewForecast() {
  useTick(2);
  const t = performance.now() / 1000;
  // Past 14 days actual + next 14 forecast with confidence band
  const past = Array.from({ length: 14 }, (_, i) => 38 + Math.sin(i * 0.7) * 9 + Math.sin(i * 0.3) * 4 + (i * 0.4));
  const fut = Array.from({ length: 14 }, (_, i) => {
    const base = past[past.length - 1] + i * 0.6 + Math.sin((i + t * 0.2) * 0.7) * 6;
    return base;
  });
  const all = [...past, ...fut];
  const W = 720, Hh = 220, pad = 28;
  const max = Math.max(...all) * 1.18;
  const sx = (i) => pad + (i / (all.length - 1)) * (W - pad * 2);
  const sy = (v) => Hh - pad - (v / max) * (Hh - pad * 2);
  const pastPath = past.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(v)}`).join(' ');
  const futPath = fut.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(past.length - 1 + i)} ${sy(v)}`).join(' ');
  const bandHi = fut.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(past.length - 1 + i)} ${sy(v + 7 + i * 0.3)}`).join(' ');
  const bandLo = fut.map((v, i) => `L ${sx(past.length - 1 + (fut.length - 1 - i))} ${sy(fut[fut.length - 1 - i] - 7 - (fut.length - 1 - i) * 0.3)}`).join(' ');
  const splitX = sx(past.length - 1);
  return (
    <div style={{ padding: 18, fontFamily: H.sans, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: H.ink }}>Oat milk · 1L</div>
          <div style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec, marginTop: 2 }}>SKU OAT-1L · supplier Pacific Farms · lead time 3d</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['7d','14d','30d','90d'].map((p, i) => (
            <span key={p} style={{
              fontFamily: H.mono, fontSize: 10.5, padding: '4px 8px', borderRadius: 3,
              background: i === 1 ? H.ink : H.surface, color: i === 1 ? '#fff' : H.text3,
              border: `1px solid ${i === 1 ? H.ink : H.border}`,
            }}>{p}</span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', flex: 1 }}>
        <defs>
          <linearGradient id="mvFcBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={H.accent} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={H.accent} stopOpacity="0.05"/>
          </linearGradient>
          <pattern id="mvFcHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={H.accent} strokeWidth="0.7" strokeOpacity="0.18"/>
          </pattern>
        </defs>
        {[0.25,0.5,0.75,1].map((p,i)=>(
          <line key={i} x1={pad} x2={W-pad} y1={sy(max*p)} y2={sy(max*p)} stroke={H.border} strokeDasharray="2 4"/>
        ))}
        {/* split divider */}
        <line x1={splitX} x2={splitX} y1={pad} y2={Hh-pad} stroke={H.borderD} strokeDasharray="3 3"/>
        <text x={splitX-6} y={pad+10} textAnchor="end" fontFamily={H.mono} fontSize="9.5" fill={H.sec}>actual</text>
        <text x={splitX+6} y={pad+10} textAnchor="start" fontFamily={H.mono} fontSize="9.5" fill={H.accent}>forecast</text>
        {/* confidence band */}
        <path d={`${bandHi} ${bandLo} Z`} fill="url(#mvFcHatch)" />
        <path d={`${bandHi} ${bandLo} Z`} fill="url(#mvFcBand)" />
        {/* past line */}
        <path d={pastPath} fill="none" stroke={H.ink} strokeWidth="2"/>
        {/* future line */}
        <path d={futPath} fill="none" stroke={H.accent} strokeWidth="2" strokeDasharray="4 3"/>
        {/* points */}
        {past.map((v,i)=><circle key={'p'+i} cx={sx(i)} cy={sy(v)} r="2" fill={H.ink}/>)}
        {fut.map((v,i)=>{
          const x = sx(past.length-1+i);
          return <circle key={'f'+i} cx={x} cy={sy(v)} r="2.5" fill={H.paper} stroke={H.accent} strokeWidth="1.5"/>;
        })}
        {/* reorder marker */}
        <line x1={sx(past.length+3)} x2={sx(past.length+3)} y1={pad} y2={Hh-pad} stroke={H.ink} strokeWidth="1"/>
        <rect x={sx(past.length+3)-50} y={pad-2} width="100" height="16" fill={H.ink} rx="2"/>
        <text x={sx(past.length+3)} y={pad+9} textAnchor="middle" fontFamily={H.mono} fontSize="9" fill="#fff" letterSpacing="0.4">REORDER · MAY 14</text>
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, paddingTop: 10, borderTop: `1px solid ${H.border}` }}>
        {[
          { k: 'Predicted · 14d', v: '628 L', s: '+18% vs prev' },
          { k: 'Reorder by', v: 'May 14', s: '4 days from now' },
          { k: 'Suggest qty', v: '14 cases', s: '@ $42.50/case' },
          { k: 'Stockout risk', v: '2.4%', s: 'within window' },
        ].map(s => (
          <div key={s.k}>
            <div style={{ fontFamily: H.mono, fontSize: 9.5, color: H.sec, textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.k}</div>
            <div style={{ fontFamily: H.mono, fontSize: 16, fontWeight: 600, color: H.ink, marginTop: 2 }}>{s.v}</div>
            <div style={{ fontFamily: H.mono, fontSize: 9.5, color: H.sec, marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewReorder() {
  useTick(2);
  const t = performance.now() / 1000;
  const rows = [
    { sku: 'OAT-1L',      name: 'Oat milk · 1L',         vend: 'Pacific Farms', qty: 14, unit: 'cases', need: 'May 14', risk: 0.62, urg: 'high' },
    { sku: 'BEAN-ETH-1KG',name: 'Beans · Ethiopia · 1kg',vend: 'Ritual Roast',  qty: 8,  unit: 'bags',  need: 'May 16', risk: 0.41, urg: 'med'  },
    { sku: 'SYR-VAN-750', name: 'Vanilla syrup · 750ml', vend: 'Monin · West',  qty: 6,  unit: 'btl',   need: 'May 17', risk: 0.38, urg: 'med'  },
    { sku: 'CUP-12-WHT',  name: 'Cups · 12oz · white',   vend: 'PaperHaus',     qty: 2,  unit: 'cases', need: 'May 19', risk: 0.21, urg: 'low'  },
    { sku: 'MILK-WH-1G',  name: 'Whole milk · 1gal',     vend: 'Local Dairy',   qty: 18, unit: 'gal',   need: 'May 13', risk: 0.71, urg: 'high' },
    { sku: 'LID-12',      name: 'Lids · 12oz',           vend: 'PaperHaus',     qty: 1,  unit: 'cases', need: 'May 22', risk: 0.12, urg: 'low'  },
  ];
  return (
    <div style={{ padding: 18, fontFamily: H.sans, fontSize: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec }}>6 reorders auto-suggested · last run 14s ago</span>
        <button style={{ fontFamily: H.sans, fontSize: 11.5, fontWeight: 500, padding: '6px 12px', background: H.ink, color: '#fff', border: 'none', borderRadius: 3 }}>
          Approve all · send 4 POs
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px 80px 80px 70px 70px', gap: 0, fontFamily: H.mono, fontSize: 9.5, color: H.sec, padding: '0 10px 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span>SKU</span><span>Item</span><span>Vendor</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Need by</span><span style={{ textAlign: 'right' }}>Risk</span><span style={{ textAlign: 'right' }}>Action</span>
      </div>
      {rows.map((r, i) => {
        const high = r.urg === 'high';
        const flash = high && Math.floor(t * 1.4) % 2 === 0;
        const urgC = high ? H.bad : r.urg === 'med' ? H.accent : H.good;
        return (
          <div key={r.sku} style={{
            display: 'grid', gridTemplateColumns: '110px 1fr 130px 80px 80px 70px 70px',
            alignItems: 'center', padding: '10px 10px',
            background: i % 2 === 0 ? H.paper : H.surface,
            borderBottom: `1px solid ${H.border}`, fontSize: 12,
          }}>
            <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.text3 }}>{r.sku}</span>
            <span>{r.name}</span>
            <span style={{ fontSize: 11.5, color: H.text2 }}>{r.vend}</span>
            <span style={{ fontFamily: H.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.qty} <span style={{ color: H.sec, fontSize: 10 }}>{r.unit}</span></span>
            <span style={{ fontFamily: H.mono, textAlign: 'right', color: high ? H.bad : H.text }}>{r.need}</span>
            <span style={{ fontFamily: H.mono, textAlign: 'right', color: urgC, opacity: flash ? 0.5 : 1, transition: 'opacity 220ms' }}>{(r.risk * 100).toFixed(0)}%</span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: H.mono, fontSize: 9.5, padding: '3px 6px', borderRadius: 2, background: H.ink, color: '#fff' }}>send</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ViewStaffing() {
  useTick(2);
  const days = ['M','T','W','T','F','S','S'];
  const people = ['Amelia', 'Devon', 'Reza', 'Mika', 'Ola', 'Sky'];
  return (
    <div style={{ padding: 18, fontFamily: H.sans, fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 1, background: H.border, border: `1px solid ${H.border}`, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ background: H.surface, padding: '8px 10px', fontFamily: H.mono, fontSize: 10.5, color: H.sec, textTransform: 'uppercase', letterSpacing: 0.4 }}>Week 19</div>
        {days.map((d, i) => (
          <div key={i} style={{ background: H.surface, padding: '8px 10px', fontFamily: H.mono, fontSize: 10.5, color: H.sec, textAlign: 'center' }}>{d}</div>
        ))}
        {people.map((p, pi) => (
          <React.Fragment key={pi}>
            <div style={{ background: H.paper, padding: '10px 10px', fontWeight: 500, color: H.text }}>{p}</div>
            {days.map((_, di) => {
              const has = (pi * 3 + di) % 5 < 3;
              const hours = ((pi * 7 + di) % 6) + 4;
              return (
                <div key={di} style={{
                  background: H.paper, padding: 6, position: 'relative',
                  minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {has && (
                    <div style={{
                      width: '88%', height: 18,
                      background: di === 2 && pi === 0 ? H.ink : H.panel,
                      color: di === 2 && pi === 0 ? '#fff' : H.text2,
                      fontFamily: H.mono, fontSize: 9.5, fontWeight: 500,
                      borderRadius: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${H.border}`,
                      animation: di === 2 && pi === 0 ? 'mvNotchPulse 1.6s ease-in-out infinite' : 'none',
                    }}>{hours}h</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontFamily: H.mono, fontSize: 10.5, color: H.sec }}>
        <span>● Confirmed</span>
        <span style={{ color: H.text }}>● Pending swap</span>
        <DotLeader />
        <span>87 hrs · $1,394 labor</span>
      </div>
    </div>
  );
}

function ViewPOS() {
  useTick(3);
  const t = performance.now() / 1000;
  const items = [
    { sku: 'LATTE-12', name: 'Latte · 12oz', qty: 2, price: 5.5 },
    { sku: 'CRSNT-PL', name: 'Croissant', qty: 1, price: 4.25 },
    { sku: 'COLD-16',  name: 'Cold brew · 16oz', qty: 1, price: 5.0 },
  ];
  const sub = items.reduce((a, i) => a + i.qty * i.price, 0);
  const tax = sub * 0.0875;
  const tot = sub + tax;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', height: '100%' }}>
      <div style={{ padding: 18, borderRight: `1px solid ${H.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {['Latte','Mocha','Drip','Cold brew','Espresso','Tea','Croissant','Bagel','Toast','Sandwich','Pastry','Add-on'].map((n, i) => {
            const flash = Math.floor(t * 0.6) % 12 === i;
            return (
              <div key={i} style={{
                aspectRatio: '1.4',
                border: `1px solid ${H.border}`,
                background: flash ? H.ink : H.paper,
                color: flash ? '#fff' : H.text,
                borderRadius: 3, padding: 8, fontSize: 11.5, fontWeight: 500,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'background 180ms, color 180ms',
              }}>
                <span>{n}</span>
                <span style={{ fontFamily: H.mono, fontSize: 10, opacity: 0.7 }}>${(3 + (i % 4)).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ background: H.surface, padding: 18, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: H.mono, fontSize: 10, color: H.sec, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Order #4813</div>
        <div style={{ flex: 1 }}>
          {items.map((i) => (
            <div key={i.sku} style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: `1px dashed ${H.border}`, fontSize: 12,
            }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: H.mono, fontSize: 10, color: H.sec, width: 16 }}>{i.qty}×</span>
                <span>{i.name}</span>
              </span>
              <span style={{ fontFamily: H.mono, fontVariantNumeric: 'tabular-nums' }}>${(i.qty * i.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${H.border}` }}>
          {[['Subtotal', sub], ['Tax', tax]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: H.text3, padding: '2px 0', fontFamily: H.mono }}>
              <span>{k}</span><span>${v.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 16, fontWeight: 600, fontFamily: H.mono }}>
            <span>Total</span><span>${tot.toFixed(2)}</span>
          </div>
          <button style={{
            width: '100%', marginTop: 12, padding: '12px', background: H.ink, color: '#fff',
            border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500, fontFamily: H.sans,
            cursor: 'pointer',
          }}>Charge ${tot.toFixed(2)}</button>
        </div>
      </div>
    </div>
  );
}

function ViewInventory() {
  useTick(2);
  const t = performance.now() / 1000;
  const rows = [
    { sku: 'BEAN-ETH-1KG', name: 'Beans · Ethiopia · 1kg', stock: 18, par: 24, unit: 'bag' },
    { sku: 'CUP-12-WHT',   name: 'Cups · 12oz · white',   stock: 312, par: 800, unit: 'pcs' },
    { sku: 'MILK-WH-1G',   name: 'Whole milk · 1gal',     stock: 6, par: 12, unit: 'gal' },
    { sku: 'OAT-1L',       name: 'Oat milk · 1L',          stock: 14, par: 18, unit: 'btl' },
    { sku: 'SYR-VAN-750',  name: 'Vanilla syrup · 750ml',  stock: 3, par: 6, unit: 'btl' },
    { sku: 'LID-12',       name: 'Lids · 12oz',            stock: 480, par: 800, unit: 'pcs' },
  ];
  return (
    <div style={{ padding: 18, fontFamily: H.sans, fontSize: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 1fr 60px', gap: 0, fontFamily: H.mono, fontSize: 10, color: H.sec, padding: '0 8px 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span>SKU</span><span>Item</span><span style={{ textAlign: 'right' }}>On hand</span><span style={{ paddingLeft: 14 }}>Par</span><span style={{ textAlign: 'right' }}>Status</span>
      </div>
      {rows.map((r, i) => {
        const pct = Math.min(1, r.stock / r.par);
        const low = pct < 0.4;
        const flashing = low && Math.floor(t * 1.2) % 2 === 0;
        return (
          <div key={r.sku} style={{
            display: 'grid', gridTemplateColumns: '120px 1fr 80px 1fr 60px',
            alignItems: 'center', padding: '8px 8px',
            background: i % 2 === 0 ? H.paper : H.surface,
            border: `1px solid ${H.border}`,
            borderTop: i === 0 ? `1px solid ${H.border}` : 'none',
            fontSize: 12,
          }}>
            <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.text3 }}>{r.sku}</span>
            <span>{r.name}</span>
            <span style={{ fontFamily: H.mono, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: low ? H.bad : H.text }}>{r.stock}</span>
            <div style={{ paddingLeft: 14, paddingRight: 10 }}>
              <div style={{ height: 6, background: H.panel, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct * 100}%`,
                  background: low ? H.bad : H.ink,
                  transition: 'width 600ms',
                }} />
              </div>
            </div>
            <span style={{
              textAlign: 'right', fontFamily: H.mono, fontSize: 9.5, fontWeight: 600,
              color: low ? H.bad : H.good, opacity: flashing ? 0.4 : 1, transition: 'opacity 220ms',
            }}>{low ? 'REORDER' : 'OK'}</span>
          </div>
        );
      })}
    </div>
  );
}

function ViewSales() {
  useTick(2);
  const t = performance.now() / 1000;
  // hourly sales 6am..2pm
  const hours = [6, 7, 8, 9, 10, 11, 12, 13];
  const data = hours.map((h, i) => 200 + Math.abs(Math.sin((h + t * 0.3) * 0.7) * 240) + i * 30);
  const max = Math.max(...data);
  const total = data.reduce((a, b) => a + b, 0);
  const W = 540, Hh = 200, pad = 24;
  const sx = (i) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const sy = (v) => Hh - pad - (v / max) * (Hh - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  const area = `${path} L ${sx(data.length - 1)} ${Hh - pad} L ${sx(0)} ${Hh - pad} Z`;
  return (
    <div style={{ padding: 18, fontFamily: H.sans }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1, fontFamily: H.mono }}>${total.toFixed(0)}</span>
        <span style={{ fontFamily: H.mono, fontSize: 11, color: H.good }}>+18.4% vs avg Sat</span>
      </div>
      <svg width={W} height={Hh} style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="mvSalesArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={H.ink} stopOpacity="0.16" />
            <stop offset="100%" stopColor={H.ink} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)}
                stroke={H.border} strokeDasharray="2 4" />
        ))}
        <path d={area} fill="url(#mvSalesArea)" />
        <path d={path} fill="none" stroke={H.ink} strokeWidth="2" />
        {data.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r="3" fill={H.paper} stroke={H.ink} strokeWidth="1.5" />
        ))}
        {hours.map((h, i) => (
          <text key={i} x={sx(i)} y={Hh - 6} textAnchor="middle"
                fontFamily={H.mono} fontSize="9.5" fill={H.sec}>{h}:00</text>
        ))}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 8 }}>
        {[
          { k: 'Orders', v: '218' }, { k: 'Avg ticket', v: '$8.42' },
          { k: 'Refunds', v: '2' }, { k: 'Tip avg', v: '12.1%' },
        ].map(s => (
          <div key={s.k} style={{ borderTop: `1px solid ${H.border}`, paddingTop: 8 }}>
            <div style={{ fontFamily: H.mono, fontSize: 10, color: H.sec, textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.k}</div>
            <div style={{ fontFamily: H.mono, fontSize: 17, fontWeight: 600, marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveDashboard() {
  const [active, setActive] = hUS(0);
  const [paused, setPaused] = hUS(false);
  hUE(() => {
    if (paused) return;
    const id = setInterval(() => setActive(a => (a + 1) % VIEWS.length), 4500);
    return () => clearInterval(id);
  }, [paused]);
  const tilt = useMouse();
  const tx = (tilt.x - 0.5) * 6;
  const ty = (tilt.y - 0.5) * -4;
  return (
    <section id="product" style={{ padding: '120px 32px 80px', position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="mv-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 32 }}>
          <MonoTag border={false}>02 · the product</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec }}>auto-cycling · click a tab</span>
        </div>

        <div className="mv-reveal" data-d="1" style={{
          display: 'grid', gridTemplateColumns: '1fr', gap: 0,
        }}>
          <h2 style={{
            margin: 0, fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 600,
            letterSpacing: -2, lineHeight: 1.02, color: H.ink, maxWidth: 1100,
            textWrap: 'balance',
          }}>
            Forecast, reorder, restock. <span style={{ color: H.ter }}>One screen. Four hours saved every week.</span>
          </h2>
        </div>

        {/* Tabs */}
        <div className="mv-reveal" data-d="2" style={{
          display: 'flex', gap: 0, marginTop: 40,
          borderTop: `1px solid ${H.border}`, borderBottom: `1px solid ${H.border}`,
        }}>
          {VIEWS.map((v, i) => {
            const on = i === active;
            return (
              <button key={v.id} onClick={() => { setActive(i); setPaused(true); }}
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
                style={{
                  flex: 1, padding: '16px 18px', textAlign: 'left',
                  background: on ? H.paper : 'transparent',
                  border: 'none', borderRight: i < VIEWS.length - 1 ? `1px solid ${H.border}` : 'none',
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: H.mono, fontSize: 14, color: on ? H.ink : H.ter }}>{v.icon}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? H.ink : H.text3, letterSpacing: -0.2 }}>{v.label}</span>
                </div>
                <div style={{ fontFamily: H.mono, fontSize: 10, color: H.sec, marginTop: 4 }}>{v.tag}</div>
                {on && <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: H.ink,
                }} />}
                {on && !paused && <div style={{
                  position: 'absolute', left: 0, top: 0, height: 2, background: H.accent, width: '100%',
                  transformOrigin: 'left', animation: 'mvShimmer 4.5s linear',
                }} />}
              </button>
            );
          })}
        </div>

        {/* Window */}
        <div className="mv-reveal" data-d="3" style={{
          marginTop: 24, position: 'relative',
          transform: `perspective(1400px) rotateY(${tx * 0.3}deg) rotateX(${ty * 0.3}deg)`,
          transformStyle: 'preserve-3d', transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
        }}>
          <div style={{
            background: H.paper, border: `1px solid ${H.border}`, borderRadius: 6,
            boxShadow: `0 30px 80px -30px rgba(28,25,23,0.18), 0 8px 22px -12px rgba(28,25,23,0.08)`,
            overflow: 'hidden',
          }}>
            {/* window chrome */}
            <div style={{
              height: 36, borderBottom: `1px solid ${H.border}`, background: H.surface,
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6,
            }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: 99, background: H.panel, border: `1px solid ${H.border}` }} />)}
              <div style={{
                flex: 1, maxWidth: 360, marginLeft: 14, height: 22, borderRadius: 3,
                background: H.paper, border: `1px solid ${H.border}`,
                display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
                fontFamily: H.mono, fontSize: 10.5, color: H.sec,
              }}>
                <span style={{ color: H.ter }}>maple-coffee.merchiva.app</span>
                <span style={{ color: H.text3 }}>{VIEWS[active].tag}</span>
              </div>
              <span style={{ fontFamily: H.mono, fontSize: 10, color: H.sec }}>{VIEWS[active].sub}</span>
            </div>
            <div style={{ height: 460, background: H.paper, position: 'relative', overflow: 'hidden' }}>
              <div key={active} style={{
                animation: 'mvFadeUp 480ms cubic-bezier(.2,.8,.2,1) both',
                height: '100%',
              }}>
                {active === 0 && <ViewForecast />}
                {active === 1 && <ViewReorder />}
                {active === 2 && <ViewInventory />}
                {active === 3 && <ViewSales />}
              </div>
              {/* scanline */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `linear-gradient(to bottom, transparent 0%, rgba(217,119,6,0.05) 50%, transparent 100%)`,
                height: 60, animation: 'mvScanY 6s ease-in-out infinite',
              }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 04 · MARQUEE — what merchiva runs
// ═══════════════════════════════════════════════════════════
function Marquee() {
  const items = [
    'demand forecasts', 'reorder points', 'stockout risk', 'lead-time aware',
    'confidence bands', 'driver attribution', 'weather signal', 'holiday lift',
    'payday bumps', 'cold-start models', 'vendor MOQs', 'pack rounding',
    'cycle counts', 'shrink alerts', 'expiry windows', 'multi-location',
    'auto purchase orders', 'supplier scorecards', 'safety-stock tuning', 'what-if scenarios',
  ];
  const row = [...items, ...items];
  return (
    <section style={{
      padding: '32px 0', borderTop: `1px solid ${H.border}`, borderBottom: `1px solid ${H.border}`,
      background: H.bgWarm, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', gap: 0, animation: 'mvMarquee 60s linear infinite',
        whiteSpace: 'nowrap', width: 'max-content',
      }}>
        {row.map((x, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, padding: '0 22px',
            fontFamily: H.sans, fontSize: 30, fontWeight: 500,
            color: i % 7 === 3 ? H.ink : H.text3, letterSpacing: -0.6,
          }}>
            <NotchM size={14} fg={H.ter} />
            {x}
          </span>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 05 · FEATURE GRID — six modules with mini-loaders
// ═══════════════════════════════════════════════════════════

function MiniLoader_Schedule() {
  useTick(8);
  const t = performance.now() / 100;
  const cells = 12;
  const head = Math.floor(t) % cells;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells}, 1fr)`, gap: 2, width: '100%' }}>
      {Array.from({ length: cells }).map((_, i) => {
        const dist = ((i - head + cells) % cells);
        const opacity = Math.max(0.12, 1 - dist * 0.14);
        return <div key={i} style={{ height: 16, background: H.ink, opacity, borderRadius: 1 }} />;
      })}
    </div>
  );
}

function MiniLoader_POS() {
  useTick(4);
  const t = performance.now() / 1000;
  const v = (Math.sin(t) * 0.5 + 0.5);
  return (
    <div style={{ width: '100%', fontFamily: H.mono, fontSize: 10.5, color: H.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ color: H.sec }}>Latte 12oz</span><span>$5.50</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ color: H.sec }}>Croissant</span><span>$4.25</span>
      </div>
      <div style={{ borderTop: `1px solid ${H.border}`, paddingTop: 4, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>Total</span>
        <span style={{ fontWeight: 600, fontFamily: H.mono }}>${(9.75 + v * 0.01).toFixed(2)}</span>
      </div>
    </div>
  );
}

function MiniLoader_Inv() {
  useTick(6);
  const t = performance.now() / 200;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[0,1,2].map(i => {
        const w = 30 + ((Math.sin(t * 0.4 + i) * 0.5 + 0.5) * 60);
        const low = w < 38;
        return (
          <div key={i} style={{ height: 6, background: H.panel, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${w}%`, background: low ? H.bad : H.ink, transition: 'width 240ms' }} />
          </div>
        );
      })}
    </div>
  );
}

function MiniLoader_Books() {
  useTick(4);
  const t = performance.now() / 200;
  const lines = [
    { l: 'Sales',   v: 4128.40 + Math.sin(t * 0.3) * 30 },
    { l: 'Tax',     v: 361.23 + Math.sin(t * 0.2) * 4 },
    { l: 'Tips',    v: 502.10 + Math.sin(t * 0.4) * 6 },
    { l: 'Net',     v: 3265.07 + Math.sin(t * 0.25) * 18 },
  ];
  return (
    <div style={{ fontFamily: H.mono, fontSize: 10.5, color: H.text2, width: '100%' }}>
      {lines.map(l => (
        <div key={l.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
          <span style={{ color: H.sec }}>{l.l}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: H.text }}>${l.v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function MiniLoader_Punch() {
  useTick(2);
  const t = performance.now() / 1000;
  const blink = Math.floor(t * 1.2) % 2 === 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: H.mono, color: H.text }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: blink ? H.good : H.panel, transition: 'background 200ms' }} />
      <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
    </div>
  );
}

function MiniLoader_Site() {
  useTick(8);
  const t = performance.now() / 200;
  const dots = 12;
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: dots }).map((_, i) => {
        const phase = ((i + t * 0.3) % dots) / dots;
        const h = 4 + Math.abs(Math.sin(phase * Math.PI)) * 14;
        return <div key={i} style={{ width: 4, height: h, background: H.ink, borderRadius: 1, transition: 'height 120ms' }} />;
      })}
    </div>
  );
}

const FEATURES = [
  { tag: 'F01', title: 'Per-SKU demand', body: 'A separate model per SKU per location. Daily and hourly granularity, refit nightly on your data.', mark: '⌇', loader: MiniLoader_Schedule, hint: '7.2% MAPE · median' },
  { tag: 'F02', title: 'Confidence bands', body: 'Forecasts come with calibrated 80/95% intervals. Decide reorder qty against your tolerance for stockout.', mark: '◇', loader: MiniLoader_POS, hint: 'P95 · 14-day window' },
  { tag: 'F03', title: 'Drivers explained', body: 'Every prediction shows what moved it: weather, payday, holiday, local event, last week\u2019s lift.', mark: '⊞', loader: MiniLoader_Inv, hint: '+18% rain Saturday' },
  { tag: 'F04', title: 'Auto-reorder', body: 'Suggested POs land in your inbox at 4am. Approve in one tap. Vendor-aware lead times, MOQs, pack sizes.', mark: '◰', loader: MiniLoader_Books, hint: 'sends at 04:00 daily' },
  { tag: 'F05', title: 'Stockout alerts', body: 'A pager-style alert the moment risk crosses your threshold. Quietly resolves itself when you reorder.', mark: '◴', loader: MiniLoader_Punch, hint: 'risk crossed 70% \u00b7 4m ago' },
  { tag: 'F06', title: 'Cold-start mode', body: 'New SKU? We borrow strength from similar items in the network until you have your own history.', mark: '◍', loader: MiniLoader_Site, hint: 'first useful forecast \u00b7 day 7' },
];

function FeatureCard({ f, idx }) {
  const [hover, setHover] = hUS(false);
  return (
    <div
      className="mv-reveal" data-d={String((idx % 3) + 1)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: 24,
        background: hover ? H.paper : H.surface,
        border: `1px solid ${H.border}`, borderRadius: 4,
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover ? '0 16px 40px -20px rgba(28,25,23,0.18)' : 'none',
        transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), background 180ms, box-shadow 240ms',
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 18,
        minHeight: 248,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 3, background: H.ink, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: H.mono, fontSize: 13, fontWeight: 600,
          }}>{f.mark}</div>
          <span style={{ fontFamily: H.mono, fontSize: 10, color: H.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>{f.tag}</span>
        </div>
        <span style={{ fontFamily: H.mono, fontSize: 10, color: H.sec }}>{f.hint}</span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: H.ink, marginBottom: 6 }}>{f.title}</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: H.text3, textWrap: 'pretty' }}>{f.body}</p>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{
        padding: 14, background: H.paper, border: `1px solid ${H.border}`, borderRadius: 3,
        minHeight: 56, display: 'flex', alignItems: 'center',
      }}>
        <f.loader />
      </div>
    </div>
  );
}

function FeatureGrid() {
  return (
    <section id="modules" style={{ padding: '120px 32px', background: H.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="mv-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>03 · modules</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec }}>six modules · one bill</span>
        </div>
        <h2 className="mv-reveal" data-d="1" style={{
          margin: '0 0 64px', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 600,
          letterSpacing: -1.6, lineHeight: 1.04, color: H.ink, maxWidth: 1000, textWrap: 'balance',
        }}>
          Six things our forecast does that <span style={{ color: H.ter }}>your spreadsheet can\u2019t</span>.
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        }}>
          {FEATURES.map((f, i) => <FeatureCard key={f.tag} f={f} idx={i} />)}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 06 · METRICS — counters + drawing chart
// ═══════════════════════════════════════════════════════════

function CountUp({ to, prefix = '', suffix = '', duration = 1600, decimals = 0 }) {
  const ref = hUR(null);
  const [v, setV] = hUS(0);
  hUE(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const start = performance.now();
          const tick = (now) => {
            const p = Math.min(1, (now - start) / duration);
            const ease = 1 - Math.pow(1 - p, 3);
            setV(to * ease);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  const display = decimals > 0 ? v.toFixed(decimals) : Math.floor(v).toLocaleString();
  return <span ref={ref}>{prefix}{display}{suffix}</span>;
}

function DrawingChart() {
  // bar-line combo, draws when in view
  const ref = hUR(null);
  const [drawn, setDrawn] = hUS(false);
  hUE(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { setDrawn(true); io.unobserve(el); } });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bars = [44, 52, 61, 70, 78, 92, 88, 96, 110, 124, 138, 156];
  const max = Math.max(...bars);
  const W = 720, Hh = 280, pad = 36;
  const bw = (W - pad * 2) / months.length - 6;
  const sx = i => pad + i * ((W - pad * 2) / months.length) + 3;
  const sy = v => Hh - pad - (v / max) * (Hh - pad * 2);
  const line = bars.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i) + bw / 2} ${sy(v)}`).join(' ');
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* gridlines */}
      {[0.25, 0.5, 0.75, 1].map((p, i) => (
        <g key={i}>
          <line x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke={H.border} strokeDasharray="3 4" />
          <text x={pad - 8} y={sy(max * p) + 3} fontFamily={H.mono} fontSize="9.5" fill={H.sec} textAnchor="end">${(max * p).toFixed(0)}k</text>
        </g>
      ))}
      {/* bars */}
      {bars.map((v, i) => {
        const x = sx(i);
        const y = sy(v);
        const h = Hh - pad - y;
        return (
          <g key={i}>
            <rect x={x} y={Hh - pad - (drawn ? h : 0)} width={bw} height={drawn ? h : 0}
                  fill={i === months.length - 1 ? H.ink : H.borderD}
                  style={{ transition: `y 900ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms, height 900ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms` }} />
            <text x={x + bw / 2} y={Hh - 12} fontFamily={H.mono} fontSize="9.5" fill={H.sec} textAnchor="middle">{months[i]}</text>
          </g>
        );
      })}
      {/* line */}
      <path d={line} fill="none" stroke={H.ink} strokeWidth="2"
            strokeDasharray="2000" strokeDashoffset={drawn ? 0 : 2000}
            style={{ transition: 'stroke-dashoffset 1600ms cubic-bezier(.2,.8,.2,1) 400ms' }} />
      {/* dots */}
      {bars.map((v, i) => (
        <circle key={i} cx={sx(i) + bw / 2} cy={sy(v)} r={drawn ? 3 : 0} fill={H.paper} stroke={H.ink} strokeWidth="1.5"
                style={{ transition: `r 280ms cubic-bezier(.2,.8,.2,1) ${800 + i * 60}ms` }} />
      ))}
    </svg>
  );
}

function Metrics() {
  return (
    <section style={{
      padding: '120px 32px', background: H.ink, color: H.bg,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* dot grid bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        maskImage: 'radial-gradient(ellipse at 70% 30%, black 30%, transparent 75%)',
      }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div className="mv-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 24, color: '#a8a29e' }}>
          <span style={{ fontFamily: H.mono, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>04 · in production</span>
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed #44403c`, transform: 'translateY(-2px)' }} />
          <span style={{ fontFamily: H.mono, fontSize: 10.5 }}>data through May 2026</span>
        </div>
        <h2 className="mv-reveal" data-d="1" style={{
          margin: '0 0 56px', fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 600,
          letterSpacing: -1.8, lineHeight: 1.04, color: '#fafaf9', maxWidth: 900, textWrap: 'balance',
        }}>
          Operators don't write reviews. They <span style={{ color: H.ter }}>renew</span>.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* counters */}
          <div className="mv-reveal" data-d="2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }}>
            {[
              { k: 'businesses live', v: 2841, fmt: { suffix: '' } },
              { k: 'avg setup time', v: 14, fmt: { suffix: ' min' } },
              { k: 'annual renewal', v: 96.4, fmt: { suffix: '%', decimals: 1 } },
              { k: 'support · first reply', v: 4, fmt: { suffix: ' min · median' } },
              { k: 'gmv processed', v: 2.4, fmt: { prefix: '$', suffix: 'B', decimals: 1 } },
              { k: 'states covered', v: 47, fmt: {} },
            ].map(s => (
              <div key={s.k} style={{ borderTop: `1px solid #292524`, paddingTop: 16 }}>
                <div style={{
                  fontSize: 'clamp(34px, 4vw, 48px)', fontWeight: 600, color: '#fafaf9',
                  fontFamily: H.mono, fontVariantNumeric: 'tabular-nums', letterSpacing: -1.6,
                }}>
                  <CountUp to={s.v} {...s.fmt} />
                </div>
                <div style={{ fontFamily: H.mono, fontSize: 10.5, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 }}>
                  {s.k}
                </div>
              </div>
            ))}
          </div>
          {/* chart */}
          <div className="mv-reveal" data-d="3" style={{
            background: '#17120f', border: `1px solid #292524`, borderRadius: 6, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: H.mono, fontSize: 10.5, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.5 }}>monthly recurring revenue</div>
                <div style={{ fontFamily: H.mono, fontSize: 28, fontWeight: 600, color: '#fafaf9', letterSpacing: -1, marginTop: 4 }}>$156k <span style={{ color: H.good, fontSize: 12 }}>+13%</span></div>
              </div>
              <span style={{ fontFamily: H.mono, fontSize: 10, color: '#a8a29e' }}>last 12 mo · USD</span>
            </div>
            <DrawingChart />
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 07 · TESTIMONIAL STRIP
// ═══════════════════════════════════════════════════════════
function Testimonials() {
  const quotes = [
    { q: 'Closed our first month with no spreadsheet for the first time in 6 years.', who: 'Amelia Cho', role: 'Owner · Maple Coffee · Oakland', tone: 'staffing' },
    { q: 'Replaced four logins. The crew actually uses it because the punch screen is faster than the wall clock.', who: 'Devon Park', role: 'GM · North Pine Salon', tone: 'punch' },
    { q: 'Inventory used to be Wednesday night and a glass of wine. Now it\'s Wednesday afternoon.', who: 'Reza Ahmadi', role: 'Co-owner · Olive & Stone Bakery', tone: 'inventory' },
  ];
  return (
    <section id="customers" style={{ padding: '120px 32px', background: H.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="mv-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 48 }}>
          <MonoTag border={false}>05 · in their words</MonoTag>
          <DotLeader />
          <a href="#all" style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec, textDecoration: 'none' }}>read all 318 →</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {quotes.map((t, i) => (
            <figure key={i} className="mv-reveal" data-d={String(i + 1)} style={{
              margin: 0, padding: 28, background: H.paper, border: `1px solid ${H.border}`, borderRadius: 4,
              display: 'flex', flexDirection: 'column', gap: 24, minHeight: 260,
            }}>
              <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                /{t.tone}
              </span>
              <blockquote style={{
                margin: 0, fontSize: 19, lineHeight: 1.42, fontWeight: 500,
                letterSpacing: -0.4, color: H.text, textWrap: 'pretty',
              }}>
                "{t.q}"
              </blockquote>
              <div style={{ flex: 1 }} />
              <figcaption style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${H.border}`, paddingTop: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 99, background: H.panel,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: H.mono, fontSize: 12, fontWeight: 600, color: H.text,
                }}>{t.who.split(' ').map(x => x[0]).join('')}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: H.ink }}>{t.who}</div>
                  <div style={{ fontSize: 11.5, color: H.sec }}>{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 08 · PRICING (compact, 2 plans)
// ═══════════════════════════════════════════════════════════
function Pricing() {
  const plans = [
    {
      tag: '01', name: 'Operator', price: 49, sub: 'per location · per month',
      hl: false,
      list: ['Up to 12 staff', 'All 6 modules', 'iOS + Android apps', 'Email support · 24h'],
    },
    {
      tag: '02', name: 'Multi', price: 129, sub: 'per location · per month',
      hl: true,
      list: ['Unlimited staff', 'All 6 modules + analytics', 'Multi-location dashboard', 'Priority support · 4h median', 'Onboarding call'],
    },
  ];
  return (
    <section id="pricing" style={{ padding: '120px 32px', background: H.bg, borderTop: `1px solid ${H.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="mv-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>06 · pricing</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: H.mono, fontSize: 10.5, color: H.sec }}>flat · per-location · no per-seat</span>
        </div>
        <h2 className="mv-reveal" data-d="1" style={{
          margin: '0 0 56px', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 600,
          letterSpacing: -1.6, lineHeight: 1.04, color: H.ink, maxWidth: 760, textWrap: 'balance',
        }}>
          Two plans. <span style={{ color: H.ter }}>No "contact sales".</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 880 }}>
          {plans.map((p, i) => (
            <div key={p.tag} className="mv-reveal" data-d={String(i + 1)} style={{
              padding: 32, borderRadius: 6,
              background: p.hl ? H.ink : H.paper,
              color: p.hl ? '#fff' : H.text,
              border: `1px solid ${p.hl ? H.ink : H.border}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <span style={{ fontFamily: H.mono, fontSize: 10.5, color: p.hl ? '#a8a29e' : H.sec, textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.tag} · {p.name}</span>
                {p.hl && <MonoTag border={false} color="#fafaf9">most picked</MonoTag>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 64, fontWeight: 600, fontFamily: H.sans, letterSpacing: -2.4, lineHeight: 1 }}>${p.price}</span>
                <span style={{ fontFamily: H.mono, fontSize: 12, color: p.hl ? '#a8a29e' : H.sec }}>/mo</span>
              </div>
              <div style={{ fontFamily: H.mono, fontSize: 11, color: p.hl ? '#a8a29e' : H.sec, marginBottom: 24 }}>{p.sub}</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.list.map(it => (
                  <li key={it} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13.5 }}>
                    <span style={{ fontFamily: H.mono, color: p.hl ? '#a8a29e' : H.ter, width: 12 }}>✓</span>
                    <span style={{ color: p.hl ? '#fafaf9' : H.text2 }}>{it}</span>
                  </li>
                ))}
              </ul>
              <a href="#start" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 28, padding: '12px 18px', borderRadius: 4,
                background: p.hl ? '#fafaf9' : H.ink, color: p.hl ? H.ink : '#fff',
                textDecoration: 'none', fontSize: 14, fontWeight: 500,
              }}>
                Start free · 30 days
                <span style={{ fontFamily: H.mono, fontSize: 12, opacity: 0.7 }}>→</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 09 · CTA + FOOTER
// ═══════════════════════════════════════════════════════════
function CTAFooter() {
  return (
    <section id="start" style={{
      padding: '120px 32px 0', background: H.bg, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 64 }}>
          <div className="mv-reveal" style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <NotchM size={48} fg={H.ink} />
          </div>
          <h2 className="mv-reveal" data-d="1" style={{
            margin: 0, fontSize: 'clamp(56px, 12vw, 180px)', fontWeight: 600,
            letterSpacing: '-0.06em', lineHeight: 0.94, color: H.ink, textWrap: 'balance',
          }}>
  never run<br/>out again.
          </h2>
          <p className="mv-reveal" data-d="2" style={{
            margin: '32px auto 0', maxWidth: 600, fontSize: 18, color: H.text3, lineHeight: 1.5, textWrap: 'pretty',
          }}>
            Connect your POS. We learn your sales for seven days, then start telling you what to order \u2014 to the case, by the day. Median forecast error: 7.2%.
          </p>
          <div className="mv-reveal" data-d="3" style={{
            marginTop: 40, display: 'flex', justifyContent: 'center', gap: 12,
          }}>
            <MagneticButton primary>Start free · 30 days</MagneticButton>
            <MagneticButton href="#demo">Book a 20-min walkthrough</MagneticButton>
          </div>
        </div>

        {/* Footer rule */}
        <div style={{
          marginTop: 80, paddingTop: 28, paddingBottom: 28,
          borderTop: `1px solid ${H.border}`,
          display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 32,
          fontFamily: H.mono, fontSize: 11, color: H.sec, alignItems: 'start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NotchM size={14} fg={H.ink} />
              <Wordmark size={13} ls={-0.6} />
            </div>
            <span>© 2026 Merchiva, Inc.</span>
            <span>Oakland · Brooklyn · remote-first</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              ['Product', ['Staffing', 'POS', 'Inventory', 'Books', 'Site builder']],
              ['Company', ['About', 'Customers', 'Careers · 4 open']],
              ['Resources', ['Docs', 'Changelog', 'Status', 'Brand kit']],
              ['Legal', ['Privacy', 'Terms', 'DPA', 'Security']],
            ].map(([h, items]) => (
              <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ color: H.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
                {items.map(x => <a key={x} href="#" style={{ color: H.sec, textDecoration: 'none' }}>{x}</a>)}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span><span style={{ color: H.good }}>●</span> all systems · 99.99% · 30d</span>
            <span>v3.4.812 · build a8c14f</span>
            <span>{new Date().toUTCString().split(' ').slice(0,4).join(' ')} · UTC</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════
function HomeApp() {
  useReveal();
  return (
    <main style={{ background: H.bg, color: H.text, fontFamily: H.sans }}>
      <Nav />
      <Hero />
      <LiveDashboard />
      <Marquee />
      <FeatureGrid />
      <Metrics />
      <Testimonials />
      <Pricing />
      <CTAFooter />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<HomeApp />);
