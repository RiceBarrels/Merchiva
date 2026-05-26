import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const metadata: Metadata = {
  title: "About — Merchiva | Built for Operators, by Operators",
  description:
    "Merchiva is a remote-first team building inventory forecasting tools for small businesses. 2,841 businesses live. 96.4% annual renewal. Oakland · Brooklyn.",
  alternates: { canonical: `${BASE_URL}/about` },
  openGraph: {
    title: "About Merchiva — The OS for the Floor",
    description: "Built for operators, by operators. Remote-first. 2,841 businesses live across 47 states.",
    url: `${BASE_URL}/about`,
    siteName: "Merchiva",
    type: "website",
  },
};

const C = {
  bg: "#f0eee9", paper: "#ffffff", surface: "#fafaf9", ink: "#0c0a09",
  text: "#1c1917", text2: "#44403c", text3: "#57534e", sec: "#78716c",
  ter: "#a8a29e", border: "#e0ddd6", borderD: "#cbc7bd", good: "#059669",
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

function OrgJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Merchiva",
    url: BASE_URL,
    description: "AI-powered inventory forecasting and daily management for small businesses.",
    foundingDate: "2024",
    numberOfEmployees: { "@type": "QuantitativeValue", value: "18" },
    address: [
      { "@type": "PostalAddress", addressLocality: "Oakland", addressRegion: "CA", addressCountry: "US" },
      { "@type": "PostalAddress", addressLocality: "Brooklyn", addressRegion: "NY", addressCountry: "US" },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default function AboutPage() {
  const stats = [
    { k: "businesses live", v: "2,841" },
    { k: "annual renewal", v: "96.4%" },
    { k: "states covered", v: "47" },
    { k: "GMV processed", v: "$2.4B" },
    { k: "team size", v: "18" },
    { k: "support · first reply", v: "4 min" },
  ];

  const values = [
    { title: "Tools, not demos", body: "We build software operators actually use every day. Dense, fast, keyboard-first. No hero sections in the app." },
    { title: "Forecast accuracy is the product", body: "If MAPE > 12%, we refund the month. We publish accuracy numbers monthly because we believe transparency builds trust." },
    { title: "Per-location, not per-seat", body: "We'll never charge per employee. The barista checking stock shouldn't cost you $15/mo." },
    { title: "Your data is yours", body: "CSV + JSON export, every day, every plan. SOC 2 Type II. We never train shared models on your data without opt-in." },
  ];

  return (
    <>
      <OrgJsonLd />
      <SiteShell active="about" background={C.bg}>
        {/* Hero */}
        <section data-mv-section style={{ padding: "100px 32px 64px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4, textTransform: "uppercase" }}>about merchiva</span>
            <h1 data-mv-hero-h1 style={{ margin: "16px 0 0", fontSize: "clamp(40px, 8vw, 96px)", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: C.ink, maxWidth: 900 }}>
              Built for operators,{" "}
              <span style={{ color: C.ter }}>by operators</span>.
            </h1>
            <p style={{ margin: "24px 0 0", fontSize: 18, lineHeight: 1.5, color: C.text2, maxWidth: 680 }}>
              Merchiva started because we ran a coffee shop and got tired of guessing how much oat milk to order. We built the forecasting engine we wished we had — then realized every small business has the same problem.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section data-mv-section style={{ padding: "0 32px 72px" }}>
          <div data-mv-stack-2 style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {stats.map((s) => (
              <div key={s.k} style={{ padding: 20, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 4 }}>
                <div style={{ fontFamily: C.mono, fontSize: "clamp(24px, 4.5vw, 40px)", fontWeight: 600, color: C.ink, letterSpacing: -1 }}>{s.v}</div>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>{s.k}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section data-mv-section style={{ padding: "100px 32px", background: C.ink, color: "#fafaf9" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: "#a8a29e", letterSpacing: 0.4, textTransform: "uppercase" }}>how we build</span>
            <h2 style={{ margin: "16px 0 40px", fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.04 }}>
              Four principles.
            </h2>
            <div data-mv-stack style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              {values.map((v, i) => (
                <div key={i} data-mv-pad-md style={{ padding: 28, background: "#17120f", border: "1px solid #292524", borderRadius: 6 }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10.5, color: "#a8a29e", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>0{i + 1}</div>
                  <h3 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 600, letterSpacing: -0.5 }}>{v.title}</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#a8a29e" }}>{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section data-mv-section style={{ padding: "100px 32px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(26px, 5vw, 56px)", fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.05 }}>
              Oakland · Brooklyn · remote-first.
            </h2>
            <p style={{ margin: "0 0 28px", fontSize: 17, color: C.text2, lineHeight: 1.5, maxWidth: 640 }}>
              18 people. Engineers, data scientists, and two former baristas. We&apos;re hiring — 4 open roles in engineering and data.
            </p>
            <div data-mv-cta-row style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 22px", borderRadius: 4, background: C.ink, color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
                Try Merchiva free <span style={{ fontFamily: C.mono, fontSize: 12, opacity: 0.7 }}>→</span>
              </Link>
            </div>
          </div>
        </section>

      </SiteShell>
    </>
  );
}
