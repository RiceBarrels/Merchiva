"use client";

// ═══════════════════════════════════════════════════════════════════════════
// Geometric loaders — squares + triangles, chaotic / off-grid
// Adapted from Loading v2 (geometric) design system.
//
// Public API:
//   Spinner — small inline spinner (drop-in replacement for animate-spin icons)
//   BuildLoader — medium block loader (the 00d "build" variant)
//   SplashLoader — full-screen 00d+ build → welcome transition
//
// All three share Square/Triangle primitives + a shared 30fps ticker so
// the page doesn't pay for multiple rAF loops when several loaders mount.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useId, type CSSProperties } from "react";

const GL = {
  ink: "#0c0a09",
  text: "#1c1917",
  sec: "#78716c",
  ter: "#a8a29e",
  border: "#e7e5e4",
  borderDark: "#292524",
  bg: "#ffffff",
  bgDark: "#0c0a09",
  good: "#34d399",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
} as const;

// One-time keyframe injection — components reference these by name.
let keyframesInjected = false;
function ensureKeyframes() {
  if (keyframesInjected || typeof document === "undefined") return;
  if (document.getElementById("mv-geo-kf")) { keyframesInjected = true; return; }
  const s = document.createElement("style");
  s.id = "mv-geo-kf";
  s.textContent = `
    @keyframes mvGeoSpinCW  { to { transform: rotate(360deg); } }
    @keyframes mvGeoSpinCCW { to { transform: rotate(-360deg); } }
    @keyframes mvGeoPulse   { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
  `;
  document.head.appendChild(s);
  keyframesInjected = true;
}

// Shared 60fps ticker. The first hook starts the rAF loop; subsequent hooks
// just listen. Each component still re-renders every frame, but we only
// schedule one rAF callback for the whole page. Running at the display's
// native refresh (no interval gate) makes the splash visibly smoother on
// 60/120Hz screens than the original 30fps cap.
const tickListeners = new Set<() => void>();
let tickRafId: number | null = null;

function startTickLoop() {
  if (tickRafId != null) return;
  const loop = () => {
    tickListeners.forEach((fn) => fn());
    tickRafId = requestAnimationFrame(loop);
  };
  tickRafId = requestAnimationFrame(loop);
}

function useTick(run = true) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const cb = () => setN((n) => (n + 1) % 1e9);
    tickListeners.add(cb);
    startTickLoop();
    return () => {
      tickListeners.delete(cb);
      if (tickListeners.size === 0 && tickRafId != null) {
        cancelAnimationFrame(tickRafId);
        tickRafId = null;
      }
    };
  }, [run]);
}

// PRNG — deterministic so positions stay stable across renders.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ─── Shape primitives ────────────────────────────────────────────────────

interface ShapeProps {
  s?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  rot?: number;
  style?: CSSProperties;
}

function Square({ s = 24, fill, stroke, sw = 2, rot = 0, style }: ShapeProps) {
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      <rect x={sw / 2} y={sw / 2} width={s - sw} height={s - sw} fill={fill || "none"} stroke={stroke} strokeWidth={sw} />
    </svg>
  );
}

function Triangle({ s = 24, fill, stroke, sw = 2, rot = 0, style }: ShapeProps) {
  const pad = sw / 2 + 1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      <polygon
        points={`${s / 2},${pad} ${s - pad},${s - pad} ${pad},${s - pad}`}
        fill={fill || "none"}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

// ─── Spinner — small inline spinner (drop-in for animate-spin Loader2) ──

export interface SpinnerProps {
  /** Outer size in pixels. Default 16 (matches `h-4 w-4`). */
  size?: number;
  /** Stroke color. Defaults to `currentColor` so it inherits text color. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function Spinner({ size = 16, color, className, style, "aria-label": ariaLabel = "Loading" }: SpinnerProps) {
  useEffect(() => { ensureKeyframes(); }, []);
  const stroke = color ?? "currentColor";
  // Inner squares + triangles spin at different speeds for the off-grid feel.
  const sq = size * 0.75;
  const tr = size * 0.5;
  const sw = Math.max(1, size * 0.09);
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={className}
      style={{ position: "relative", width: size, height: size, display: "inline-block", lineHeight: 0, ...style }}
    >
      <span
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          animation: "mvGeoSpinCW 1.4s linear infinite",
        }}
      >
        <Square s={sq} stroke={stroke} sw={sw} />
      </span>
      <span
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          animation: "mvGeoSpinCCW 1.8s linear infinite",
        }}
      >
        <Triangle s={tr} stroke={stroke} sw={sw} />
      </span>
    </span>
  );
}

// ─── BuildLoader — medium block (the "build" variant from 00d) ─────────
// 9 shapes scatter, then settle into a line, then scatter again. Used for
// page-level loading where the inline spinner is too small.

export interface BuildLoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

export function BuildLoader({ size = 1, color, className }: BuildLoaderProps) {
  useEffect(() => { ensureKeyframes(); }, []);
  useTick();
  const stroke = color ?? GL.ink;
  const N = 9;
  const cycle = 3600;
  const phase = (performance.now() % cycle) / cycle;

  const r = useMemo(() => rng(19), []);
  const targets = useMemo(
    () => Array.from({ length: N }).map((_, i) => ({
      x: 12 + i * 26, y: 40, rot: 0, isTri: i % 2 === 0, filled: i % 3 === 1,
    })),
    [],
  );
  const chaos = useMemo(
    () => Array.from({ length: N }).map(() => ({
      dx: (r() - 0.5) * 160,
      dy: (r() - 0.5) * 80,
      drot: (r() - 0.5) * 400,
    })),
    [r],
  );

  let p: number;
  if (phase < 0.4) p = phase / 0.4;
  else if (phase < 0.6) p = 1;
  else p = 1 - (phase - 0.6) / 0.4;
  const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

  const W = N * 26 + 12;
  const H = 80 * size;
  return (
    <div className={className} style={{ width: W * size, height: H, position: "relative" }} role="status" aria-label="Loading">
      {targets.map((t, i) => {
        const x = t.x * size + chaos[i].dx * (1 - eased) * size * 0.5;
        const y = t.y * size + chaos[i].dy * (1 - eased) * size * 0.5;
        const rot = t.rot + chaos[i].drot * (1 - eased);
        const Comp = t.isTri ? Triangle : Square;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)` }}>
            <Comp s={18 * size} stroke={stroke} fill={t.filled ? stroke : "none"} sw={1.6} />
          </div>
        );
      })}
    </div>
  );
}

// ─── SplashLoader — full-screen 00d+ (build → welcome transition) ──────

export interface SplashLoaderProps {
  /** Dark variant (charcoal background). Defaults to light. */
  dark?: boolean;
  /** Display name shown in the welcome reveal. Defaults to "Welcome back". */
  name?: string;
  /** Subtext under the welcome ("3 stores · 4 jobs in queue") */
  meta?: string;
  /**
   * Controlled-mode signal: while `false`, stay in the loading orbit (the
   * splash will loop indefinitely). The moment this flips `true`, the splash
   * plays its end animation (snap → ready → exit → welcome) once and calls
   * `onFinish`. Leave this prop undefined to fall back to the legacy `loop`
   * behavior (good for the design-canvas demo).
   */
  ready?: boolean;
  /** Fires once after the end animation completes — use it to unmount. */
  onFinish?: () => void;
  /** Loop the full sequence forever (only used when `ready` is undefined). */
  loop?: boolean;
  /** When true, suppress the final welcome reveal — useful when the splash is just covering an in-flight load. */
  hideWelcome?: boolean;
  /** Optional tagline shown in the topbar during loading ("booting workspace"). */
  tagline?: string;
  /** Optional status line under the loading bar ("assembling workspace · 248 records"). */
  status?: string;
}

// Duration of the end animation once `ready` flips true. The original 00d+
// cycle is 6500ms total, with the ending (PH.settle → 1) taking ~3250ms — we
// compress it slightly so users aren't held up too long once the data lands.
const ENDING_MS = 2800;
// A bridge between the loading orbit and the snap so `p` glides instead of
// jumping. Tuned long enough that the square + triangle visibly decelerate
// into their final positions before the snap commits.
const SETTLE_BRIDGE_MS = 520;
// Loading-phase oscillation bounds. `p` rides a sine wave between MIN/MAX
// so the orbit chaos has a gentle in-and-out feel instead of looping
// abruptly. Both values stay below PH.snap (0.62) — the shapes never
// accidentally start snapping while we're still loading.
const LOAD_P_MIN = 0.08;
const LOAD_P_MAX = 0.42;
const LOAD_OSC_MS = 5200;

// Easing helpers.
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Lerp between two `#rrggbb` hex colors. Used to transition the splash's
// fills toward pure black as the logo zooms in for the end animation —
// rather than overlaying a separate black layer, the logo's own surfaces
// darken as they fill the viewport.
function mixHex(c1: string, c2: string, t: number): string {
  const parse = (s: string): [number, number, number] => {
    const h = s.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(r1, r2)},${lerp(g1, g2)},${lerp(b1, b2)})`;
}

export function SplashLoader({
  dark = true,
  name = "Welcome back",
  meta = "operations software · ready",
  ready,
  onFinish,
  loop = false,
  hideWelcome = false,
  tagline = "booting workspace",
  status = "assembling workspace",
}: SplashLoaderProps) {
  useEffect(() => { ensureKeyframes(); }, []);
  useTick();

  // Anchor t so the sequence starts at p=0 on mount (the live cycle would
  // otherwise drop the user in mid-animation).
  const [startedAt] = useState(() => performance.now());
  const cycleMs = 6500;
  const elapsed = performance.now() - startedAt;

  // Controlled mode: when `ready` first flips true, capture both the timer
  // start and the current loading-p so the ending can ease away from
  // exactly where the orbit was — no teleport.
  const controlled = ready !== undefined;
  const [endingStart, setEndingStart] = useState<{ at: number; fromP: number } | null>(null);

  // Helper: deterministic loading-p as a function of elapsed time.
  // Sine wave between LOAD_P_MIN..LOAD_P_MAX over LOAD_OSC_MS.
  function loadingPAt(t: number): number {
    const phase = (t % LOAD_OSC_MS) / LOAD_OSC_MS;
    const wave = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0..1
    return LOAD_P_MIN + wave * (LOAD_P_MAX - LOAD_P_MIN);
  }

  useEffect(() => {
    if (controlled && ready && endingStart === null) {
      const now = performance.now();
      setEndingStart({ at: now, fromP: loadingPAt(now - startedAt) });
    }
  }, [controlled, ready, endingStart, startedAt]);

  // Fire onFinish once the end animation completes. setTimeout so the
  // callback fires even if the user tabs away (rAF is paused there).
  useEffect(() => {
    if (endingStart === null || !onFinish) return;
    const total = SETTLE_BRIDGE_MS + ENDING_MS + 250;
    const remaining = total - (performance.now() - endingStart.at);
    const id = setTimeout(onFinish, Math.max(0, remaining));
    return () => clearTimeout(id);
  }, [endingStart, onFinish]);

  // ── Compute p (sequence progress) ──────────────────────────────────────
  //   Controlled mode (recommended):
  //     • Loading: p oscillates on a sine wave (no hard cycle restart)
  //     • Ready flips → 320ms bridge eases p from current value to PH.settle
  //     • Then 2.8s eased ramp from PH.settle → 1.0
  //   Legacy mode (no `ready` prop):
  //     • loop=true  → full 6.5s cycle, repeats forever
  //     • loop=false → plays once, holds at 1
  let p: number;
  if (controlled) {
    if (endingStart === null) {
      p = loadingPAt(elapsed);
    } else {
      const tEnd = performance.now() - endingStart.at;
      if (tEnd < SETTLE_BRIDGE_MS) {
        // Bridge: ease from wherever the orbit was up to PH.settle.
        const k = easeOutCubic(tEnd / SETTLE_BRIDGE_MS);
        p = endingStart.fromP + k * (0.50 - endingStart.fromP);
      } else {
        // Main ending — easeInOutCubic so snap → ready feels deliberate
        // (slow in, fast through, gentle out into the welcome reveal).
        const k = easeInOutCubic(Math.min(1, (tEnd - SETTLE_BRIDGE_MS) / ENDING_MS));
        p = 0.50 + k * (1 - 0.50);
      }
    }
  } else {
    p = loop ? (elapsed % cycleMs) / cycleMs : Math.min(elapsed / cycleMs, 1);
  }

  const bg = dark ? GL.bgDark : GL.bg;
  const fg = dark ? "#fafaf9" : GL.ink;
  const sec = dark ? "#78716c" : GL.sec;
  const ter = dark ? "#57534e" : GL.ter;
  const bd = dark ? GL.borderDark : GL.border;
  const good = GL.good;

  // Logo geometry (200×200 SVG): 140×140 square with a triangular notch
  // (40 wide, 56 deep) bitten out of the top center.
  const VB = 200, SQ_S = 140;
  const SQ_FX = (VB - SQ_S) / 2;        // 30
  const SQ_FY = (VB - SQ_S) / 2;        // 30
  const TRI_W = 40, TRI_H = 56;
  const TRI_FX = (VB - TRI_W) / 2;      // 80
  const TRI_FY = SQ_FY - 1;

  // Phase boundaries (matches original 00d+ exactly).
  const PH = { settle: 0.50, snap: 0.62, ready: 0.78, exit: 0.92 };

  // Ambient accent shapes — 3 small subtle ones, fade out by snap.
  const ambient = useMemo(() => [
    { kind: "sq", s: 14, baseX: 36, baseY: 28, freq: 0.7, phase: 0.0 },
    { kind: "tr", s: 12, baseX: 72, baseY: 16, freq: 0.5, phase: 1.4 },
    { kind: "sq", s: 10, baseX: 18, baseY: 70, freq: 0.6, phase: 2.7 },
  ] as const, []);

  const t = elapsed;

  // Position interpolation for the square + triangle. The math is lifted
  // from the design; comments below mirror the phases:
  //   settle → snap → ready → exit
  let sqX: number, sqY: number, sqRot: number;
  let triX: number, triY: number, triRot: number;
  let fillT = 0;   // 0 = outlined square, 1 = solid
  let notchT = 0;  // 0 = fg-filled triangle, 1 = bg-colored cutout

  if (p < PH.settle) {
    const decay = 1 - (p / PH.snap);
    const s1 = Math.sin(t / 700);
    const c1 = Math.cos(t / 800);
    sqX = SQ_FX + s1 * 12 * decay;
    sqY = SQ_FY + c1 * 9 * decay;
    sqRot = s1 * 8 * decay;
    triX = TRI_FX + Math.sin(t / 600 + 1.2) * 22 * decay;
    triY = TRI_FY - 38 * decay + Math.cos(t / 720 + 0.8) * 6 * decay;
    triRot = Math.sin(t / 540 + 0.4) * 24 * decay;
  } else if (p < PH.snap) {
    // SNAP phase — the original 00d+ multiplied decay by 0.4 here, which
    // creates a visible jolt at the PH.settle boundary (orbit amplitude
    // discontinuously jumps from settle's exit decay ~0.19 up to 0.40 and
    // the triangle teleports ~30px upward to "begin its dock"). We instead
    // keep amplitude continuous with where the settle phase left off, and
    // let the cubic ease + overshoot still give the click-in feel.
    const localT = (p - PH.settle) / (PH.snap - PH.settle);
    const eased = 1 - Math.pow(1 - localT, 3);
    const overshoot = Math.sin(localT * Math.PI) * (1 - localT) * 3;
    const SETTLE_EXIT_DECAY = 1 - PH.settle / PH.snap; // ≈ 0.194
    const decay = SETTLE_EXIT_DECAY * (1 - eased);
    const s1 = Math.sin(t / 700);
    const c1 = Math.cos(t / 800);
    sqX = SQ_FX + s1 * 12 * decay;
    sqY = SQ_FY + c1 * 9 * decay - overshoot * 0.5;
    sqRot = s1 * 8 * decay;
    triX = TRI_FX + Math.sin(t / 600 + 1.2) * 22 * decay;
    triY = TRI_FY - 38 * decay + Math.cos(t / 720 + 0.8) * 6 * decay - overshoot;
    triRot = Math.sin(t / 540 + 0.4) * 24 * decay;
    fillT = eased;
    notchT = Math.max(0, (eased - 0.3) / 0.7);
  } else if (p < PH.ready) {
    const localT = (p - PH.snap) / (PH.ready - PH.snap);
    const bounce = Math.sin(localT * Math.PI * 1.5) * Math.exp(-localT * 4) * 3;
    sqX = SQ_FX; sqY = SQ_FY - bounce; sqRot = 0;
    triX = TRI_FX; triY = TRI_FY - bounce; triRot = 0;
    fillT = 1; notchT = 1;
  } else if (p < PH.exit) {
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

  // Opacities.
  const shapesOp = p < PH.ready ? 1 : p < PH.exit ? 1 - (p - PH.ready) / (PH.exit - PH.ready) : hideWelcome ? 1 : 0;
  const wordOp = p < PH.snap ? 0 : p < PH.ready ? (p - PH.snap) / (PH.ready - PH.snap) : shapesOp;
  const loadOp = p < PH.snap ? 1 : p < PH.ready ? 1 - (p - PH.snap) / (PH.ready - PH.snap) : 0;
  const readyOp = wordOp;
  const ambOp = Math.max(0, 1 - p / PH.snap) * (dark ? 0.35 : 0.30);
  // chromeOp is computed below once hideWelcomeMode / scaleT are known.

  let welcomeOp = 0;
  if (!hideWelcome && p >= PH.exit) {
    const tail = (p - PH.exit) / (1 - PH.exit);
    welcomeOp = tail < 0.75 ? Math.min(1, tail * 5) : 1 - (tail - 0.75) / 0.25;
  }

  // ─ hideWelcome end animation ───────────────────────────────────────────
  // Three sub-phases after the snap:
  //   1) ZOOM + BLACK  (PH.snap → SCALE_PHASE_END)
  //      Center stack (logo + wordmark) scales 1× → 6× while a black
  //      overlay grows in opacity to take over the screen.
  //   2) HOLD          (SCALE_PHASE_END → HOLD_PHASE_END)
  //      Screen is fully black, nothing moves — a deliberate beat.
  //   3) BLUR + FADE   (HOLD_PHASE_END → 1.0)
  //      Container blurs and fades to opacity 0, revealing whatever the
  //      parent rendered underneath (the dashboard).
  const SCALE_PHASE_END = 0.78;
  const HOLD_PHASE_END = 0.86;
  const hideWelcomeMode = hideWelcome === true;

  const scaleT = hideWelcomeMode && p > PH.snap
    ? easeInOutCubic(Math.min(1, (p - PH.snap) / (SCALE_PHASE_END - PH.snap)))
    : 0;
  // Big scale so the 140px square covers any practical viewport (≥16× ⇒
  // 2240px wide, enough for 2K displays).
  const centerScale = 1 + scaleT * 18;
  // Blackness ramps slightly faster than the scale so the inside of the
  // square is already deep black by the time it fills the viewport.
  const blackness = Math.min(1, scaleT * 1.25);

  const exitT = hideWelcomeMode
    ? Math.max(0, Math.min(1, (p - HOLD_PHASE_END) / (1 - HOLD_PHASE_END)))
    : 0;
  const exitFade = easeInOutCubic(exitT);
  const containerBlur = easeOutCubic(exitT) * 18;

  // Themed colors that ALSO transition to black during the zoom — this is
  // the "logo becomes black" effect: the square's own fill darkens to #000
  // as it grows, the container bg follows, and the triangle cutout blends
  // with the surrounding black so the notch dissolves into a flat field.
  const bgZoom  = blackness > 0 ? mixHex(bg, "#000000", blackness) : bg;
  const fgZoom  = blackness > 0 ? mixHex(fg, "#000000", blackness) : fg;

  // In hideWelcome mode the chrome (topbar / footer) sits above the zooming
  // square — fade it out as the zoom progresses so the viewport ends up
  // uniformly black instead of showing chrome edges.
  const chromeOp = hideWelcomeMode
    ? Math.max(0, 1 - scaleT * 1.8)
    : p < PH.ready ? 1 : p < PH.exit ? 1 - (p - PH.ready) / (PH.exit - PH.ready) : 0;

  // Progress bar: in controlled mode, drift asymptotically toward ~85% while
  // loading (so the bar visually progresses even though we're parked at p≈0.10),
  // then snap to 100% during the ending. In legacy mode, use the same
  // p→snap mapping as the original design.
  const loadProg = controlled
    ? endingStart === null
      ? Math.min(0.85, elapsed / 7000)
      : 1
    : p < PH.snap ? p / PH.snap : 1;
  const statusBlock = p < PH.snap
    ? { text: "CONNECTING", tagline, dot: true }
    : { text: "READY", tagline: meta, dot: false };

  // Unique id so multiple SplashLoader instances don't share ambient seeds.
  const uid = useId();
  void uid; // ambient is static — kept for future use

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        width: "100%", height: "100%", background: bgZoom, color: fg,
        display: "flex", flexDirection: "column", position: "relative",
        fontFamily: GL.sans, overflow: "hidden",
        // Container-level blur+fade — applied during the final BLUR phase.
        // The ZOOM + BLACK happens via the logo's own fill darkening as it
        // scales up (see fgZoom on the rect below); no overlay needed.
        opacity: 1 - exitFade,
        filter: containerBlur > 0 ? `blur(${containerBlur}px)` : undefined,
        pointerEvents: exitFade > 0.3 ? "none" : undefined,
      }}
    >
      {/* topbar */}
      <div
        style={{
          height: 44, borderBottom: `1px solid ${bd}`,
          display: "flex", alignItems: "center", padding: "0 18px", gap: 12,
          fontFamily: GL.mono, fontSize: 11, color: sec, position: "relative", zIndex: 2,
          background: dark ? "rgba(12,10,9,0.6)" : "rgba(255,255,255,0.6)",
          backdropFilter: "blur(6px)", opacity: chromeOp, transition: "none",
          paddingLeft: 98
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: 1.4, color: fg }}>MERCHIVA</span>
        <span style={{ color: ter }}>·</span>
        <span>{statusBlock.tagline}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: 999, background: good,
              animation: statusBlock.dot ? "mvGeoPulse 1.4s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ color: good, letterSpacing: 0.8 }}>{statusBlock.text}</span>
        </div>
      </div>

      {/* center stack — zooms toward the viewer during the hideWelcome ending */}
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 28, position: "relative", zIndex: 1,
          transform: centerScale !== 1 ? `scale(${centerScale})` : undefined,
          transformOrigin: "center center",
          willChange: hideWelcomeMode ? "transform" : undefined,
        }}
      >
        <div style={{ width: 200, height: 200, position: "relative", opacity: shapesOp }}>
          {ambient.map((a, i) => {
            const dx = Math.sin(t / (700 + i * 50) + a.phase) * 4;
            const dy = Math.cos(t / (650 + i * 60) + a.phase) * 4;
            const rot = Math.sin(t / 800 + a.phase) * 14;
            return (
              <div key={i} style={{ position: "absolute", left: a.baseX + dx, top: a.baseY + dy, opacity: ambOp, pointerEvents: "none" }}>
                {a.kind === "sq"
                  ? <Square s={a.s} stroke={fg} sw={1} rot={rot} />
                  : <Triangle s={a.s} stroke={fg} sw={1} rot={rot} />}
              </div>
            );
          })}

          <svg viewBox={`0 0 ${VB} ${VB}`} width="200" height="200" style={{ display: "block", overflow: "visible" }}>
            <rect
              x={sqX} y={sqY} width={SQ_S} height={SQ_S}
              fill="none" stroke={fgZoom} strokeWidth="2.5"
              opacity={1 - fillT}
              transform={`rotate(${sqRot} ${sqX + SQ_S / 2} ${sqY + SQ_S / 2})`}
            />
            <rect
              x={sqX} y={sqY} width={SQ_S} height={SQ_S}
              fill={fgZoom}
              opacity={fillT}
              transform={`rotate(${sqRot} ${sqX + SQ_S / 2} ${sqY + SQ_S / 2})`}
            />
            <polygon
              points={`${triX},${triY} ${triX + TRI_W},${triY} ${triX + TRI_W / 2},${triY + TRI_H}`}
              fill={fgZoom}
              opacity={1 - notchT}
              transform={`rotate(${triRot} ${triX + TRI_W / 2} ${triY + TRI_H / 2})`}
            />
            <polygon
              points={`${triX},${triY} ${triX + TRI_W},${triY} ${triX + TRI_W / 2},${triY + TRI_H}`}
              fill={bgZoom}
              opacity={notchT}
              transform={`rotate(${triRot} ${triX + TRI_W / 2} ${triY + TRI_H / 2})`}
            />
          </svg>
        </div>

        <div style={{ position: "relative", width: 360, height: 86 }}>
          {/* LOADING block */}
          <div
            style={{
              position: "absolute", inset: 0, opacity: loadOp,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
              pointerEvents: "none",
            }}
          >
            <div style={{ fontFamily: GL.mono, fontSize: 11.5, color: sec, letterSpacing: 0.3, textAlign: "center" }}>
              {status}
            </div>
            <div style={{ width: 320, height: 2, background: bd, position: "relative" }}>
              <div
                style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${loadProg * 100}%`, background: fg,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 24, fontFamily: GL.mono, fontSize: 10, color: ter, letterSpacing: 0.4 }}>
              <span>STEP 02 / 04</span>
              <span>{Math.floor(loadProg * 100).toString().padStart(2, "0")}%</span>
            </div>
          </div>

          {/* READY block — wordmark + tagline */}
          <div
            style={{
              position: "absolute", inset: 0, opacity: readyOp * shapesOp,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              pointerEvents: "none",
              transform: `translateY(${(1 - readyOp) * 6}px)`,
            }}
          >
            <div style={{ fontFamily: GL.sans, fontSize: 34, fontWeight: 600, color: fg, letterSpacing: -1.2, lineHeight: 1 }}>
              Merchiva
            </div>
            <div style={{ fontFamily: GL.mono, fontSize: 10.5, color: sec, letterSpacing: 1, textTransform: "uppercase" }}>
              {meta}
            </div>
          </div>
        </div>
      </div>

      {/* welcome reveal */}
      {!hideWelcome && (
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 14,
            opacity: welcomeOp, pointerEvents: "none", zIndex: 3,
            transform: `translateY(${(1 - welcomeOp) * 12}px)`,
          }}
        >
          {/* mini Notch M */}
          <svg width={42} height={42} viewBox="0 0 200 200">
            <rect x={30} y={30} width={140} height={140} fill={fg} />
            <polygon points={`80,29 120,29 100,85`} fill={bg} />
          </svg>
          <div style={{ fontFamily: GL.sans, fontSize: 30, fontWeight: 600, color: fg, letterSpacing: -0.6, marginTop: 4 }}>
            {name}
          </div>
          <div
            style={{
              fontFamily: GL.mono, fontSize: 11, color: sec, letterSpacing: 0.3,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span>workspace ready</span>
          </div>
        </div>
      )}

      {/* footer */}
      <div
        style={{
          height: 28, borderTop: `1px solid ${bd}`, padding: "0 18px",
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: GL.mono, fontSize: 10, color: ter, letterSpacing: 0.2,
          background: dark ? "rgba(12,10,9,0.6)" : "rgba(255,255,255,0.6)",
          zIndex: 2, opacity: chromeOp,
        }}
      >
        <span>merchiva</span><span>·</span><span>booting</span>
        <span style={{ marginLeft: "auto", color: ter }}>{(elapsed / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
