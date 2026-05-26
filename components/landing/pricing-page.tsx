"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

const P = {
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
  accentSoft: "oklch(0.92 0.04 65)",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
};

// ─── Hooks ──────────────────────────────────────────────────

function useTick(fps = 30, run = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const interval = 1000 / fps;
    let last = performance.now();
    let raf: number;
    const loop = (t: number) => {
      if (t - last >= interval) { last = t; setTick((x) => (x + 1) % 1e9); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, run]);
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".p-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
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

// ─── Primitives ─────────────────────────────────────────────

function NotchM({ size = 28, fg = P.ink }: { size?: number; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: 3, display: "block" }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

function Wordmark({ size = 22, color = P.ink, ls = -1.2 }: { size?: number; color?: string; ls?: number }) {
  return <span style={{ fontFamily: P.sans, fontWeight: 600, fontSize: size, color, letterSpacing: ls, lineHeight: 1 }}>Merchiva</span>;
}

function MonoTag({ children, color = P.sec, border = true }: { children: React.ReactNode; color?: string; border?: boolean }) {
  return (
    <span style={{
      fontFamily: P.mono, fontSize: 10.5, color, letterSpacing: 0.4, textTransform: "uppercase",
      border: border ? `1px solid ${P.border}` : "none",
      padding: border ? "4px 8px" : 0, borderRadius: 3, background: border ? P.paper : "transparent",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>{children}</span>
  );
}

function DotLeader({ color = P.borderD }: { color?: string }) {
  return <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${color}`, transform: "translateY(-2px)" }} />;
}

// ═══════════════════════════════════════════════════════════
// HERO
// ═══════════════════════════════════════════════════════════

function HeroBackdrop() {
  const m = useMouse();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: "-40px",
        backgroundImage: `radial-gradient(${P.borderD} 1px, transparent 1px)`,
        backgroundSize: "24px 24px", opacity: 0.6,
        animation: "mv-drift 18s linear infinite",
        maskImage: "radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse at 50% 50%, black 30%, transparent 75%)",
      }} />
      <div style={{
        position: "absolute",
        left: `calc(${m.x * 100}% - 320px)`, top: `calc(${m.y * 100}% - 320px)`,
        width: 640, height: 640, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(217,119,6,0.08), transparent 60%)",
        transition: "left 240ms ease-out, top 240ms ease-out",
      }} />
    </div>
  );
}

function HeroHeadline() {
  const lines = ["simple", "pricing."];
  let idx = 0;
  return (
    <h1 style={{
      margin: 0, fontFamily: P.sans, fontWeight: 600,
      fontSize: "clamp(72px, 12vw, 200px)", lineHeight: 0.92,
      letterSpacing: "-0.06em", color: P.ink,
    }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap" }}>
          {line.split("").map((c) => {
            const i = idx++;
            return (
              <span key={i} style={{
                display: "inline-block",
                color: c === "." ? P.accent : "inherit",
                whiteSpace: "pre",
                animation: `mv-letter-in 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 50}ms both`,
              }}>{c === " " ? " " : c}</span>
            );
          })}
        </div>
      ))}
    </h1>
  );
}

function Hero() {
  return (
    <section data-mv-section style={{ position: "relative", paddingTop: 140, paddingBottom: 80, paddingLeft: 32, paddingRight: 32, overflow: "hidden" }}>
      <HeroBackdrop />
      <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto" }}>
        <div data-mv-stack style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36, animation: "mv-fade-up 700ms 60ms both", flexWrap: "wrap" }}>
          <MonoTag>
            <span style={{ width: 6, height: 6, background: P.good, borderRadius: "50%" }} />
            01 · pricing · effective may 2026
          </MonoTag>
          <span style={{ fontSize: 13, color: P.sec, letterSpacing: -0.1 }}>
            Per-location, flat. No per-seat. No per-SKU. No &ldquo;contact sales&rdquo;.
          </span>
        </div>
        <div data-mv-hero-h1><HeroHeadline /></div>
        <div data-mv-stack style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, alignItems: "end", animation: "mv-fade-up 800ms 700ms both" }}>
          <p style={{ margin: 0, fontSize: 22, lineHeight: 1.4, color: P.text2, letterSpacing: -0.3, maxWidth: 640, fontWeight: 400, textWrap: "pretty" as never }}>
            One forecast engine, three plans. Start free for 30 days, then pay per location — your forecasts, your reorder POs, your data, all included. <em style={{ color: P.ink, fontStyle: "normal", fontWeight: 600 }}>Cancel any time.</em>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <div style={{ fontFamily: P.mono, fontSize: 12, color: P.text2, padding: "10px 14px", border: `1px solid ${P.border}`, background: P.paper, borderRadius: 4, lineHeight: 1.5 }}>
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
// BILLING TOGGLE + PLAN CARDS
// ═══════════════════════════════════════════════════════════

const PLAN_DATA = [
  {
    id: "starter", tag: "P01", name: "Starter", sub: "For one shop, getting set up.",
    monthly: 49, yearly: 39,
    features: ["Up to 250 SKUs", "Daily forecasts · 14-day window", "80% confidence bands", "Auto reorder suggestions", "Email + Slack alerts", "CSV export", "Email support · 24h"],
    notIncluded: ["Hourly forecasts", "Multi-location", "API access"],
    cta: "Start free · 30 days", highlight: false,
  },
  {
    id: "operator", tag: "P02", name: "Operator", sub: "For shops that run on the forecast.",
    monthly: 129, yearly: 99,
    features: ["Unlimited SKUs", "Hourly forecasts · 90-day window", "95% confidence bands · calibrated", "Driver attribution · weather, payday, holiday", "Auto-send POs to vendors", "Multi-location dashboard", "API + webhooks", "Priority support · 4h median", "Onboarding call"],
    notIncluded: ["Custom models", "SLA · 99.99%"],
    cta: "Start free · 30 days", highlight: true,
  },
  {
    id: "chain", tag: "P03", name: "Chain", sub: "For 5+ locations and groups.",
    monthly: "Custom" as string | number, yearly: "Custom" as string | number,
    features: ["Everything in Operator", "Custom forecast models per region", "Cross-location stock balancing", "Vendor scorecards", "SSO + SCIM", "SLA · 99.99% · 30d", "Dedicated CSM", "Quarterly forecast review"],
    notIncluded: [] as string[],
    cta: "Talk to founders", highlight: false,
  },
];

function BillingToggle({ yearly, setYearly }: { yearly: boolean; setYearly: (v: boolean) => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 0, padding: 4, background: P.paper, border: `1px solid ${P.border}`, borderRadius: 6, position: "relative" }}>
      <div style={{
        position: "absolute", top: 4, bottom: 4, width: "calc(50% - 4px)",
        left: yearly ? "calc(50% + 0px)" : 4,
        background: P.ink, borderRadius: 4,
        transition: "left 320ms cubic-bezier(.2,.8,.2,1)",
      }} />
      {[
        { l: "Monthly", v: false, save: undefined as string | undefined },
        { l: "Yearly", v: true, save: "−20%" },
      ].map((o) => (
        <button key={o.l} onClick={() => setYearly(o.v)} style={{
          position: "relative", zIndex: 1, padding: "8px 18px", borderRadius: 4,
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: P.sans, fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
          color: yearly === o.v ? "#fff" : P.text2,
          transition: "color 220ms", display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          {o.l}
          {o.save && (
            <span style={{
              fontFamily: P.mono, fontSize: 9.5, padding: "2px 5px", borderRadius: 2,
              background: yearly === o.v ? "rgba(255,255,255,0.16)" : P.accentSoft,
              color: yearly === o.v ? "#fff" : P.accent, letterSpacing: 0.3,
            }}>{o.save}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function CountUpInline({ to, duration = 800 }: { to: number; duration?: number }) {
  const [v, setV] = useState(to);
  useEffect(() => {
    const start = performance.now();
    const from = v;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setV(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(v)}</span>;
}

function PlanCard({ plan, idx, yearly }: { plan: typeof PLAN_DATA[number]; idx: number; yearly: boolean }) {
  const [hover, setHover] = useState(false);
  const price = yearly ? plan.yearly : plan.monthly;
  const hl = plan.highlight;
  return (
    <div className="p-reveal" data-d={String(idx + 1)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", padding: 32, borderRadius: 8,
        background: hl ? P.ink : hover ? P.paper : P.surface,
        color: hl ? "#fff" : P.text,
        border: `1px solid ${hl ? P.ink : P.border}`,
        transform: hover ? "translateY(-6px)" : hl ? "translateY(-3px)" : "none",
        boxShadow: hl
          ? "0 32px 80px -28px rgba(28,25,23,0.45), 0 8px 24px -12px rgba(28,25,23,0.18)"
          : hover ? "0 22px 60px -22px rgba(28,25,23,0.22)" : "0 4px 12px -8px rgba(28,25,23,0.06)",
        transition: "transform 280ms cubic-bezier(.2,.8,.2,1), background 200ms, box-shadow 280ms",
        overflow: "hidden",
      }}>
      {hl && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.06) 50%, transparent 65%)",
          backgroundSize: "200% 100%", animation: "mv-sweep 6s ease-in-out infinite",
        }} />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, position: "relative" }}>
        <span style={{ fontFamily: P.mono, fontSize: 10.5, color: hl ? "#a8a29e" : P.sec, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {plan.tag} · {plan.name}
        </span>
        {hl && (
          <span style={{
            fontFamily: P.mono, fontSize: 9.5, padding: "4px 8px", borderRadius: 99,
            background: "rgba(255,255,255,0.12)", color: "#fafaf9", letterSpacing: 0.4,
            border: "1px solid rgba(255,255,255,0.18)",
          }}>most picked · 68%</span>
        )}
      </div>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, lineHeight: 1.5, color: hl ? "#d6d3d1" : P.text3, position: "relative" }}>
        {plan.sub}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4, position: "relative" }}>
        {typeof price === "number" ? (
          <>
            <span style={{ fontSize: 64, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2.4, lineHeight: 1, color: hl ? "#fafaf9" : P.ink }}>$</span>
            <span style={{ fontSize: 64, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2.4, lineHeight: 1, color: hl ? "#fafaf9" : P.ink }}>
              <CountUpInline to={price} duration={500} />
            </span>
          </>
        ) : (
          <span style={{ fontSize: 56, fontWeight: 600, fontFamily: P.sans, letterSpacing: -2, lineHeight: 1, color: hl ? "#fafaf9" : P.ink }}>{price}</span>
        )}
        {typeof price === "number" && <span style={{ fontFamily: P.mono, fontSize: 12, color: hl ? "#a8a29e" : P.sec }}>/mo</span>}
      </div>
      <div style={{ fontFamily: P.mono, fontSize: 11, color: hl ? "#a8a29e" : P.sec, marginBottom: 24, position: "relative" }}>
        {typeof price === "number" ? `per location · billed ${yearly ? "yearly" : "monthly"}` : "volume discounts · annual contract"}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9, position: "relative" }}>
        {plan.features.map((it) => (
          <li key={it} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13 }}>
            <span style={{ fontFamily: P.mono, color: hl ? "#fafaf9" : P.ink, width: 14, flexShrink: 0, fontSize: 12, fontWeight: 600 }}>✓</span>
            <span style={{ color: hl ? "#fafaf9" : P.text2, lineHeight: 1.4 }}>{it}</span>
          </li>
        ))}
        {plan.notIncluded.map((it) => (
          <li key={it} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, color: hl ? "#78716c" : P.ter, textDecoration: "line-through" }}>
            <span style={{ fontFamily: P.mono, width: 14, flexShrink: 0, fontSize: 11 }}>×</span>
            <span style={{ lineHeight: 1.4 }}>{it}</span>
          </li>
        ))}
      </ul>
      <Link
        // Enterprise → contact; numbered tiers → in-app billing (AppLayout
        // gates routes — unauthenticated visitors get bounced to /login first,
        // then return to billing where they can pick monthly/yearly).
        href={typeof price === "number" ? `/~/settings/billing?cycle=${yearly ? "yearly" : "monthly"}` : "/signup"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 28, padding: "14px 18px", borderRadius: 4, position: "relative",
          background: hl ? "#fafaf9" : P.ink, color: hl ? P.ink : "#fff",
          textDecoration: "none", fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
          transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
          transform: hover ? "translateY(-1px)" : "none",
        }}
      >
        {plan.cta}
        <span style={{ fontFamily: P.mono, fontSize: 12, opacity: 0.7 }}>→</span>
      </Link>
    </div>
  );
}

function PlansSection({ yearly, setYearly }: { yearly: boolean; setYearly: (v: boolean) => void }) {
  return (
    <section data-mv-section style={{ padding: "40px 32px 100px", background: P.bg, position: "relative" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="p-reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <BillingToggle yearly={yearly} setYearly={setYearly} />
        </div>
        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {PLAN_DATA.map((p, i) => <PlanCard key={p.id} plan={p} idx={i} yearly={yearly} />)}
        </div>
        <div className="p-reveal" data-d="3" style={{
          marginTop: 28, display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center",
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
// ROI CALCULATOR
// ═══════════════════════════════════════════════════════════

function ROICalculator() {
  const [skus, setSkus] = useState(180);
  const [aov, setAov] = useState(8);
  const [orders, setOrders] = useState(220);
  const [margin, setMargin] = useState(35);

  const dailyGMV = aov * orders;
  const monthlyGMV = dailyGMV * 30;
  const monthlySaved = monthlyGMV * 0.03;
  const monthlyMargin = monthlySaved * (margin / 100);
  const planCost = skus > 250 ? 129 : 49;
  const monthlyROI = monthlyMargin - planCost;
  const payback = monthlyMargin > 0 ? (planCost / monthlyMargin) * 30 : 0;

  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <section data-mv-section style={{ padding: "120px 32px", background: P.ink, color: P.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px", maskImage: "radial-gradient(ellipse at 30% 30%, black 30%, transparent 75%)" }} />
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div className="p-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 24, color: "#a8a29e" }}>
          <span style={{ fontFamily: P.mono, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase" }}>02 · roi calculator</span>
          <div style={{ flex: 1, height: 1, borderTop: "1px dashed #44403c", transform: "translateY(-2px)" }} />
          <span style={{ fontFamily: P.mono, fontSize: 10.5 }}>drag · live update</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: "0 0 40px", fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 600,
          letterSpacing: -1.6, lineHeight: 1.04, color: "#fafaf9", maxWidth: 900, textWrap: "balance" as never,
        }}>
          Pays back in <span style={{ color: P.accent }}><CountUpInline to={Math.max(1, Math.round(payback))} duration={420} /></span> days. <span style={{ color: "#78716c" }}>For your shop, today.</span>
        </h2>

        <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 48, alignItems: "start" }}>
          <div className="p-reveal" data-d="2" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              { l: "SKUs you stock", v: skus, set: setSkus, min: 30, max: 1200, step: 10, fmt: (x: number) => x.toString() },
              { l: "Daily orders", v: orders, set: setOrders, min: 30, max: 1500, step: 10, fmt: (x: number) => x.toString() },
              { l: "Average order", v: aov, set: setAov, min: 3, max: 80, step: 1, fmt: (x: number) => `$${x}` },
              { l: "Gross margin", v: margin, set: setMargin, min: 10, max: 70, step: 1, fmt: (x: number) => `${x}%` },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontFamily: P.mono, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.l}</span>
                  <span style={{ fontFamily: P.mono, fontSize: 18, fontWeight: 600, color: "#fafaf9", fontVariantNumeric: "tabular-nums" }}>{s.fmt(s.v)}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={s.v}
                  onChange={(e) => s.set(parseInt(e.target.value, 10))}
                  style={{ width: "100%", accentColor: P.accent, cursor: "pointer" }} />
              </div>
            ))}
          </div>
          <div className="p-reveal" data-d="3" style={{ background: "#17120f", border: "1px solid #292524", borderRadius: 6, padding: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, marginBottom: 28 }}>
              {[
                { k: "Monthly savings · est.", v: `$${Math.round(monthlyMargin).toLocaleString()}`, c: P.accent },
                { k: "Plan cost", v: `$${planCost}`, c: "#fafaf9" },
                { k: "Monthly ROI", v: `$${Math.round(monthlyROI).toLocaleString()}`, c: P.good },
                { k: "Payback period", v: `${Math.max(1, Math.round(payback))}d`, c: "#fafaf9" },
              ].map((s) => (
                <div key={s.k}>
                  <div style={{ fontFamily: P.mono, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.k}</div>
                  <div style={{ fontFamily: P.mono, fontSize: 28, fontWeight: 600, color: s.c, letterSpacing: -1, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #292524", paddingTop: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: P.mono, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.4 }}>12-month projection</span>
                <span style={{ fontFamily: P.mono, fontSize: 10, color: "#a8a29e" }}>● savings <span style={{ color: "#78716c" }}>● cost</span></span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
                {months.map((_, i) => {
                  const maxVal = Math.max(monthlyMargin, 1);
                  const h = Math.min(100, (monthlyMargin / maxVal) * 100);
                  const cH = Math.min(100, (planCost / maxVal) * 100);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2, height: 100 }}>
                      <div style={{ height: `${h}%`, background: P.accent, transformOrigin: "bottom", animation: "mv-rise 600ms cubic-bezier(.2,.8,.2,1) both", animationDelay: `${i * 30}ms`, borderRadius: "2px 2px 0 0" }} />
                      <div style={{ height: `${cH * 0.4}%`, background: "#44403c", transformOrigin: "bottom", animation: "mv-rise 600ms cubic-bezier(.2,.8,.2,1) both", animationDelay: `${i * 30 + 150}ms`, borderRadius: "0 0 2px 2px" }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: P.mono, fontSize: 9, color: "#78716c" }}>
                <span>now</span><span>+12 mo · ${Math.round(monthlyMargin * 12).toLocaleString()} saved</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPARE TABLE
// ═══════════════════════════════════════════════════════════

function CompareTable() {
  const cols = ["Feature", "Starter", "Operator", "Chain"];
  const rows = [
    { label: "SKUs", vals: ["250", "∞", "∞"] },
    { label: "Forecast horizon", vals: ["14 days", "90 days", "90 days"] },
    { label: "Forecast granularity", vals: ["daily", "hourly", "hourly"] },
    { label: "Confidence bands", vals: ["80%", "80% + 95%", "80% + 95%"] },
    { label: "Driver attribution", vals: ["—", "✓", "✓ + custom"] },
    { label: "Auto reorder POs", vals: ["suggest", "send", "send + balance"] },
    { label: "Multi-location", vals: ["—", "✓", "✓ + cross-bal"] },
    { label: "Custom regional models", vals: ["—", "—", "✓"] },
    { label: "API + webhooks", vals: ["—", "✓", "✓"] },
    { label: "SSO + SCIM", vals: ["—", "—", "✓"] },
    { label: "Support · first reply", vals: ["24h", "4h", "30m"] },
    { label: "SLA", vals: ["—", "—", "99.99% / 30d"] },
  ];

  useTick(2);
  const t = Math.floor((performance.now() / 900) % rows.length);

  return (
    <section data-mv-section style={{ padding: "120px 32px", background: P.bg }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="p-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>03 · the full table</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>everything · in writing</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: "0 0 40px", fontSize: "clamp(30px, 5vw, 56px)", fontWeight: 600,
          letterSpacing: -1.4, lineHeight: 1.04, color: P.ink, maxWidth: 800, textWrap: "balance" as never,
        }}>
          What&apos;s in. <span style={{ color: P.ter }}>What&apos;s not.</span>
        </h2>
        <div className="p-reveal" data-d="2" style={{ background: P.paper, border: `1px solid ${P.border}`, borderRadius: 6, overflow: "hidden" }}>
          <div data-mv-scroll-x>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", background: P.surface, borderBottom: `1px solid ${P.border}` }}>
                {cols.map((c, i) => (
                  <div key={c} style={{
                    padding: "14px 16px", fontFamily: P.mono, fontSize: 10.5,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    background: i === 2 ? P.panel : "transparent",
                    fontWeight: i === 2 ? 600 : 500,
                    color: i === 2 ? P.ink : P.sec,
                  }}>{c}</div>
                ))}
              </div>
              {rows.map((r, ri) => {
                const isHighlight = ri === t;
                return (
                  <div key={r.label} style={{
                    display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
                    borderBottom: ri < rows.length - 1 ? `1px solid ${P.border}` : "none",
                    background: isHighlight ? "rgba(217,119,6,0.05)" : "transparent",
                    transition: "background 600ms ease",
                  }}>
                    <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: P.text }}>{r.label}</div>
                    {r.vals.map((v, ci) => (
                      <div key={ci} style={{
                        padding: "12px 16px", fontFamily: v === "—" ? P.sans : P.mono, fontSize: 13,
                        color: v === "—" ? P.ter : P.text,
                        background: ci === 1 ? (isHighlight ? "rgba(217,119,6,0.08)" : P.surface) : "transparent",
                        fontWeight: ci === 1 ? 600 : 400,
                      }}>{v}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════

const FAQS = [
  { q: "How accurate is the forecast, really?", a: "Median MAPE across all customers is 7.2% on 14-day horizons after seven days of training data. Median rises to ~9% on cold-start SKUs (no history), and falls to ~5% by day 60." },
  { q: "What POS systems do you connect to?", a: "Square, Toast, Clover, Lightspeed, Shopify POS, and our own Merchiva POS. CSV import works for everything else. New connectors are added monthly." },
  { q: "Do I have to use Merchiva POS to get forecasting?", a: "No. The forecasting engine works with any connected POS or CSV feed. You can use Merchiva forecasting and keep your existing register." },
  { q: "What happens after the 30-day trial?", a: "Your account converts to your selected plan and you're billed for the next month. We email you 7, 3, and 1 day before. If you don't add a card, the account pauses — your data stays for 90 days." },
  { q: "Is there a per-SKU charge?", a: "No. SKU caps apply on Starter (250). Operator and Chain are unlimited. We will never charge per forecast, per API call, or per PO." },
  { q: "Can I cancel any time?", a: "Yes. Cancel from settings — pro-rated refund of any unused days. Data export (CSV + JSON) is available on every plan, every day." },
  { q: "Where does my data live?", a: "US-East (Virginia) by default. EU customers can choose Frankfurt. SOC 2 Type II, HIPAA-eligible. We never train shared models on your private sales data without explicit opt-in." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section data-mv-section style={{ padding: "120px 32px", background: P.bg }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="p-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>05 · faq</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>still have a q? → hi@merchiva.app</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: "0 0 40px", fontSize: "clamp(30px, 5vw, 56px)", fontWeight: 600,
          letterSpacing: -1.4, lineHeight: 1.04, color: P.ink, textWrap: "balance" as never,
        }}>The honest answers.</h2>
        <div className="p-reveal" data-d="2" style={{ borderTop: `1px solid ${P.border}` }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${P.border}` }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{
                  width: "100%", textAlign: "left", background: "transparent", border: "none",
                  padding: "22px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 24, fontFamily: P.sans,
                }}>
                  <span style={{ fontFamily: P.mono, fontSize: 11, color: P.sec, letterSpacing: 0.4, width: 28, flexShrink: 0 }}>0{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 18, fontWeight: 500, color: P.ink, letterSpacing: -0.3 }}>{f.q}</span>
                  <span style={{
                    width: 22, height: 22, borderRadius: 99, border: `1px solid ${P.borderD}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    background: isOpen ? P.ink : "transparent", color: isOpen ? "#fff" : P.text2,
                    transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
                    transform: isOpen ? "rotate(45deg)" : "rotate(0)", fontSize: 16, lineHeight: 1, fontWeight: 300,
                  }}>+</span>
                </button>
                <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 380ms cubic-bezier(.2,.8,.2,1)" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div className="mv-faq-body" style={{ paddingLeft: 52, paddingRight: 46, paddingBottom: 22, fontSize: 15, lineHeight: 1.6, color: P.text2, textWrap: "pretty" as never }}>
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
// GUARANTEES
// ═══════════════════════════════════════════════════════════

function Trust() {
  const guarantees = [
    { tag: "G1", title: "30-day money-back", body: "Don't love it? Full refund, no questions." },
    { tag: "G2", title: "Forecast accuracy SLA", body: "On Operator & Chain. We refund the month if MAPE > 12%." },
    { tag: "G3", title: "Price lock", body: "Your monthly rate is locked for 24 months from signup." },
    { tag: "G4", title: "Data portability", body: "CSV + JSON export, every day, every plan." },
  ];
  return (
    <section data-mv-section style={{ padding: "100px 32px", background: P.bg, borderTop: `1px solid ${P.border}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="p-reveal" style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 16 }}>
          <MonoTag border={false}>06 · guarantees</MonoTag>
          <DotLeader />
          <span style={{ fontFamily: P.mono, fontSize: 10.5, color: P.sec }}>in writing · every contract</span>
        </div>
        <h2 className="p-reveal" data-d="1" style={{
          margin: "0 0 40px", fontSize: "clamp(28px, 4.5vw, 52px)", fontWeight: 600,
          letterSpacing: -1.2, lineHeight: 1.06, color: P.ink, maxWidth: 760, textWrap: "balance" as never,
        }}>Four promises. <span style={{ color: P.ter }}>Real ones.</span></h2>
        <div data-mv-stack-2 style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {guarantees.map((g, i) => (
            <div key={g.tag} className="p-reveal" data-d={String((i % 4) + 1)} style={{
              padding: 24, background: P.paper, border: `1px solid ${P.border}`, borderRadius: 4,
              minHeight: 200, display: "flex", flexDirection: "column", gap: 14, position: "relative", overflow: "hidden",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 4, background: P.ink, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: P.mono, fontSize: 12, fontWeight: 600, letterSpacing: 0.4,
              }}>{g.tag}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: P.ink, letterSpacing: -0.4 }}>{g.title}</div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: P.text3, textWrap: "pretty" as never }}>{g.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// CTA + FOOTER
// ═══════════════════════════════════════════════════════════

function CTAFooter() {
  return (
    <section id="start" data-mv-section style={{ padding: "120px 32px 80px", background: P.bg, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        <div style={{ position: "relative", textAlign: "center" }}>
          <div className="p-reveal" style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <NotchM size={48} fg={P.ink} />
          </div>
          <h2 className="p-reveal" data-d="1" data-mv-hero-h1 style={{
            margin: 0, fontSize: "clamp(56px, 12vw, 180px)", fontWeight: 600,
            letterSpacing: "-0.06em", lineHeight: 0.94, color: P.ink, textWrap: "balance" as never,
          }}>try it<br />for thirty days.</h2>
          <p className="p-reveal" data-d="2" style={{ margin: "28px auto 0", maxWidth: 600, fontSize: 17, color: P.text3, lineHeight: 1.5, textWrap: "pretty" as never }}>
            Connect your POS in two minutes. Get your first forecast in seven days. Cancel any time, full refund.
          </p>
          <div className="p-reveal" data-d="3" data-mv-cta-row style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/signup" style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 22px", borderRadius: 4,
              background: P.ink, color: "#fff", textDecoration: "none",
              fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
              animation: "mv-glow 2.6s ease-in-out infinite",
            }}>Start free · 30 days <span style={{ fontFamily: P.mono, fontSize: 12, opacity: 0.7 }}>→</span></Link>
            <a href="#" style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 22px", borderRadius: 4,
              background: "transparent", color: P.ink,
              border: `1px solid ${P.borderD}`, textDecoration: "none",
              fontSize: 14, fontWeight: 500, letterSpacing: -0.1,
            }}>Book a 20-min walkthrough <span style={{ fontFamily: P.mono, fontSize: 12 }}>→</span></a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export function PricingPage() {
  useReveal();
  const [yearly, setYearly] = useState(false);
  return (
    <SiteShell active="pricing" background={P.bg}>
      <Hero />
      <PlansSection yearly={yearly} setYearly={setYearly} />
      <ROICalculator />
      <CompareTable />
      <FAQ />
      <Trust />
      <CTAFooter />
    </SiteShell>
  );
}
