"use client";

import { useState } from "react";
import type { SiteElement, SiteTheme, ElementType } from "@/lib/types";
import type { Product } from "@/lib/types";

// ─── Theme CSS vars ───────────────────────────────────────────────────────────

function themeVars(theme: SiteTheme): React.CSSProperties {
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

// ─── Individual element renderers ─────────────────────────────────────────────

function RenderText({ props }: { props: Record<string, unknown> }) {
  const tag = (props.tag as string) || "p";
  const content = (props.content as string) || "Text";
  const style: React.CSSProperties = {
    textAlign: (props.align as React.CSSProperties["textAlign"]) || "left",
    color: (props.color as string) || undefined,
    fontSize: (props.fontSize as string) || undefined,
    fontWeight: (props.fontWeight as React.CSSProperties["fontWeight"]) || undefined,
    fontFamily: tag.startsWith("h") ? "var(--sr-font-heading)" : "var(--sr-font-body)",
    padding: (props.padding as string) || "0",
    margin: 0,
    lineHeight: 1.6,
  };

  const Tag = tag as keyof JSX.IntrinsicElements;
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

function RenderButton({ props }: { props: Record<string, unknown> }) {
  const label = (props.label as string) || "Button";
  const href = (props.href as string) || "#";
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

function RenderHero({ props }: { props: Record<string, unknown> }) {
  const title = (props.title as string) || "Welcome";
  const subtitle = (props.subtitle as string) || "";
  const bgImage = (props.backgroundImage as string) || "";
  const bgColor = (props.backgroundColor as string) || "var(--sr-bg)";
  const ctaLabel = (props.ctaLabel as string) || "";
  const ctaHref = (props.ctaHref as string) || "#";
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

function RenderNav({ props }: { props: Record<string, unknown> }) {
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
          <a key={i} href={l.href} style={{ color: textColor, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, opacity: 0.85 }}>{l.label}</a>
        ))}
      </div>
    </nav>
  );
}

function RenderFooter({ props }: { props: Record<string, unknown> }) {
  const text = (props.text as string) || "© 2024 My Site";
  const links = (props.links as { label: string; href: string }[]) || [];
  const bgColor = (props.backgroundColor as string) || "#18181b";
  const textColor = (props.textColor as string) || "#9ca3af";

  return (
    <footer style={{ background: bgColor, color: textColor, padding: "2.5rem 2rem", textAlign: "center" }}>
      {links.length > 0 && (
        <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
          {links.map((l, i) => <a key={i} href={l.href} style={{ color: textColor, textDecoration: "none", fontSize: "0.875rem" }}>{l.label}</a>)}
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

function RenderContainer({ props, children }: { props: Record<string, unknown>; children?: SiteElement[] }) {
  return (
    <div style={{
      backgroundColor: (props.backgroundColor as string) || undefined,
      padding: (props.padding as string) || "2rem",
      maxWidth: (props.maxWidth as string) || "100%",
      margin: "0 auto",
      borderRadius: (props.borderRadius as string) || undefined,
    }}>
      {children?.map((child) => (
        <SiteElementRenderer key={child.id} element={child} />
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

function RenderProductCard({ props, products }: { props: Record<string, unknown>; products?: Product[] }) {
  const productId = props.productId as string;
  const showPrice = props.showPrice !== false;
  const showDescription = props.showDescription === true;
  const product = products?.find((p) => p.id === productId);

  const name = product?.name || "Product Name";
  const price = product?.price ?? 0;
  const category = product?.category || "Category";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "var(--sr-radius)", overflow: "hidden", maxWidth: "320px" }}>
      <div style={{ background: "#f9fafb", height: "180px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem" }}>🛍️</div>
      <div style={{ padding: "1rem" }}>
        <h3 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, marginBottom: "0.5rem", fontSize: "1rem" }}>{name}</h3>
        {showDescription && <p style={{ fontSize: "0.8125rem", color: "var(--sr-secondary)", marginBottom: "0.5rem" }}>{category}</p>}
        {showPrice && <p style={{ fontWeight: 700, color: "var(--sr-accent)", marginBottom: "0.75rem", fontSize: "1.125rem" }}>${price.toFixed(2)}</p>}
        <a href="#" style={{ display: "block", textAlign: "center", background: "var(--sr-primary)", color: "#fff", padding: "0.5rem", borderRadius: "var(--sr-radius)", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>Add to Cart</a>
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

function RenderPricingTable({ props }: { props: Record<string, unknown> }) {
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
          <a href={plan.ctaHref || "#"} style={{ display: "block", textAlign: "center", padding: "0.625rem", background: plan.highlighted ? "var(--sr-accent)" : "var(--sr-primary)", color: "#fff", borderRadius: "var(--sr-radius)", fontWeight: 700, textDecoration: "none", fontSize: "0.875rem" }}>{plan.ctaLabel || "Get Started"}</a>
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

// ─── Element dispatcher ───────────────────────────────────────────────────────

export function SiteElementRenderer({
  element,
  products,
}: {
  element: SiteElement;
  products?: Product[];
}) {
  const { type, props, children } = element;

  switch (type as ElementType) {
    case "text":      return <RenderText props={props} />;
    case "image":     return <RenderImage props={props} />;
    case "button":    return <RenderButton props={props} />;
    case "hero":      return <RenderHero props={props} />;
    case "nav":       return <RenderNav props={props} />;
    case "footer":    return <RenderFooter props={props} />;
    case "divider":   return <RenderDivider props={props} />;
    case "spacer":    return <RenderSpacer props={props} />;
    case "container": return <RenderContainer props={props} children={children} />;
    case "columns":   return <RenderColumns props={props} />;
    case "product-card":   return <RenderProductCard props={props} products={products} />;
    case "booking-form":   return <RenderBookingForm props={props} />;
    case "coupon-banner":  return <RenderCouponBanner props={props} />;
    case "pricing-table":  return <RenderPricingTable props={props} />;
    case "testimonial":    return <RenderTestimonial props={props} />;
    case "faq":            return <RenderFaq props={props} />;
    case "gallery":        return <RenderGallery props={props} />;
    case "custom-html":    return <RenderCustomHtml props={props} />;
    case "login-form":     return <RenderLoginForm props={props} />;
    default:               return null;
  }
}

// ─── Full page renderer ───────────────────────────────────────────────────────

export function SiteRenderer({
  elements,
  theme,
  products,
}: {
  elements: SiteElement[];
  theme: SiteTheme;
  products?: Product[];
}) {
  return (
    <div style={themeVars(theme)}>
      {elements.map((el) => (
        <SiteElementRenderer key={el.id} element={el} products={products} />
      ))}
    </div>
  );
}
