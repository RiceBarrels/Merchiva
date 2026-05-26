"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

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
      data-mv-stack-2
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
              padding: "14px 16px",
              borderRight: i < stats.length - 1 ? `1px solid ${C.border}` : "none",
              borderBottom: `1px solid ${C.border}`,
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
      data-mv-section
      style={{
        position: "relative",
        minHeight: "100vh",
        paddingTop: 120,
        paddingBottom: 64,
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

        <div data-mv-hero-h1><HeroWordmark /></div>

        <div
          data-mv-stack
          style={{
            marginTop: 36,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 36,
            alignItems: "end",
            animation: "mv-fade-up 800ms 700ms both",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.45,
              color: C.text2,
              letterSpacing: -0.2,
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
            <div data-mv-cta-row style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
// 02b · TRUSTED BY — DATA SPONSORS
// ═══════════════════════════════════════════════════════════

const SPONSORS = [
  {
    name: "Bake Culture",
    slug: "bake-culture",
    desc: "Premium Asian-fusion bakery chain bringing Hong Kong–style baking to the Bay Area. Known for their signature pineapple buns, egg tarts, and matcha croissants across 8 locations.",
    stat: "8 locations",
    since: "2024",
    tag: "bakery · retail",
    accent: "#c2956b",
  },
  {
    name: "Devine'r",
    slug: "deviner",
    desc: "A Brooklyn gem where coffee craftsmanship meets genuine hospitality. Expertly roasted beans paired with exceptional pastries — from rich, smooth lattes to unforgettable hot chocolate. 4.6 stars from nearly 100 reviews, a true community gathering place.",
    stat: "4.6★ rating",
    since: "2025",
    tag: "coffee · bakery",
    accent: "#6b4c3b",
  },
];

function SponsorLogo({ name, accent, size = 48 }: { name: string; accent: string; size?: number }) {
  const letter = name[0];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: C.sans,
        fontSize: size * 0.44,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: -1,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function SponsorCard({
  s,
  idx,
  hovered,
  onHover,
}: {
  s: (typeof SPONSORS)[0];
  idx: number;
  hovered: boolean;
  onHover: (h: boolean) => void;
}) {
  return (
    <div
      className="mv-reveal"
      data-d={String(idx + 2)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "relative",
        padding: 32,
        background: hovered ? C.paper : C.surface,
        border: `1px solid ${hovered ? C.borderD : C.border}`,
        borderRadius: 6,
        overflow: "hidden",
        transform: hovered ? "translateY(-4px)" : "none",
        boxShadow: hovered
          ? "0 24px 60px -20px rgba(28,25,23,0.16), 0 8px 20px -10px rgba(28,25,23,0.06)"
          : "none",
        transition:
          "transform 360ms cubic-bezier(.2,.8,.2,1), background 240ms, border-color 240ms, box-shadow 400ms",
        animation: `mv-logo-in 800ms cubic-bezier(.2,.8,.2,1) ${300 + idx * 180}ms both`,
      }}
    >
      {/* Shine sweep on hover */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 0,
            width: "60%",
            height: "100%",
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
            animation: "mv-shine 800ms ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
        <SponsorLogo name={s.name} accent={s.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: C.ink,
                letterSpacing: -0.5,
              }}
            >
              {s.name}
            </span>
            <span
              style={{
                fontFamily: C.mono,
                fontSize: 9.5,
                color: C.sec,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "3px 7px",
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                background: C.paper,
              }}
            >
              {s.tag}
            </span>
          </div>
          <div
            style={{
              fontFamily: C.mono,
              fontSize: 10.5,
              color: C.sec,
              marginTop: 4,
              display: "flex",
              gap: 14,
            }}
          >
            <span>since {s.since}</span>
            <span style={{ color: C.borderD }}>·</span>
            <span>{s.stat}</span>
          </div>
        </div>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: C.text2,
          textWrap: "pretty" as never,
        }}
      >
        {s.desc}
      </p>

      {/* Bottom accent line */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${s.accent}, transparent)`,
          opacity: hovered ? 1 : 0,
          transition: "opacity 400ms",
        }}
      />
    </div>
  );
}

function TrustedBy() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <section
      data-mv-section
      style={{
        padding: "80px 32px 40px",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="mv-reveal"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 12,
          }}
        >
          <MonoTag border={false}>data sponsors</MonoTag>
          <DotLeader />
          <MonoTag border={false}>powering our forecasts with real data</MonoTag>
        </div>

        <h3
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 40px",
            fontSize: "clamp(24px, 3.5vw, 38px)",
            fontWeight: 600,
            letterSpacing: -1.2,
            lineHeight: 1.1,
            color: C.ink,
          }}
        >
          Built with businesses who{" "}
          <span style={{ color: C.ter }}>share their signal</span>.
        </h3>

        {/* Cards */}
        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {SPONSORS.map((s, i) => (
            <SponsorCard
              key={s.slug}
              s={s}
              idx={i}
              hovered={hoverIdx === i}
              onHover={(h) => setHoverIdx(h ? i : null)}
            />
          ))}
        </div>

        {/* Logo scroll strip */}
        <div
          className="mv-reveal"
          data-d="4"
          style={{
            marginTop: 36,
            overflow: "hidden",
            borderTop: `1px solid ${C.border}`,
            borderBottom: `1px solid ${C.border}`,
            padding: "20px 0",
            position: "relative",
          }}
        >
          {/* Fade edges */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 80,
              background: `linear-gradient(to right, ${C.bg}, transparent)`,
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 80,
              background: `linear-gradient(to left, ${C.bg}, transparent)`,
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 0,
              animation: "mv-logo-scroll 20s linear infinite",
              whiteSpace: "nowrap",
              width: "max-content",
            }}
          >
            {[...SPONSORS, ...SPONSORS, ...SPONSORS, ...SPONSORS].map((s, i) => (
              <div
                key={`${s.slug}-${i}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "0 40px",
                }}
              >
                <SponsorLogo name={s.name} accent={s.accent} size={32} />
                <span
                  style={{
                    fontFamily: C.sans,
                    fontSize: 18,
                    fontWeight: 600,
                    color: C.text3,
                    letterSpacing: -0.4,
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    fontFamily: C.mono,
                    fontSize: 10,
                    color: C.ter,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  {s.tag}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Connector line decoration */}
        <div
          className="mv-reveal"
          data-d="5"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            marginTop: 24,
          }}
        >
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${C.borderD}` }} />
          <span
            style={{
              fontFamily: C.mono,
              fontSize: 10.5,
              color: C.ter,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            their data trains our models · your forecasts get better
          </span>
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${C.borderD}` }} />
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

// ─── iPhone shell + Dynamic Island ──────────────────────────

function PhoneIcon({ kind }: { kind: "trend" | "cloud" | "box" | "check" | "bar" | "dot" }) {
  const stroke = "currentColor";
  switch (kind) {
    case "trend":
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 12 L7 7 L10 9 L14 4" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 4 H14 V8" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "cloud":
      return (
        <svg width="13" height="11" viewBox="0 0 18 14" fill="none" aria-hidden>
          <path d="M5 11 a3 3 0 0 1 -0.5 -6 a4.5 4.5 0 0 1 8.5 -0.5 a3 3 0 0 1 0 6.5 z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6 12.5 V13.5 M9.5 12.5 V13.5 M13 12.5 V13.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "box":
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2.5" y="3" width="11" height="10" rx="1" stroke={stroke} strokeWidth="1.4" />
          <path d="M2.5 6 H13.5 M8 3 V13" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "check":
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8 L7 12 L13 4" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bar":
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 13 V8 M7.5 13 V5 M12 13 V10" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "dot":
      return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: "currentColor" }} />;
  }
}

const ISLAND_MESSAGES: { icon: "trend" | "cloud" | "box" | "check" | "bar" | "dot"; title: string; sub: string; accent: string }[][] = [
  // forecast
  [
    { icon: "trend", title: "628L predicted", sub: "next 14d · 87% conf", accent: "#34d399" },
    { icon: "cloud", title: "Rain → +18%", sub: "iced drinks · Wed", accent: "#60a5fa" },
  ],
  // reorder
  [
    { icon: "box", title: "Reorder by May 14", sub: "12 SKUs · oat milk", accent: "#fbbf24" },
    { icon: "check", title: "PO #4812 sent", sub: "Pacific · 23 cases", accent: "#34d399" },
  ],
  // inventory
  [
    { icon: "box", title: "Cups: 2.1 days left", sub: "ETA Thu · 4 cases", accent: "#fbbf24" },
    { icon: "dot", title: "Stock OK · 92 SKUs", sub: "8 below threshold", accent: "#34d399" },
  ],
  // sales
  [
    { icon: "trend", title: "+12% vs last week", sub: "Today · $4,820", accent: "#34d399" },
    { icon: "bar", title: "Peak: 10–11 AM", sub: "84 orders / hr", accent: "#60a5fa" },
  ],
];

function DynamicIsland({ activeView }: { activeView: number }) {
  const messages = ISLAND_MESSAGES[activeView] ?? [];
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"collapsed" | "open">("collapsed");

  // Open shortly after mount / view change, then cycle messages
  useEffect(() => {
    if (messages.length === 0) return;
    setIdx(0);
    setPhase("collapsed");
    const openTo = setTimeout(() => setPhase("open"), 380);

    const cycle = setInterval(() => {
      // collapse → swap content → reopen
      setPhase("collapsed");
      setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setPhase("open");
      }, 380);
    }, 3600);

    return () => {
      clearTimeout(openTo);
      clearInterval(cycle);
    };
  }, [activeView, messages.length]);

  const m = messages[idx];
  const open = phase === "open" && !!m;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 9,
        left: "50%",
        transform: "translateX(-50%)",
        height: open ? 36 : 28,
        width: open ? 224 : 104,
        background: "#000",
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        gap: 9,
        paddingInline: open ? 10 : 0,
        overflow: "hidden",
        color: "#fafaf9",
        boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.05)",
        transition:
          "width 520ms cubic-bezier(.22,.9,.22,1), height 520ms cubic-bezier(.22,.9,.22,1), padding-inline 520ms cubic-bezier(.22,.9,.22,1)",
        willChange: "width, height",
        zIndex: 6,
      }}
    >
      {open && m && (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            animation: "mv-island-in 460ms cubic-bezier(.2,.8,.25,1) both",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 99,
              background: m.accent,
              color: "#0c0a09",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <PhoneIcon kind={m.icon} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: -0.15,
                lineHeight: 1.05,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {m.title}
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.55)",
                fontFamily: C.mono,
                letterSpacing: 0.2,
                lineHeight: 1.05,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {m.sub}
            </div>
          </div>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 99,
              background: m.accent,
              flexShrink: 0,
              boxShadow: `0 0 8px ${m.accent}`,
              animation: "mv-pulse 1.6s ease-in-out infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}

function IPhoneShell({
  children,
  activeView,
  tx,
  ty,
}: {
  children: React.ReactNode;
  activeView: number;
  tx: number;
  ty: number;
}) {
  return (
    <div
      className="mv-phone"
      style={{
        width: "100%",
        maxWidth: 400,
        margin: "0 auto",
        position: "relative",
        transform: `perspective(1400px) rotateY(${tx * 0.3}deg) rotateX(${ty * 0.3}deg)`,
        transformStyle: "preserve-3d",
        transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* outer titanium body */}
      <div
        style={{
          padding: 10,
          borderRadius: 52,
          background:
            "linear-gradient(160deg, #1c1917 0%, #0c0a09 55%, #1c1917 100%)",
          boxShadow:
            "0 40px 80px -30px rgba(28,25,23,0.45), 0 14px 30px -16px rgba(28,25,23,0.28), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 0 0 1px #1c1917",
          position: "relative",
        }}
      >
        {/* side buttons */}
        <span style={{ position: "absolute", left: -2, top: 96, width: 3, height: 26, borderRadius: 2, background: "#0c0a09" }} />
        <span style={{ position: "absolute", left: -2, top: 138, width: 3, height: 48, borderRadius: 2, background: "#0c0a09" }} />
        <span style={{ position: "absolute", left: -2, top: 196, width: 3, height: 48, borderRadius: 2, background: "#0c0a09" }} />
        <span style={{ position: "absolute", right: -2, top: 138, width: 3, height: 72, borderRadius: 2, background: "#0c0a09" }} />

        {/* screen */}
        <div
          style={{
            borderRadius: 42,
            overflow: "hidden",
            background: C.paper,
            position: "relative",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {/* status bar */}
          <div
            style={{
              position: "relative",
              height: 52,
              padding: "14px 26px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: C.sans,
              fontSize: 13,
              fontWeight: 600,
              color: C.ink,
              zIndex: 5,
            }}
          >
            <span style={{ letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>9:41</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {/* signal */}
              <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden>
                <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
                <rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="currentColor" />
                <rect x="9" y="3" width="3" height="8" rx="0.5" fill="currentColor" />
                <rect x="13.5" y="1" width="3" height="10" rx="0.5" fill="currentColor" />
              </svg>
              {/* wifi */}
              <svg width="14" height="11" viewBox="0 0 16 12" fill="none" aria-hidden>
                <path d="M1 4.3 a10 10 0 0 1 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M3.5 6.8 a6.4 6.4 0 0 1 9 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M6 9.3 a3 3 0 0 1 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="8" cy="10.7" r="0.9" fill="currentColor" />
              </svg>
              {/* battery */}
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <span style={{ width: 22, height: 11, border: "1.2px solid currentColor", borderRadius: 3, padding: 1.5, display: "flex" }}>
                  <span style={{ background: "currentColor", height: "100%", width: "80%", borderRadius: 1 }} />
                </span>
                <span style={{ width: 1.5, height: 4, background: "currentColor", borderRadius: 0.5, marginLeft: 1 }} />
              </span>
            </span>
          </div>

          {/* Dynamic Island — sits on top of the status bar */}
          <DynamicIsland activeView={activeView} />

          {/* content viewport — overlay is sibling so it doesn't scroll with content */}
          <div style={{ position: "relative", height: 520, background: C.paper, overflow: "hidden" }}>
            <div
              className="mv-phone-screen"
              style={{ height: "100%", overflowX: "auto", overflowY: "hidden" }}
            >
              <div className="mv-phone-screen-inner" style={{ minWidth: 640, height: "100%" }}>
                {children}
              </div>
            </div>
            {/* scan-line overlay */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background: "linear-gradient(to bottom, transparent 0%, rgba(217,119,6,0.06) 50%, transparent 100%)",
                height: 60,
                animation: "mv-scan-y 6s ease-in-out infinite",
              }}
            />
          </div>

          {/* home indicator */}
          <div
            style={{
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: C.paper,
            }}
          >
            <span style={{ width: 124, height: 4, borderRadius: 99, background: C.ink, opacity: 0.85 }} />
          </div>
        </div>
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
    <section id="product" data-mv-section style={{ padding: "120px 32px 80px", position: "relative" }}>
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
              fontSize: "clamp(28px, 5vw, 64px)",
              fontWeight: 600,
              letterSpacing: -1.4,
              lineHeight: 1.05,
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

        {/* iPhone */}
        <div className="mv-reveal" data-d="3" style={{ marginTop: 32, position: "relative" }}>
          <IPhoneShell activeView={active} tx={tx} ty={ty}>
            <div
              key={active}
              style={{
                animation: "mv-fade-up 480ms cubic-bezier(.2,.8,.2,1) both",
                height: "100%",
              }}
            >
              {active === 0 && <ViewForecast />}
              {active === 1 && <ViewReorder />}
              {active === 2 && <ViewInventory />}
              {active === 3 && <ViewSales />}
            </div>
          </IPhoneShell>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 03b · MR. MERCHIVA AUTO-SCHEDULER
// ═══════════════════════════════════════════════════════════

type DemoShift = {
  day: number;
  dh: string;
  s: number;
  e: number;
  name: string;
  initials: string;
  color: string;
  reason: string;
};

const SCHEDULE_SHIFTS: DemoShift[] = [
  { day: 0, dh: "Mon", s: 7,  e: 13, name: "Sarah",  initials: "SK", color: "#fbbf24", reason: "Sarah opens Mon — she's flagged \"early-bird\" in availability." },
  { day: 0, dh: "Mon", s: 13, e: 19, name: "Mateo",  initials: "MR", color: "#60a5fa", reason: "Mateo on close — 1h overlap with Sarah for handover." },
  { day: 1, dh: "Tue", s: 7,  e: 13, name: "Priya",  initials: "PS", color: "#34d399", reason: "Priya leads Tue AM — payday lift forecast +14%." },
  { day: 1, dh: "Tue", s: 13, e: 19, name: "Sarah",  initials: "SK", color: "#fbbf24", reason: "Sarah doubles Tue PM — Mateo unavailable after 1 pm." },
  { day: 2, dh: "Wed", s: 8,  e: 14, name: "Mateo",  initials: "MR", color: "#60a5fa", reason: "Mateo opens Wed — Sarah requested mid-week PM." },
  { day: 2, dh: "Wed", s: 14, e: 20, name: "Devon",  initials: "DP", color: "#a78bfa", reason: "Devon trains Wed PM — first solo close (Priya nearby)." },
  { day: 3, dh: "Thu", s: 7,  e: 13, name: "Priya",  initials: "PS", color: "#34d399", reason: "Thursday rush — senior on bar opens cleaner." },
  { day: 3, dh: "Thu", s: 13, e: 19, name: "Sarah",  initials: "SK", color: "#fbbf24", reason: "Sarah closes Thu — coverage gap solved without OT." },
  { day: 4, dh: "Fri", s: 7,  e: 13, name: "Mateo",  initials: "MR", color: "#60a5fa", reason: "Mateo Fri AM — weather says +22% iced drinks." },
  { day: 4, dh: "Fri", s: 13, e: 20, name: "Priya",  initials: "PS", color: "#34d399", reason: "Priya extended close — payday + Friday happy hour." },
  { day: 5, dh: "Sat", s: 8,  e: 14, name: "Devon",  initials: "DP", color: "#a78bfa", reason: "Devon Sat AM — soft demand, good day to keep training." },
  { day: 5, dh: "Sat", s: 14, e: 20, name: "Sarah",  initials: "SK", color: "#fbbf24", reason: "Sarah Sat close — Mateo flagged Sat PTO last month." },
  { day: 6, dh: "Sun", s: 9,  e: 15, name: "Priya",  initials: "PS", color: "#34d399", reason: "Priya solo Sun AM — brunch crowd, predictable mix." },
  { day: 6, dh: "Sun", s: 15, e: 19, name: "Mateo",  initials: "MR", color: "#60a5fa", reason: "Mateo wraps the week — Sun close keeps payroll under cap." },
];

function MiniSpinner({ size = 12, color = "#fafaf9" }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "1.5px solid rgba(255,255,255,0.18)",
        borderTopColor: color,
        borderRadius: "50%",
        animation: "mv-spin 0.8s linear infinite",
      }}
    />
  );
}

function SchedulingDemo() {
  const total = SCHEDULE_SHIFTS.length;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= total) {
      const t = setTimeout(() => setStep(0), 3500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 700 : 560);
    return () => clearTimeout(t);
  }, [step, total]);

  const placed = SCHEDULE_SHIFTS.slice(0, step);
  const recent = placed.slice(-3);
  const isComplete = step >= total;

  const HOUR_START = 6;
  const HOUR_END = 22;
  const ROW_H = 18;
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const totalHours = placed.reduce((sum, s) => sum + (s.e - s.s), 0);

  return (
    <section id="scheduling" data-mv-section style={{ padding: "60px 32px 100px", background: C.bg, position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 24 }}>
          <MonoTag border={false}>02b · auto-scheduler</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>writing next week · auto-cycle</span>
        </div>
        <h2
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 14px",
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 900,
            textWrap: "balance" as never,
          }}
        >
          Mr. Merchiva writes <span style={{ color: C.ter }}>next week&apos;s schedule</span>.
        </h2>
        <p
          className="mv-reveal"
          data-d="2"
          style={{
            margin: "0 0 36px",
            fontSize: 17,
            color: C.text3,
            lineHeight: 1.5,
            maxWidth: 680,
            textWrap: "pretty" as never,
          }}
        >
          He reads availability, payroll caps, last week&apos;s trades, and the weather — then drops a full week of shifts in under a minute. Approve in one tap, or let it auto-commit.
        </p>

        <div
          className="mv-reveal"
          data-d="3"
          data-mv-stack-lg
          style={{
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {/* Mr. Merchiva chat panel */}
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 460,
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: C.surface,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: C.ink,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NotchM size={20} fg="#fafaf9" />
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background: isComplete ? C.good : C.accent,
                    border: `2px solid ${C.surface}`,
                    animation: "mv-pulse 1.6s ease-in-out infinite",
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
                  Mr. Merchiva
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, marginTop: 2, letterSpacing: 0.3 }}>
                  {isComplete ? `done · ${total} shifts placed` : `scheduling · ${step}/${total}`}
                </div>
              </div>
              {!isComplete && <MiniSpinner size={12} color={C.ink} />}
            </div>

            <div
              style={{
                flex: 1,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                justifyContent: "flex-end",
                overflow: "hidden",
              }}
            >
              {recent.map((shift, i) => {
                const globalIdx = placed.length - recent.length + i;
                return (
                  <div
                    key={globalIdx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      animation: "mv-msg-in 380ms cubic-bezier(.2,.85,.25,1) both",
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        background: C.ink,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <NotchM size={14} fg="#fafaf9" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: "8px 11px",
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          color: C.text,
                          textWrap: "pretty" as never,
                        }}
                      >
                        {shift.reason}
                      </div>
                      <div
                        style={{
                          fontFamily: C.mono,
                          fontSize: 9.5,
                          color: C.ter,
                          marginTop: 4,
                          paddingLeft: 2,
                          letterSpacing: 0.2,
                        }}
                      >
                        <span style={{ color: shift.color }}>●</span>{" "}
                        {shift.dh.toLowerCase()} · {shift.s.toString().padStart(2, "0")}:00–{shift.e.toString().padStart(2, "0")}:00 · {shift.name}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isComplete && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "rgba(5,150,105,0.06)",
                    border: "1px solid rgba(5,150,105,0.22)",
                    borderRadius: 8,
                    animation: "mv-fade-up 380ms cubic-bezier(.2,.85,.25,1) both",
                    marginTop: 2,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 8 L7 12 L13 4" stroke={C.good} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.good }}>
                    Week ready · {total} shifts · {totalHours}h
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>under budget</span>
                </div>
              )}
            </div>
          </div>

          {/* Week grid */}
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
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
                week of may 13 · 2026
              </span>
              <DotLeader />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>
                {step} / {total} shifts · {totalHours}h
              </span>
            </div>

            <div style={{ flex: 1, padding: "10px 14px 14px" }}>
              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", marginBottom: 6 }}>
                <div />
                {DAYS.map((d) => (
                  <div
                    key={d}
                    style={{
                      fontFamily: C.mono,
                      fontSize: 10,
                      color: C.sec,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      paddingLeft: 4,
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 0 }}>
                {/* Hour labels */}
                <div style={{ position: "relative", height: ROW_H * HOURS.length }}>
                  {HOURS.filter((h) => h % 2 === 0).map((h) => (
                    <div
                      key={h}
                      style={{
                        position: "absolute",
                        top: (h - HOUR_START) * ROW_H - 5,
                        right: 8,
                        fontFamily: C.mono,
                        fontSize: 9,
                        color: C.ter,
                        letterSpacing: 0.2,
                      }}
                    >
                      {h.toString().padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* Calendar body */}
                <div style={{ position: "relative", height: ROW_H * HOURS.length, borderLeft: `1px solid ${C.border}` }}>
                  {/* horizontal hour lines */}
                  {HOURS.filter((h) => h % 2 === 0).map((h) => (
                    <div
                      key={h}
                      style={{
                        position: "absolute",
                        top: (h - HOUR_START) * ROW_H,
                        left: 0,
                        right: 0,
                        height: 1,
                        background: C.border,
                        pointerEvents: "none",
                      }}
                    />
                  ))}
                  {/* vertical day dividers */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      pointerEvents: "none",
                    }}
                  >
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          borderRight: i < 6 ? `1px dashed ${C.border}` : "none",
                        }}
                      />
                    ))}
                  </div>

                  {/* shift cards */}
                  {placed.map((s, i) => {
                    const top = (s.s - HOUR_START) * ROW_H;
                    const height = (s.e - s.s) * ROW_H - 2;
                    const left = `calc(${s.day} * (100% / 7) + 2px)`;
                    const width = `calc((100% / 7) - 4px)`;
                    const isLatest = i === placed.length - 1;
                    return (
                      <div
                        key={`${s.day}-${s.s}-${s.name}-${i}`}
                        style={{
                          position: "absolute",
                          top,
                          left,
                          width,
                          height,
                          background: s.color,
                          borderRadius: 4,
                          padding: "3px 5px 3px 6px",
                          color: "#0c0a09",
                          letterSpacing: -0.1,
                          lineHeight: 1.12,
                          boxShadow: isLatest
                            ? "0 8px 14px -6px rgba(28,25,23,0.32), inset 0 0 0 1px rgba(12,10,9,0.06)"
                            : "inset 0 0 0 1px rgba(12,10,9,0.06)",
                          animation: "mv-shift-in 420ms cubic-bezier(.2,1,.35,1) both",
                          overflow: "hidden",
                          fontFamily: C.sans,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span
                            style={{
                              width: 13,
                              height: 13,
                              borderRadius: 99,
                              background: "rgba(12,10,9,0.18)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 7.5,
                              fontWeight: 700,
                              fontFamily: C.mono,
                              flexShrink: 0,
                            }}
                          >
                            {s.initials}
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.name}
                          </span>
                        </div>
                        {height > 28 && (
                          <div
                            style={{
                              fontFamily: C.mono,
                              fontSize: 8.5,
                              color: "rgba(12,10,9,0.62)",
                              marginTop: 1,
                              letterSpacing: 0.2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {s.s.toString().padStart(2, "0")}:00–{s.e.toString().padStart(2, "0")}:00
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* "Mr. Merchiva is here" cursor — points at the latest column being filled */}
                  {!isComplete && (() => {
                    const next = SCHEDULE_SHIFTS[step];
                    if (!next) return null;
                    return (
                      <div
                        style={{
                          position: "absolute",
                          top: (next.s - HOUR_START) * ROW_H - 4,
                          left: `calc(${next.day} * (100% / 7) + 2px)`,
                          width: `calc((100% / 7) - 4px)`,
                          height: (next.e - next.s) * ROW_H,
                          border: `1.5px dashed ${C.accent}`,
                          borderRadius: 4,
                          opacity: 0.55,
                          animation: "mv-pulse 1.1s ease-in-out infinite",
                          pointerEvents: "none",
                        }}
                      />
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// 03c · MERCHIVA POS — SCAN TO RECEIPT
// ═══════════════════════════════════════════════════════════

type POSProduct = { id: number; name: string; price: number; tag: string };

const POS_PRODUCTS: POSProduct[] = [
  { id: 1, name: "Iced Latte",       price: 6.5,  tag: "drinks" },
  { id: 2, name: "Almond Croissant", price: 4.25, tag: "bakery" },
  { id: 3, name: "Double Espresso",  price: 3.0,  tag: "drinks" },
  { id: 4, name: "Avocado Toast",    price: 8.5,  tag: "food"   },
  { id: 5, name: "Matcha Latte",     price: 5.75, tag: "drinks" },
  { id: 6, name: "Cold Brew",        price: 4.75, tag: "drinks" },
];

// Indices into POS_PRODUCTS — order in which items are scanned each cycle.
const POS_SEQUENCE = [0, 1, 2, 0, 4];

function POSDemo() {
  // Phases per cycle:
  //   0..N-1   → scan item N
  //   N        → charging
  //   N+1      → done (receipt printed)
  //   N+2      → reset
  const totalSteps = POS_SEQUENCE.length + 2;
  const [step, setStep] = useState(0);

  useEffect(() => {
    let delay = 900;
    if (step === POS_SEQUENCE.length) delay = 1300; // charging spinner
    if (step === POS_SEQUENCE.length + 1) delay = 2000; // hold "Charged" state
    if (step >= totalSteps) {
      const t = setTimeout(() => setStep(0), 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step, totalSteps]);

  const phase: "scanning" | "charge" | "done" =
    step < POS_SEQUENCE.length ? "scanning" : step === POS_SEQUENCE.length ? "charge" : "done";

  const pickedIndices = POS_SEQUENCE.slice(0, Math.min(step, POS_SEQUENCE.length));
  const highlightedIdx = phase === "scanning" ? POS_SEQUENCE[step] : -1;

  const cartItems = useMemo(() => {
    const counts: Record<number, number> = {};
    pickedIndices.forEach((idx) => {
      counts[idx] = (counts[idx] ?? 0) + 1;
    });
    return Object.entries(counts).map(([idx, qty]) => ({ p: POS_PRODUCTS[parseInt(idx, 10)], qty }));
    // intentionally key by joined indices so equal cart shape memoizes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedIndices.join(",")]);

  const subtotal = cartItems.reduce((sum, x) => sum + x.p.price * x.qty, 0);
  const tax = subtotal * 0.08;
  const grand = subtotal + tax;
  const itemCount = cartItems.reduce((a, b) => a + b.qty, 0);

  return (
    <section id="pos" data-mv-section style={{ padding: "60px 32px 100px", background: C.bg }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 24 }}>
          <MonoTag border={false}>02c · merchiva POS</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>scan · cart · charge</span>
        </div>
        <h2
          className="mv-reveal"
          data-d="1"
          style={{
            margin: "0 0 14px",
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 820,
            textWrap: "balance" as never,
          }}
        >
          From scan to receipt <span style={{ color: C.ter }}>in four taps</span>.
        </h2>
        <p
          className="mv-reveal"
          data-d="2"
          style={{
            margin: "0 0 36px",
            fontSize: 17,
            color: C.text3,
            lineHeight: 1.5,
            maxWidth: 640,
            textWrap: "pretty" as never,
          }}
        >
          The Merchiva register shares the same catalog and stock counts as your dashboard. Every sale updates the forecast in the same second — no overnight sync.
        </p>

        <div
          className="mv-reveal"
          data-d="3"
          data-mv-stack-lg
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {/* Product grid */}
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
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
                catalog · {POS_PRODUCTS.length} items
              </span>
              <DotLeader />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>terminal · 03</span>
            </div>
            <div
              style={{
                flex: 1,
                padding: 12,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gridAutoRows: "minmax(96px, 1fr)",
                gap: 10,
              }}
            >
              {POS_PRODUCTS.map((p, i) => {
                const isHighlighted = i === highlightedIdx;
                return (
                  <div
                    key={p.id}
                    style={{
                      position: "relative",
                      border: `1px solid ${isHighlighted ? C.ink : C.border}`,
                      borderRadius: 6,
                      padding: 12,
                      background: isHighlighted ? C.ink : C.paper,
                      color: isHighlighted ? "#fafaf9" : C.ink,
                      transition: "background 220ms, color 220ms, border-color 220ms, transform 220ms, box-shadow 220ms",
                      transform: isHighlighted ? "scale(1.025)" : "scale(1)",
                      boxShadow: isHighlighted
                        ? "0 14px 26px -12px rgba(28,25,23,0.45)"
                        : "0 1px 0 rgba(28,25,23,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: C.mono,
                        fontSize: 9,
                        color: isHighlighted ? "#a8a29e" : C.sec,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {p.tag}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.2 }}>
                      {p.name}
                    </div>
                    <div
                      style={{
                        marginTop: "auto",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: C.mono,
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: -0.4,
                        }}
                      >
                        ${p.price.toFixed(2)}
                      </span>
                      {isHighlighted && (
                        <span
                          style={{
                            fontFamily: C.mono,
                            fontSize: 9,
                            padding: "1px 6px",
                            background: "rgba(250,250,249,0.18)",
                            borderRadius: 3,
                            letterSpacing: 0.4,
                            color: "#fafaf9",
                          }}
                        >
                          scan
                        </span>
                      )}
                    </div>
                    {isHighlighted && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: -4,
                          pointerEvents: "none",
                          borderRadius: 9,
                          border: `2px solid ${C.accent}`,
                          animation: "mv-ring-in 360ms cubic-bezier(.2,.85,.25,1) both",
                          opacity: 0.55,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart panel */}
          <div
            style={{
              background: C.paper,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 420,
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
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
                cart · {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <DotLeader />
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec }}>queue #4218</span>
            </div>

            <div style={{ flex: 1, padding: "4px 0", overflow: "hidden" }}>
              {cartItems.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12.5,
                    color: C.ter,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  Scan an item to begin
                </div>
              ) : (
                cartItems.map((it, i) => (
                  <div
                    key={it.p.id}
                    style={{
                      padding: "11px 16px",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      borderBottom: i < cartItems.length - 1 ? `1px solid ${C.border}` : "none",
                      animation:
                        i === cartItems.length - 1 && phase === "scanning"
                          ? "mv-line-in 360ms cubic-bezier(.2,.85,.25,1) both"
                          : undefined,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: C.mono,
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: C.text,
                        background: C.surface,
                        padding: "2px 6px",
                        borderRadius: 3,
                        border: `1px solid ${C.border}`,
                        letterSpacing: 0.3,
                      }}
                    >
                      ×{it.qty}
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        color: C.text,
                        fontWeight: 500,
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.p.name}
                    </span>
                    <span
                      style={{
                        fontFamily: C.mono,
                        fontSize: 12,
                        color: C.text,
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${(it.p.price * it.qty).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Totals + charge */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px 16px", background: C.surface }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: C.text3,
                  marginBottom: 4,
                  fontFamily: C.mono,
                }}
              >
                <span>Subtotal</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>${subtotal.toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: C.text3,
                  marginBottom: 10,
                  fontFamily: C.mono,
                }}
              >
                <span>Tax · 8%</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>${tax.toFixed(2)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 15.5,
                  color: C.ink,
                  fontWeight: 600,
                  marginBottom: 12,
                  letterSpacing: -0.2,
                }}
              >
                <span>Total</span>
                <span
                  style={{
                    fontFamily: C.mono,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: -0.4,
                  }}
                >
                  ${grand.toFixed(2)}
                </span>
              </div>
              <div
                role="button"
                aria-disabled
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  borderRadius: 4,
                  background:
                    phase === "done" ? C.good : phase === "charge" ? C.ink : itemCount === 0 ? C.ter : C.ink,
                  color: "#fafaf9",
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "background 320ms",
                  animation:
                    phase === "scanning" && itemCount > 0
                      ? "mv-glow 2.4s ease-in-out infinite"
                      : undefined,
                }}
              >
                {phase === "scanning" && itemCount === 0 && "Tap to charge"}
                {phase === "scanning" && itemCount > 0 && (
                  <>
                    Tap to charge{" "}
                    <span
                      style={{
                        fontFamily: C.mono,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${grand.toFixed(2)}
                    </span>
                  </>
                )}
                {phase === "charge" && (
                  <>
                    <MiniSpinner size={12} color="#fafaf9" />
                    Processing…
                  </>
                )}
                {phase === "done" && (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M3 8 L7 12 L13 4"
                        stroke="#fff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Charged{" "}
                    <span
                      style={{
                        fontFamily: C.mono,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ${grand.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: C.mono,
                  fontSize: 10,
                  color: C.sec,
                  display: "flex",
                  justifyContent: "space-between",
                  letterSpacing: 0.2,
                }}
              >
                <span>
                  {phase === "done" ? (
                    <>
                      receipt #4218 · printed ·{" "}
                      <span style={{ color: C.good }}>stock + forecast updated</span>
                    </>
                  ) : (
                    "tap · swipe · contactless · gift card"
                  )}
                </span>
              </div>
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
    <section id="modules" data-mv-section style={{ padding: "120px 32px", background: C.bg }}>
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
            margin: "0 0 40px",
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 1000,
            textWrap: "balance" as never,
          }}
        >
          Six things our forecast does that <span style={{ color: C.ter }}>your spreadsheet can&apos;t</span>.
        </h2>
        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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
      data-mv-section
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

        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48, alignItems: "center" }}>
          <div className="mv-reveal" data-d="2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
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
    <section id="customers" data-mv-section style={{ padding: "120px 32px", background: C.bg }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="mv-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 32 }}>
          <MonoTag border={false}>05 · in their words</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec }}>read all 318 →</span>
        </div>
        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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
    <section id="pricing" data-mv-section style={{ padding: "120px 32px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
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
            margin: "0 0 36px",
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.04,
            color: C.ink,
            maxWidth: 760,
            textWrap: "balance" as never,
          }}
        >
          Two plans. <span style={{ color: C.ter }}>No &ldquo;contact sales&rdquo;.</span>
        </h2>
        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 880 }}>
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
    <section id="start" data-mv-section style={{ padding: "120px 32px 80px", background: C.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div style={{ position: "relative", textAlign: "center" }}>
          <div className="mv-reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <NotchM size={48} fg={C.ink} />
          </div>
          <h2
            className="mv-reveal"
            data-d="1"
            data-mv-hero-h1
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
              margin: "28px auto 0",
              maxWidth: 600,
              fontSize: 17,
              color: C.text3,
              lineHeight: 1.5,
              textWrap: "pretty" as never,
            }}
          >
            Connect your POS. We learn your sales for seven days, then start telling you what to order — to the case, by
            the day. Median forecast error: 7.2%.
          </p>
          <div className="mv-reveal" data-d="3" data-mv-cta-row style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <MagneticButton primary href="/signup">
              Start free · 30 days
            </MagneticButton>
            <MagneticButton href="#product">Book a 20-min walkthrough</MagneticButton>
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
    <SiteShell active="product" background={C.bg}>
      <Hero />
      <TrustedBy />
      <LiveDashboard />
      <SchedulingDemo />
      <POSDemo />
      <Marquee />
      <FeatureGrid />
      <Metrics />
      <Testimonials />
      <Pricing />
      <CTAFooter />
    </SiteShell>
  );
}
