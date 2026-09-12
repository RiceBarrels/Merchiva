"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n/config";
import { DOWNLOAD_PAGE_ENABLED } from "@/lib/download-page";

// Prefix internal marketing links with the active locale so navigation stays in
// the same language without a proxy redirect hop. Auth routes (/login, /signup)
// are not localized; "#"/external links pass through untouched.
const LOCALIZED_ROUTES = ["/features", "/pricing", "/download", "/about", "/blogs", "/changelog"];
function localizeHref(href: string, locale: Locale): string {
  if (href === "/") return `/${locale}`;
  if (href.startsWith("/#")) return `/${locale}${href.slice(1)}`;
  if (LOCALIZED_ROUTES.some((r) => href === r || href.startsWith(`${r}/`))) return `/${locale}${href}`;
  return href;
}

const C = {
  bg: "#f0eee9",
  paper: "#ffffff",
  ink: "#0c0a09",
  text: "#1c1917",
  text2: "#44403c",
  text3: "#57534e",
  sec: "#78716c",
  ter: "#a8a29e",
  border: "#e0ddd6",
  borderD: "#cbc7bd",
  good: "#059669",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
};

export type SiteNavKey = "product" | "features" | "pricing" | "about" | "changelog" | "download" | "blog";

function NotchM({ size = 22, fg = C.ink }: { size?: number; fg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: 3, display: "block" }}>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fg} />
    </svg>
  );
}

// `navKey` indexes landing.nav.* in the dictionaries; href is locale-prefixed
// at render time via localizeHref().
const ALL_NAV_LINKS: { key: SiteNavKey; navKey: string; href: string }[] = [
  { key: "features", navKey: "features", href: "/features" },
  { key: "pricing", navKey: "pricing", href: "/pricing" },
  { key: "download", navKey: "download", href: "/download" },
  { key: "about", navKey: "about", href: "/about" },
  { key: "blog", navKey: "blog", href: "/blogs" },
  { key: "changelog", navKey: "changelog", href: "/changelog" },
];
const NAV_LINKS = ALL_NAV_LINKS.filter((x) => DOWNLOAD_PAGE_ENABLED || x.key !== "download");

function SiteNav({ active, scrollRef }: { active?: SiteNavKey; scrollRef: React.RefObject<HTMLElement | null> }) {
  const { locale, t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 24);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  return (
    <nav
      className="mv-nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        padding: "12px 16px",
        transition: "background 240ms ease, border-color 240ms ease, backdrop-filter 240ms ease",
        background: scrolled || menuOpen ? "rgba(240,238,233,0.92)" : "rgba(240,238,233,0)",
        backdropFilter: scrolled || menuOpen ? "saturate(140%) blur(14px)" : "none",
        WebkitBackdropFilter: scrolled || menuOpen ? "saturate(140%) blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled || menuOpen ? C.border : "transparent"}`,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>
        <Link href={`/${locale}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink, padding: "6px 4px", marginLeft: -4 }}>
          <NotchM size={22} />
          <span style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 17, color: C.ink, letterSpacing: -0.8, lineHeight: 1 }}>
            Merchiva
          </span>
        </Link>
        {/* Desktop links — hidden on mobile */}
        <div data-mv-hide-mobile style={{ display: "flex", gap: 24, marginLeft: 24 }}>
          {NAV_LINKS.map((x) => {
            const isActive = active === x.key;
            return (
              <Link
                key={x.key}
                href={localizeHref(x.href, locale)}
                style={{
                  fontSize: 13,
                  color: isActive ? C.ink : C.text3,
                  textDecoration: "none",
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: -0.1,
                }}
                className="hover:!text-foreground dark:text-stone-100 transition-colors"
              >
                {t(`landing.nav.${x.navKey}`)}
              </Link>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {/* Desktop right cluster */}
        <div data-mv-hide-mobile style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LanguageSwitcher variant="inline" className="w-auto min-w-[120px]" />
          <Link
            href="/login"
            style={{ fontSize: 13, color: C.text2, textDecoration: "none", fontWeight: 500, padding: "6px 10px" }}
          >
            {t("landing.cta.signIn")}
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
            {t("landing.cta.startFree")}
            <span style={{ fontFamily: C.mono, fontSize: 11, opacity: 0.7 }}>→</span>
          </Link>
        </div>
        {/* Mobile right cluster — Start free + hamburger */}
        <div className="mv-mobile-cluster" style={{ display: "none", alignItems: "center", gap: 8 }}>
          <Link
            href="/signup"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#fff",
              background: C.ink,
              textDecoration: "none",
              padding: "9px 14px",
              borderRadius: 4,
              letterSpacing: -0.1,
            }}
          >
            {t("landing.cta.startFree")}
          </Link>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.ink, cursor: "pointer",
            }}
          >
            <span style={{ position: "relative", width: 16, height: 12, display: "block" }}>
              <span style={{
                position: "absolute", left: 0, right: 0, height: 1.5, background: C.ink, top: menuOpen ? 5 : 0,
                transform: menuOpen ? "rotate(45deg)" : "none", transition: "all 200ms",
              }} />
              <span style={{
                position: "absolute", left: 0, right: 0, height: 1.5, background: C.ink, top: 5,
                opacity: menuOpen ? 0 : 1, transition: "opacity 150ms",
              }} />
              <span style={{
                position: "absolute", left: 0, right: 0, height: 1.5, background: C.ink, top: menuOpen ? 5 : 10,
                transform: menuOpen ? "rotate(-45deg)" : "none", transition: "all 200ms",
              }} />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} direction="top">
        <DrawerContent
          style={{
            background: "rgba(240,238,233,0.98)",
            backdropFilter: "saturate(140%) blur(14px)",
            WebkitBackdropFilter: "saturate(140%) blur(14px)",
            borderBottom: `1px solid ${C.border}`,
            color: C.text,
            fontFamily: C.sans,
          }}
        >
          <DrawerTitle className="sr-only">Menu</DrawerTitle>
          <DrawerDescription className="sr-only">
            Site navigation links
          </DrawerDescription>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {NAV_LINKS.map((x) => {
              const isActive = active === x.key;
              return (
                <Link
                  key={x.key}
                  href={localizeHref(x.href, locale)}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    fontSize: 16,
                    color: isActive ? C.ink : C.text2,
                    textDecoration: "none",
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: -0.2,
                    padding: "14px 4px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  {t(`landing.nav.${x.navKey}`)}
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.ter }}>→</span>
                </Link>
              );
            })}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              style={{
                marginTop: 16,
                fontSize: 14,
                color: C.text,
                textDecoration: "none",
                fontWeight: 500,
                padding: "12px 14px",
                borderRadius: 4,
                border: `1px solid ${C.border}`,
                background: C.paper,
                textAlign: "center",
              }}
            >
              {t("landing.cta.signIn")}
            </Link>
            <div style={{ marginTop: 16 }}>
              <LanguageSwitcher variant="inline" className="w-full" />
            </div>
          </div>
        </DrawerContent>
      </Drawer>

    </nav>
  );
}

// tKey indexes the dictionaries; suffix is non-translated trailing text.
const ALL_FOOTER_GROUPS: { headingKey: string; items: { tKey: string; href: string; suffix?: string }[] }[] = [
  {
    headingKey: "product",
    items: [
      { tKey: "landing.nav.features", href: "/features" },
      { tKey: "landing.nav.pricing", href: "/pricing" },
      { tKey: "landing.nav.download", href: "/download" },
      { tKey: "landing.nav.changelog", href: "/changelog" },
    ],
  },
  {
    headingKey: "company",
    items: [
      { tKey: "landing.nav.about", href: "/about" },
      { tKey: "landing.footer.customers", href: "/#customers" },
      { tKey: "landing.footer.careers", href: "/about", suffix: " · 4 open" },
    ],
  },
  {
    headingKey: "resources",
    items: [
      { tKey: "landing.footer.docs", href: "#" },
      { tKey: "landing.nav.blog", href: "/blogs" },
      { tKey: "landing.nav.changelog", href: "/changelog" },
      { tKey: "landing.footer.status", href: "#" },
    ],
  },
  {
    headingKey: "legal",
    items: [
      { tKey: "landing.footer.privacy", href: "#" },
      { tKey: "landing.footer.terms", href: "#" },
      { tKey: "landing.footer.dpa", href: "#" },
      { tKey: "landing.footer.security", href: "#" },
    ],
  },
];
const FOOTER_GROUPS = ALL_FOOTER_GROUPS.map((g) => ({
  ...g,
  items: g.items.filter((x) => DOWNLOAD_PAGE_ENABLED || x.href !== "/download"),
}));

export function SiteFooter() {
  const { locale, t } = useI18n();
  return (
    <footer style={{ background: C.bg, padding: "48px 20px 32px", borderTop: `1px solid ${C.border}` }}>
      <div
        data-mv-stack-lg
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 2fr 1fr",
          gap: 32,
          fontFamily: C.mono,
          fontSize: 12,
          color: C.sec,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NotchM size={14} />
            <span style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 13, color: C.ink, letterSpacing: -0.6, lineHeight: 1 }}>
              Merchiva
            </span>
          </div>
          <span>&copy; 2026 Merchiva, Inc.</span>
          <span>Oakland · Brooklyn · remote-first</span>
        </div>
        <div data-mv-stack-2 style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18 }}>
          {FOOTER_GROUPS.map((g) => (
            <div key={g.headingKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ color: C.text, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {t(`landing.footer.${g.headingKey}`)}
              </span>
              {g.items.map((x) => (
                <Link key={`${x.tKey}-${x.href}`} href={localizeHref(x.href, locale)} style={{ color: C.sec, textDecoration: "none", padding: "4px 0" }}>
                  {t(x.tKey)}{x.suffix ?? ""}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="mv-footer-meta" style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "right" }}>
          <span>
            <span style={{ color: C.good }}>●</span> all systems · 99.99% · 30d
          </span>
          <span>v3.4.812 · build a8c14f</span>
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({
  active,
  children,
  background = C.bg,
}: {
  active?: SiteNavKey;
  children: React.ReactNode;
  background?: string;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  return (
    <main
      ref={scrollRef}
      className="mv-landing scroll-smooth"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background,
        color: C.text,
        fontFamily: C.sans,
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      <SiteNav active={active} scrollRef={scrollRef} />
      {children}
      <SiteFooter />
    </main>
  );
}
