"use client";

import { useState, useMemo } from "react";
import type { SiteElement, SiteTheme, ElementType } from "@/lib/types";
import type { Product } from "@/lib/types";
import { DynamicIcon } from "@/components/icon-picker";

// ─── Theme CSS vars ───────────────────────────────────────────────────────────

export function themeVars(theme: SiteTheme): React.CSSProperties {
  return {
    "--sr-primary": theme.primary,
    "--sr-secondary": theme.secondary,
    "--sr-accent": theme.accent,
    "--sr-bg": theme.background,
    "--sr-text": theme.text,
    "--sr-font-heading": theme.headingFont,
    "--sr-font-body": theme.bodyFont,
    "--sr-radius": `${theme.borderRadius}px`,
    fontFamily: theme.bodyFont,
    color: theme.text,
    backgroundColor: theme.background,
  } as React.CSSProperties;
}

// ─── Link rewriting ──────────────────────────────────────────────────────────

function resolveHref(href: string, basePath?: string): string {
  if (!basePath || !href) return href;
  if (href === "#" || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  if (href.startsWith("/")) return `${basePath}${href}`;
  return href;
}

// ─── Individual element renderers ─────────────────────────────────────────────

function RenderText({ props }: { props: Record<string, unknown> }) {
  const tag = (props.tag as string) || "p";
  const content = (props.content as string) || "Text";
  const customStyle = (props.style as Record<string, string>) || {};
  const style: React.CSSProperties = {
    textAlign: ((customStyle.textAlign || props.align) as React.CSSProperties["textAlign"]) || "left",
    color: customStyle.color || (props.color as string) || undefined,
    fontSize: customStyle.fontSize || (props.fontSize as string) || undefined,
    fontWeight: (customStyle.fontWeight || props.fontWeight as React.CSSProperties["fontWeight"]) || undefined,
    fontFamily: customStyle.fontFamily || (tag.startsWith("h") ? "var(--sr-font-heading)" : "var(--sr-font-body)"),
    lineHeight: customStyle.lineHeight || 1.6,
    letterSpacing: customStyle.letterSpacing || undefined,
    padding: (props.padding as string) || "0",
    margin: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = tag as any;
  return <Tag style={style}>{content}</Tag>;
}

function RenderImage({ props }: { props: Record<string, unknown> }) {
  const src = (props.src as string) || "";
  const alt = (props.alt as string) || "Image";
  const style: React.CSSProperties = {
    width: (props.width as string) || "100%",
    height: (props.height as string) || "auto",
    objectFit: (props.objectFit as React.CSSProperties["objectFit"]) || "cover",
    borderRadius: (props.borderRadius as string) || "0",
    display: "block",
  };

  if (!src) {
    return (
      <div style={{ ...style, height: style.height === "auto" ? "200px" : style.height, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.875rem" }}>
        No image
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={style} />;
}

function RenderButton({ props, basePath }: { props: Record<string, unknown>; basePath?: string }) {
  const label = (props.label as string) || "Button";
  const href = resolveHref((props.href as string) || "#", basePath);
  const variant = (props.variant as string) || "primary";
  const size = (props.size as string) || "md";
  const fullWidth = props.fullWidth === true;

  const pad = size === "sm" ? "0.375rem 0.875rem" : size === "lg" ? "0.75rem 1.75rem" : "0.5rem 1.25rem";
  const fontSize = size === "sm" ? "0.8125rem" : size === "lg" ? "1rem" : "0.875rem";

  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    padding: pad,
    fontSize,
    fontWeight: 600,
    borderRadius: "var(--sr-radius)",
    textDecoration: "none",
    cursor: "pointer",
    width: fullWidth ? "100%" : undefined,
    textAlign: "center",
    transition: "opacity 0.15s",
    border: "2px solid transparent",
  };

  const variantStyle: React.CSSProperties =
    variant === "secondary"
      ? { background: "var(--sr-secondary)", color: "#fff", borderColor: "var(--sr-secondary)" }
      : variant === "outline"
      ? { background: "transparent", color: "var(--sr-primary)", borderColor: "var(--sr-primary)" }
      : variant === "accent"
      ? { background: "var(--sr-accent)", color: "#fff", borderColor: "var(--sr-accent)" }
      : { background: "var(--sr-primary)", color: "#fff", borderColor: "var(--sr-primary)" };

  return <a href={href} style={{ ...baseStyle, ...variantStyle }}>{label}</a>;
}

function RenderHero({ props, basePath }: { props: Record<string, unknown>; basePath?: string }) {
  const title = (props.title as string) || "Welcome";
  const subtitle = (props.subtitle as string) || "";
  const bgImage = (props.backgroundImage as string) || "";
  const bgColor = (props.backgroundColor as string) || "var(--sr-bg)";
  const ctaLabel = (props.ctaLabel as string) || "";
  const ctaHref = resolveHref((props.ctaHref as string) || "#", basePath);
  const align = (props.align as string) || "center";
  const height = (props.height as string) || "480px";
  const textColor = (props.textColor as string) || undefined;

  return (
    <div style={{
      minHeight: height,
      background: bgImage ? `url(${bgImage}) center/cover no-repeat, ${bgColor}` : bgColor,
      display: "flex",
      alignItems: "center",
      justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
      padding: "4rem 2rem",
    }}>
      <div style={{ maxWidth: "640px", textAlign: align as React.CSSProperties["textAlign"], color: textColor }}>
        <h1 style={{ fontFamily: "var(--sr-font-heading)", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: "1rem", lineHeight: 1.15, color: textColor || "var(--sr-text)" }}>{title}</h1>
        {subtitle && <p style={{ fontSize: "1.125rem", marginBottom: "2rem", opacity: 0.8, color: textColor || "var(--sr-text)" }}>{subtitle}</p>}
        {ctaLabel && (
          <a href={ctaHref} style={{ display: "inline-block", background: "var(--sr-primary)", color: "#fff", padding: "0.75rem 2rem", borderRadius: "var(--sr-radius)", fontWeight: 700, textDecoration: "none", fontSize: "1rem" }}>{ctaLabel}</a>
        )}
      </div>
    </div>
  );
}

function RenderNav({ props, basePath }: { props: Record<string, unknown>; basePath?: string }) {
  const logo = (props.logo as string) || "My Site";
  const links = (props.links as { label: string; href: string }[]) || [];
  const bgColor = (props.backgroundColor as string) || "#ffffff";
  const textColor = (props.textColor as string) || "var(--sr-text)";
  const sticky = props.sticky === true;

  return (
    <nav style={{ background: bgColor, padding: "0.875rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.08)", position: sticky ? "sticky" : "relative", top: 0, zIndex: sticky ? 100 : undefined }}>
      <span style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 800, fontSize: "1.125rem", color: textColor }}>{logo}</span>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        {links.map((l, i) => (
          <a key={i} href={resolveHref(l.href, basePath)} style={{ color: textColor, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, opacity: 0.85 }}>{l.label}</a>
        ))}
      </div>
    </nav>
  );
}

function RenderFooter({ props, basePath }: { props: Record<string, unknown>; basePath?: string }) {
  const text = (props.text as string) || "© 2024 My Site";
  const links = (props.links as { label: string; href: string }[]) || [];
  const bgColor = (props.backgroundColor as string) || "#18181b";
  const textColor = (props.textColor as string) || "#9ca3af";

  return (
    <footer style={{ background: bgColor, color: textColor, padding: "2.5rem 2rem", textAlign: "center" }}>
      {links.length > 0 && (
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
          {links.map((l, i) => <a key={i} href={resolveHref(l.href, basePath)} style={{ color: textColor, textDecoration: "none", fontSize: "0.875rem" }}>{l.label}</a>)}
        </div>
      )}
      <p style={{ fontSize: "0.875rem", margin: 0 }}>{text}</p>
    </footer>
  );
}

function RenderDivider({ props }: { props: Record<string, unknown> }) {
  return (
    <hr style={{
      border: "none",
      borderTop: `${(props.thickness as string) || "1px"} solid ${(props.color as string) || "#e5e7eb"}`,
      margin: (props.margin as string) || "1rem 0",
    }} />
  );
}

function RenderSpacer({ props }: { props: Record<string, unknown> }) {
  return <div style={{ height: (props.height as string) || "48px" }} />;
}

function RenderLayout({ props, children, basePath }: { props: Record<string, unknown>; children?: SiteElement[]; basePath?: string }) {
  const direction = (props.direction as string) || "stack";
  const spacing = (props.spacing as string) || "medium";
  const GAP: Record<string, string> = { small: "8px", medium: "16px", large: "24px" };
  const gridCols = Number(props.columns) || 2;
  const justify = (props.justify as string) || undefined;
  const tag = (props.tag as string) || "div";
  const href = (props.href as string) || undefined;
  const customStyle = (props.style as Record<string, string>) || {};

  const style: React.CSSProperties = {
    backgroundColor: (props.backgroundColor as string) || undefined,
    padding: (props.padding as string) || "1rem",
    borderRadius: (props.borderRadius as string) || undefined,
    width: "100%",
    height: "100%",
    // Typography from style prop
    fontFamily: customStyle.fontFamily || undefined,
    fontSize: customStyle.fontSize || undefined,
    fontWeight: customStyle.fontWeight || undefined,
    color: customStyle.color || undefined,
    textAlign: (customStyle.textAlign as React.CSSProperties["textAlign"]) || undefined,
    lineHeight: customStyle.lineHeight || undefined,
    letterSpacing: customStyle.letterSpacing || undefined,
  };

  if (direction === "free") {
    style.position = "relative";
  } else if (direction === "row") {
    style.display = "flex";
    style.flexDirection = "row";
    style.flexWrap = "wrap";
    style.gap = GAP[spacing] ?? spacing;
    style.alignItems = (props.align as string) || "flex-start";
    style.justifyContent = justify;
  } else if (direction === "grid") {
    style.display = "grid";
    style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    style.gap = GAP[spacing] ?? spacing;
    style.justifyContent = justify;
  } else {
    // stack (default)
    style.display = "flex";
    style.flexDirection = "column";
    style.gap = GAP[spacing] ?? spacing;
    style.alignItems = (props.align as string) || "stretch";
    style.justifyContent = justify;
  }

  const isLink = tag === "a";
  if (isLink) {
    style.textDecoration = "none";
    if (!style.color) style.color = "inherit";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = tag as any;

  return (
    <Tag style={style} href={isLink ? resolveHref(href || "#", basePath) : undefined}>
      {children?.map((child) => (
        <SiteElementRenderer key={child.id} element={child} basePath={basePath} />
      ))}
    </Tag>
  );
}

function RenderFixed({ props, children, basePath }: { props: Record<string, unknown>; children?: SiteElement[]; basePath?: string }) {
  const direction = (props.direction as string) || "stack";
  const spacing = (props.spacing as string) || "medium";
  const GAP: Record<string, string> = { small: "8px", medium: "16px", large: "24px" };
  const gridCols = Number(props.columns) || 2;
  const justify = (props.justify as string) || undefined;
  const x = Number(props.x) || 0;
  const y = Number(props.y) || 0;
  const zIndex = Number(props.zIndex) || 100;
  const customStyle = (props.style as Record<string, string>) || {};

  const style: React.CSSProperties = {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    zIndex,
    backgroundColor: (props.backgroundColor as string) || undefined,
    padding: (props.padding as string) || "1rem",
    fontFamily: customStyle.fontFamily || undefined,
    fontSize: customStyle.fontSize || undefined,
    fontWeight: customStyle.fontWeight || undefined,
    color: customStyle.color || undefined,
    textAlign: (customStyle.textAlign as React.CSSProperties["textAlign"]) || undefined,
    lineHeight: customStyle.lineHeight || undefined,
    letterSpacing: customStyle.letterSpacing || undefined,
  };

  if (direction === "row") {
    style.display = "flex";
    style.flexDirection = "row";
    style.flexWrap = "wrap";
    style.gap = GAP[spacing] ?? spacing;
    style.alignItems = (props.align as string) || "flex-start";
    style.justifyContent = justify;
  } else if (direction === "grid") {
    style.display = "grid";
    style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    style.gap = GAP[spacing] ?? spacing;
    style.justifyContent = justify;
  } else {
    style.display = "flex";
    style.flexDirection = "column";
    style.gap = GAP[spacing] ?? spacing;
    style.alignItems = (props.align as string) || "stretch";
    style.justifyContent = justify;
  }

  return (
    <div style={style}>
      {children?.map((child) => (
        <SiteElementRenderer key={child.id} element={child} basePath={basePath} />
      ))}
    </div>
  );
}

function RenderColumns({ props }: { props: Record<string, unknown> }) {
  const count = Math.min(6, Math.max(1, Number(props.columns) || 2));
  const gap = (props.gap as string) || "1.5rem";
  const cols = (props.columnContent as string[]) || Array(count).fill("");

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ minHeight: "80px" }}>
          {cols[i] ? <p style={{ margin: 0, fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{cols[i]}</p> : null}
        </div>
      ))}
    </div>
  );
}

function RenderProductCard({ props, products, siteSlug, basePath }: { props: Record<string, unknown>; products?: Product[]; siteSlug?: string; basePath?: string }) {
  const productId = props.productId as string;
  const showPrice = props.showPrice !== false;
  const showDescription = props.showDescription === true;
  const product = products?.find((p) => p.id === productId);

  const name = product?.name || "Product Name";
  const price = product?.price ?? 0;
  const category = product?.category || "Category";
  const rawHref = siteSlug && productId ? `/s/${siteSlug}/product/${productId}` : basePath && productId ? `/product/${productId}` : "#";
  const productPageHref = resolveHref(rawHref, basePath);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", overflow: "hidden", maxWidth: "320px" }}>
      <a href={productPageHref} style={{ display: "flex", background: "#f9fafb", height: "180px", alignItems: "center", justifyContent: "center", fontSize: "3rem", textDecoration: "none" }}>🛍️</a>
      <div style={{ padding: "1rem" }}>
        <h3 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "0.5rem", fontSize: "1rem" }}>{name}</h3>
        {showDescription && <p style={{ fontSize: "0.8125rem", color: "var(--sr-secondary)", marginBottom: "0.5rem" }}>{category}</p>}
        {showPrice && <p style={{ fontWeight: 700, color: "var(--sr-accent)", marginBottom: "0.75rem", fontSize: "1.125rem" }}>${price.toFixed(2)}</p>}
        <a href={productPageHref} style={{ display: "block", textAlign: "center", background: "var(--sr-primary)", color: "#fff", padding: "0.5rem", borderRadius: "var(--sr-radius)", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>View Product</a>
      </div>
    </div>
  );
}

function RenderBookingForm({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Book an Appointment";
  const submitLabel = (props.submitLabel as string) || "Book Now";
  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "var(--sr-radius)", fontSize: "0.875rem", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", padding: "2rem", maxWidth: "480px" }}>
      <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "1.5rem", fontSize: "1.25rem" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {[["Name", "text", "Jane Smith"], ["Email", "email", "jane@example.com"], ["Date", "date", ""], ["Time", "time", ""]].map(([l, t, p]) => (
          <div key={l}>
            <label style={labelStyle}>{l}</label>
            <input type={t} placeholder={p} style={inputStyle} readOnly />
          </div>
        ))}
        <button type="button" style={{ background: "var(--sr-primary)", color: "#fff", padding: "0.625rem 1.5rem", borderRadius: "var(--sr-radius)", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.875rem" }}>{submitLabel}</button>
      </div>
    </div>
  );
}

function RenderCouponBanner({ props }: { props: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const code = (props.code as string) || "SAVE10";
  const description = (props.description as string) || "Get 10% off your next order!";
  const bgColor = (props.backgroundColor as string) || "#fef3c7";
  const textColor = (props.textColor as string) || "#92400e";

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div style={{ background: bgColor, color: textColor, padding: "1.25rem 2rem", borderRadius: "var(--sr-radius)", textAlign: "center" }}>
      <p style={{ marginBottom: "0.75rem", fontWeight: 600, fontSize: "1rem" }}>{description}</p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", background: "rgba(255,255,255,0.6)", padding: "0.375rem 0.75rem", borderRadius: "4px", border: "1px dashed currentColor" }}>
        <code style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em", fontSize: "1rem" }}>{code}</code>
        <button onClick={handleCopy} style={{ background: textColor, color: bgColor, border: "none", padding: "0.25rem 0.625rem", borderRadius: "3px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function RenderPricingTable({ props, basePath }: { props: Record<string, unknown>; basePath?: string }) {
  const plans = (props.plans as { name: string; price: string; features: string[]; ctaLabel: string; ctaHref: string; highlighted: boolean }[]) || [];

  if (!plans.length) {
    return <div style={{ padding: "2rem", color: "#9ca3af", textAlign: "center", border: "1px dashed #e5e7eb" }}>Add plans in the properties panel</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: "1.5rem" }}>
      {plans.map((plan, i) => (
        <div key={i} style={{ border: `2px solid ${plan.highlighted ? "var(--sr-accent)" : "#e5e7eb"}`, borderRadius: "var(--sr-radius)", padding: "2rem", position: "relative" }}>
          {plan.highlighted && <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "var(--sr-accent)", color: "#fff", padding: "0.125rem 0.75rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 700 }}>Popular</div>}
          <h3 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "0.5rem" }}>{plan.name}</h3>
          <p style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "1.5rem" }}>{plan.price}</p>
          <ul style={{ listStyle: "none", padding: 0, marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(plan.features || []).map((f, j) => (
              <li key={j} style={{ fontSize: "0.875rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <span style={{ color: "var(--sr-accent)", fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
              </li>
            ))}
          </ul>
          <a href={resolveHref(plan.ctaHref || "#", basePath)} style={{ display: "block", textAlign: "center", padding: "0.625rem", background: plan.highlighted ? "var(--sr-accent)" : "var(--sr-primary)", color: "#fff", borderRadius: "var(--sr-radius)", fontWeight: 700, textDecoration: "none", fontSize: "0.875rem" }}>{plan.ctaLabel || "Get Started"}</a>
        </div>
      ))}
    </div>
  );
}

function RenderTestimonial({ props }: { props: Record<string, unknown> }) {
  const quote = (props.quote as string) || "A great testimonial goes here.";
  const author = (props.author as string) || "Jane D.";
  const role = (props.role as string) || "Happy Customer";
  const avatar = (props.avatar as string) || "";
  const rating = Number(props.rating) || 5;

  return (
    <div style={{ padding: "2rem", borderLeft: "4px solid var(--sr-accent)", background: "rgba(0,0,0,0.02)", borderRadius: "0 var(--sr-radius) var(--sr-radius) 0" }}>
      <div style={{ color: "#f59e0b", fontSize: "1.25rem", marginBottom: "0.75rem" }}>{"★".repeat(Math.min(5, rating))}</div>
      <blockquote style={{ fontSize: "1.0625rem", lineHeight: 1.7, marginBottom: "1rem", fontStyle: "italic", margin: "0 0 1rem" }}>&ldquo;{quote}&rdquo;</blockquote>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={author} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--sr-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{author[0]?.toUpperCase()}</div>
        )}
        <div>
          <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{author}</p>
          <p style={{ color: "var(--sr-secondary)", margin: 0, fontSize: "0.8125rem" }}>{role}</p>
        </div>
      </div>
    </div>
  );
}

function RenderFaq({ props }: { props: Record<string, unknown> }) {
  const items = (props.items as { question: string; answer: string }[]) || [];
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {items.map((item, i) => (
        <div key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            style={{ width: "100%", textAlign: "left", padding: "1rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 600, fontSize: "0.9375rem" }}
          >
            {item.question}
            <span style={{ flexShrink: 0, fontSize: "1.25rem", lineHeight: 1, transition: "transform 0.2s", transform: openIdx === i ? "rotate(45deg)" : "none" }}>+</span>
          </button>
          {openIdx === i && (
            <div style={{ paddingBottom: "1rem", color: "var(--sr-secondary)", fontSize: "0.9rem", lineHeight: 1.7 }}>{item.answer}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function RenderGallery({ props }: { props: Record<string, unknown> }) {
  const images = (props.images as { src: string; alt: string }[]) || [];
  const columns = Number(props.columns) || 3;
  const gap = (props.gap as string) || "0.5rem";

  if (!images.length) {
    return <div style={{ padding: "3rem", textAlign: "center", border: "1px dashed #e5e7eb", color: "#9ca3af", borderRadius: "var(--sr-radius)" }}>Add images in the properties panel</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={img.src} alt={img.alt || `Image ${i + 1}`} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--sr-radius)" }} />
      ))}
    </div>
  );
}

function RenderCustomHtml({ props }: { props: Record<string, unknown> }) {
  const html = (props.html as string) || "";
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function RenderCodeBlock({ props }: { props: Record<string, unknown> }) {
  const language = (props.language as string) || "html";
  const code = (props.code as string) || "";
  const execute = props.execute === true;

  if (!execute) {
    // Display mode: syntax-highlighted code block
    return (
      <div style={{ borderRadius: "var(--sr-radius)", overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 1rem", background: "#18181b", color: "#a1a1aa", fontSize: "0.75rem", fontFamily: "monospace" }}>
          <span>{language.toUpperCase()}</span>
        </div>
        <pre style={{ margin: 0, padding: "1rem", background: "#09090b", color: "#e4e4e7", fontFamily: "'Geist Mono', 'Fira Code', monospace", fontSize: "0.8125rem", overflowX: "auto", lineHeight: 1.6 }}>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  // Execute mode: sandboxed iframe
  const buildSrcdoc = () => {
    if (language === "html") return code;
    if (language === "css") return `<!DOCTYPE html><html><head><style>${code}</style></head><body><p>CSS applied</p></body></html>`;
    if (language === "javascript") return `<!DOCTYPE html><html><body><script>${code}<\/script></body></html>`;
    return code;
  };

  const height = (props.height as string) || "300px";
  return (
    <iframe
      srcDoc={buildSrcdoc()}
      sandbox="allow-scripts"
      style={{ width: "100%", height, border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)" }}
      title="Code output"
    />
  );
}

function RenderMembershipWidget({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Member Benefits";
  const tierName = (props.tierName as string) || "Gold Member";
  const tierColor = (props.tierColor as string) || "#f59e0b";
  const tierIcon = (props.tierIcon as string) || "⭐";
  const showPoints = props.showPoints !== false;
  const perks = (props.previewPerks as string[]) || ["Free drink every 3 hours", "10% off weekends", "Priority seating"];

  return (
    <div style={{ border: `2px solid ${tierColor}`, borderRadius: "var(--sr-radius)", padding: "1.5rem", maxWidth: "400px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <span style={{ fontSize: "2rem" }}>{tierIcon}</span>
        <div>
          <p style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 800, fontSize: "1.125rem", margin: 0, color: tierColor }}>{tierName}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--sr-secondary)", margin: 0 }}>{title}</p>
        </div>
      </div>
      {showPoints && (
        <div style={{ background: `${tierColor}15`, border: `1px solid ${tierColor}40`, borderRadius: "4px", padding: "0.625rem 1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Your Points</span>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.25rem", color: tierColor }}>0</span>
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {perks.map((perk, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.875rem" }}>
            <span style={{ color: tierColor, fontWeight: 700, flexShrink: 0 }}>✓</span>
            {perk}
          </li>
        ))}
      </ul>
      <button style={{ marginTop: "1rem", width: "100%", padding: "0.625rem", background: tierColor, color: "#fff", border: "none", borderRadius: "var(--sr-radius)", fontWeight: 700, cursor: "pointer", fontSize: "0.875rem" }}>
        Claim a Perk
      </button>
    </div>
  );
}

function RenderLoginForm({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Sign In";
  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "var(--sr-radius)", fontSize: "0.875rem", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "1.5rem", fontSize: "1.25rem" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div><label style={labelStyle}>Email</label><input type="email" placeholder="you@example.com" style={inputStyle} readOnly /></div>
        <div><label style={labelStyle}>Password</label><input type="password" placeholder="••••••••" style={inputStyle} readOnly /></div>
        <button type="button" style={{ background: "var(--sr-primary)", color: "#fff", padding: "0.625rem 1.5rem", borderRadius: "var(--sr-radius)", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.875rem" }}>Sign In</button>
      </div>
    </div>
  );
}

function RenderIcon({ props }: { props: Record<string, unknown> }) {
  const name = (props.name as string) || "Star";
  const size = Number(props.size) || 32;
  const color = (props.color as string) || "var(--sr-primary)";
  const align = (props.align as string) || "left";

  return (
    <div style={{ textAlign: align as React.CSSProperties["textAlign"] }}>
      <DynamicIcon name={name} size={size} color={color} />
    </div>
  );
}

function RenderCart({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Your Cart";
  const emptyText = (props.emptyText as string) || "Your cart is empty.";
  const checkoutLabel = (props.checkoutLabel as string) || "Checkout";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", padding: "1.5rem", maxWidth: "480px" }}>
      <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, fontSize: "1.25rem", marginBottom: "1rem" }}>{title}</h2>
      <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--sr-secondary)", fontSize: "0.875rem", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", marginBottom: "1rem" }}>
        {emptyText}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontWeight: 600 }}>
        <span>Total</span>
        <span>$0.00</span>
      </div>
      <button type="button" style={{ width: "100%", background: "var(--sr-primary)", color: "#fff", padding: "0.625rem", borderRadius: "var(--sr-radius)", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.875rem" }}>
        {checkoutLabel}
      </button>
    </div>
  );
}

function RenderCheckout({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Checkout";
  const submitLabel = (props.submitLabel as string) || "Place Order";
  const inputStyle: React.CSSProperties = { width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "var(--sr-radius)", fontSize: "0.875rem", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.25rem" };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", padding: "2rem", maxWidth: "540px" }}>
      <h2 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "1.5rem", fontSize: "1.25rem" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div><label style={labelStyle}>First Name</label><input type="text" placeholder="Jane" style={inputStyle} readOnly /></div>
          <div><label style={labelStyle}>Last Name</label><input type="text" placeholder="Smith" style={inputStyle} readOnly /></div>
        </div>
        <div><label style={labelStyle}>Email</label><input type="email" placeholder="jane@example.com" style={inputStyle} readOnly /></div>
        <div><label style={labelStyle}>Address</label><input type="text" placeholder="123 Main St" style={inputStyle} readOnly /></div>
        <div><label style={labelStyle}>Card Number</label><input type="text" placeholder="4242 4242 4242 4242" style={inputStyle} readOnly /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div><label style={labelStyle}>Expiry</label><input type="text" placeholder="MM/YY" style={inputStyle} readOnly /></div>
          <div><label style={labelStyle}>CVC</label><input type="text" placeholder="123" style={inputStyle} readOnly /></div>
        </div>
        <button type="button" style={{ background: "var(--sr-primary)", color: "#fff", padding: "0.625rem 1.5rem", borderRadius: "var(--sr-radius)", fontWeight: 600, border: "none", cursor: "pointer", fontSize: "0.875rem" }}>{submitLabel}</button>
      </div>
    </div>
  );
}

function RenderReward({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Earn Rewards";
  const description = (props.description as string) || "Earn points on every purchase!";
  const pointsLabel = (props.pointsLabel as string) || "Points";
  const bgColor = (props.backgroundColor as string) || "#f0fdf4";
  const textColor = (props.textColor as string) || "#166534";

  return (
    <div style={{ background: bgColor, color: textColor, borderRadius: "var(--sr-radius)", padding: "1.5rem 2rem", textAlign: "center", border: `1px solid ${textColor}30` }}>
      <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎁</div>
      <h3 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 800, fontSize: "1.25rem", marginBottom: "0.375rem" }}>{title}</h3>
      <p style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "1rem" }}>{description}</p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(255,255,255,0.6)", padding: "0.5rem 1rem", borderRadius: "var(--sr-radius)", border: `1px solid ${textColor}40` }}>
        <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "1.5rem" }}>0</span>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{pointsLabel}</span>
      </div>
    </div>
  );
}

// ─── Element dispatcher ───────────────────────────────────────────────────────

export function SiteElementRenderer({
  element,
  products,
  siteSlug,
  basePath,
}: {
  element: SiteElement;
  products?: Product[];
  siteSlug?: string;
  basePath?: string;
}) {
  const { type, props, children } = element;
  const customStyle = (props.style as React.CSSProperties | undefined) || {};
  const isLayoutType = type === "layout" || type === "container" || type === "viewport";

  // For layout types, apply element.height as minHeight so RenderLayout's height:100% works
  const wrapperStyle: React.CSSProperties = { ...customStyle };
  if (isLayoutType && element.height != null) {
    const hVal = typeof element.height === "number" ? `${element.height}px` : element.height;
    if (!wrapperStyle.minHeight) wrapperStyle.minHeight = hVal;
  }
  if (isLayoutType && element.width != null) {
    const wVal = typeof element.width === "number" ? `${element.width}px` : element.width;
    if (!wrapperStyle.width) wrapperStyle.width = wVal;
  }

  const hasWrapperStyle = Object.keys(wrapperStyle).length > 0;

  const rendered = (() => {
    switch (type as ElementType) {
      case "text":      return <RenderText props={props} />;
      case "image":     return <RenderImage props={props} />;
      case "button":    return <RenderButton props={props} basePath={basePath} />;
      case "hero":      return <RenderHero props={props} basePath={basePath} />;
      case "nav":       return <RenderNav props={props} basePath={basePath} />;
      case "footer":    return <RenderFooter props={props} basePath={basePath} />;
      case "divider":   return <RenderDivider props={props} />;
      case "spacer":    return <RenderSpacer props={props} />;
      case "fixed":     return <RenderFixed props={props} children={children} basePath={basePath} />;
      case "layout":
      case "container":
      case "viewport":  return <RenderLayout props={props} children={children} basePath={basePath} />;
      case "columns":   return <RenderColumns props={props} />;
      case "product-card":   return <RenderProductCard props={props} products={products} siteSlug={siteSlug} basePath={basePath} />;
      case "booking-form":   return <RenderBookingForm props={props} />;
      case "coupon-banner":  return <RenderCouponBanner props={props} />;
      case "pricing-table":  return <RenderPricingTable props={props} basePath={basePath} />;
      case "testimonial":    return <RenderTestimonial props={props} />;
      case "faq":            return <RenderFaq props={props} />;
      case "gallery":        return <RenderGallery props={props} />;
      case "custom-html":    return <RenderCustomHtml props={props} />;
      case "login-form":         return <RenderLoginForm props={props} />;
      case "code-block":         return <RenderCodeBlock props={props} />;
      case "membership-widget":  return <RenderMembershipWidget props={props} />;
      case "cart":       return <RenderCart props={props} />;
      case "checkout":   return <RenderCheckout props={props} />;
      case "reward":     return <RenderReward props={props} />;
      case "icon":       return <RenderIcon props={props} />;
      default:           return null;
    }
  })();

  if (!hasWrapperStyle) return rendered;
  return <div style={wrapperStyle}>{rendered}</div>;
}

// ─── Google Fonts loader ──────────────────────────────────────────────────────

// Fonts that are always available without a Google Fonts request
const NATIVE_FONTS = new Set([
  "system-ui", "sans-serif", "serif", "monospace", "-apple-system",
  "Georgia", "Courier New", "Helvetica Neue", "Helvetica", "Arial",
  "Times New Roman", "Verdana", "Tahoma",
]);

export function buildGoogleFontsUrl(fonts: string[]): string | null {
  const googleFamilies = fonts
    .filter(Boolean)
    .map((f) => f.split(",")[0].trim().replace(/['"]/g, ""))
    .filter((f) => !NATIVE_FONTS.has(f) && f !== "");
  const unique = [...new Set(googleFamilies)];
  if (!unique.length) return null;
  const query = unique.map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`).join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

// ─── Full page renderer ───────────────────────────────────────────────────────

export function SiteRenderer({
  elements,
  theme,
  products,
  siteSlug,
  basePath,
}: {
  elements: SiteElement[];
  theme: SiteTheme;
  products?: Product[];
  siteSlug?: string;
  basePath?: string;
}) {
  const googleFontsUrl = useMemo(
    () => buildGoogleFontsUrl([theme.headingFont, theme.bodyFont]),
    [theme.headingFont, theme.bodyFont]
  );
  return (
    <div style={themeVars(theme)}>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      {elements.map((el) => (
        <SiteElementRenderer key={el.id} element={el} products={products} siteSlug={siteSlug} basePath={basePath} />
      ))}
    </div>
  );
}
