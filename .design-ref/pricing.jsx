// ═══════════════════════════════════════════════════════════
// Merchiva — Pricing page (fancy + heavily animated)
// Inventory-forecasting focused. Reuses Merchiva brand vocab.
// ═══════════════════════════════════════════════════════════

const { useState: pUS, useEffect: pUE, useRef: pUR, useMemo: pUM, useLayoutEffect: pUL } = React;

const P = {
  bg:       '#f0eee9',
  bgWarm:   '#e8e4dc',
  paper:    '#ffffff',
  surface:  '#fafaf9',
  panel:    '#f5f5f4',
  ink:      '#0c0a09',
  inkSoft:  '#17120f',
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
  accentSoft: 'oklch(0.92 0.04 65)',
  mono:     "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:     "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// ─── Inject keyframes ──────────────────────────────────────
(function injectPK() {
  if (document.getElementById('mv-pricing-kf')) return;
  const s = document.createElement('style');
  s.id = 'mv-pricing-kf';
  s.textContent = `
    @keyframes pBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    @keyframes pDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-40px, -40px, 0); } }
    @keyframes pMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    @keyframes pFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pLetterIn { from { opacity: 0; transform: translateY(40px) scale(0.96); filter: blur(8px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
    @keyframes pSpin { to { transform: rotate(360deg); } }
    @keyframes pBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes pRise { from { transform: scaleY(0); opacity: 0.4; } to { transform: scaleY(1); opacity: 1; } }
    @keyframes pSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
    @keyframes pDash { to { stroke-dashoffset: 0; } }
    @keyframes pGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,0); } 50% { box-shadow: 0 0 0 8px rgba(217,119,6,0.15); } }
    @keyframes pFlash { 0% { background: ${P.accentSoft}; } 100% { background: transparent; } }
    @keyframes pTickerY { 0% { transform: translateY(110%); } 12% { transform: translateY(0); } 88% { transform: translateY(0); } 100% { transform: translateY(-110%); } }
    @keyframes pNumberShuffle { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .p-reveal { opacity: 0; transform: translateY(24px); transition: opacity 700ms cubic-bezier(.2,.8,.2,1), transform 700ms cubic-bezier(.2,.8,.2,1); }
    .p-reveal.in { opacity: 1; transform: none; }
    .p-reveal[data-d="1"] { transition-delay: 80ms; }
    .p-reveal[data-d="2"] { transition-delay: 160ms; }
    .p-reveal[data-d="3"] { transition-delay: 240ms; }
    .p-reveal[data-d="4"] { transition-delay: 320ms; }
    .p-reveal[data-d="5"] { transition-delay: 400ms; }
    html { scroll-behavior: smooth; }
    ::selection { background: ${P.ink}; color: ${P.bg}; }
  `;
  document.head.appendChild(s);
})();

// ─── Hooks ──────────────────────────────────────────────────
function useTickP(fps = 30, run = true) {
  const [, setTick] = pUS(0);
  pUE(() => {
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
  pUE(() => {
    const els = document.querySelectorAll('.p-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useMouseP() {
  const [m, setM] = pUS({ x: 0.5, y: 0.5 });
  pUE(() => {
    const onMove = (e) => setM({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return m;
}

// ─── Brand bits ─────────────────────────────────────────────
function NotchM({ size = 28, fg = P.ink, bg = 'transparent' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ background: bg, borderRadius: 3, display: 'block' }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}
function Wordmark({ size = 22, color = P.ink, weight = 600, ls = -1.2 }) {
  return <span style={{ fontFamily: P.sans, fontWeight: weight, fontSize: size, color, letterSpacing: ls, lineHeight: 1 }}>Merchiva</span>;
}
function MonoTag({ children, color = P.sec, border = true }) {
  return (
    <span style={{
      fontFamily: P.mono, fontSize: 10.5, color, letterSpacing: 0.4, textTransform: 'uppercase',
      border: border ? `1px solid ${P.border}` : 'none',
      padding: border ? '4px 8px' : 0, borderRadius: 3, background: border ? P.paper : 'transparent',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</span>
  );
}
function DotLeader({ color = P.borderD }) {
  return (<div style={{ flex: 1, height: 1, borderTop: `1px dashed ${color}`, transform: 'translateY(-2px)' }} />);
}

// ═══════════════════════════════════════════════════════════
// 01 · NAV
// ═══════════════════════════════════════════════════════════
function Nav() {
  const [scrolled, setScrolled] = pUS(false);
  pUE(() => {
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
      borderBottom: `1px solid ${scrolled ? P.border : 'transparent'}`,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32 }}>
        <a href="Home.html" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: P.ink }}>
          <NotchM size={22} />
          <Wordmark size={17} ls={-0.8} />
        </a>
        <div style={{ display: 'flex', gap: 24, marginLeft: 24 }}>
          {[['Forecast','Home.html#product'],['Modules','Home.html#modules'],['Pricing','#'],['Customers','Home.html#customers'],['Changelog','#']].map(([x,h]) => (
            <a key={x} href={h} style={{
              fontSize: 13, color: x === 'Pricing' ? P.ink : P.text3, textDecoration: 'none',
              fontWeight: x === 'Pricing' ? 600 : 500, letterSpacing: -0.1,
            }}>{x}</a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec, letterSpacing: 0.3 }}>
            v3.4 <span style={{ color: P.good }}>●</span> live
          </span>
          <a href="#" style={{ fontSize: 13, color: P.text2, textDecoration: 'none', fontWeight: 500, padding: '6px 10px' }}>Sign in</a>
          <a href="#start" style={{
            fontSize: 13, fontWeight: 500, color: '#fff', background: P.ink, textDecoration: 'none',
            padding: '8px 14px', borderRadius: 4, letterSpacing: -0.1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>Start free <span style={{ fontFamily: P.mono, fontSize: 11, opacity: 0.7 }}>→</span></a>
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════
// 02 · HERO — Animated headline with shuffling price
// ═══════════════════════════════════════════════════════════

function ShufflingDigits({ value, duration = 1400, fontSize = 200 }) {
  // value is integer; shuffles digits before settling
  const ref = pUR(null);
  const [shown, setShown] = pUS(0);
  pUE(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) {
          const start = performance.now();
          let raf;
          const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            if (t < 0.85) {
              setShown(Math.floor(Math.random() * 999));
              raf = requestAnimationFrame(tick);
            } else {
              setShown(value);
            }
          };
          raf = requestAnimationFrame(tick);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  const str = String(shown).padStart(2, '0');
  return (
    <span ref={ref} style={{ fontFamily: P.sans, fontSize, fontWeight: 600, letterSpacing: '-0.06em', fontVariantNumeric: 'tabular-nums', color: P.ink, display: 'inline-flex' }}>
      {str.split('').map((d, i) => <span key={i} style={{ display: 'inline-block', minWidth: '0.55em', textAlign: 'center' }}>{d}</span>)}
    </span>
  );
}

function HeroBackdrop() {
  const m = useMouseP();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: '-40px',
        backgroundImage: `radial-gradient(${P.borderD} 1px, transparent 1px)`,
        backgroundSize: '24px 24px', opacity: 0.6,
        animation: 'pDrift 18s linear infinite',
        maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)',
      }} />
      <div style={{
        position: 'absolute',
        left: `calc(${m.x * 100}% - 320px)`, top: `calc(${m.y * 100}% - 320px)`,
        width: 640, height: 640, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,119,6,0.08), transparent 60%)',
        transition: 'left 240ms ease-out, top 240ms ease-out',
      }} />
    </div>
  );
}

function HeroHeadline({ pricePerLoc }) {
  // "pricing / that scales / with your shelves." letter-by-letter
  const lines = ['simple', 'pricing.'];
  let idx = 0;
  return (
    <h1 style={{
      margin: 0, fontFamily: P.sans, fontWeight: 600,
      fontSize: 'clamp(72px, 12vw, 200px)', lineHeight: 0.92,
      letterSpacing: '-0.06em', color: P.ink,
    }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: 'flex', flexWrap: 'nowrap' }}>
          {line.split('').map((c) => {
            const i = idx++;
            return (
              <span key={i} style={{
                display: 'inline-block',
                color: c === '.' ? P.accent : 'inherit',
                whiteSpace: 'pre',
                animation: `pLetterIn 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 50}ms both`,
              }}>{c === ' ' ? '\u00A0' : c}</span>
            );
          })}
        </div>
      ))}
    </h1>
  );
}

function Hero() {
  return (
    <section style={{
      position: 'relative', paddingTop: 140, paddingBottom: 80,
      paddingLeft: 32, paddingRight: 32, overflow: 'hidden',
    }}>
      <HeroBackdrop />
      <div style={{ position: 'relative', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36, animation: 'pFadeUp 700ms 60ms both' }}>
          <MonoTag>
            <span style={{ width: 6, height: 6, background: P.good, borderRadius: '50%' }} />
            01 · pricing · effective may 2026
          </MonoTag>
          <span style={{ fontSize: 13, color: P.sec, letterSpacing: -0.1 }}>
            Per-location, flat. No per-seat. No per-SKU. No "contact sales".
          </span>
        </div>

        <HeroHeadline />

        <div style={{
          marginTop: 48, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, alignItems: 'end',
          animation: 'pFadeUp 800ms 700ms both',
        }}>
          <p style={{
            margin: 0, fontSize: 22, lineHeight: 1.4, color: P.text2,
            letterSpacing: -0.3, maxWidth: 640, fontWeight: 400, textWrap: 'pretty',
          }}>
            One forecast engine, three plans. Start free for 30 days, then pay per location — your forecasts, your reorder POs, your data, all included. <em style={{ color: P.ink, fontStyle: 'normal', fontWeight: 600 }}>Cancel any time.</em>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              fontFamily: P.mono, fontSize: 12, color: P.text2, padding: '10px 14px',
              border: `1px solid ${P.border}`, background: P.paper, borderRadius: 4, lineHeight: 1.5,
            }}>
              <div><span style={{ color: P.ter }}>$</span> merchiva pricing.median_payback</div>
              <div style={{ color: P.good }}>→ 11 days</div>
            </div>
            <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec, letterSpacing: 0.3 }}>
              based on 2,841 customers · stockouts × margin
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 03 · BILLING TOGGLE + PLAN CARDS
// ═══════════════════════════════════════════════════════════

const PLAN_DATA = [
  {
    id: 'starter', tag: 'P01', name: 'Starter',
    sub: 'For one shop, getting set up.',
    monthly: 49, yearly: 39,
    features: [
      'Up to 250 SKUs',
      'Daily forecasts · 14-day window',
      '80% confidence bands',
      'Auto reorder suggestions',
      'Email + Slack alerts',
      'CSV export',
      'Email support · 24h',
    ],
    notIncluded: ['Hourly forecasts', 'Multi-location', 'API access'],
    cta: 'Start free · 30 days', highlight: false,
  },
  {
    id: 'operator', tag: 'P02', name: 'Operator',
    sub: 'For shops that run on the forecast.',
    monthly: 129, yearly: 99,
    features: [
      'Unlimited SKUs',
      'Hourly forecasts · 90-day window',
      '95% confidence bands · calibrated',
      'Driver attribution · weather, payday, holiday',
      'Auto-send POs to vendors',
      'Multi-location dashboard',
      'API + webhooks',
      'Priority support · 4h median',
      'Onboarding call',
    ],
    notIncluded: ['Custom models', 'SLA · 99.99%'],
    cta: 'Start free · 30 days', highlight: true,
  },
  {
    id: 'chain', tag: 'P03', name: 'Chain',
    sub: 'For 5+ locations and groups.',
    monthly: 'Custom', yearly: 'Custom',
    features: [
      'Everything in Operator',
      'Custom forecast models per region',
      'Cross-location stock balancing',
      'Vendor scorecards',
      'SSO + SCIM',
      'SLA · 99.99% · 30d',
      'Dedicated CSM',
      'Quarterly forecast review',
    ],
    notIncluded: [],
    cta: 'Talk to founders', highlight: false,
  },
];

function BillingToggle({ yearly, setYearly }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 0,
      padding: 4, background: P.paper, border: `1px solid ${P.border}`, borderRadius: 6,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 4, bottom: 4,
        width: 'calc(50% - 4px)',
        left: yearly ? 'calc(50% + 0px)' : 4,
        background: P.ink, borderRadius: 4,
        transition: 'left 320ms cubic-bezier(.2,.8,.2,1)',
      }} />
      {[
        { l: 'Monthly', v: false },
        { l: 'Yearly', v: true, save: '−20%' },
      ].map(o => (
        <button key={o.l} onClick={() => setYearly(o.v)} style={{
          position: 'relative', zIndex: 1, padding: '8px 18px', borderRadius: 4,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: P.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
          color: yearly === o.v ? '#fff' : P.text2,
          transition: 'color 220ms', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {o.l}
          {o.save && (
            <span style={{
              fontFamily: P.mono, fontSize: 9.5, padding: '2px 5px', borderRadius: 2,
              background: yearly === o.v ? 'rgba(255,255,255,0.16)' : P.accentSoft,
              color: yearly === o.v ? '#fff' : P.accent, letterSpacing: 0.3,
            }}>{o.save}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function CountUpInline({ to, prefix = '', suffix = '', duration = 800 }) {
  // animates whenever `to` changes
  const [v, setV] = pUS(to);
  pUE(() => {
    const start = performance.now();
    const from = v;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setV(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{prefix}{Math.round(v)}{suffix}</span>;
}

function PlanCard({ plan, idx, yearly }) {
  const [hover, setHover] = pUS(false);
  const price = yearly ? plan.yearly : plan.monthly;
  const hl = plan.highlight;
  return (
    <div className="p-reveal" data-d={String(idx + 1)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', padding: 32, borderRadius: 8,
        background: hl ? P.ink : (hover ? P.paper : P.surface),
        color: hl ? '#fff' : P.text,
        border: `1px solid ${hl ? P.ink : P.border}`,
        transform: hover ? 'translateY(-6px)' : (hl ? 'translateY(-3px)' : 'none'),
        boxShadow: hl
          ? '0 32px 80px -28px rgba(28,25,23,0.45), 0 8px 24px -12px rgba(28,25,23,0.18)'
          : (hover ? '0 22px 60px -22px rgba(28,25,23,0.22)' : '0 4px 12px -8px rgba(28,25,23,0.06)'),
        transition: 'transform 280ms cubic-bezier(.2,.8,.2,1), background 200ms, box-shadow 280ms',
        overflow: 'hidden',
      }}>
      {/* subtle shimmer sweep on highlighted */}
      {hl && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)',
          backgroundSize: '200% 100%',
          animation: 'pSweep 6s ease-in-out infinite',
        }} />
      )}
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'relative' }}>
        <span style={{
          fontFamily: P.mono, fontSize: 10.5,
          color: hl ? '#a8a29e' : P.sec, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{plan.tag} · {plan.name}</span>
        {hl && (
          <span style={{
            fontFamily: P.mono, fontSize: 9.5, padding: '4px 8px', borderRadius: 99,
            background: 'rgba(255,255,255,0.12)', color: '#fafaf9', letterSpacing: 0.4,
            border: '1px solid rgba(255,255,255,0.18)',
          }}>most picked · 68%</span>
        )}
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13.5, lineHeight: 1.5, color: hl ? '#d6d3d1' : P.text3, position: 'relative' }}>
        {plan.sub}
      </p>
      {/* price */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4, position: 'relative' }}>
        {typeof price === 'number' ? (
          <>
            <span style={{ fontSize: 64, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2.4, lineHeight: 1, color: hl ? '#fafaf9' : P.ink }}>$</span>
            <span style={{ fontSize: 64, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2.4, lineHeight: 1, color: hl ? '#fafaf9' : P.ink }}>
              <CountUpInline to={price} duration={500} />
            </span>
          </>
        ) : (
          <span style={{ fontSize: 56, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2, lineHeight: 1, color: hl ? '#fafaf9' : P.ink }}>{price}</span>
        )}
        {typeof price === 'number' && (
          <span style={{ fontFamily: P.mono, fontSize: 12, color: hl ? '#a8a29e' : P.sec }}>/mo</span>
        )}
      </div>
      <div style={{ fontFamily: P.mono, fontSize: 11, color: hl ? '#a8a29e' : P.sec, marginBottom: 24, position: 'relative' }}>
        {typeof price === 'number'
          ? <>per location · billed {yearly ? 'yearly' : 'monthly'}</>
          : 'volume discounts · annual contract'}
      </div>
      {/* features */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9, position: 'relative' }}>
        {plan.features.map((it, i) => (
          <li key={it} style={{
            display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13,
            opacity: 0, animation: hover ? `pFadeUp 360ms cubic-bezier(.2,.8,.2,1) ${i * 35}ms forwards` : 'pFadeUp 540ms cubic-bezier(.2,.8,.2,1) forwards',
            animationDelay: `${i * 35 + 100}ms`,
          }}>
            <span style={{
              fontFamily: P.mono, color: hl ? '#fafaf9' : P.ink, width: 14,
              flexShrink: 0, fontSize: 12, fontWeight: 600,
            }}>✓</span>
            <span style={{ color: hl ? '#fafaf9' : P.text2, lineHeight: 1.4 }}>{it}</span>
          </li>
        ))}
        {plan.notIncluded.map((it) => (
          <li key={it} style={{
            display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13,
            color: hl ? '#78716c' : P.ter, textDecoration: 'line-through',
          }}>
            <span style={{ fontFamily: P.mono, width: 14, flexShrink: 0, fontSize: 11 }}>×</span>
            <span style={{ lineHeight: 1.4 }}>{it}</span>
          </li>
        ))}
      </ul>
      {/* cta */}
      <a href="#start" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 28, padding: '14px 18px', borderRadius: 4, position: 'relative',
        background: hl ? '#fafaf9' : P.ink, color: hl ? P.ink : '#fff',
        textDecoration: 'none', fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
        transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}>
        {plan.cta}
        <span style={{ fontFamily: P.mono, fontSize: 12, opacity: 0.7 }}>→</span>
      </a>
    </div>
  );
}

function PlansSection({ yearly, setYearly }) {
  return (
    <section style={{ padding: '40px 32px 100px', background: P.bg, position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="p-reveal" style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
          <BillingToggle yearly={yearly} setYearly={setYearly} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {PLAN_DATA.map((p, i) => <PlanCard key={p.id} plan={p} idx={i} yearly={yearly} />)}
        </div>
        {/* footnote row */}
        <div className="p-reveal" data-d="3" style={{
          marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center',
          fontFamily: P.mono, fontSize: 11, color: P.sec, letterSpacing: 0.3,
        }}>
          <span><span style={{ color: P.good }}>✓</span> 30-day free trial · all plans</span>
          <span><span style={{ color: P.good }}>✓</span> no card to start</span>
          <span><span style={{ color: P.good }}>✓</span> cancel any time · pro-rated refund</span>
          <span><span style={{ color: P.good }}>✓</span> data export on day one</span>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 04 · ROI CALCULATOR — animated chart
// ═══════════════════════════════════════════════════════════

function ROICalculator() {
  const [skus, setSkus] = pUS(180);
  const [aov, setAov] = pUS(8);     // avg order value, $
  const [orders, setOrders] = pUS(220); // daily orders
  const [margin, setMargin] = pUS(35); // %

  // Simple model: forecast saves ~3% of GMV via avoided stockouts + reduced waste
  const dailyGMV = aov * orders;
  const monthlyGMV = dailyGMV * 30;
  const monthlySaved = monthlyGMV * 0.03;
  const monthlyMargin = monthlySaved * (margin / 100);
  const planCost = skus > 250 ? 129 : 49;
  const monthlyROI = monthlyMargin - planCost;
  const payback = monthlyMargin > 0 ? (planCost / monthlyMargin) * 30 : 0;

  // Animated chart: 12 bars showing month-by-month savings vs cost
  const months = Array.from({ length: 12 }, (_, i) => i);
  const savedBars = months.map(() => monthlyMargin);
  const costBars = months.map(() => planCost);

  return (
    <section style={{
      padding: '120px 32px', background: P.ink, color: P.bg,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        maskImage: 'radial-gradient(ellipse at 30% 30%, black 30%, transparent 75%)',
      }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div className="p-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 24, color: '#a8a29e' }}>
          <span style={{ fontFamily: P.mono, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase' }}>02 · roi calculator</span>
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed #44403c`, transform: 'translateY(-2px)' }} />
          <span style={{ fontFamily: P.mono, fontSize: 10.5 }}>drag · live update</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: '0 0 56px', fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 600,
          letterSpacing: -1.8, lineHeight: 1.04, color: '#fafaf9', maxWidth: 900, textWrap: 'balance',
        }}>
          Pays back in <span style={{ color: P.accent }}><CountUpInline to={Math.max(1, Math.round(payback))} duration={420} /></span> days. <span style={{ color: '#78716c' }}>For your shop, today.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 64, alignItems: 'start' }}>
          {/* sliders */}
          <div className="p-reveal" data-d="2" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {[
              { l: 'SKUs you stock', v: skus, set: setSkus, min: 30, max: 1200, step: 10, fmt: x => x.toString() },
              { l: 'Daily orders', v: orders, set: setOrders, min: 30, max: 1500, step: 10, fmt: x => x.toString() },
              { l: 'Average order', v: aov, set: setAov, min: 3, max: 80, step: 1, fmt: x => `$${x}` },
              { l: 'Gross margin', v: margin, set: setMargin, min: 10, max: 70, step: 1, fmt: x => `${x}%` },
            ].map(s => (
              <div key={s.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontFamily: P.mono, fontSize: 10.5, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.l}</span>
                  <span style={{ fontFamily: P.mono, fontSize: 18, fontWeight: 600, color: '#fafaf9', fontVariantNumeric: 'tabular-nums' }}>{s.fmt(s.v)}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={s.v}
                  onChange={e => s.set(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: P.accent, cursor: 'pointer' }} />
              </div>
            ))}
          </div>
          {/* output */}
          <div className="p-reveal" data-d="3" style={{
            background: '#17120f', border: `1px solid #292524`, borderRadius: 6, padding: 28,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 28 }}>
              {[
                { k: 'Monthly savings · est.', v: `$${Math.round(monthlyMargin).toLocaleString()}`, c: P.accent },
                { k: 'Plan cost', v: `$${planCost}`, c: '#fafaf9' },
                { k: 'Monthly ROI', v: `$${Math.round(monthlyROI).toLocaleString()}`, c: P.good },
                { k: 'Payback period', v: `${Math.max(1, Math.round(payback))}d`, c: '#fafaf9' },
              ].map(s => (
                <div key={s.k}>
                  <div style={{ fontFamily: P.mono, fontSize: 9.5, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.k}</div>
                  <div style={{ fontFamily: P.mono, fontSize: 28, fontWeight: 600, color: s.c, letterSpacing: -1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                </div>
              ))}
            </div>
            {/* chart */}
            <div style={{ borderTop: '1px solid #292524', paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: P.mono, fontSize: 10, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.4 }}>12-month projection</span>
                <span style={{ fontFamily: P.mono, fontSize: 10, color: '#a8a29e' }}>● savings <span style={{ color: '#78716c' }}>● cost</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
                {months.map((m, i) => {
                  const max = Math.max(...savedBars, 1);
                  const h = Math.min(100, (savedBars[i] / max) * 100);
                  const cH = Math.min(100, (costBars[i] / max) * 100);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2, height: 100 }}>
                      <div style={{ height: `${h}%`, background: P.accent, transformOrigin: 'bottom', animation: 'pRise 600ms cubic-bezier(.2,.8,.2,1) both', animationDelay: `${i * 30}ms`, borderRadius: '2px 2px 0 0' }} />
                      <div style={{ height: `${cH * 0.4}%`, background: '#44403c', transformOrigin: 'bottom', animation: 'pRise 600ms cubic-bezier(.2,.8,.2,1) both', animationDelay: `${i * 30 + 150}ms`, borderRadius: '0 0 2px 2px' }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: P.mono, fontSize: 9, color: '#78716c' }}>
                <span>now</span><span>+12 mo · $<CountUpInline to={Math.round(monthlyMargin * 12)} duration={400} /> saved</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 05 · COMPARE TABLE — animated highlight row
// ═══════════════════════════════════════════════════════════

function CompareTable() {
  const cols = ['Feature', 'Starter', 'Operator', 'Chain'];
  const rows = [
    { label: 'SKUs',                   vals: ['250',     '∞',     '∞']      },
    { label: 'Forecast horizon',        vals: ['14 days', '90 days','90 days'] },
    { label: 'Forecast granularity',    vals: ['daily',   'hourly', 'hourly']  },
    { label: 'Confidence bands',        vals: ['80%',     '80% + 95%','80% + 95%'] },
    { label: 'Driver attribution',      vals: ['—',       '✓',      '✓ + custom'] },
    { label: 'Auto reorder POs',        vals: ['suggest', 'send',   'send + balance'] },
    { label: 'Multi-location',          vals: ['—',       '✓',      '✓ + cross-bal'] },
    { label: 'Custom regional models',  vals: ['—',       '—',      '✓'] },
    { label: 'API + webhooks',          vals: ['—',       '✓',      '✓'] },
    { label: 'SSO + SCIM',              vals: ['—',       '—',      '✓'] },
    { label: 'Support · first reply',   vals: ['24h',     '4h',     '30m'] },
    { label: 'SLA',                     vals: ['—',       '—',      '99.99% / 30d'] },
  ];

  // animated highlight row that moves down through the table
  useTickP(2);
  const t = Math.floor((performance.now() / 900) % rows.length);

  return (
    <section style={{ padding: '120px 32px', background: P.bg }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="p-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>03 · the full table</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>everything · in writing</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: '0 0 48px', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 600,
          letterSpacing: -1.6, lineHeight: 1.04, color: P.ink, maxWidth: 800, textWrap: 'balance',
        }}>
          What's in. <span style={{ color: P.ter }}>What's not.</span>
        </h2>
        <div className="p-reveal" data-d="2" style={{
          background: P.paper, border: `1px solid ${P.border}`, borderRadius: 6, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
            background: P.surface, borderBottom: `1px solid ${P.border}`,
          }}>
            {cols.map((c, i) => (
              <div key={c} style={{
                padding: '16px 20px',
                fontFamily: P.mono, fontSize: 10.5, color: P.sec,
                textTransform: 'uppercase', letterSpacing: 0.5,
                background: i === 2 ? P.panel : 'transparent',
                fontWeight: i === 2 ? 600 : 500,
                color: i === 2 ? P.ink : P.sec,
              }}>{c}</div>
            ))}
          </div>
          {rows.map((r, ri) => {
            const isHighlight = ri === t;
            return (
              <div key={r.label} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
                borderBottom: ri < rows.length - 1 ? `1px solid ${P.border}` : 'none',
                background: isHighlight ? 'rgba(217,119,6,0.05)' : 'transparent',
                transition: 'background 600ms ease',
              }}>
                <div style={{ padding: '14px 20px', fontSize: 13, fontWeight: 500, color: P.text }}>{r.label}</div>
                {r.vals.map((v, ci) => (
                  <div key={ci} style={{
                    padding: '14px 20px', fontFamily: v === '—' ? P.sans : P.mono, fontSize: 13,
                    color: v === '—' ? P.ter : P.text,
                    background: ci === 1 ? (isHighlight ? 'rgba(217,119,6,0.08)' : P.surface) : 'transparent',
                    fontWeight: ci === 1 ? 600 : 400,
                  }}>{v}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 06 · LIVE TICKER — "right now · across merchiva"
// ═══════════════════════════════════════════════════════════

const TICKER_EVENTS = [
  ['Maple Coffee · Oakland',   'reordered 14 cases · oat milk 1L'],
  ['Ritual Bagels · Brooklyn', 'forecast updated · bagels +22% Sat'],
  ['North Pine Salon · LA',    'stockout averted · color L\'Oréal 6N'],
  ['Olive & Stone · Austin',   'weather signal · +18% iced drinks'],
  ['Brushstroke · Denver',     'auto-PO sent · $1,284 to Pacific'],
  ['Ember & Vine · Portland',  'cold-start · new SKU “matcha 12oz”'],
  ['Cobalt Body Shop · SF',    'safety stock raised · bumpers +15%'],
  ['Pourover Co · Seattle',    'forecast accuracy · 6.4% MAPE · 30d'],
];

function TickerStrip() {
  const [tick, setTick] = pUS(0);
  pUE(() => {
    const id = setInterval(() => setTick(t => t + 1), 2400);
    return () => clearInterval(id);
  }, []);
  const visible = Array.from({ length: 5 }, (_, i) => TICKER_EVENTS[(tick + i) % TICKER_EVENTS.length]);
  return (
    <section style={{ padding: '60px 32px', background: P.bgWarm, borderTop: `1px solid ${P.border}`, borderBottom: `1px solid ${P.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: P.good, animation: 'pBounce 1.4s ease-in-out infinite' }} />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec, textTransform: 'uppercase', letterSpacing: 0.5 }}>04 · right now · across merchiva</span>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>every event · anonymized</span>
        </div>
        <div style={{
          height: 220, overflow: 'hidden', position: 'relative',
          border: `1px solid ${P.border}`, borderRadius: 4, background: P.paper,
        }}>
          {visible.map(([who, what], i) => (
            <div key={`${tick}-${i}`} style={{
              padding: '12px 20px', borderBottom: `1px solid ${P.border}`,
              display: 'flex', alignItems: 'baseline', gap: 16, fontSize: 13.5,
              animation: 'pFadeUp 480ms cubic-bezier(.2,.8,.2,1) both',
              animationDelay: `${i * 40}ms`,
              background: i === 0 ? `linear-gradient(90deg, ${P.accentSoft} 0%, transparent 60%)` : 'transparent',
              transition: 'background 800ms',
            }}>
              <span style={{ fontFamily: P.mono, fontSize: 10, color: P.sec, width: 50 }}>
                {String(Math.floor(Math.random() * 60)).padStart(2, '0')}s
              </span>
              <span style={{ fontWeight: 600, color: P.ink, minWidth: 240 }}>{who}</span>
              <span style={{ color: P.text2 }}>{what}</span>
              <DotLeader />
              <span style={{ fontFamily: P.mono, fontSize: 10, color: P.sec }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 07 · FAQ — animated accordion
// ═══════════════════════════════════════════════════════════

const FAQS = [
  { q: 'How accurate is the forecast, really?',
    a: 'Median MAPE across all customers is 7.2% on 14-day horizons after seven days of training data. Median rises to ~9% on cold-start SKUs (no history), and falls to ~5% by day 60. We publish these numbers monthly on the changelog.' },
  { q: 'What POS systems do you connect to?',
    a: 'Square, Toast, Clover, Lightspeed, Shopify POS, and our own Merchiva POS. CSV import works for everything else. New connectors are added monthly — vote on the public roadmap.' },
  { q: 'Do I have to use Merchiva POS to get forecasting?',
    a: 'No. The forecasting engine works with any connected POS or CSV feed. You can use Merchiva forecasting and keep your existing register.' },
  { q: 'What happens after the 30-day trial?',
    a: 'Your account converts to your selected plan and you\'re billed for the next month. We email you 7, 3, and 1 day before. If you don\'t add a card, the account pauses — your data stays for 90 days.' },
  { q: 'Is there a per-SKU charge?',
    a: 'No. SKU caps apply on Starter (250). Operator and Chain are unlimited. We will never charge per forecast, per API call, or per PO.' },
  { q: 'Can I cancel any time?',
    a: 'Yes. Cancel from settings — pro-rated refund of any unused days. Data export (CSV + JSON) is available on every plan, every day.' },
  { q: 'Where does my data live?',
    a: 'US-East (Virginia) by default. EU customers can choose Frankfurt. SOC 2 Type II, HIPAA-eligible. We never train shared models on your private sales data without explicit opt-in.' },
];

function FAQ() {
  const [open, setOpen] = pUS(0);
  return (
    <section style={{ padding: '120px 32px', background: P.bg }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="p-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>05 · faq</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>still have a q? → hi@merchiva.app</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: '0 0 48px', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 600,
          letterSpacing: -1.6, lineHeight: 1.04, color: P.ink, textWrap: 'balance',
        }}>
          The honest answers.
        </h2>
        <div className="p-reveal" data-d="2" style={{ borderTop: `1px solid ${P.border}` }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${P.border}` }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{
                  width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                  padding: '22px 0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 24,
                  fontFamily: P.sans,
                }}>
                  <span style={{
                    fontFamily: P.mono, fontSize: 11, color: P.sec, letterSpacing: 0.4,
                    width: 28, flexShrink: 0,
                  }}>0{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 18, fontWeight: 500, color: P.ink, letterSpacing: -0.3 }}>{f.q}</span>
                  <span style={{
                    width: 22, height: 22, borderRadius: 99, border: `1px solid ${P.borderD}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: isOpen ? P.ink : 'transparent',
                    color: isOpen ? '#fff' : P.text2,
                    transition: 'all 240ms cubic-bezier(.2,.8,.2,1)',
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                    fontSize: 16, lineHeight: 1, fontWeight: 300,
                  }}>+</span>
                </button>
                <div style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 380ms cubic-bezier(.2,.8,.2,1)',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ paddingLeft: 52, paddingRight: 46, paddingBottom: 22, fontSize: 15, lineHeight: 1.6, color: P.text2, textWrap: 'pretty' }}>
                      {f.a}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 08 · LOGOS / TRUST + GUARANTEE
// ═══════════════════════════════════════════════════════════
function Trust() {
  const guarantees = [
    { tag: 'G1', title: '30-day money-back', body: 'Don\'t love it? Full refund, no questions.' },
    { tag: 'G2', title: 'Forecast accuracy SLA', body: 'On Operator & Chain. We refund the month if MAPE > 12%.' },
    { tag: 'G3', title: 'Price lock', body: 'Your monthly rate is locked for 24 months from signup.' },
    { tag: 'G4', title: 'Data portability', body: 'CSV + JSON export, every day, every plan.' },
  ];
  return (
    <section style={{ padding: '100px 32px', background: P.bg, borderTop: `1px solid ${P.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="p-reveal" style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>06 · guarantees</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>in writing · every contract</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: '0 0 56px', fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 600,
          letterSpacing: -1.4, lineHeight: 1.06, color: P.ink, maxWidth: 760, textWrap: 'balance',
        }}>
          Four promises. <span style={{ color: P.ter }}>Real ones.</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {guarantees.map((g, i) => (
            <div key={g.tag} className="p-reveal" data-d={String((i % 4) + 1)} style={{
              padding: 24, background: P.paper, border: `1px solid ${P.border}`, borderRadius: 4,
              minHeight: 200, display: 'flex', flexDirection: 'column', gap: 14,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 4, background: P.ink, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: P.mono, fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
              }}>{g.tag}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: P.ink, letterSpacing: -0.4 }}>{g.title}</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: P.text3, textWrap: 'pretty' }}>{g.body}</p>
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
    <section id="start" style={{ padding: '120px 32px 0', background: P.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 64 }}>
          <div className="p-reveal" style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <NotchM size={48} fg={P.ink} />
          </div>
          <h2 className="p-reveal" data-d="1" style={{
            margin: 0, fontSize: 'clamp(56px, 12vw, 180px)', fontWeight: 600,
            letterSpacing: '-0.06em', lineHeight: 0.94, color: P.ink, textWrap: 'balance',
          }}>
            try it<br/>for thirty days.
          </h2>
          <p className="p-reveal" data-d="2" style={{
            margin: '32px auto 0', maxWidth: 600, fontSize: 18, color: P.text3, lineHeight: 1.5, textWrap: 'pretty',
          }}>
            Connect your POS in two minutes. Get your first forecast in seven days. Cancel any time, full refund.
          </p>
          <div className="p-reveal" data-d="3" style={{
            marginTop: 40, display: 'flex', justifyContent: 'center', gap: 12,
          }}>
            <a href="#" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 22px', borderRadius: 4,
              background: P.ink, color: '#fff', textDecoration: 'none',
              fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
              animation: 'pGlow 2.6s ease-in-out infinite',
            }}>Start free · 30 days <span style={{ fontFamily: P.mono, fontSize: 12, opacity: 0.7 }}>→</span></a>
            <a href="#" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 22px', borderRadius: 4,
              background: 'transparent', color: P.ink,
              border: `1px solid ${P.borderD}`, textDecoration: 'none',
              fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
            }}>Book a 20-min walkthrough <span style={{ fontFamily: P.mono, fontSize: 12 }}>→</span></a>
          </div>
        </div>

        <div style={{
          marginTop: 80, paddingTop: 28, paddingBottom: 28,
          borderTop: `1px solid ${P.border}`,
          display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 32,
          fontFamily: P.mono, fontSize: 11, color: P.sec, alignItems: 'start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NotchM size={14} fg={P.ink} />
              <Wordmark size={13} ls={-0.6} />
            </div>
            <span>© 2026 Merchiva, Inc.</span>
            <span>Oakland · Brooklyn · remote-first</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              ['Product', ['Forecast', 'Reorder', 'Inventory', 'Signal']],
              ['Company', ['About', 'Customers', 'Careers · 4 open']],
              ['Resources', ['Docs', 'Changelog', 'Status', 'Brand kit']],
              ['Legal', ['Privacy', 'Terms', 'DPA', 'Security']],
            ].map(([h, items]) => (
              <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ color: P.text, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
                {items.map(x => <a key={x} href="#" style={{ color: P.sec, textDecoration: 'none' }}>{x}</a>)}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span><span style={{ color: P.good }}>●</span> all systems · 99.99% · 30d</span>
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
function PricingApp() {
  useReveal();
  const [yearly, setYearly] = pUS(false);
  return (
    <main style={{ background: P.bg, color: P.text, fontFamily: P.sans }}>
      <Nav />
      <Hero />
      <PlansSection yearly={yearly} setYearly={setYearly} />
      <ROICalculator />
      <CompareTable />
      <TickerStrip />
      <FAQ />
      <Trust />
      <CTAFooter />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PricingApp />);
