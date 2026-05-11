"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const C = {
  bg: "#f0eee9",
  bgWarm: "#e8e4dc",
  paper: "#ffffff",
  surface: "#fafaf9",
  panel: "#f5f5f4",
  ink: "#0c0a09",
  text: "#1c1917",
  text2: "#44403c",
  text3: "#57534e",
  sec: "#78716c",
  ter: "#a8a29e",
  border: "#e0ddd6",
  borderD: "#cbc7bd",
  good: "#059669",
  bad: "#b91c1c",
  accent: "oklch(0.55 0.09 55)",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
};

// ─── Hooks ──────────────────────────────────────────────────

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useTick(fps = 30, run = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const interval = 1000 / fps;
    let last = performance.now();
    let raf: number;
    const loop = (t: number) => {
      if (t - last >= interval) {
        last = t;
        setTick((x) => (x + 1) % 1e9);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, run]);
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".mv-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useMouse() {
  const [m, setM] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const onMove = (e: MouseEvent) =>
      setM({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return m;
}

// ─── Small primitives ───────────────────────────────────────

function NotchM({ size = 28, fg = C.ink }: { size?: number; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: 3, display: "block" }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

function Wordmark({ size = 22, color = C.ink, ls = -1.2 }: { size?: number; color?: string; ls?: number }) {
  return (
    <span style={{ fontFamily: C.sans, fontWeight: 600, fontSize: size, color, letterSpacing: ls, lineHeight: 1 }}>
      Merchiva
    </span>
  );
}

function MonoTag({ children, color = C.sec, border = true }: { children: React.ReactNode; color?: string; border?: boolean }) {
  return (
    <span
      style={{
        fontFamily: C.mono,
        fontSize: 10.5,
        color,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        border: border ? `1px solid ${C.border}` : "none",
        padding: border ? "4px 8px" : 0,
        borderRadius: 3,
        background: border ? C.paper : "transparent",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </span>
  );
}

function DotLeader({ color = C.borderD }: { color?: string }) {
  return <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${color}`, transform: "translateY(-2px)" }} />;
}

// ═══════════════════════════════════════════════════════════
// 01 · TOP NAV
// ═══════════════════════════════════════════════════════════

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "14px 32px",
        transition: "background 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease",
        background: scrolled ? "rgba(240,238,233,0.78)" : "transparent",
        backdropFilter: scrolled ? "saturate(140%) blur(14px)" : "none",
        WebkitBackdropFilter: scrolled ? "saturate(140%) blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? C.border : "transparent"}`,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 32 }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink }}>
          <NotchM size={22} />
          <Wordmark size={17} ls={-0.8} />
        </a>
        <div style={{ display: "flex", gap: 24, marginLeft: 24 }}>
          {[
            { label: "Product", href: "#product" },
            { label: "Modules", href: "#modules" },
            { label: "Pricing", href: "/pricing" },
            { label: "Customers", href: "#customers" },
          ].map((x) => (
            <Link
              key={x.label}
              href={x.href}
              style={{ fontSize: 13, color: C.text3, textDecoration: "none", fontWeight: 500, letterSpacing: -0.1 }}
              className="hover:!text-stone-900 transition-colors"
            >
              {x.label}
            </Link>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.3 }}>
            v3.4 <span style={{ color: C.good }}>●</span> live
          </span>
          <Link
            href="/login"
            style={{ fontSize: 13, color: C.text2, textDecoration: "none", fontWeight: 500, padding: "6px 10px" }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: C.ink,
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: 4,
              letterSpacing: -0.1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Start free
            <span style={{ fontFamily: C.mono, fontSize: 11, opacity: 0.7 }}>→</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════
// 02 · HERO
// ═══════════════════════════════════════════════════════════

function AnimatedGrid() {
  const m = useMouse();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: "-40px",
          backgroundImage: `radial-gradient(${C.borderD} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
          opacity: 0.6,
          animation: "mv-drift 18s linear infinite",
          maskImage: "radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 60%, black 30%, transparent 75%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `calc(${m.x * 100}% - 280px)`,
          top: `calc(${m.y * 100}% - 280px)`,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(217,119,6,0.07), transparent 60%)",
          transition: "left 240ms ease-out, top 240ms ease-out",
        }}
      />
      {[
        { top: 24, left: 24 },
        { top: 24, right: 24 },
        { bottom: 24, left: 24 },
        { bottom: 24, right: 24 },
      ].map((p, i) => (
        <div key={i} style={{ position: "absolute", ...p, width: 14, height: 14, color: C.ter }}>
          <div style={{ position: "absolute", top: 6, left: 0, right: 0, height: 1, background: "currentColor" }} />
          <div style={{ position: "absolute", left: 6, top: 0, bottom: 0, width: 1, background: "currentColor" }} />
        </div>
      ))}
    </div>
  );
}

function HeroWordmark() {
  const lines = ["know what", "sells next."];
  let idx = 0;
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: C.sans,
        fontWeight: 600,
        fontSize: "clamp(64px, 11vw, 168px)",
        lineHeight: 0.94,
        letterSpacing: "-0.055em",
        color: C.ink,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap" }}>
          {line.split("").map((c) => {
            const i = idx++;
            const isAccent = li === 1 && c === "s" && line.indexOf(c) === 0;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  color: isAccent ? C.accent : "inherit",
                  whiteSpace: "pre",
                  animation: `mv-letter-in 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 50}ms both`,
                }}
              >
                {c === " " ? " " : c}
              </span>
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
  const [pi, setPi] = useState(0);
  const [shown, setShown] = useState("");
  const [del, setDel] = useState(false);

  useEffect(() => {
    const target = phrases[pi];
    let t: ReturnType<typeof setTimeout>;
    if (!del && shown.length < target.length) {
      t = setTimeout(() => setShown(target.slice(0, shown.length + 1)), 55);
    } else if (!del && shown.length === target.length) {
      t = setTimeout(() => setDel(true), 1700);
    } else if (del && shown.length > 0) {
      t = setTimeout(() => setShown(target.slice(0, shown.length - 1)), 24);
    } else if (del && shown.length === 0) {
      setDel(false);
      setPi((pi + 1) % phrases.length);
    }
    return () => clearTimeout(t);
  }, [shown, del, pi]);

  return (
    <div
      style={{
        fontFamily: C.mono,
        fontSize: 13.5,
        color: C.text2,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        border: `1px solid ${C.border}`,
        background: C.paper,
        borderRadius: 4,
      }}
    >
      <span style={{ color: C.ter }}>$</span>
      <span style={{ color: C.text }}>merchiva </span>
      <span style={{ color: C.text2 }}>{shown}</span>
      <span style={{ width: 7, height: 14, background: C.ink, animation: "mv-blink 1s steps(1) infinite" }} />
    </div>
  );
}

function HeroTicker() {
  useTick(8);
  const t = performance.now() / 1000;
  const stats = [
    { label: "forecasts run · today", base: 184_612, drift: 0.92, fixed: undefined as string | undefined },
    { label: "stockouts prevented · 30d", base: 41_287, drift: 0.18, fixed: undefined as string | undefined },
    { label: "reorders auto-suggested", base: 612_408, drift: 0.41, fixed: undefined as string | undefined },
    { label: "forecast accuracy · MAPE", base: 0, drift: 0, fixed: "7.2%" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        overflow: "hidden",
        background: C.paper,
      }}
    >
      {stats.map((s, i) => {
        const v = Math.floor(s.base + t * s.drift * 60);
        return (
          <div
            key={i}
            style={{
              padding: "14px 18px",
              borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : "none",
              background: i % 2 === 0 ? C.paper : C.surface,
            }}
          >
            <div
              style={{
                fontFamily: C.mono,
                fontSize: 18,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: -0.5,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.fixed ?? v.toLocaleString()}
            </div>
            <div
              style={{
                fontFamily: C.mono,
                fontSize: 9.5,
                color: C.sec,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MagneticButton({
  children,
  primary,
  href,
}: {
  children: React.ReactNode;
  primary?: boolean;
  href?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [d, setD] = useState({ x: 0, y: 0 });
  const isInternal = href === "/signup" || href === "/login";
  const Comp = isInternal ? Link : "a";
  return (
    <Comp
      ref={ref as never}
      href={href || "#start"}
      onMouseMove={(e: React.MouseEvent) => {
        const r = ref.current!.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        setD({ x: (e.clientX - cx) * 0.18, y: (e.clientY - cy) * 0.32 });
      }}
      onMouseLeave={() => setD({ x: 0, y: 0 })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 22px",
        borderRadius: 4,
        background: primary ? C.ink : "transparent",
        color: primary ? "#fff" : C.ink,
        border: primary ? `1px solid ${C.ink}` : `1px solid ${C.borderD}`,
        textDecoration: "none",
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: -0.1,
        transform: `translate(${d.x}px, ${d.y}px)`,
        transition: "transform 240ms cubic-bezier(.2,.8,.2,1), background 160ms",
      }}
    >
      {children}
      <span style={{ fontFamily: C.mono, fontSize: 12, opacity: 0.8 }}>→</span>
    </Comp>
  );
}

function Hero() {
  return (
    <section
      id="top"
      style={{
        position: "relative",
        minHeight: "100vh",
        paddingTop: 120,
        paddingBottom: 80,
        paddingLeft: 32,
        paddingRight: 32,
        overflow: "hidden",
      }}
    >
      <AnimatedGrid />
      <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 36,
            animation: "mv-fade-up 700ms 60ms both",
          }}
        >
          <MonoTag>
            <span style={{ width: 6, height: 6, background: C.good, borderRadius: "50%" }} />
            new · v3.4 · forecasting engine
          </MonoTag>
          <span style={{ fontSize: 13, color: C.sec, letterSpacing: -0.1 }}>
            Inventory forecasting that pays back in week one.
          </span>
        </div>

        <HeroWordmark />

        <div
          style={{
            marginTop: 44,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 48,
            alignItems: "end",
            animation: "mv-fade-up 800ms 700ms both",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 22,
              lineHeight: 1.4,
              color: C.text2,
              letterSpacing: -0.3,
              maxWidth: 640,
              fontWeight: 400,
              textWrap: "pretty" as never,
            }}
          >
            Stop guessing. Merchiva watches your sales every minute and tells you{" "}
            <em style={{ color: C.ink, fontStyle: "normal", fontWeight: 600 }}>
              exactly how much to order, and when
            </em>{" "}
            — for every SKU, every supplier, every location. Median forecast error:{" "}
            <strong style={{ color: C.ink, fontWeight: 600 }}>7.2%</strong>.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <TypingLine />
            <div style={{ display: "flex", gap: 10 }}>
              <MagneticButton primary href="/signup">
                Start free · 30 days
              </MagneticButton>
              <MagneticButton href="#product">Watch 2-min demo</MagneticButton>
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.3 }}>
              no card · 2-minute setup · cancel anytime
            </span>
          </div>
        </div>

        <div style={{ marginTop: 64, animation: "mv-fade-up 900ms 1100ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
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
// 03 · LIVE PRODUCT PREVIEW
// ═══════════════════════════════════════════════════════════

const VIEWS = [
  { id: "forecast", label: "Forecast", icon: "⌇", tag: "/forecast/sku", sub: "Oat milk · 1L · 14-day window" },
  { id: "reorder", label: "Reorder", icon: "⊞", tag: "/forecast/reorder", sub: "Auto-suggested · 6 vendors" },
  { id: "inv", label: "Inventory", icon: "◫", tag: "/inventory", sub: "Stockroom · 124 SKUs" },
  { id: "sales", label: "Signal", icon: "◴", tag: "/forecast/signal", sub: "Drivers · weather · payday · holiday" },
];

function ViewForecast() {
  useTick(2);
  const t = performance.now() / 1000;
  const past = Array.from({ length: 14 }, (_, i) => 38 + Math.sin(i * 0.7) * 9 + Math.sin(i * 0.3) * 4 + i * 0.4);
  const fut = Array.from({ length: 14 }, (_, i) => {
    return past[past.length - 1] + i * 0.6 + Math.sin((i + t * 0.2) * 0.7) * 6;
  });
  const all = [...past, ...fut];
  const W = 720,
    Hh = 220,
    pad = 28;
  const max = Math.max(...all) * 1.18;
  const sx = (i: number) => pad + (i / (all.length - 1)) * (W - pad * 2);
  const sy = (v: number) => Hh - pad - (v / max) * (Hh - pad * 2);
  const pastPath = past.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i)} ${sy(v)}`).join(" ");
  const futPath = fut.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(past.length - 1 + i)} ${sy(v)}`).join(" ");
  const bandHi = fut.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(past.length - 1 + i)} ${sy(v + 7 + i * 0.3)}`).join(" ");
  const bandLo = fut
    .map(
      (_, i) =>
        `L ${sx(past.length - 1 + (fut.length - 1 - i))} ${sy(fut[fut.length - 1 - i] - 7 - (fut.length - 1 - i) * 0.3)}`
    )
    .join(" ");
  const splitX = sx(past.length - 1);

  return (
    <div style={{ padding: 18, fontFamily: C.sans, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Oat milk · 1L</div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, marginTop: 2 }}>
            SKU OAT-1L · supplier Pacific Farms · lead time 3d
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["7d", "14d", "30d", "90d"].map((p, i) => (
            <span
              key={p}
              style={{
                fontFamily: C.mono,
                fontSize: 10.5,
                padding: "4px 8px",
                borderRadius: 3,
                background: i === 1 ? C.ink : C.surface,
                color: i === 1 ? "#fff" : C.text3,
                border: `1px solid ${i === 1 ? C.ink : C.border}`,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: "100%", flex: 1 }}>
        <defs>
          <linearGradient id="mvFcBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0.05} />
          </linearGradient>
          <pattern id="mvFcHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.accent} strokeWidth="0.7" strokeOpacity={0.18} />
          </pattern>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke={C.border} strokeDasharray="2 4" />
        ))}
        <line x1={splitX} x2={splitX} y1={pad} y2={Hh - pad} stroke={C.borderD} strokeDasharray="3 3" />
        <text x={splitX - 6} y={pad + 10} textAnchor="end" fontFamily={C.mono} fontSize="9.5" fill={C.sec}>
          actual
        </text>
        <text x={splitX + 6} y={pad + 10} textAnchor="start" fontFamily={C.mono} fontSize="9.5" fill={C.accent}>
          forecast
        </text>
        <path d={`${bandHi} ${bandLo} Z`} fill="url(#mvFcHatch)" />
        <path d={`${bandHi} ${bandLo} Z`} fill="url(#mvFcBand)" />
        <path d={pastPath} fill="none" stroke={C.ink} strokeWidth="2" />
        <path d={futPath} fill="none" stroke={C.accent} strokeWidth="2" strokeDasharray="4 3" />
        {past.map((v, i) => (
          <circle key={"p" + i} cx={sx(i)} cy={sy(v)} r="2" fill={C.ink} />
        ))}
        {fut.map((v, i) => (
          <circle
            key={"f" + i}
            cx={sx(past.length - 1 + i)}
            cy={sy(v)}
            r="2.5"
            fill={C.paper}
            stroke={C.accent}
            strokeWidth="1.5"
          />
        ))}
        <line x1={sx(past.length + 3)} x2={sx(past.length + 3)} y1={pad} y2={Hh - pad} stroke={C.ink} strokeWidth="1" />
        <rect x={sx(past.length + 3) - 50} y={pad - 2} width="100" height="16" fill={C.ink} rx="2" />
        <text x={sx(past.length + 3)} y={pad + 9} textAnchor="middle" fontFamily={C.mono} fontSize="9" fill="#fff" letterSpacing={0.4}>
          REORDER · MAY 14
        </text>
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        {[
          { k: "Predicted · 14d", v: "628 L", s: "+18% vs prev" },
          { k: "Reorder by", v: "May 14", s: "4 days from now" },
          { k: "Suggest qty", v: "14 cases", s: "@ $42.50/case" },
          { k: "Stockout risk", v: "2.4%", s: "within window" },
        ].map((s) => (
          <div key={s.k}>
            <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.sec, textTransform: "uppercase", letterSpacing: 0.4 }}>{s.k}</div>
            <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.ink, marginTop: 2 }}>{s.v}</div>
            <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.sec, marginTop: 2 }}>{s.s}</div>
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
    { sku: "OAT-1L", name: "Oat milk · 1L", vend: "Pacific Farms", qty: 14, unit: "cases", need: "May 14", risk: 0.62, urg: "high" },
    { sku: "BEAN-ETH-1KG", name: "Beans · Ethiopia · 1kg", vend: "Ritual Roast", qty: 8, unit: "bags", need: "May 16", risk: 0.41, urg: "med" },
    { sku: "SYR-VAN-750", name: "Vanilla syrup · 750ml", vend: "Monin · West", qty: 6, unit: "btl", need: "May 17", risk: 0.38, urg: "med" },
    { sku: "CUP-12-WHT", name: "Cups · 12oz · white", vend: "PaperHaus", qty: 2, unit: "cases", need: "May 19", risk: 0.21, urg: "low" },
    { sku: "MILK-WH-1G", name: "Whole milk · 1gal", vend: "Local Dairy", qty: 18, unit: "gal", need: "May 13", risk: 0.71, urg: "high" },
    { sku: "LID-12", name: "Lids · 12oz", vend: "PaperHaus", qty: 1, unit: "cases", need: "May 22", risk: 0.12, urg: "low" },
  ];
  return (
    <div style={{ padding: 18, fontFamily: C.sans, fontSize: 12, height: "100%", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>6 reorders auto-suggested · last run 14s ago</span>
        <button
          style={{
            fontFamily: C.sans,
            fontSize: 11.5,
            fontWeight: 500,
            padding: "6px 12px",
            background: C.ink,
            color: "#fff",
            border: "none",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Approve all · send 4 POs
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "110px 1fr 130px 80px 80px 70px 70px",
          gap: 0,
          fontFamily: C.mono,
          fontSize: 9.5,
          color: C.sec,
          padding: "0 10px 6px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <span>SKU</span>
        <span>Item</span>
        <span>Vendor</span>
        <span style={{ textAlign: "right" }}>Qty</span>
        <span style={{ textAlign: "right" }}>Need by</span>
        <span style={{ textAlign: "right" }}>Risk</span>
        <span style={{ textAlign: "right" }}>Action</span>
      </div>
      {rows.map((r, i) => {
        const high = r.urg === "high";
        const flash = high && Math.floor(t * 1.4) % 2 === 0;
        const urgC = high ? C.bad : r.urg === "med" ? C.accent : C.good;
        return (
          <div
            key={r.sku}
            style={{
              display: "grid",
              gridTemplateColumns: "110px 1fr 130px 80px 80px 70px 70px",
              alignItems: "center",
              padding: "10px 10px",
              background: i % 2 === 0 ? C.paper : C.surface,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 12,
            }}
          >
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.text3 }}>{r.sku}</span>
            <span>{r.name}</span>
            <span style={{ fontSize: 11.5, color: C.text2 }}>{r.vend}</span>
            <span style={{ fontFamily: C.mono, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {r.qty}{" "}
              <span style={{ color: C.sec, fontSize: 10 }}>{r.unit}</span>
            </span>
            <span style={{ fontFamily: C.mono, textAlign: "right", color: high ? C.bad : C.text }}>{r.need}</span>
            <span style={{ fontFamily: C.mono, textAlign: "right", color: urgC, opacity: flash ? 0.5 : 1, transition: "opacity 220ms" }}>
              {(r.risk * 100).toFixed(0)}%
            </span>
            <span style={{ textAlign: "right" }}>
              <span style={{ fontFamily: C.mono, fontSize: 9.5, padding: "3px 6px", borderRadius: 2, background: C.ink, color: "#fff" }}>
                send
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ViewInventory() {
  useTick(2);
  const t = performance.now() / 1000;
  const rows = [
    { sku: "BEAN-ETH-1KG", name: "Beans · Ethiopia · 1kg", stock: 18, par: 24 },
    { sku: "CUP-12-WHT", name: "Cups · 12oz · white", stock: 312, par: 800 },
    { sku: "MILK-WH-1G", name: "Whole milk · 1gal", stock: 6, par: 12 },
    { sku: "OAT-1L", name: "Oat milk · 1L", stock: 14, par: 18 },
    { sku: "SYR-VAN-750", name: "Vanilla syrup · 750ml", stock: 3, par: 6 },
    { sku: "LID-12", name: "Lids · 12oz", stock: 480, par: 800 },
  ];
  return (
    <div style={{ padding: 18, fontFamily: C.sans, fontSize: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr 80px 1fr 60px",
          gap: 0,
          fontFamily: C.mono,
          fontSize: 10,
          color: C.sec,
          padding: "0 8px 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <span>SKU</span>
        <span>Item</span>
        <span style={{ textAlign: "right" }}>On hand</span>
        <span style={{ paddingLeft: 14 }}>Par</span>
        <span style={{ textAlign: "right" }}>Status</span>
      </div>
      {rows.map((r, i) => {
        const pct = Math.min(1, r.stock / r.par);
        const low = pct < 0.4;
        const flashing = low && Math.floor(t * 1.2) % 2 === 0;
        return (
          <div
            key={r.sku}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 80px 1fr 60px",
              alignItems: "center",
              padding: "8px 8px",
              background: i % 2 === 0 ? C.paper : C.surface,
              border: `1px solid ${C.border}`,
              borderTop: i === 0 ? `1px solid ${C.border}` : "none",
              fontSize: 12,
            }}
          >
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.text3 }}>{r.sku}</span>
            <span>{r.name}</span>
            <span style={{ fontFamily: C.mono, textAlign: "right", fontVariantNumeric: "tabular-nums", color: low ? C.bad : C.text }}>
              {r.stock}
            </span>
            <div style={{ paddingLeft: 14, paddingRight: 10 }}>
              <div style={{ height: 6, background: C.panel, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: low ? C.bad : C.ink, transition: "width 600ms" }} />
              </div>
            </div>
            <span
              style={{
                textAlign: "right",
                fontFamily: C.mono,
                fontSize: 9.5,
                fontWeight: 600,
                color: low ? C.bad : C.good,
                opacity: flashing ? 0.4 : 1,
                transition: "opacity 220ms",
              }}
            >
              {low ? "REORDER" : "OK"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ViewSales() {
  useTick(2);
  const t = performance.now() / 1000;
  const hours = [6, 7, 8, 9, 10, 11, 12, 13];
  const data = hours.map((h, i) => 200 + Math.abs(Math.sin((h + t * 0.3) * 0.7) * 240) + i * 30);
  const max = Math.max(...data);
  const total = data.reduce((a, b) => a + b, 0);
  const W = 540,
    Hh = 200,
    pad = 24;
  const sx = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const sy = (v: number) => Hh - pad - (v / max) * (Hh - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  const area = `${path} L ${sx(data.length - 1)} ${Hh - pad} L ${sx(0)} ${Hh - pad} Z`;

  return (
    <div style={{ padding: 18, fontFamily: C.sans }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1, fontFamily: C.mono }}>${total.toFixed(0)}</span>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.good }}>+18.4% vs avg Sat</span>
      </div>
      <svg width={W} height={Hh} style={{ display: "block", maxWidth: "100%" }}>
        <defs>
          <linearGradient id="mvSalesArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.ink} stopOpacity={0.16} />
            <stop offset="100%" stopColor={C.ink} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke={C.border} strokeDasharray="2 4" />
        ))}
        <path d={area} fill="url(#mvSalesArea)" />
        <path d={path} fill="none" stroke={C.ink} strokeWidth="2" />
        {data.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r="3" fill={C.paper} stroke={C.ink} strokeWidth="1.5" />
        ))}
        {hours.map((h, i) => (
          <text key={i} x={sx(i)} y={Hh - 6} textAnchor="middle" fontFamily={C.mono} fontSize="9.5" fill={C.sec}>
            {h}:00
          </text>
        ))}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 8 }}>
        {[
          { k: "Orders", v: "218" },
          { k: "Avg ticket", v: "$8.42" },
          { k: "Refunds", v: "2" },
          { k: "Tip avg", v: "12.1%" },
        ].map((s) => (
          <div key={s.k} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, textTransform: "uppercase", letterSpacing: 0.4 }}>{s.k}</div>
            <div style={{ fontFamily: C.mono, fontSize: 17, fontWeight: 600, marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveDashboard() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % VIEWS.length), 4500);
    return () => clearInterval(id);
  }, [paused]);
  const tilt = useMouse();
  const tx = (tilt.x - 0.5) * 6;
  const ty = (tilt.y - 0.5) * -4;

  return (
    <section id="product" style={{ padding: "120px 32px 80px", position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 32 }}>
          <MonoTag border={false}>02 · the product</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>auto-cycling · click a tab</span>
        </div>

        <div className="mv-reveal" data-d="1">
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 600,
              letterSpacing: -2,
              lineHeight: 1.02,
              color: C.ink,
              maxWidth: 1100,
              textWrap: "balance" as never,
            }}
          >
            Forecast, reorder, restock.{" "}
            <span style={{ color: C.ter }}>One screen. Four hours saved every week.</span>
          </h2>
        </div>

        {/* Tabs */}
        <div
          className="mv-reveal"
          data-d="2"
          style={{
            display: "flex",
            gap: 0,
            marginTop: 40,
            borderTop: `1px solid ${C.border}`,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {VIEWS.map((v, i) => {
            const on = i === active;
            return (
              <button
                key={v.id}
                onClick={() => {
                  setActive(i);
                  setPaused(true);
                }}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                style={{
                  flex: 1,
                  padding: "16px 18px",
                  textAlign: "left",
                  background: on ? C.paper : "transparent",
                  border: "none",
                  borderRight: i < VIEWS.length - 1 ? `1px solid ${C.border}` : "none",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 14, color: on ? C.ink : C.ter }}>{v.icon}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? C.ink : C.text3, letterSpacing: -0.2 }}>
                    {v.label}
                  </span>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, marginTop: 4 }}>{v.tag}</div>
                {on && (
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: C.ink }} />
                )}
                {on && !paused && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: 2,
                      background: C.accent,
                      width: "100%",
                      transformOrigin: "left",
                      animation: "mv-shimmer 4.5s linear",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Window */}
        <div
          className="mv-reveal"
          data-d="3"
          style={{
            marginTop: 24,
            position: "relative",
            transform: `perspective(1400px) rotateY(${tx * 0.3}deg) rotateX(${ty * 0.3}deg)`,
            transformStyle: "preserve-3d",
            transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              boxShadow: "0 30px 80px -30px rgba(28,25,23,0.18), 0 8px 22px -12px rgba(28,25,23,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 36,
                borderBottom: `1px solid ${C.border}`,
                background: C.surface,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                gap: 6,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{ width: 9, height: 9, borderRadius: 99, background: C.panel, border: `1px solid ${C.border}` }}
                />
              ))}
              <div
                style={{
                  flex: 1,
                  maxWidth: 360,
                  marginLeft: 14,
                  height: 22,
                  borderRadius: 3,
                  background: C.paper,
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  gap: 8,
                  fontFamily: C.mono,
                  fontSize: 10.5,
                  color: C.sec,
                }}
              >
                <span style={{ color: C.ter }}>maple-coffee.merchiva.app</span>
                <span style={{ color: C.text3 }}>{VIEWS[active].tag}</span>
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>{VIEWS[active].sub}</span>
            </div>
            <div style={{ height: 460, background: C.paper, position: "relative", overflow: "hidden" }}>
              <div key={active} style={{ animation: "mv-fade-up 480ms cubic-bezier(.2,.8,.2,1) both", height: "100%" }}>
                {active === 0 && <ViewForecast />}
                {active === 1 && <ViewReorder />}
                {active === 2 && <ViewInventory />}
                {active === 3 && <ViewSales />}
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: "linear-gradient(to bottom, transparent 0%, rgba(217,119,6,0.05) 50%, transparent 100%)",
                  height: 60,
                  animation: "mv-scan-y 6s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 04 · MARQUEE
// ═══════════════════════════════════════════════════════════

function Marquee() {
  const items = [
    "demand forecasts",
    "reorder points",
    "stockout risk",
    "lead-time aware",
    "confidence bands",
    "driver attribution",
    "weather signal",
    "holiday lift",
    "payday bumps",
    "cold-start models",
    "vendor MOQs",
    "pack rounding",
    "cycle counts",
    "shrink alerts",
    "expiry windows",
    "multi-location",
    "auto purchase orders",
    "supplier scorecards",
    "safety-stock tuning",
    "what-if scenarios",
  ];
  const row = [...items, ...items];
  return (
    <section
      style={{
        padding: "32px 0",
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.bgWarm,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 0,
          animation: "mv-marquee 60s linear infinite",
          whiteSpace: "nowrap",
          width: "max-content",
        }}
      >
        {row.map((x, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "0 22px",
              fontFamily: C.sans,
              fontSize: 30,
              fontWeight: 500,
              color: i % 7 === 3 ? C.ink : C.text3,
              letterSpacing: -0.6,
            }}
          >
            <NotchM size={14} fg={C.ter} />
            {x}
          </span>
        ))}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 05 · FEATURE GRID
// ═══════════════════════════════════════════════════════════

function MiniLoader_Schedule() {
  useTick(8);
  const t = performance.now() / 100;
  const cells = 12;
  const head = Math.floor(t) % cells;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells}, 1fr)`, gap: 2, width: "100%" }}>
      {Array.from({ length: cells }).map((_, i) => {
        const dist = (i - head + cells) % cells;
        const opacity = Math.max(0.12, 1 - dist * 0.14);
        return <div key={i} style={{ height: 16, background: C.ink, opacity, borderRadius: 1 }} />;
      })}
    </div>
  );
}

function MiniLoader_POS() {
  useTick(4);
  const t = performance.now() / 1000;
  const v = Math.sin(t) * 0.5 + 0.5;
  return (
    <div style={{ width: "100%", fontFamily: C.mono, fontSize: 10.5, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span style={{ color: C.sec }}>Latte 12oz</span>
        <span>$5.50</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <span style={{ color: C.sec }}>Croissant</span>
        <span>$4.25</span>
      </div>
      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: 4,
          marginTop: 4,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontWeight: 600 }}>Total</span>
        <span style={{ fontWeight: 600, fontFamily: C.mono }}>${(9.75 + v * 0.01).toFixed(2)}</span>
      </div>
    </div>
  );
}

function MiniLoader_Inv() {
  useTick(6);
  const t = performance.now() / 200;
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
      {[0, 1, 2].map((i) => {
        const w = 30 + (Math.sin(t * 0.4 + i) * 0.5 + 0.5) * 60;
        const low = w < 38;
        return (
          <div key={i} style={{ height: 6, background: C.panel, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${w}%`, background: low ? C.bad : C.ink, transition: "width 240ms" }} />
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
    { l: "Sales", v: 4128.4 + Math.sin(t * 0.3) * 30 },
    { l: "Tax", v: 361.23 + Math.sin(t * 0.2) * 4 },
    { l: "Tips", v: 502.1 + Math.sin(t * 0.4) * 6 },
    { l: "Net", v: 3265.07 + Math.sin(t * 0.25) * 18 },
  ];
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.text2, width: "100%" }}>
      {lines.map((l) => (
        <div key={l.l} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: C.sec }}>{l.l}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: C.text }}>${l.v.toFixed(2)}</span>
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
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: C.mono, color: C.text }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          background: blink ? C.good : C.panel,
          transition: "background 200ms",
        }}
      />
      <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </span>
    </div>
  );
}

function MiniLoader_Site() {
  useTick(8);
  const t = performance.now() / 200;
  const dots = 12;
  return (
    <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 4 }}>
      {Array.from({ length: dots }).map((_, i) => {
        const phase = ((i + t * 0.3) % dots) / dots;
        const h = 4 + Math.abs(Math.sin(phase * Math.PI)) * 14;
        return <div key={i} style={{ width: 4, height: h, background: C.ink, borderRadius: 1, transition: "height 120ms" }} />;
      })}
    </div>
  );
}

type Feature = {
  tag: string;
  title: string;
  body: string;
  mark: string;
  loader: React.ComponentType;
  hint: string;
};

const FEATURES: Feature[] = [
  { tag: "F01", title: "Per-SKU demand", body: "A separate model per SKU per location. Daily and hourly granularity, refit nightly on your data.", mark: "⌇", loader: MiniLoader_Schedule, hint: "7.2% MAPE · median" },
  { tag: "F02", title: "Confidence bands", body: "Forecasts come with calibrated 80/95% intervals. Decide reorder qty against your tolerance for stockout.", mark: "◇", loader: MiniLoader_POS, hint: "P95 · 14-day window" },
  { tag: "F03", title: "Drivers explained", body: "Every prediction shows what moved it: weather, payday, holiday, local event, last week’s lift.", mark: "⊞", loader: MiniLoader_Inv, hint: "+18% rain Saturday" },
  { tag: "F04", title: "Auto-reorder", body: "Suggested POs land in your inbox at 4am. Approve in one tap. Vendor-aware lead times, MOQs, pack sizes.", mark: "◰", loader: MiniLoader_Books, hint: "sends at 04:00 daily" },
  { tag: "F05", title: "Stockout alerts", body: "A pager-style alert the moment risk crosses your threshold. Quietly resolves itself when you reorder.", mark: "◴", loader: MiniLoader_Punch, hint: "risk crossed 70% · 4m ago" },
  { tag: "F06", title: "Cold-start mode", body: "New SKU? We borrow strength from similar items in the network until you have your own history.", mark: "◍", loader: MiniLoader_Site, hint: "first useful forecast · day 7" },
];

function FeatureCard({ f, idx }: { f: Feature; idx: number }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="mv-reveal"
      data-d={String((idx % 3) + 1)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 24,
        background: hover ? C.paper : C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? "0 16px 40px -20px rgba(28,25,23,0.18)" : "none",
        transition: "transform 220ms cubic-bezier(.2,.8,.2,1), background 180ms, box-shadow 240ms",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 248,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 3,
              background: C.ink,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: C.mono,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {f.mark}
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {f.tag}
          </span>
        </div>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>{f.hint}</span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: C.ink, marginBottom: 6 }}>{f.title}</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text3, textWrap: "pretty" as never }}>{f.body}</p>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: 14,
          background: C.paper,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          minHeight: 56,
          display: "flex",
          alignItems: "center",
        }}
      >
        <f.loader />
      </div>
    </div>
  );
}

function FeatureGrid() {
  return (
    <section id="modules" style={{ padding: "120px 32px", background: C.bg }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>03 · modules</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>six modules · one bill</span>
        </div>
        <h2
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 64px",
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.6,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 1000,
            textWrap: "balance" as never,
          }}
        >
          Six things our forecast does that <span style={{ color: C.ter }}>your spreadsheet can&apos;t</span>.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.tag} f={f} idx={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 06 · METRICS
// ═══════════════════════════════════════════════════════════

function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1600,
  decimals = 0,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / duration);
              const ease = 1 - Math.pow(1 - p, 3);
              setV(to * ease);
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  const display = decimals > 0 ? v.toFixed(decimals) : Math.floor(v).toLocaleString();
  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

function DrawingChart() {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            setDrawn(true);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const bars = [44, 52, 61, 70, 78, 92, 88, 96, 110, 124, 138, 156];
  const max = Math.max(...bars);
  const W = 720,
    Hh = 280,
    pad = 36;
  const bw = (W - pad * 2) / months.length - 6;
  const sx = (i: number) => pad + i * ((W - pad * 2) / months.length) + 3;
  const sy = (v: number) => Hh - pad - (v / max) * (Hh - pad * 2);
  const line = bars.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i) + bw / 2} ${sy(v)}`).join(" ");

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${Hh}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((p, i) => (
        <g key={i}>
          <line x1={pad} x2={W - pad} y1={sy(max * p)} y2={sy(max * p)} stroke={C.border} strokeDasharray="3 4" />
          <text x={pad - 8} y={sy(max * p) + 3} fontFamily={C.mono} fontSize="9.5" fill={C.sec} textAnchor="end">
            ${(max * p).toFixed(0)}k
          </text>
        </g>
      ))}
      {bars.map((v, i) => {
        const x = sx(i);
        const y = sy(v);
        const h = Hh - pad - y;
        return (
          <g key={i}>
            <rect
              x={x}
              y={Hh - pad - (drawn ? h : 0)}
              width={bw}
              height={drawn ? h : 0}
              fill={i === months.length - 1 ? C.ink : C.borderD}
              style={{
                transition: `y 900ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms, height 900ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms`,
              }}
            />
            <text x={x + bw / 2} y={Hh - 12} fontFamily={C.mono} fontSize="9.5" fill={C.sec} textAnchor="middle">
              {months[i]}
            </text>
          </g>
        );
      })}
      <path
        d={line}
        fill="none"
        stroke={C.ink}
        strokeWidth="2"
        strokeDasharray="2000"
        strokeDashoffset={drawn ? 0 : 2000}
        style={{ transition: "stroke-dashoffset 1600ms cubic-bezier(.2,.8,.2,1) 400ms" }}
      />
      {bars.map((v, i) => (
        <circle
          key={i}
          cx={sx(i) + bw / 2}
          cy={sy(v)}
          r={drawn ? 3 : 0}
          fill={C.paper}
          stroke={C.ink}
          strokeWidth="1.5"
          style={{ transition: `r 280ms cubic-bezier(.2,.8,.2,1) ${800 + i * 60}ms` }}
        />
      ))}
    </svg>
  );
}

function Metrics() {
  return (
    <section
      style={{
        padding: "120px 32px",
        background: C.ink,
        color: C.bg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse at 70% 30%, black 30%, transparent 75%)",
        }}
      />
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div
          className="mv-reveal"
          style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 24, color: "#a8a29e" }}
        >
          <span style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase" }}>
            04 · in production
          </span>
          <div style={{ flex: 1, height: 1, borderTop: "1px dashed #44403c", transform: "translateY(-2px)" }} />
          <span style={{ fontFamily: C.mono, fontSize: 10.5 }}>data through May 2026</span>
        </div>
        <h2
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 56px",
            fontSize: "clamp(36px, 5vw, 60px)",
            fontWeight: 600,
            letterSpacing: -1.8,
            lineHeight: 1.04,
            color: "#fafaf9",
            maxWidth: 900,
            textWrap: "balance" as never,
          }}
        >
          Operators don&apos;t write reviews. They <span style={{ color: C.ter }}>renew</span>.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 64, alignItems: "center" }}>
          <div className="mv-reveal" data-d="2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 32 }}>
            {[
              { k: "businesses live", v: 2841, fmt: {} },
              { k: "avg setup time", v: 14, fmt: { suffix: " min" } },
              { k: "annual renewal", v: 96.4, fmt: { suffix: "%", decimals: 1 } },
              { k: "support · first reply", v: 4, fmt: { suffix: " min · median" } },
              { k: "gmv processed", v: 2.4, fmt: { prefix: "$", suffix: "B", decimals: 1 } },
              { k: "states covered", v: 47, fmt: {} },
            ].map((s) => (
              <div key={s.k} style={{ borderTop: "1px solid #292524", paddingTop: 16 }}>
                <div
                  style={{
                    fontSize: "clamp(34px, 4vw, 48px)",
                    fontWeight: 600,
                    color: "#fafaf9",
                    fontFamily: C.mono,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: -1.6,
                  }}
                >
                  <CountUp to={s.v} {...s.fmt} />
                </div>
                <div
                  style={{
                    fontFamily: C.mono,
                    fontSize: 10.5,
                    color: "#a8a29e",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginTop: 6,
                  }}
                >
                  {s.k}
                </div>
              </div>
            ))}
          </div>
          <div
            className="mv-reveal"
            data-d="3"
            style={{ background: "#17120f", border: "1px solid #292524", borderRadius: 6, padding: 24 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div>
                <div
                  style={{
                    fontFamily: C.mono,
                    fontSize: 10.5,
                    color: "#a8a29e",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  monthly recurring revenue
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 600, color: "#fafaf9", letterSpacing: -1, marginTop: 4 }}>
                  $156k <span style={{ color: C.good, fontSize: 12 }}>+13%</span>
                </div>
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: "#a8a29e" }}>last 12 mo · USD</span>
            </div>
            <DrawingChart />
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 07 · TESTIMONIALS
// ═══════════════════════════════════════════════════════════

function Testimonials() {
  const quotes = [
    {
      q: "Closed our first month with no spreadsheet for the first time in 6 years.",
      who: "Amelia Cho",
      role: "Owner · Maple Coffee · Oakland",
      tone: "staffing",
    },
    {
      q: 'Replaced four logins. The crew actually uses it because the punch screen is faster than the wall clock.',
      who: "Devon Park",
      role: "GM · North Pine Salon",
      tone: "punch",
    },
    {
      q: "Inventory used to be Wednesday night and a glass of wine. Now it's Wednesday afternoon.",
      who: "Reza Ahmadi",
      role: "Co-owner · Olive & Stone Bakery",
      tone: "inventory",
    },
  ];
  return (
    <section id="customers" style={{ padding: "120px 32px", background: C.bg }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 48 }}>
          <MonoTag border={false}>05 · in their words</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>read all 318 →</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {quotes.map((t, i) => (
            <figure
              key={i}
              className="mv-reveal"
              data-d={String(i + 1)}
              style={{
                margin: 0,
                padding: 28,
                background: C.paper,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                gap: 24,
                minHeight: 260,
              }}
            >
              <span
                style={{
                  fontFamily: C.mono,
                  fontSize: 10.5,
                  color: C.sec,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                /{t.tone}
              </span>
              <blockquote
                style={{
                  margin: 0,
                  fontSize: 19,
                  lineHeight: 1.42,
                  fontWeight: 500,
                  letterSpacing: -0.4,
                  color: C.text,
                  textWrap: "pretty" as never,
                }}
              >
                &ldquo;{t.q}&rdquo;
              </blockquote>
              <div style={{ flex: 1 }} />
              <figcaption
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: `1px solid ${C.border}`,
                  paddingTop: 14,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 99,
                    background: C.panel,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: C.mono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  {t.who
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t.who}</div>
                  <div style={{ fontSize: 11.5, color: C.sec }}>{t.role}</div>
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
// 08 · PRICING
// ═══════════════════════════════════════════════════════════

function Pricing() {
  const plans = [
    {
      tag: "01",
      name: "Operator",
      price: 49,
      sub: "per location · per month",
      hl: false,
      list: ["Up to 12 staff", "All 6 modules", "iOS + Android apps", "Email support · 24h"],
    },
    {
      tag: "02",
      name: "Multi",
      price: 129,
      sub: "per location · per month",
      hl: true,
      list: ["Unlimited staff", "All 6 modules + analytics", "Multi-location dashboard", "Priority support · 4h median", "Onboarding call"],
    },
  ];
  return (
    <section id="pricing" style={{ padding: "120px 32px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>06 · pricing</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>flat · per-location · no per-seat</span>
        </div>
        <h2
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 56px",
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.6,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 760,
            textWrap: "balance" as never,
          }}
        >
          Two plans. <span style={{ color: C.ter }}>No &ldquo;contact sales&rdquo;.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 880 }}>
          {plans.map((p, i) => (
            <div
              key={p.tag}
              className="mv-reveal"
              data-d={String(i + 1)}
              style={{
                padding: 32,
                borderRadius: 6,
                background: p.hl ? C.ink : C.paper,
                color: p.hl ? "#fff" : C.text,
                border: `1px solid ${p.hl ? C.ink : C.border}`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <span
                  style={{
                    fontFamily: C.mono,
                    fontSize: 10.5,
                    color: p.hl ? "#a8a29e" : C.sec,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {p.tag} · {p.name}
                </span>
                {p.hl && <MonoTag border={false} color="#fafaf9">most picked</MonoTag>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 64, fontWeight: 600, fontFamily: C.sans, letterSpacing: -2.4, lineHeight: 1 }}>
                  ${p.price}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 12, color: p.hl ? "#a8a29e" : C.sec }}>/mo</span>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: p.hl ? "#a8a29e" : C.sec, marginBottom: 24 }}>
                {p.sub}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {p.list.map((it) => (
                  <li key={it} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13.5 }}>
                    <span style={{ fontFamily: C.mono, color: p.hl ? "#a8a29e" : C.ter, width: 12 }}>✓</span>
                    <span style={{ color: p.hl ? "#fafaf9" : C.text2 }}>{it}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 28,
                  padding: "12px 18px",
                  borderRadius: 4,
                  background: p.hl ? "#fafaf9" : C.ink,
                  color: p.hl ? C.ink : "#fff",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Start free · 30 days
                <span style={{ fontFamily: C.mono, fontSize: 12, opacity: 0.7 }}>→</span>
              </Link>
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
    <section id="start" style={{ padding: "120px 32px 0", background: C.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div style={{ position: "relative", textAlign: "center", marginBottom: 64 }}>
          <div className="mv-reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <NotchM size={48} fg={C.ink} />
          </div>
          <h2
            className="mv-reveal"
            data-d="1"
            style={{
              margin: 0,
              fontSize: "clamp(56px, 12vw, 180px)",
              fontWeight: 600,
              letterSpacing: "-0.06em",
              lineHeight: 0.94,
              color: C.ink,
              textWrap: "balance" as never,
            }}
          >
            never run
            <br />
            out again.
          </h2>
          <p
            className="mv-reveal"
            data-d="2"
            style={{
              margin: "32px auto 0",
              maxWidth: 600,
              fontSize: 18,
              color: C.text3,
              lineHeight: 1.5,
              textWrap: "pretty" as never,
            }}
          >
            Connect your POS. We learn your sales for seven days, then start telling you what to order — to the case, by
            the day. Median forecast error: 7.2%.
          </p>
          <div className="mv-reveal" data-d="3" style={{ marginTop: 40, display: "flex", justifyContent: "center", gap: 12 }}>
            <MagneticButton primary href="/signup">
              Start free · 30 days
            </MagneticButton>
            <MagneticButton href="#product">Book a 20-min walkthrough</MagneticButton>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 80,
            paddingTop: 28,
            paddingBottom: 28,
            borderTop: `1px solid ${C.border}`,
            display: "grid",
            gridTemplateColumns: "1fr 2fr 1fr",
            gap: 32,
            fontFamily: C.mono,
            fontSize: 11,
            color: C.sec,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NotchM size={14} fg={C.ink} />
              <Wordmark size={13} ls={-0.6} />
            </div>
            <span>&copy; 2026 Merchiva, Inc.</span>
            <span>Oakland · Brooklyn · remote-first</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {(
              [
                ["Product", [
                  { label: "Features", href: "/features" },
                  { label: "Pricing", href: "/pricing" },
                  { label: "Changelog", href: "/changelog" },
                ]],
                ["Company", [
                  { label: "About", href: "/about" },
                  { label: "Customers", href: "#customers" },
                  { label: "Careers · 4 open", href: "/about" },
                ]],
                ["Resources", [
                  { label: "Docs", href: "#" },
                  { label: "Changelog", href: "/changelog" },
                  { label: "Status", href: "#" },
                ]],
                ["Legal", [
                  { label: "Privacy", href: "#" },
                  { label: "Terms", href: "#" },
                  { label: "DPA", href: "#" },
                  { label: "Security", href: "#" },
                ]],
              ] as [string, { label: string; href: string }[]][]
            ).map(([h, items]) => (
              <div key={h} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ color: C.text, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</span>
                {items.map((x) => (
                  <Link key={x.label} href={x.href} style={{ color: C.sec, textDecoration: "none" }}>
                    {x.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 10 }}>
            <span>
              <span style={{ color: C.good }}>●</span> all systems · 99.99% · 30d
            </span>
            <span>v3.4.812 · build a8c14f</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export function Homepage() {
  useReveal();
  return (
    <main className="mv-landing" style={{ background: C.bg, color: C.text, fontFamily: C.sans }}>
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
