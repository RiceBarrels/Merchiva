import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const metadata: Metadata = {
  title: "Features — Merchiva | Per-SKU Forecasting, Auto-Reorder, Stockout Alerts",
  description:
    "Per-SKU demand models with 7.2% median error. Confidence bands, driver attribution (weather, payday, holiday), auto-send POs, cold-start mode, and multi-location dashboards.",
  keywords: [
    "inventory forecasting features",
    "demand prediction accuracy",
    "auto reorder purchase orders",
    "stockout prevention alerts",
    "weather demand forecasting",
    "multi-location inventory",
    "SKU-level forecasting",
    "confidence interval forecasting",
    "cold start inventory model",
    "vendor management software",
  ],
  alternates: { canonical: `${BASE_URL}/features` },
  openGraph: {
    title: "Merchiva Features — Six Modules, One Forecast Engine",
    description:
      "Per-SKU demand models, confidence bands, driver attribution, auto-reorder POs, stockout alerts, cold-start mode. 7.2% median MAPE.",
    url: `${BASE_URL}/features`,
    siteName: "Merchiva",
    type: "website",
  },
};

const C = {
  bg: "#f0eee9",
  paper: "#ffffff",
  surface: "#fafaf9",
  ink: "#0c0a09",
  text: "#1c1917",
  text2: "#44403c",
  text3: "#57534e",
  sec: "#78716c",
  ter: "#a8a29e",
  border: "#e0ddd6",
  borderD: "#cbc7bd",
  good: "#059669",
  accent: "oklch(0.55 0.09 55)",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
};

function NotchM({ size = 28, fg = C.ink }: { size?: number; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: 3, display: "block" }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

const MODULES = [
  {
    tag: "F01",
    title: "Per-SKU Demand Forecasting",
    body: "A separate model per SKU per location. Daily and hourly granularity, refit nightly on your data. Median MAPE: 7.2% on 14-day horizons after seven days of training.",
    stats: [
      { k: "Median MAPE", v: "7.2%" },
      { k: "Refit cycle", v: "nightly" },
      { k: "Granularity", v: "hourly" },
    ],
  },
  {
    tag: "F02",
    title: "Confidence Bands",
    body: "Every forecast comes with calibrated 80% and 95% prediction intervals. Decide reorder quantity against your tolerance for stockout — not a gut feeling.",
    stats: [
      { k: "Intervals", v: "80% + 95%" },
      { k: "Calibration", v: "daily" },
      { k: "Window", v: "up to 90d" },
    ],
  },
  {
    tag: "F03",
    title: "Driver Attribution",
    body: "Every prediction shows what moved it: weather (rain → +18% iced drinks), payday bumps, holiday lift, local events, last week's trend. No black boxes.",
    stats: [
      { k: "Drivers tracked", v: "12+" },
      { k: "Weather granularity", v: "hourly" },
      { k: "Attribution", v: "per-SKU" },
    ],
  },
  {
    tag: "F04",
    title: "Auto-Reorder Purchase Orders",
    body: "Suggested POs land in your inbox at 4am. Approve in one tap. Vendor-aware lead times, minimum order quantities, pack sizes — all factored in automatically.",
    stats: [
      { k: "PO delivery", v: "04:00 daily" },
      { k: "Vendor MOQs", v: "auto-rounded" },
      { k: "Approval", v: "one-tap" },
    ],
  },
  {
    tag: "F05",
    title: "Stockout Alerts",
    body: "A pager-style alert the moment risk crosses your threshold. Delivered via email, Slack, or SMS. Quietly resolves itself when you reorder. No alert fatigue.",
    stats: [
      { k: "Channels", v: "email, Slack, SMS" },
      { k: "Threshold", v: "configurable" },
      { k: "Auto-resolve", v: "yes" },
    ],
  },
  {
    tag: "F06",
    title: "Cold-Start Mode",
    body: "New SKU with no history? Merchiva borrows strength from similar items in the network until you have your own data. First useful forecast by day 7.",
    stats: [
      { k: "First forecast", v: "day 7" },
      { k: "Method", v: "network transfer" },
      { k: "Accuracy at d30", v: "~9% MAPE" },
    ],
  },
];

const INTEGRATIONS = [
  { name: "Square", desc: "Catalog, inventory, and sales sync via OAuth" },
  { name: "Toast", desc: "Menu items, modifiers, and daily sales" },
  { name: "Clover", desc: "Full POS data sync including tenders" },
  { name: "Lightspeed", desc: "Retail and restaurant catalog sync" },
  { name: "Shopify POS", desc: "Products, variants, and order data" },
  { name: "CSV Import", desc: "Works with any POS or ERP system" },
];

function FeaturesJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Merchiva Features",
    description: "Complete feature list for Merchiva inventory forecasting software.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: MODULES.map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: m.title,
        description: m.body,
      })),
    },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default function FeaturesPage() {
  return (
    <>
      <FeaturesJsonLd />
      <SiteShell active="features" background={C.bg}>
        {/* Hero */}
        <section data-mv-section style={{ padding: "100px 32px 64px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4, textTransform: "uppercase" }}>01 · features</span>
            <h1 data-mv-hero-h1 style={{ margin: "16px 0 0", fontSize: "clamp(40px, 8vw, 96px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: C.ink, maxWidth: 900 }}>
              Six things our forecast does that{" "}
              <span style={{ color: C.ter }}>your spreadsheet can&apos;t</span>.
            </h1>
            <p style={{ margin: "24px 0 0", fontSize: 18, lineHeight: 1.5, color: C.text2, maxWidth: 680, letterSpacing: -0.2 }}>
              One engine, six modules. Every prediction is per-SKU, per-location, and comes with a confidence band and driver attribution — so you know <em style={{ fontStyle: "normal", fontWeight: 600, color: C.ink }}>why</em> the number moved.
            </p>
          </div>
        </section>

        {/* Module cards */}
        <section data-mv-section style={{ padding: "0 32px 100px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {MODULES.map((m) => (
              <article key={m.tag} data-mv-stack style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                <div data-mv-pad-md style={{ padding: 40 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 4, background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, fontSize: 11, fontWeight: 600 }}>{m.tag}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, textTransform: "uppercase", letterSpacing: 0.4 }}>{m.tag}</span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: "clamp(22px, 3.4vw, 28px)", fontWeight: 600, letterSpacing: -0.6, color: C.ink, lineHeight: 1.15 }}>{m.title}</h2>
                  <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6, color: C.text3 }}>{m.body}</p>
                </div>
                <div data-mv-pad-md style={{ background: C.surface, borderLeft: `1px solid ${C.border}`, padding: 40, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                  {m.stats.map((s) => (
                    <div key={s.k} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.sec, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.k}</div>
                      <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: C.ink, marginTop: 4, letterSpacing: -0.5 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Integrations */}
        <section data-mv-section style={{ padding: "100px 32px", background: C.ink, color: "#fafaf9" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: "#a8a29e", letterSpacing: 0.4, textTransform: "uppercase" }}>02 · integrations</span>
            <h2 style={{ margin: "16px 0 36px", fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.04 }}>
              Connects to the POS you already use.
            </h2>
            <div data-mv-stack-2 style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {INTEGRATIONS.map((i) => (
                <div key={i.name} style={{ padding: 22, background: "#17120f", border: "1px solid #292524", borderRadius: 4 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{i.name}</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#a8a29e" }}>{i.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section data-mv-section style={{ padding: "100px 32px", textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2 data-mv-hero-h1 style={{ margin: 0, fontSize: "clamp(32px, 6vw, 64px)", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.04 }}>
              Ready to stop guessing?
            </h2>
            <p style={{ margin: "20px 0 0", fontSize: 17, color: C.text3, lineHeight: 1.5 }}>
              Connect your POS in two minutes. Get your first forecast in seven days.
            </p>
            <div data-mv-cta-row style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 22px", borderRadius: 4, background: C.ink, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                Start free · 30 days <span style={{ fontFamily: C.mono, fontSize: 12, opacity: 0.7 }}>→</span>
              </Link>
              <Link href="/pricing" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 22px", borderRadius: 4, border: `1px solid ${C.borderD}`, color: C.ink, textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                View pricing
              </Link>
            </div>
          </div>
        </section>

      </SiteShell>
    </>
  );
}
