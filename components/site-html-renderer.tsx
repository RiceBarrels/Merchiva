"use client";

import { useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { themeVars, buildGoogleFontsUrl } from "@/components/site-renderer";
import { applyBuilderAnimation } from "@/lib/builder/apply-builder-animation";
import type { BuilderAnimation } from "@/lib/builder/animation";
import { LoginForm } from "@/components/site-elements/login-form";
import { CustomerLoginElement } from "@/components/site-elements/customer-login";
import { BookingForm } from "@/components/site-elements/booking-form";
import { Gallery } from "@/components/site-elements/gallery";
import { Faq } from "@/components/site-elements/faq";
import { CouponBanner } from "@/components/site-elements/coupon-banner";
import { CodeBlockElement } from "@/components/site-elements/code-block";
import { ProductCard } from "@/components/site-elements/product-card";
import { Testimonial } from "@/components/site-elements/testimonial";
import { PricingTable } from "@/components/site-elements/pricing-table";
import { MembershipElement } from "@/components/site-elements/membership-element";
import { getSystemValues, resolveValues, type ValueContext } from "@/lib/builder/site-values";
import { tokenStyleVars } from "@/lib/builder/design-tokens";
import type { SiteTheme, Product } from "@/lib/types";

// Map of data-widget="…" → React component. Each component receives the
// dataset of its placeholder as props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WIDGETS: Record<string, React.ComponentType<any>> = {
  "login": LoginForm,
  "customer-login": CustomerLoginElement,
  "booking-form": BookingForm,
  "gallery": Gallery,
  "faq": Faq,
  "coupon-banner": CouponBanner,
  "code-block": CodeBlockElement,
  "product-card": ProductCard,
  "testimonial": Testimonial,
  "pricing-table": PricingTable,
  "membership": MembershipElement,
};

interface SiteHtmlRendererProps {
  html: string;
  theme: SiteTheme;
  products?: Product[];
  siteSlug?: string;
  basePath?: string;
  customValues?: Record<string, string>;
  valueContext?: ValueContext;
  /** Site-level design token overrides (keyed by --mv-* CSS var name).
   *  Inlined onto the wrapper element so the storefront renders with the
   *  same brand colors/spacing as the builder preview. */
  customTokens?: Record<string, string>;
}

export function SiteHtmlRenderer({ html, theme, products, siteSlug, basePath, customValues, valueContext, customTokens }: SiteHtmlRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootsRef = useRef<Root[]>([]);
  const animationCleanupsRef = useRef<Array<() => void>>([]);
  const googleFontsUrl = buildGoogleFontsUrl([theme.headingFont, theme.bodyFont]);

  // Substitute {key} placeholders with system + custom values before rendering.
  const resolvedHtml = useMemo(() => {
    const sys = getSystemValues(valueContext ?? {});
    return resolveValues(html, customValues, sys);
  }, [html, customValues, valueContext]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Tear down any previous widget roots before re-scanning
    rootsRef.current.forEach((root) => {
      try { root.unmount(); } catch {}
    });
    rootsRef.current = [];

    const placeholders = container.querySelectorAll<HTMLElement>("[data-widget]");
    placeholders.forEach((el) => {
      const name = el.dataset.widget;
      if (!name) return;
      const Component = WIDGETS[name];
      if (!Component) {
        el.innerHTML = `<div style="padding:12px;background:#fef3c7;border:1px dashed #f59e0b;color:#92400e;border-radius:6px;font-family:monospace;font-size:12px">unknown widget: ${name}</div>`;
        return;
      }
      // Forward all data-* attrs (minus data-widget) as props
      const props: Record<string, string> = {};
      for (const key in el.dataset) {
        if (key === "widget") continue;
        const v = el.dataset[key];
        if (v != null) props[key] = v;
      }
      // Also stash some site context that widgets commonly need
      if (siteSlug) props.siteSlug = siteSlug;
      if (basePath) props.basePath = basePath;
      const productId = props.productId;
      if (productId && products) {
        const product = products.find((p) => p.id === productId);
        if (product) (props as unknown as Record<string, unknown>).product = product;
      }
      try {
        // Clear placeholder content before mounting
        el.innerHTML = "";
        const root = createRoot(el);
        root.render(<Component {...props} />);
        rootsRef.current.push(root);
      } catch (err) {
        console.error(`[SiteHtmlRenderer] mount failed for ${name}:`, err);
      }
    });

    // ── Apply motion animations to elements with data-animation ────────
    animationCleanupsRef.current.forEach((fn) => { try { fn(); } catch {} });
    animationCleanupsRef.current = [];
    const animatedEls = container.querySelectorAll<HTMLElement>("[data-animation]");
    let applied = 0;
    let parseErrors = 0;
    animatedEls.forEach((el) => {
      const raw = el.getAttribute("data-animation");
      if (!raw) return;
      let parsed: BuilderAnimation | null = null;
      try {
        parsed = JSON.parse(raw) as BuilderAnimation;
      } catch (e) {
        parseErrors++;
        console.warn("[SiteHtmlRenderer] failed to parse data-animation", raw, e);
        return;
      }
      const stop = applyBuilderAnimation(el, parsed);
      animationCleanupsRef.current.push(stop);
      applied++;
    });
    if (animatedEls.length > 0) {
      console.log(
        `[SiteHtmlRenderer] animations — found: ${animatedEls.length}, applied: ${applied}, parse errors: ${parseErrors}`,
      );
    }

    return () => {
      rootsRef.current.forEach((root) => {
        try { root.unmount(); } catch {}
      });
      rootsRef.current = [];
      animationCleanupsRef.current.forEach((fn) => { try { fn(); } catch {} });
      animationCleanupsRef.current = [];
    };
    // Re-mount whenever HTML changes — placeholders may have moved
  }, [resolvedHtml, products, siteSlug, basePath]);

  // Merge theme vars + design-token overrides onto the wrapper. The token
  // overrides win when both define the same custom property.
  const wrapperStyle: React.CSSProperties = {
    ...themeVars(theme),
    ...(tokenStyleVars(customTokens) as React.CSSProperties),
  };

  return (
    <div style={wrapperStyle}>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: resolvedHtml }} />
    </div>
  );
}
