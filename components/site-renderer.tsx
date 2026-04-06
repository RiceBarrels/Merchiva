"use client";

import { useState } from "react";
import type { SiteElement, SiteTheme, ElementType } from "@/lib/types";

// ─── Theme CSS variables ──────────────────────────────────────────────────────

function themeVars(theme: SiteTheme): React.CSSProperties {
  return {
    "--site-primary": theme.primaryColor,
    "--site-secondary": theme.secondaryColor,
    "--site-accent": theme.accentColor,
    "--site-bg": theme.bgColor,
    "--site-text": theme.textColor,
    "--site-heading-font": theme.headingFont,
    "--site-body-font": theme.bodyFont,
    "--site-radius": theme.borderRadius,
    fontFamily: theme.bodyFont + ", Inter, system-ui, sans-serif",
    backgroundColor: theme.bgColor,
    color: theme.textColor,
  } as React.CSSProperties;
}

// ─── Default props per element type ──────────────────────────────────────────

export function getDefaultProps(type: ElementType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { tag: "p", content: "Your text here", align: "left", color: "", fontSize: "1rem", fontWeight: "400" };
    case "image":
      return { src: "", alt: "Image", objectFit: "cover", width: "100%", height: "300px" };
    case "button":
      return { label: "Click Here", href: "#", variant: "primary", align: "center" };
    case "container":
      return { bgColor: "", padding: "2rem", maxWidth: "1200px", borderRadius: "0" };
    case "divider":
      return { color: "#e5e7eb", thickness: "1px", style: "solid", marginY: "1rem" };
    case "hero":
      return {
        title: "Welcome to Our Business",
        subtitle: "We provide exceptional service tailored to your needs.",
        bgColor: "#111827",
        bgImage: "",
        textColor: "#ffffff",
        align: "center",
        ctaLabel: "Get Started",
        ctaHref: "#",
        ctaSecondaryLabel: "",
        ctaSecondaryHref: "#",
        minHeight: "500px",
      };
    case "nav":
      return {
        logo: "My Business",
        links: [
          { label: "Home", href: "/" },
          { label: "About", href: "#about" },
          { label: "Contact", href: "#contact" },
        ],
        bgColor: "#ffffff",
        textColor: "#111827",
        sticky: true,
      };
    case "footer":
      return {
        text: "© 2024 My Business. All rights reserved.",
        links: [
          { label: "Privacy", href: "#" },
          { label: "Terms", href: "#" },
        ],
        bgColor: "#111827",
        textColor: "#9ca3af",
      };
    case "spacer":
      return { height: "3rem" };
    case "columns":
      return {
        columns: 2,
        gap: "2rem",
        items: [
          { content: "Column 1 content" },
          { content: "Column 2 content" },
        ],
      };
    case "video":
      return { url: "", title: "Video", autoplay: false, muted: true, loop: false };
    case "gallery":
      return {
        images: [
          { src: "", alt: "Photo 1" },
          { src: "", alt: "Photo 2" },
          { src: "", alt: "Photo 3" },
        ],
        columns: 3,
        gap: "0.5rem",
      };
    case "product-card":
      return { title: "Product Name", price: "$0.00", description: "Product description here.", image: "", ctaLabel: "Order Now", ctaHref: "#" };
    case "booking-form":
      return { title: "Make a Reservation", subtitle: "Book your table today", bgColor: "#f9fafb", accentColor: "" };
    case "coupon-banner":
      return { title: "Special Offer", code: "SAVE10", description: "Use code at checkout for 10% off.", bgColor: "#2563eb", textColor: "#ffffff" };
    case "login-form":
      return { title: "Sign In", subtitle: "Access your account", redirectUrl: "/" };
    case "pricing-table":
      return {
        plans: [
          { name: "Basic", price: "$9/mo", features: ["Feature one", "Feature two", "Feature three"], ctaLabel: "Get Started", ctaHref: "#", highlighted: false },
          { name: "Pro", price: "$29/mo", features: ["Everything in Basic", "Feature four", "Feature five", "Priority support"], ctaLabel: "Get Pro", ctaHref: "#", highlighted: true },
        ],
      };
    case "testimonial":
      return { author: "Jane Smith", role: "Happy Customer", content: "This business completely exceeded my expectations. Highly recommend!", rating: 5, avatar: "" };
    case "faq":
      return {
        title: "Frequently Asked Questions",
        items: [
          { question: "What are your hours?", answer: "We are open Monday–Friday 9am–6pm." },
          { question: "Do you offer delivery?", answer: "Yes, we deliver within a 10-mile radius." },
          { question: "How do I contact you?", answer: "You can reach us by phone or email from our contact page." },
        ],
      };
    case "custom-html":
      return { html: "<p>Custom HTML content</p>" };
    default:
      return {};
  }
}

// ─── Individual element renderers ─────────────────────────────────────────────

function RenderText({ props }: { props: Record<string, unknown> }) {
  const tag = (props.tag as string) || "p";
  const content = (props.content as string) || "";
  const align = (props.align as string) || "left";
  const color = (props.color as string) || "inherit";
  const fontSize = (props.fontSize as string) || "1rem";
  const fontWeight = (props.fontWeight as string) || "400";

  const style: React.CSSProperties = { textAlign: align as React.CSSProperties["textAlign"], color: color || undefined, fontSize, fontWeight, margin: "0", lineHeight: "1.6" };

  if (tag === "h1") return <h1 style={{ ...style, fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>{content}</h1>;
  if (tag === "h2") return <h2 style={{ ...style, fontSize: "2rem", fontWeight: "600", letterSpacing: "-0.015em" }}>{content}</h2>;
  if (tag === "h3") return <h3 style={{ ...style, fontSize: "1.5rem", fontWeight: "600" }}>{content}</h3>;
  if (tag === "h4") return <h4 style={{ ...style, fontSize: "1.25rem", fontWeight: "600" }}>{content}</h4>;
  return <p style={style}>{content}</p>;
}

function RenderImage({ props }: { props: Record<string, unknown> }) {
  const src = (props.src as string) || "";
  const alt = (props.alt as string) || "";
  const width = (props.width as string) || "100%";
  const height = (props.height as string) || "300px";
  const objectFit = (props.objectFit as string) || "cover";

  if (!src) {
    return (
      <div style={{ width, height, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.875rem", border: "2px dashed #e5e7eb" }}>
        No image set
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} style={{ width, height, objectFit: objectFit as React.CSSProperties["objectFit"], display: "block" }} />
  );
}

function RenderButton({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const label = (props.label as string) || "Button";
  const href = (props.href as string) || "#";
  const variant = (props.variant as string) || "primary";
  const align = (props.align as string) || "center";

  const styles: Record<string, React.CSSProperties> = {
    primary: { background: theme.primaryColor, color: "#fff", border: "none" },
    secondary: { background: "transparent", color: theme.primaryColor, border: `2px solid ${theme.primaryColor}` },
    accent: { background: theme.accentColor, color: "#fff", border: "none" },
    outline: { background: "transparent", color: theme.textColor, border: `2px solid ${theme.textColor}` },
  };

  return (
    <div style={{ textAlign: align as React.CSSProperties["textAlign"] }}>
      <a
        href={href}
        style={{
          display: "inline-block",
          padding: "0.625rem 1.5rem",
          borderRadius: theme.borderRadius,
          fontSize: "0.9rem",
          fontWeight: "600",
          textDecoration: "none",
          cursor: "pointer",
          ...(styles[variant] ?? styles.primary),
        }}
      >
        {label}
      </a>
    </div>
  );
}

function RenderDivider({ props }: { props: Record<string, unknown> }) {
  return (
    <hr
      style={{
        border: "none",
        borderTop: `${props.thickness || "1px"} ${props.style || "solid"} ${props.color || "#e5e7eb"}`,
        margin: `${props.marginY || "1rem"} 0`,
      }}
    />
  );
}

function RenderSpacer({ props }: { props: Record<string, unknown> }) {
  return <div style={{ height: (props.height as string) || "3rem" }} />;
}

function RenderHero({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const bgColor = (props.bgColor as string) || theme.primaryColor;
  const bgImage = (props.bgImage as string) || "";
  const textColor = (props.textColor as string) || "#ffffff";
  const align = (props.align as string) || "center";
  const minHeight = (props.minHeight as string) || "500px";

  return (
    <div
      style={{
        minHeight,
        background: bgImage ? `url(${bgImage}) center/cover no-repeat` : bgColor,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        padding: "4rem 2rem",
        textAlign: align as React.CSSProperties["textAlign"],
        color: textColor,
        position: "relative",
      }}
    >
      {bgImage && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "800px", margin: align === "center" ? "0 auto" : "0" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: "700", letterSpacing: "-0.025em", marginBottom: "1rem", fontFamily: `${theme.headingFont}, Inter, sans-serif` }}>
          {(props.title as string) || "Your Title"}
        </h1>
        <p style={{ fontSize: "1.25rem", opacity: 0.85, marginBottom: "2rem", lineHeight: "1.6" }}>
          {(props.subtitle as string) || ""}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start" }}>
          {props.ctaLabel && (
            <a
              href={(props.ctaHref as string) || "#"}
              style={{ background: theme.accentColor, color: "#fff", padding: "0.75rem 2rem", borderRadius: theme.borderRadius, textDecoration: "none", fontWeight: "600", display: "inline-block" }}
            >
              {props.ctaLabel as string}
            </a>
          )}
          {props.ctaSecondaryLabel && (
            <a
              href={(props.ctaSecondaryHref as string) || "#"}
              style={{ background: "transparent", color: textColor, border: `2px solid ${textColor}`, padding: "0.75rem 2rem", borderRadius: theme.borderRadius, textDecoration: "none", fontWeight: "600", display: "inline-block" }}
            >
              {props.ctaSecondaryLabel as string}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function RenderNav({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const logo = (props.logo as string) || "Business";
  const links = (props.links as { label: string; href: string }[]) || [];
  const bgColor = (props.bgColor as string) || "#ffffff";
  const textColor = (props.textColor as string) || theme.textColor;
  const sticky = props.sticky as boolean;

  return (
    <nav
      style={{
        background: bgColor,
        borderBottom: "1px solid rgba(0,0,0,0.1)",
        padding: "0 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "60px",
        position: sticky ? "sticky" : "static",
        top: 0,
        zIndex: 100,
      }}
    >
      <span style={{ fontWeight: "700", fontSize: "1.125rem", color: textColor, fontFamily: `${theme.headingFont}, Inter, sans-serif` }}>{logo}</span>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        {links.map((link, i) => (
          <a key={i} href={link.href} style={{ color: textColor, textDecoration: "none", fontSize: "0.9rem", fontWeight: "500", opacity: 0.8 }}>
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function RenderFooter({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const text = (props.text as string) || "";
  const links = (props.links as { label: string; href: string }[]) || [];
  const bgColor = (props.bgColor as string) || theme.primaryColor;
  const textColor = (props.textColor as string) || "#9ca3af";

  return (
    <footer style={{ background: bgColor, padding: "2rem", color: textColor }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.875rem" }}>{text}</p>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {links.map((link, i) => (
            <a key={i} href={link.href} style={{ color: textColor, textDecoration: "none", fontSize: "0.875rem" }}>{link.label}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

function RenderColumns({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const columns = Number(props.columns) || 2;
  const gap = (props.gap as string) || "2rem";
  const items = (props.items as { content: string }[]) || Array(columns).fill({ content: "" });

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap, padding: "2rem 0" }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: "1rem", border: "1px solid #e5e7eb", borderRadius: theme.borderRadius, minHeight: "100px" }}>
          <p style={{ margin: 0, color: theme.textColor }}>{item.content}</p>
        </div>
      ))}
    </div>
  );
}

function RenderVideo({ props }: { props: Record<string, unknown> }) {
  const url = (props.url as string) || "";
  const title = (props.title as string) || "Video";

  if (!url) {
    return (
      <div style={{ background: "#111827", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
        <span>No video URL set</span>
      </div>
    );
  }

  // Convert YouTube/Vimeo URLs to embed
  let embedUrl = url;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return (
    <div style={{ aspectRatio: "16/9", position: "relative" }}>
      <iframe src={embedUrl} title={title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} allowFullScreen />
    </div>
  );
}

function RenderGallery({ props }: { props: Record<string, unknown> }) {
  const images = (props.images as { src: string; alt: string }[]) || [];
  const columns = Number(props.columns) || 3;
  const gap = (props.gap as string) || "0.5rem";

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
      {images.map((img, i) => (
        <div key={i} style={{ aspectRatio: "1", background: "#f3f4f6", overflow: "hidden" }}>
          {img.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.src} alt={img.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: "0.75rem" }}>
              Photo {i + 1}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RenderProductCard({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: theme.borderRadius, overflow: "hidden", maxWidth: "360px" }}>
      <div style={{ background: "#f3f4f6", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {props.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.image as string} alt={props.title as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#9ca3af", fontSize: "0.875rem" }}>Product Image</span>
        )}
      </div>
      <div style={{ padding: "1.25rem" }}>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: "600", color: theme.textColor }}>{(props.title as string) || "Product Name"}</h3>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#6b7280", lineHeight: "1.5" }}>{(props.description as string) || ""}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: "700", fontSize: "1.25rem", color: theme.primaryColor }}>{(props.price as string) || "$0.00"}</span>
          <a href={(props.ctaHref as string) || "#"} style={{ background: theme.accentColor, color: "#fff", padding: "0.5rem 1rem", borderRadius: theme.borderRadius, textDecoration: "none", fontSize: "0.875rem", fontWeight: "600" }}>
            {(props.ctaLabel as string) || "Order"}
          </a>
        </div>
      </div>
    </div>
  );
}

function RenderBookingForm({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const [formData, setFormData] = useState({ name: "", phone: "", date: "", time: "", partySize: "2" });
  const [submitted, setSubmitted] = useState(false);
  const bgColor = (props.bgColor as string) || "#f9fafb";

  if (submitted) {
    return (
      <div style={{ background: bgColor, padding: "3rem 2rem", textAlign: "center", borderRadius: theme.borderRadius }}>
        <h3 style={{ color: "#16a34a", fontWeight: "600", marginBottom: "0.5rem" }}>Reservation Confirmed!</h3>
        <p style={{ color: "#6b7280" }}>We&apos;ll see you soon. Check your phone for confirmation.</p>
      </div>
    );
  }

  return (
    <div style={{ background: bgColor, padding: "2.5rem 2rem", borderRadius: theme.borderRadius }}>
      <h2 style={{ fontWeight: "700", marginBottom: "0.5rem", color: theme.textColor, fontFamily: `${theme.headingFont}, Inter, sans-serif` }}>
        {(props.title as string) || "Make a Reservation"}
      </h2>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontSize: "0.9rem" }}>{(props.subtitle as string) || ""}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {[
          { key: "name", label: "Full Name", type: "text", placeholder: "John Smith" },
          { key: "phone", label: "Phone", type: "tel", placeholder: "(555) 000-0000" },
          { key: "date", label: "Date", type: "date", placeholder: "" },
          { key: "time", label: "Time", type: "time", placeholder: "" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem", color: theme.textColor }}>{label}</label>
            <input
              type={type}
              placeholder={placeholder}
              value={formData[key as keyof typeof formData]}
              onChange={(e) => setFormData((p) => ({ ...p, [key]: e.target.value }))}
              style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: theme.borderRadius, fontSize: "0.9rem", boxSizing: "border-box" }}
            />
          </div>
        ))}
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem", color: theme.textColor }}>Party Size</label>
          <select
            value={formData.partySize}
            onChange={(e) => setFormData((p) => ({ ...p, partySize: e.target.value }))}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: theme.borderRadius, fontSize: "0.9rem" }}
          >
            {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>)}
          </select>
        </div>
      </div>
      <button
        onClick={() => setSubmitted(true)}
        style={{ marginTop: "1.5rem", background: theme.accentColor, color: "#fff", padding: "0.75rem 2rem", border: "none", borderRadius: theme.borderRadius, fontWeight: "600", cursor: "pointer", fontSize: "0.9rem" }}
      >
        Reserve Table
      </button>
    </div>
  );
}

function RenderCouponBanner({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const [copied, setCopied] = useState(false);
  const code = (props.code as string) || "SAVE10";
  const bgColor = (props.bgColor as string) || theme.accentColor;
  const textColor = (props.textColor as string) || "#ffffff";

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div style={{ background: bgColor, padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
      <div>
        <p style={{ fontWeight: "700", fontSize: "1.125rem", color: textColor, margin: "0 0 0.25rem" }}>{(props.title as string) || "Special Offer"}</p>
        <p style={{ color: textColor, opacity: 0.8, margin: 0, fontSize: "0.875rem" }}>{(props.description as string) || ""}</p>
      </div>
      <button
        onClick={copy}
        style={{ background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.5)", borderRadius: theme.borderRadius, color: textColor, padding: "0.5rem 1.25rem", cursor: "pointer", fontWeight: "700", fontSize: "1rem", letterSpacing: "0.05em", fontFamily: "monospace" }}
      >
        {copied ? "Copied!" : code}
      </button>
    </div>
  );
}

function RenderLoginForm({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  return (
    <div style={{ maxWidth: "400px", margin: "0 auto", padding: "2.5rem 2rem", border: "1px solid #e5e7eb", borderRadius: theme.borderRadius }}>
      <h2 style={{ fontWeight: "700", marginBottom: "0.5rem", color: theme.textColor, fontFamily: `${theme.headingFont}, Inter, sans-serif` }}>
        {(props.title as string) || "Sign In"}
      </h2>
      <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontSize: "0.9rem" }}>{(props.subtitle as string) || ""}</p>
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem", color: theme.textColor }}>Email</label>
        <input type="email" placeholder="you@example.com" style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: theme.borderRadius, fontSize: "0.9rem", boxSizing: "border-box" }} />
      </div>
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem", color: theme.textColor }}>Password</label>
        <input type="password" placeholder="••••••••" style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: theme.borderRadius, fontSize: "0.9rem", boxSizing: "border-box" }} />
      </div>
      <button style={{ width: "100%", background: theme.accentColor, color: "#fff", padding: "0.75rem", border: "none", borderRadius: theme.borderRadius, fontWeight: "600", cursor: "pointer", fontSize: "0.9rem" }}>
        Sign In
      </button>
    </div>
  );
}

function RenderPricingTable({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const plans = (props.plans as { name: string; price: string; features: string[]; ctaLabel: string; ctaHref: string; highlighted: boolean }[]) || [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: "1.5rem", padding: "2rem 0" }}>
      {plans.map((plan, i) => (
        <div
          key={i}
          style={{
            border: plan.highlighted ? `2px solid ${theme.accentColor}` : "1px solid #e5e7eb",
            borderRadius: theme.borderRadius,
            padding: "2rem",
            background: plan.highlighted ? `${theme.accentColor}08` : "#fff",
            position: "relative",
          }}
        >
          {plan.highlighted && (
            <div style={{ position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%) translateY(-50%)", background: theme.accentColor, color: "#fff", padding: "0.2rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: "600", whiteSpace: "nowrap" }}>
              Most Popular
            </div>
          )}
          <h3 style={{ fontWeight: "700", color: theme.textColor, marginBottom: "0.5rem" }}>{plan.name}</h3>
          <p style={{ fontSize: "2rem", fontWeight: "700", color: plan.highlighted ? theme.accentColor : theme.textColor, marginBottom: "1.5rem" }}>{plan.price}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {plan.features.map((f, j) => (
              <li key={j} style={{ fontSize: "0.875rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "#16a34a" }}>✓</span> {f}
              </li>
            ))}
          </ul>
          <a
            href={plan.ctaHref || "#"}
            style={{ display: "block", textAlign: "center", background: plan.highlighted ? theme.accentColor : "transparent", color: plan.highlighted ? "#fff" : theme.accentColor, border: `2px solid ${theme.accentColor}`, padding: "0.625rem", borderRadius: theme.borderRadius, textDecoration: "none", fontWeight: "600", fontSize: "0.9rem" }}
          >
            {plan.ctaLabel || "Get Started"}
          </a>
        </div>
      ))}
    </div>
  );
}

function RenderTestimonial({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const rating = Number(props.rating) || 5;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: theme.borderRadius, padding: "2rem", maxWidth: "600px" }}>
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ color: i < rating ? "#f59e0b" : "#e5e7eb", fontSize: "1.25rem" }}>★</span>
        ))}
      </div>
      <p style={{ color: theme.textColor, lineHeight: "1.6", fontStyle: "italic", marginBottom: "1.5rem" }}>
        &ldquo;{(props.content as string) || ""}&rdquo;
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {props.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.avatar as string} alt={props.author as string} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: theme.accentColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "700" }}>
            {((props.author as string) || "?")[0]}
          </div>
        )}
        <div>
          <p style={{ fontWeight: "600", margin: 0, color: theme.textColor, fontSize: "0.9rem" }}>{(props.author as string) || ""}</p>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8rem" }}>{(props.role as string) || ""}</p>
        </div>
      </div>
    </div>
  );
}

function RenderFAQ({ props, theme }: { props: Record<string, unknown>; theme: SiteTheme }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = (props.items as { question: string; answer: string }[]) || [];

  return (
    <div style={{ maxWidth: "720px" }}>
      {props.title && (
        <h2 style={{ fontWeight: "700", marginBottom: "1.5rem", color: theme.textColor, fontFamily: `${theme.headingFont}, Inter, sans-serif` }}>
          {props.title as string}
        </h2>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {items.map((item, i) => (
          <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: theme.borderRadius, overflow: "hidden" }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              style={{ width: "100%", padding: "1rem 1.25rem", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", fontWeight: "600", color: theme.textColor, fontSize: "0.9rem" }}
            >
              {item.question}
              <span style={{ transform: openIndex === i ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#9ca3af" }}>▾</span>
            </button>
            {openIndex === i && (
              <div style={{ padding: "0 1.25rem 1rem", color: "#6b7280", fontSize: "0.9rem", lineHeight: "1.6" }}>
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderContainer({ props, theme, children }: { props: Record<string, unknown>; theme: SiteTheme; children?: React.ReactNode }) {
  return (
    <div
      style={{
        background: (props.bgColor as string) || "transparent",
        padding: (props.padding as string) || "2rem",
        maxWidth: (props.maxWidth as string) || "100%",
        margin: "0 auto",
        borderRadius: (props.borderRadius as string) || theme.borderRadius,
      }}
    >
      {children || <p style={{ color: "#9ca3af", textAlign: "center", margin: 0 }}>Empty container</p>}
    </div>
  );
}

// ─── Element wrapper (with optional editor chrome) ────────────────────────────

function ElementWrapper({
  element,
  theme,
  editorMode,
  selected,
  onSelect,
}: {
  element: SiteElement;
  theme: SiteTheme;
  editorMode?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const content = renderElementContent(element, theme);

  if (!editorMode) {
    return <>{content}</>;
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect?.(element.id); }}
      style={{
        position: "relative",
        outline: selected ? "2px solid #2563eb" : "2px solid transparent",
        outlineOffset: "2px",
        cursor: "pointer",
        transition: "outline 0.1s",
      }}
      className="group"
    >
      {content}
      {selected && (
        <div style={{ position: "absolute", top: "-1px", left: "-1px", background: "#2563eb", color: "#fff", fontSize: "0.65rem", fontWeight: "600", padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em", pointerEvents: "none", zIndex: 10 }}>
          {element.type}
        </div>
      )}
    </div>
  );
}

function renderElementContent(element: SiteElement, theme: SiteTheme): React.ReactNode {
  const p = element.props;
  switch (element.type) {
    case "text":       return <RenderText props={p} />;
    case "image":      return <RenderImage props={p} />;
    case "button":     return <RenderButton props={p} theme={theme} />;
    case "divider":    return <RenderDivider props={p} />;
    case "spacer":     return <RenderSpacer props={p} />;
    case "hero":       return <RenderHero props={p} theme={theme} />;
    case "nav":        return <RenderNav props={p} theme={theme} />;
    case "footer":     return <RenderFooter props={p} theme={theme} />;
    case "columns":    return <RenderColumns props={p} theme={theme} />;
    case "video":      return <RenderVideo props={p} />;
    case "gallery":    return <RenderGallery props={p} />;
    case "container":  return <RenderContainer props={p} theme={theme} />;
    case "product-card": return <RenderProductCard props={p} theme={theme} />;
    case "booking-form": return <RenderBookingForm props={p} theme={theme} />;
    case "coupon-banner": return <RenderCouponBanner props={p} theme={theme} />;
    case "login-form": return <RenderLoginForm props={p} theme={theme} />;
    case "pricing-table": return <RenderPricingTable props={p} theme={theme} />;
    case "testimonial": return <RenderTestimonial props={p} theme={theme} />;
    case "faq":        return <RenderFAQ props={p} theme={theme} />;
    case "custom-html":
      return <div dangerouslySetInnerHTML={{ __html: (p.html as string) || "" }} />;
    default:
      return <div style={{ padding: "1rem", background: "#f3f4f6", color: "#6b7280", textAlign: "center" }}>Unknown element: {element.type}</div>;
  }
}

// ─── Main SiteRenderer ────────────────────────────────────────────────────────

interface SiteRendererProps {
  elements: SiteElement[];
  theme: SiteTheme;
  editorMode?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function SiteRenderer({ elements, theme, editorMode, selectedId, onSelect }: SiteRendererProps) {
  return (
    <div style={themeVars(theme)}>
      {elements.map((el) => (
        <ElementWrapper
          key={el.id}
          element={el}
          theme={theme}
          editorMode={editorMode}
          selected={selectedId === el.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
