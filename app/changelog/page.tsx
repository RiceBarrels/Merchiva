import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const metadata: Metadata = {
  title: "Changelog — Merchiva | Product Updates and New Features",
  description:
    "Latest product updates, new features, and improvements to Merchiva. Currently in beta — transparent release notes published with every update.",
  alternates: { canonical: `${BASE_URL}/changelog` },
  openGraph: {
    title: "Merchiva Changelog — What's New",
    description: "Beta release notes, new feature rollouts, and platform improvements.",
    url: `${BASE_URL}/changelog`,
    siteName: "Merchiva",
    type: "website",
  },
};

const C = {
  bg: "#f0eee9", paper: "#ffffff", surface: "#fafaf9", ink: "#0c0a09",
  text: "#1c1917", text2: "#44403c", text3: "#57534e", sec: "#78716c",
  ter: "#a8a29e", border: "#e0ddd6", borderD: "#cbc7bd", good: "#059669",
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

const ENTRIES = [
  {
    version: "beta-5.11.26",
    date: "May 11, 2026",
    tag: "latest",
    title: "Marketing site & SEO overhaul",
    items: [
      "New animated marketing homepage — hero wordmark, live product preview, feature grid, metrics section",
      "Dedicated pricing page with 3-plan cards, billing toggle, ROI calculator, feature comparison table, FAQ",
      "New /features, /about, /changelog SEO pages — all server-rendered for crawlability",
      "Added sitemap.xml, robots.txt, JSON-LD structured data (Organization, SoftwareApplication, FAQPage)",
      "Open Graph + Twitter Card metadata on all public pages",
      "Footer navigation connected across all marketing pages",
    ],
  },
  {
    version: "beta-5.5.26",
    date: "May 5, 2026",
    tag: "major",
    title: "Feature expansion — P0 through P3",
    items: [
      "Supplier management — vendor list, contact info, lead times, order history",
      "Financial management — revenue tracking, expense categories, P&L overview",
      "AI assistant enhancement — improved chat context, conversation history",
      "Booking & queue system — appointment slots, walk-in queue, wait times",
      "Marketing & coupons — promotional campaigns, discount codes, customer targeting",
      "Training module — onboarding checklists, training videos, staff progress tracking",
      "Display mode — customer-facing screen for menus and promotions",
      "Smart pricing — dynamic price suggestions based on demand and time-of-day",
      "Full i18n for products, API/webhooks settings, reviews pages",
    ],
  },
  {
    version: "beta-5.4.26",
    date: "May 4, 2026",
    tag: "major",
    title: "Platform consolidation + i18n expansion",
    items: [
      "Integrated all features into existing pages — no more scattered routes",
      "New pages: bookings, marketing, training, suppliers, finances, reviews, API settings",
      "Added core utility libraries for availability, customers, membership, payments",
      "Added notification, waste_log, and location tables to SpacetimeDB",
      "i18n expanded to all new modules (6 languages: en, es, fr, zh, ar, hi)",
    ],
  },
  {
    version: "beta-4.28.26",
    date: "Apr 28, 2026",
    tag: "feature",
    title: "Dark mode + shift trade improvements",
    items: [
      "Full dark mode support — toggle from settings, persists via cookie + localStorage",
      "Display name reducer for SpacetimeDB — user profiles across the system",
      "Shift trade broadcasts — managers get notified, approval flow",
      "Custom date/time input components for mobile",
      "Fix: chat userId now derived from SpacetimeDB identity, not JWT token",
    ],
  },
  {
    version: "beta-4.27.26",
    date: "Apr 27, 2026",
    tag: "feature",
    title: "Site builder templates + notification system",
    items: [
      "9 preset page templates for the site builder with lockable core elements",
      "Shift trade notifications to target staff with manager reassign",
      "Manager approval flow for shift trades",
      "Notification bell panel with real-time updates",
      "Resend button for pending team invitations",
      "Sidebar drawer disabled when dialogs are open (fix overlap bug)",
      "Touch-swipe day carousel replaces snap-x scroll (better mobile UX)",
      "Sidebar drag haptics — light tick every 10px, heavy on open/close thresholds",
    ],
  },
  {
    version: "beta-4.25.26",
    date: "Apr 25, 2026",
    tag: "feature",
    title: "Mobile site builder + haptic feedback",
    items: [
      "Mobile site builder with Craft.js — touch drag, component palette",
      "Haptic feedback on mobile sidebar open",
      "Redesigned bottom tab navigation for mobile",
      "Language picker now uses dialog instead of dropdown (better on mobile)",
      "PageHeader component extracted, consistent headers across all pages",
      "Fix: Capacitor login redirect flow",
    ],
  },
  {
    version: "beta-4.14.26",
    date: "Apr 14, 2026",
    tag: "feature",
    title: "Square OAuth refactor + i18n",
    items: [
      "Square OAuth integration reworked — multi-location selection",
      "Full i18n support for 6 languages: English, Spanish, French, Chinese, Arabic, Hindi",
      "Translations for all core pages: dashboard, inventory, sales, POS, products, staffing",
      "Chat, settings, membership, site storefront all translated",
      "SpacetimeDB connection builder no longer rebuilds on locale change",
    ],
  },
  {
    version: "beta-4.5.26",
    date: "Apr 5, 2026",
    tag: "feature",
    title: "Capacitor native app + caching",
    items: [
      "Capacitor support for iOS and Android native apps",
      "Static export support for offline builds",
      "localStorage cache with stale-while-revalidate loading — instant UI",
      "All loading spinners removed in favor of cached UI",
      "Date swipe with bounce animation",
      "Todo/chat cache sync across home and schedule views",
      "Role-based task checklists with evidence upload",
    ],
  },
  {
    version: "beta-4.4.26",
    date: "Apr 4, 2026",
    tag: "major",
    title: "Home redesign + real-time chat",
    items: [
      "Home page redesigned — todo system, shift table view, per-day availability",
      "Real-time chat with SpacetimeDB — instant message delivery",
      "iOS-style mobile dialogs with swipe-to-dismiss",
      "Avatar upload for user profiles",
      "PDF, PNG, CSV export for reports",
      "Slide-over mobile sidebar with swipe gestures",
      "Haptic feedback on all button interactions",
    ],
  },
  {
    version: "beta-4.2.26",
    date: "Apr 2, 2026",
    tag: "major",
    title: "Scheduling + multi-store + POS",
    items: [
      "7shifts-style scheduling UI — My Shifts, Schedule, and Roles tabs",
      "Staff self-service: shift trade, cover requests, availability, time off",
      "Multi-store support — separate user name from store name",
      "Clover POS integration — catalog, inventory, tenders sync",
      "Square OAuth with scheduling and Resend email invites",
      "Enhanced roles system — icon picker, descriptions, task timelines",
      "Multi-step setup onboarding for new organizations",
    ],
  },
  {
    version: "beta-4.1.26",
    date: "Apr 1, 2026",
    tag: "major",
    title: "Initial launch — Merchiva beta",
    items: [
      "Anti-AI Aesthetics redesign — sharp corners (0.3rem), Slate palette, compact density",
      "Team/employee accounts with permission-based UI (owner/manager/staff)",
      "Setup page for orgless users with OTP verification",
      "Supabase auth + RLS on all tables",
      "Square POS integration for catalog, inventory, and sales sync",
      "Dashboard, inventory, sales, staffing, products, settings pages",
      "Initial commit — Next.js 16, Tailwind CSS v4, shadcn/ui v4",
    ],
  },
];

function tagStyle(tag: string) {
  if (tag === "latest") return { bg: C.good, label: "latest" };
  if (tag === "major") return { bg: C.ink, label: "major" };
  return { bg: C.accent, label: tag };
}

export default function ChangelogPage() {
  return (
    <main style={{ background: C.bg, color: C.text, fontFamily: C.sans }}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, padding: "14px 32px", background: "rgba(240,238,233,0.92)", backdropFilter: "saturate(140%) blur(14px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 32 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink }}>
            <NotchM size={22} />
            <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: -0.8, lineHeight: 1 }}>Merchiva</span>
          </Link>
          <div style={{ display: "flex", gap: 24, marginLeft: 24 }}>
            {[
              { l: "Features", h: "/features" },
              { l: "Pricing", h: "/pricing" },
              { l: "About", h: "/about" },
              { l: "Changelog", h: "/changelog" },
            ].map((x) => (
              <Link key={x.l} href={x.h} style={{ fontSize: 13, color: x.l === "Changelog" ? C.ink : C.text3, textDecoration: "none", fontWeight: x.l === "Changelog" ? 600 : 500 }}>{x.l}</Link>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/signup" style={{ fontSize: 13, fontWeight: 500, color: "#fff", background: C.ink, textDecoration: "none", padding: "8px 14px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
            Start free <span style={{ fontFamily: C.mono, fontSize: 11, opacity: 0.7 }}>→</span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "100px 32px 60px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4, textTransform: "uppercase" }}>changelog</span>
            <span style={{ fontFamily: C.mono, fontSize: 9.5, padding: "3px 8px", borderRadius: 99, background: C.accent, color: "#fff", letterSpacing: 0.4, fontWeight: 600 }}>BETA</span>
          </div>
          <h1 style={{ margin: "0 0 0", fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.96, color: C.ink }}>
            What&apos;s new.
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: 18, color: C.text2, lineHeight: 1.5 }}>
            Merchiva is in active beta development. This changelog tracks every release since day one. Expect frequent updates.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 16, fontFamily: C.mono, fontSize: 11, color: C.sec }}>
            <span>219 commits</span>
            <span>·</span>
            <span>since Apr 1, 2026</span>
            <span>·</span>
            <span>11 releases</span>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ padding: "0 32px 120px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {ENTRIES.map((e, i) => {
            const ts = tagStyle(e.tag);
            return (
              <article key={e.version} style={{ position: "relative", paddingLeft: 32, paddingBottom: i < ENTRIES.length - 1 ? 48 : 0, borderLeft: i < ENTRIES.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ position: "absolute", left: -5, top: 0, width: 10, height: 10, borderRadius: 99, background: ts.bg, border: `2px solid ${C.bg}` }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4 }}>{e.date}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, padding: "3px 7px", borderRadius: 3, background: ts.bg, color: "#fff", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{ts.label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.ter }}>{e.version}</span>
                </div>
                <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: C.ink }}>{e.title}</h2>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {e.items.map((item) => (
                    <li key={item} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, lineHeight: 1.5, color: C.text2 }}>
                      <span style={{ fontFamily: C.mono, color: C.ter, flexShrink: 0 }}>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "28px 32px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 11, color: C.sec }}>
          <span>&copy; 2026 Merchiva, Inc.</span>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/features" style={{ color: C.sec, textDecoration: "none" }}>Features</Link>
            <Link href="/pricing" style={{ color: C.sec, textDecoration: "none" }}>Pricing</Link>
            <Link href="/about" style={{ color: C.sec, textDecoration: "none" }}>About</Link>
            <Link href="/changelog" style={{ color: C.sec, textDecoration: "none" }}>Changelog</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
