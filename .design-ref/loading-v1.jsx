// ═══════════════════════════════════════════════════════════
// Merchiva — Loading animations
// All loaders are built from the Notch M primitive: a square
// block with a V cut from the top. The V is the animated
// variable.
// ═══════════════════════════════════════════════════════════

const LOAD = {
  bg:      '#ffffff',
  surface: '#fafaf9',
  panel:   '#f5f5f4',
  ink:     '#0c0a09',
  text:    '#1c1917',
  sec:     '#78716c',
  ter:     '#a8a29e',
  border:  '#e7e5e4',
  borderD: '#d6d3d1',
  accent:  'oklch(0.55 0.09 55)',
  mono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans:    "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// keyframes injected once
(function injectKF() {
  if (document.getElementById('merchiva-load-kf')) return;
  const s = document.createElement('style');
  s.id = 'merchiva-load-kf';
  s.textContent = `
    @keyframes mvNotchScale {
      0%, 100% { transform: scaleY(0.4); }
      50%      { transform: scaleY(1); }
    }
    @keyframes mvFill {
      0%   { transform: translateY(72%); }
      100% { transform: translateY(0%); }
    }
    @keyframes mvSweep {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes mvDash {
      0%   { stroke-dashoffset: 480; }
      55%  { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: 0; }
    }
    @keyframes mvFade {
      0%, 60% { opacity: 0; }
      75%     { opacity: 1; }
      100%    { opacity: 1; }
    }
    @keyframes mvPulse {
      0%, 100% { opacity: .35; }
      50%      { opacity: 1; }
    }
    @keyframes mvBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    @keyframes mvDots {
      0%, 20%   { content: ""; }
      40%       { content: "."; }
      60%       { content: ".."; }
      80%, 100% { content: "..."; }
    }
    @keyframes mvCount {
      0%   { --p: 0; }
      100% { --p: 100; }
    }
    @keyframes mvBar {
      0%   { width: 0%; }
      100% { width: 100%; }
    }
    @keyframes mvShimmer {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(220%); }
    }
    @keyframes mvSpin { to { transform: rotate(360deg); } }
    @keyframes mvTickPop {
      0%, 100% { transform: scaleY(.5); opacity: .25; }
      50%      { transform: scaleY(1);  opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

// ─── Loader 01 — Notch Breathe ─────────────────────────────
// The V notch deepens and rises — like breathing. Most distilled.
function LoaderBreathe({ size = 120, color = LOAD.ink, speed = 1.6 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <mask id={`mvb-${id}`}>
          {/* white = visible body */}
          <rect x="14" y="14" width="72" height="72" fill="#fff" />
          {/* black V cuts the notch — scales vertically from its top */}
          <polygon
            points="40,14 60,14 50,72"
            fill="#000"
            style={{
              transformOrigin: '50px 14px',
              animation: `mvNotchScale ${speed}s cubic-bezier(.65,0,.35,1) infinite`,
            }}
          />
        </mask>
      </defs>
      <rect x="14" y="14" width="72" height="72" fill={color} mask={`url(#mvb-${id})`} />
    </svg>
  );
}

// ─── Loader 02 — Fill Rise ─────────────────────────────────
// The mark is an outline; a fill rises inside it like a vessel
// filling. Reads as "loading complete = full".
function LoaderFill({ size = 120, color = LOAD.ink, speed = 2.2 }) {
  // We render the mark as a clip-path, and animate a rising rect inside.
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <clipPath id={`mv-${id}`}>
          <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" />
        </clipPath>
      </defs>
      {/* outline */}
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill="none" stroke={color} strokeWidth="2"
      />
      {/* faint backplate */}
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={color} opacity={0.08}
      />
      {/* rising fill, clipped */}
      <g clipPath={`url(#mv-${id})`}>
        <rect
          x="14" y="14" width="72" height="72"
          fill={color}
          style={{
            transformOrigin: '0 100%',
            animation: `mvFill ${speed}s cubic-bezier(.4,0,.2,1) infinite`,
          }}
        />
      </g>
    </svg>
  );
}

// ─── Loader 03 — Notch Sweep ───────────────────────────────
// A horizontal sweep moves under the V notch like a scanner line.
// Mark stays static, ticks underneath pulse.
function LoaderSweep({ size = 120, color = LOAD.ink, speed = 1.4 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <clipPath id={`mvs-${id}`}>
          <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" />
        </clipPath>
      </defs>
      {/* mark */}
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={color}
      />
      {/* sweep band (clipped to mark) */}
      <g clipPath={`url(#mvs-${id})`}>
        <rect
          x="-30" y="14" width="30" height="72"
          fill="#ffffff" opacity="0.85"
          style={{
            animation: `mvSweep ${speed}s cubic-bezier(.65,0,.35,1) infinite`,
            transformOrigin: 'center',
          }}
        />
      </g>
      {/* baseline ticks */}
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x={28 + i * 18} y="92" width="14" height="3"
          fill={color}
          style={{
            transformOrigin: `${35 + i * 18}px 93.5px`,
            animation: `mvTickPop ${speed}s ease-in-out infinite`,
            animationDelay: `${i * (speed / 6)}s`,
          }}
        />
      ))}
    </svg>
  );
}

// ─── Loader 04 — Glyph Build ───────────────────────────────
// The mark draws itself stroke-by-stroke, then fills. A loop that
// feels like the system constructing itself.
function LoaderBuild({ size = 120, color = LOAD.ink, speed = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* outline that draws itself */}
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray="480"
        style={{
          animation: `mvDash ${speed}s cubic-bezier(.7,0,.3,1) infinite`,
        }}
      />
      {/* fill that fades in once outline is done */}
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={color}
        style={{
          animation: `mvFade ${speed}s cubic-bezier(.4,0,.2,1) infinite`,
        }}
      />
    </svg>
  );
}

// ─── Static Notch reference ────────────────────────────────
function NotchStatic({ size = 22, color = LOAD.ink }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={color}
      />
    </svg>
  );
}

// ─── Wordmark ──────────────────────────────────────────────
function MvWordmark({ size = 26, color = LOAD.ink, weight = 600, letterSpacing = -1.2 }) {
  return (
    <span style={{
      fontFamily: LOAD.sans, fontWeight: weight,
      fontSize: size, color, letterSpacing, lineHeight: 1,
    }}>Merchiva</span>
  );
}

// ─── Loader card chrome ────────────────────────────────────
function LoaderCard({ id, name, sub, children, dark = false, footer }) {
  const bg = dark ? LOAD.ink : LOAD.bg;
  const surf = dark ? '#17120f' : LOAD.surface;
  const txt = dark ? '#fafaf9' : LOAD.text;
  const sec = dark ? '#78716c' : LOAD.sec;
  const bd  = dark ? '#292524' : LOAD.border;
  return (
    <div style={{
      background: bg, border: `1px solid ${bd}`, borderRadius: 3,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: LOAD.sans, height: '100%',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${bd}`, background: surf,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontFamily: LOAD.mono, color: sec, letterSpacing: 0.4 }}>{id}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: txt, letterSpacing: -0.1 }}>{name}</span>
        </div>
        <span style={{
          fontSize: 9.5, fontFamily: LOAD.mono, color: sec,
          border: `1px solid ${bd}`, padding: '2px 5px', borderRadius: 2,
          textTransform: 'uppercase', letterSpacing: 0.4,
        }}>{sub}</span>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', padding: 24,
      }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: '8px 12px', borderTop: `1px solid ${bd}`,
          fontFamily: LOAD.mono, fontSize: 10, color: sec, letterSpacing: 0.2,
        }}>{footer}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCENES
// ═══════════════════════════════════════════════════════════

// Hero — full-screen splash, the recommended in-product loader
function HeroSplash({ variant = 'breathe', speed = 1.6, dark = true }) {
  const Loader = {
    breathe: LoaderBreathe, fill: LoaderFill, sweep: LoaderSweep, build: LoaderBuild,
  }[variant];
  const bg   = dark ? LOAD.ink : LOAD.bg;
  const fg   = dark ? '#fafaf9' : LOAD.ink;
  const sec  = dark ? '#78716c' : LOAD.sec;
  const ter  = dark ? '#57534e' : LOAD.ter;
  const bd   = dark ? '#292524' : LOAD.border;

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: fg,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: LOAD.sans,
    }}>
      {/* faint grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${bd} 1px, transparent 1px), linear-gradient(90deg, ${bd} 1px, transparent 1px)`,
        backgroundSize: '40px 40px', opacity: 0.35, pointerEvents: 'none',
      }} />
      {/* topbar */}
      <div style={{
        height: 44, borderBottom: `1px solid ${bd}`,
        display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12,
        fontFamily: LOAD.mono, fontSize: 11, color: sec, position: 'relative',
      }}>
        <NotchStatic size={14} color={fg} />
        <span style={{ fontWeight: 600, letterSpacing: 1.4, color: fg }}>MERCHIVA</span>
        <span style={{ color: ter }}>·</span>
        <span>booting workspace</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399',
            animation: 'mvPulse 1.4s ease-in-out infinite' }} />
          <span style={{ color: '#34d399', letterSpacing: 0.8 }}>CONNECTING</span>
        </div>
      </div>

      {/* main */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28, position: 'relative',
      }}>
        <Loader size={120} color={fg} speed={speed} />
        <MvWordmark size={28} color={fg} />
        <div style={{ fontFamily: LOAD.mono, fontSize: 11.5, color: sec, letterSpacing: 0.3 }}>
          loading · reconciling 248 transactions<span style={{ display: 'inline-block', width: 14, textAlign: 'left', }}>
            <DotDotDot />
          </span>
        </div>

        {/* progress */}
        <div style={{ width: 260, marginTop: 4 }}>
          <div style={{
            height: 2, background: bd, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', inset: 0, width: '40%', background: fg,
              animation: 'mvShimmer 1.8s cubic-bezier(.65,0,.35,1) infinite',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 6,
            fontFamily: LOAD.mono, fontSize: 9.5, color: ter, letterSpacing: 0.4,
          }}>
            <span>STEP 02 / 04</span>
            <span>~2s remaining</span>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        height: 28, borderTop: `1px solid ${bd}`, padding: '0 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: LOAD.mono, fontSize: 10, color: ter, letterSpacing: 0.2,
      }}>
        <span>v4.2.1</span><span>·</span><span>Blue Bottle · Xintiandi</span><span>·</span><span>esc to skip splash</span>
      </div>
    </div>
  );
}

function DotDotDot() {
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: LOAD.mono,
    }}>
      <span style={{ animation: 'mvPulse 1.4s ease-in-out infinite' }}>.</span>
      <span style={{ animation: 'mvPulse 1.4s ease-in-out infinite', animationDelay: '0.18s' }}>.</span>
      <span style={{ animation: 'mvPulse 1.4s ease-in-out infinite', animationDelay: '0.36s' }}>.</span>
    </span>
  );
}

// Variants comparison — 4 loaders side by side
function VariantsGrid() {
  const items = [
    { id: '01', name: 'Notch Breathe', sub: 'recommended', sub2: 'V depth oscillates · 1.6s cycle', Loader: LoaderBreathe, speed: 1.6 },
    { id: '02', name: 'Fill Rise',     sub: 'process',     sub2: 'V is a vessel · fills 2.2s', Loader: LoaderFill, speed: 2.2 },
    { id: '03', name: 'Notch Sweep',   sub: 'scanning',    sub2: 'scan band + tick row · 1.4s', Loader: LoaderSweep, speed: 1.4 },
    { id: '04', name: 'Glyph Build',   sub: 'cold-start',  sub2: 'draws then fills · 2.4s', Loader: LoaderBuild, speed: 2.4 },
  ];
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)',
      gap: 1, background: LOAD.border,
    }}>
      {items.map(({ id, name, sub, sub2, Loader, speed }) => (
        <LoaderCard key={id} id={id} name={name} sub={sub} footer={sub2}>
          <Loader size={130} speed={speed} />
        </LoaderCard>
      ))}
    </div>
  );
}

// In-product placements — small loaders embedded in real surfaces
function InContext() {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 1, background: LOAD.border,
    }}>
      {/* button */}
      <LoaderCard id="P1" name="Button" sub="inline" footer="14px · same color as label">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button style={{
            padding: '10px 16px', background: LOAD.ink, color: '#fafaf9',
            border: 'none', borderRadius: 3, fontFamily: LOAD.sans, fontSize: 13,
            fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <LoaderBreathe size={14} color="#fafaf9" speed={1.4} />
            Reconciling
          </button>
          <button style={{
            padding: '10px 16px', background: '#fff', color: LOAD.ink,
            border: `1px solid ${LOAD.borderD}`, borderRadius: 3, fontFamily: LOAD.sans,
            fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: 'default',
          }}>
            <LoaderBreathe size={14} color={LOAD.ink} speed={1.4} />
            Saving
          </button>
        </div>
      </LoaderCard>

      {/* table row skeleton */}
      <LoaderCard id="P2" name="Table fetch" sub="skeleton" footer="loader pinned to header · rows shimmer">
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${LOAD.border}`, padding: '8px 4px',
          }}>
            <span style={{ fontFamily: LOAD.mono, fontSize: 10.5, color: LOAD.sec, letterSpacing: 0.4 }}>
              TRANSACTIONS
            </span>
            <LoaderBreathe size={12} color={LOAD.sec} speed={1.4} />
          </div>
          {[0.9, 0.7, 0.85, 0.5].map((w, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, padding: '10px 4px',
              borderBottom: `1px solid ${LOAD.border}`,
            }}>
              <Skel w="32%" />
              <Skel w={`${w * 30}%`} />
              <Skel w={`${w * 24}%`} />
            </div>
          ))}
        </div>
      </LoaderCard>

      {/* command palette */}
      <LoaderCard id="P3" name="Command bar" sub="search" footer="caret blink + sweep dots">
        <div style={{
          width: 220, border: `1px solid ${LOAD.border}`, background: '#fff',
          borderRadius: 3, padding: '10px 12px',
          fontFamily: LOAD.mono, fontSize: 12, color: LOAD.text,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: LOAD.sec }}>$</span>
          <span>searching</span>
          <span style={{ color: LOAD.sec }}><DotDotDot /></span>
          <span style={{
            marginLeft: 'auto', width: 8, height: 14, background: LOAD.ink,
            animation: 'mvBlink 1.1s steps(1) infinite',
          }} />
        </div>
      </LoaderCard>
    </div>
  );
}

function Skel({ w = '40%' }) {
  return (
    <div style={{
      height: 10, width: w, background: LOAD.surface,
      position: 'relative', overflow: 'hidden', borderRadius: 2,
    }}>
      <div style={{
        position: 'absolute', inset: 0, width: '40%',
        background: `linear-gradient(90deg, transparent, ${LOAD.border}, transparent)`,
        animation: 'mvShimmer 1.8s linear infinite',
      }} />
    </div>
  );
}

// Sequence — Recommended loader timed out as filmstrip
function Filmstrip() {
  // Render the recommended loader (Breathe) as 6 freeze-frames using
  // negative animation-delays on a paused element trick.
  const frames = [0, 0.16, 0.32, 0.5, 0.66, 0.83];
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: LOAD.bg, padding: 28, gap: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: LOAD.mono, fontSize: 10.5, color: LOAD.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          01 · Notch Breathe
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: LOAD.text, letterSpacing: -0.2 }}>
          Frame study · 1.6s loop, 6 sample frames
        </span>
      </div>
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
      }}>
        {frames.map((t, i) => {
          // depth at time t (cosine for back-and-forth)
          const depth = 30 + (Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * 40;
          return (
            <div key={i} style={{
              border: `1px solid ${LOAD.border}`, background: LOAD.surface, borderRadius: 3,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: 8,
            }}>
              <svg width="80" height="80" viewBox="0 0 100 100">
                <path
                  d={`M14 14 L40 14 L50 ${depth} L60 14 L86 14 L86 86 L14 86 Z`}
                  fill={LOAD.ink}
                />
              </svg>
              <span style={{ fontFamily: LOAD.mono, fontSize: 10, color: LOAD.sec }}>
                t = {(t * 1.6).toFixed(2)}s
              </span>
            </div>
          );
        })}
      </div>
      <div style={{
        borderTop: `1px solid ${LOAD.border}`, paddingTop: 14,
        fontFamily: LOAD.mono, fontSize: 11, color: LOAD.sec, lineHeight: 1.55,
      }}>
        Easing: cubic-bezier(.65, 0, .35, 1) · symmetric in/out so the V never snaps.
        Depth range: 30u → 70u (stays inside the 14-86u glyph box).
        Pairs with horizontal shimmer on progress · 1.8s offset cycle.
      </div>
    </div>
  );
}

// Scale study — same loader at different sizes
function ScaleStudy() {
  const sizes = [16, 24, 40, 64, 96, 140];
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      padding: 28, background: LOAD.bg, gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: LOAD.mono, fontSize: 10.5, color: LOAD.sec, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Scale
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: LOAD.text, letterSpacing: -0.2 }}>
          Holds at 16px — same loop, all sizes in lockstep
        </span>
      </div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 16,
      }}>
        {sizes.map(s => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <LoaderBreathe size={s} speed={1.6} />
            <span style={{ fontFamily: LOAD.mono, fontSize: 10, color: LOAD.sec }}>{s}px</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Expose to global
Object.assign(window, {
  V1_LoaderBreathe: LoaderBreathe, V1_LoaderFill: LoaderFill,
  V1_LoaderSweep: LoaderSweep, V1_LoaderBuild: LoaderBuild,
  V1_HeroSplash: HeroSplash, V1_VariantsGrid: VariantsGrid,
  V1_InContext: InContext, V1_Filmstrip: Filmstrip, V1_ScaleStudy: ScaleStudy,
  V1_NotchStatic: NotchStatic, V1_MvWordmark: MvWordmark,
});
