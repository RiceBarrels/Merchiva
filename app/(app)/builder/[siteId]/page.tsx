"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Globe,
  Loader2,
  Palette,
  Plus,
  Save,
  Trash2,
  X,
  LayoutDashboard,
  Type,
  Image,
  MousePointerClick,
  SeparatorHorizontal,
  AlignJustify,
  Square,
  Columns2,
  ShoppingBag,
  CalendarDays,
  Tag,
  CreditCard,
  MessageSquare,
  HelpCircle,
  GalleryHorizontal,
  Code2,
  LogIn,
  Navigation,
  Footprints,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSiteById, getPages, createPage, updatePage, updateSite, deletePage } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import { SiteElementRenderer } from "@/components/site-renderer";
import { usePermissions } from "@/lib/context/permissions";
import type { Site, SitePage, SiteElement, ElementType, SiteTheme } from "@/lib/types";
import type { Product } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultProps(type: ElementType): Record<string, unknown> {
  switch (type) {
    case "text":       return { content: "Your text here", tag: "p", align: "left", fontSize: "1rem", fontWeight: "normal", color: "", padding: "0" };
    case "image":      return { src: "", alt: "Image", width: "100%", height: "auto", objectFit: "cover", borderRadius: "0" };
    case "button":     return { label: "Click me", href: "#", variant: "primary", size: "md", fullWidth: false };
    case "hero":       return { title: "Welcome to Our Site", subtitle: "Tell your story here.", backgroundImage: "", backgroundColor: "#f9fafb", ctaLabel: "Get Started", ctaHref: "#", align: "center", height: "480px", textColor: "" };
    case "nav":        return { logo: "My Site", links: [{ label: "Home", href: "/" }, { label: "About", href: "/about" }], backgroundColor: "#ffffff", textColor: "#09090b", sticky: false };
    case "footer":     return { text: "© 2024 My Site. All rights reserved.", links: [], backgroundColor: "#18181b", textColor: "#9ca3af" };
    case "divider":    return { color: "#e5e7eb", thickness: "1px", margin: "1.5rem 0" };
    case "spacer":     return { height: "48px" };
    case "container":  return { backgroundColor: "", padding: "2rem", maxWidth: "100%", borderRadius: "0" };
    case "columns":    return { columns: 2, gap: "1.5rem", columnContent: ["", ""] };
    case "product-card":  return { productId: "", showPrice: true, showDescription: false };
    case "booking-form":  return { title: "Book an Appointment", submitLabel: "Book Now" };
    case "coupon-banner": return { code: "SAVE10", description: "Get 10% off your next order!", backgroundColor: "#fef3c7", textColor: "#92400e" };
    case "pricing-table": return { plans: [{ name: "Basic", price: "Free", features: ["Feature 1", "Feature 2"], ctaLabel: "Get Started", ctaHref: "#", highlighted: false }, { name: "Pro", price: "$29/mo", features: ["Everything in Basic", "Priority support", "Advanced features"], ctaLabel: "Start Pro", ctaHref: "#", highlighted: true }] };
    case "testimonial":   return { quote: "This product is amazing!", author: "Jane D.", role: "Happy Customer", avatar: "", rating: 5 };
    case "faq":           return { items: [{ question: "What is your return policy?", answer: "We offer a 30-day return policy on all items." }, { question: "How do I contact support?", answer: "Email us at hello@example.com anytime." }] };
    case "gallery":       return { images: [], columns: 3, gap: "0.5rem" };
    case "custom-html":   return { html: "<p>Your custom HTML here</p>" };
    case "login-form":    return { title: "Sign In", redirectUrl: "/dashboard" };
    default:              return {};
  }
}

// ─── Element palette config ───────────────────────────────────────────────────

const PALETTE: { label: string; icon: React.ReactNode; type: ElementType }[][] = [
  [
    { label: "Text",      icon: <Type className="h-3.5 w-3.5" />,             type: "text" },
    { label: "Image",     icon: <Image className="h-3.5 w-3.5" />,            type: "image" },
    { label: "Button",    icon: <MousePointerClick className="h-3.5 w-3.5" />, type: "button" },
    { label: "Divider",   icon: <Minus className="h-3.5 w-3.5" />,            type: "divider" },
    { label: "Spacer",    icon: <SeparatorHorizontal className="h-3.5 w-3.5" />, type: "spacer" },
    { label: "Container", icon: <Square className="h-3.5 w-3.5" />,           type: "container" },
    { label: "Columns",   icon: <Columns2 className="h-3.5 w-3.5" />,         type: "columns" },
  ],
  [
    { label: "Hero",      icon: <LayoutDashboard className="h-3.5 w-3.5" />,  type: "hero" },
    { label: "Nav",       icon: <Navigation className="h-3.5 w-3.5" />,       type: "nav" },
    { label: "Footer",    icon: <Footprints className="h-3.5 w-3.5" />,       type: "footer" },
  ],
  [
    { label: "Product",   icon: <ShoppingBag className="h-3.5 w-3.5" />,      type: "product-card" },
    { label: "Booking",   icon: <CalendarDays className="h-3.5 w-3.5" />,     type: "booking-form" },
    { label: "Coupon",    icon: <Tag className="h-3.5 w-3.5" />,              type: "coupon-banner" },
    { label: "Pricing",   icon: <CreditCard className="h-3.5 w-3.5" />,       type: "pricing-table" },
  ],
  [
    { label: "Review",    icon: <MessageSquare className="h-3.5 w-3.5" />,    type: "testimonial" },
    { label: "FAQ",       icon: <HelpCircle className="h-3.5 w-3.5" />,       type: "faq" },
    { label: "Gallery",   icon: <GalleryHorizontal className="h-3.5 w-3.5" />, type: "gallery" },
  ],
  [
    { label: "Login",     icon: <LogIn className="h-3.5 w-3.5" />,            type: "login-form" },
    { label: "HTML",      icon: <Code2 className="h-3.5 w-3.5" />,            type: "custom-html" },
  ],
];

const PALETTE_LABELS = ["Basic", "Layout", "Commerce", "Content", "Advanced"];

// ─── Properties panel components ─────────────────────────────────────────────

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-muted-foreground pt-1.5 leading-none">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function PropInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function PropSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function PropToggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span className="text-xs">{label}</span>
    </label>
  );
}

function PropTextarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring resize-y font-mono"
    />
  );
}

// ─── Type-specific property panels ───────────────────────────────────────────

function TextProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Content">
        <PropTextarea value={(props.content as string) || ""} onChange={(v) => onChange("content", v)} />
      </PropRow>
      <PropRow label="Tag">
        <PropSelect value={(props.tag as string) || "p"} onChange={(v) => onChange("tag", v)} options={[{ label: "Heading 1", value: "h1" }, { label: "Heading 2", value: "h2" }, { label: "Heading 3", value: "h3" }, { label: "Heading 4", value: "h4" }, { label: "Paragraph", value: "p" }, { label: "Span", value: "span" }]} />
      </PropRow>
      <PropRow label="Align">
        <PropSelect value={(props.align as string) || "left"} onChange={(v) => onChange("align", v)} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
      </PropRow>
      <PropRow label="Font size"><PropInput value={(props.fontSize as string) || ""} onChange={(v) => onChange("fontSize", v)} placeholder="1rem" /></PropRow>
      <PropRow label="Weight">
        <PropSelect value={(props.fontWeight as string) || "normal"} onChange={(v) => onChange("fontWeight", v)} options={[{ label: "Normal", value: "normal" }, { label: "Medium", value: "500" }, { label: "Semibold", value: "600" }, { label: "Bold", value: "bold" }]} />
      </PropRow>
      <PropRow label="Color"><PropInput type="color" value={(props.color as string) || "#000000"} onChange={(v) => onChange("color", v)} /></PropRow>
      <PropRow label="Padding"><PropInput value={(props.padding as string) || ""} onChange={(v) => onChange("padding", v)} placeholder="0.5rem 1rem" /></PropRow>
    </>
  );
}

function ImageProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="URL"><PropInput value={(props.src as string) || ""} onChange={(v) => onChange("src", v)} placeholder="https://…" /></PropRow>
      <PropRow label="Alt text"><PropInput value={(props.alt as string) || ""} onChange={(v) => onChange("alt", v)} placeholder="Image description" /></PropRow>
      <PropRow label="Width"><PropInput value={(props.width as string) || "100%"} onChange={(v) => onChange("width", v)} placeholder="100%" /></PropRow>
      <PropRow label="Height"><PropInput value={(props.height as string) || "auto"} onChange={(v) => onChange("height", v)} placeholder="auto" /></PropRow>
      <PropRow label="Fit">
        <PropSelect value={(props.objectFit as string) || "cover"} onChange={(v) => onChange("objectFit", v)} options={[{ label: "Cover", value: "cover" }, { label: "Contain", value: "contain" }, { label: "Fill", value: "fill" }, { label: "None", value: "none" }]} />
      </PropRow>
      <PropRow label="Radius"><PropInput value={(props.borderRadius as string) || "0"} onChange={(v) => onChange("borderRadius", v)} placeholder="8px" /></PropRow>
    </>
  );
}

function ButtonProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Label"><PropInput value={(props.label as string) || ""} onChange={(v) => onChange("label", v)} placeholder="Click me" /></PropRow>
      <PropRow label="Link"><PropInput value={(props.href as string) || "#"} onChange={(v) => onChange("href", v)} placeholder="/page or https://…" /></PropRow>
      <PropRow label="Style">
        <PropSelect value={(props.variant as string) || "primary"} onChange={(v) => onChange("variant", v)} options={[{ label: "Primary", value: "primary" }, { label: "Secondary", value: "secondary" }, { label: "Outline", value: "outline" }, { label: "Accent", value: "accent" }]} />
      </PropRow>
      <PropRow label="Size">
        <PropSelect value={(props.size as string) || "md"} onChange={(v) => onChange("size", v)} options={[{ label: "Small", value: "sm" }, { label: "Medium", value: "md" }, { label: "Large", value: "lg" }]} />
      </PropRow>
      <PropRow label="Full width"><PropToggle value={props.fullWidth === true} onChange={(v) => onChange("fullWidth", v)} label="Full width" /></PropRow>
    </>
  );
}

function HeroProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Welcome" /></PropRow>
      <PropRow label="Subtitle"><PropTextarea value={(props.subtitle as string) || ""} onChange={(v) => onChange("subtitle", v)} rows={2} /></PropRow>
      <PropRow label="CTA Label"><PropInput value={(props.ctaLabel as string) || ""} onChange={(v) => onChange("ctaLabel", v)} placeholder="Get Started" /></PropRow>
      <PropRow label="CTA Link"><PropInput value={(props.ctaHref as string) || "#"} onChange={(v) => onChange("ctaHref", v)} placeholder="#" /></PropRow>
      <PropRow label="Align">
        <PropSelect value={(props.align as string) || "center"} onChange={(v) => onChange("align", v)} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
      </PropRow>
      <PropRow label="Height"><PropInput value={(props.height as string) || "480px"} onChange={(v) => onChange("height", v)} placeholder="480px" /></PropRow>
      <PropRow label="Bg color"><PropInput type="color" value={(props.backgroundColor as string) || "#f9fafb"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Bg image"><PropInput value={(props.backgroundImage as string) || ""} onChange={(v) => onChange("backgroundImage", v)} placeholder="https://…" /></PropRow>
      <PropRow label="Text color"><PropInput type="color" value={(props.textColor as string) || "#09090b"} onChange={(v) => onChange("textColor", v)} /></PropRow>
    </>
  );
}

function NavProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const links = (props.links as { label: string; href: string }[]) || [];
  return (
    <>
      <PropRow label="Logo"><PropInput value={(props.logo as string) || ""} onChange={(v) => onChange("logo", v)} placeholder="My Site" /></PropRow>
      <PropRow label="Bg color"><PropInput type="color" value={(props.backgroundColor as string) || "#ffffff"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropInput type="color" value={(props.textColor as string) || "#09090b"} onChange={(v) => onChange("textColor", v)} /></PropRow>
      <PropRow label="Sticky"><PropToggle value={props.sticky === true} onChange={(v) => onChange("sticky", v)} label="Sticky on scroll" /></PropRow>
      <PropRow label="Links">
        <div className="space-y-1">
          {links.map((l, i) => (
            <div key={i} className="flex gap-1">
              <input value={l.label} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], label: e.target.value }; onChange("links", n); }} placeholder="Label" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <input value={l.href} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], href: e.target.value }; onChange("links", n); }} placeholder="/page" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => onChange("links", links.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <button onClick={() => onChange("links", [...links, { label: "New", href: "/" }])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add link</button>
        </div>
      </PropRow>
    </>
  );
}

function FooterProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const links = (props.links as { label: string; href: string }[]) || [];
  return (
    <>
      <PropRow label="Text"><PropTextarea value={(props.text as string) || ""} onChange={(v) => onChange("text", v)} rows={2} /></PropRow>
      <PropRow label="Bg color"><PropInput type="color" value={(props.backgroundColor as string) || "#18181b"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropInput type="color" value={(props.textColor as string) || "#9ca3af"} onChange={(v) => onChange("textColor", v)} /></PropRow>
      <PropRow label="Links">
        <div className="space-y-1">
          {links.map((l, i) => (
            <div key={i} className="flex gap-1">
              <input value={l.label} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], label: e.target.value }; onChange("links", n); }} placeholder="Label" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <input value={l.href} onChange={(e) => { const n = [...links]; n[i] = { ...n[i], href: e.target.value }; onChange("links", n); }} placeholder="/page" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => onChange("links", links.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <button onClick={() => onChange("links", [...links, { label: "New", href: "/" }])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add link</button>
        </div>
      </PropRow>
    </>
  );
}

function DividerProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Color"><PropInput type="color" value={(props.color as string) || "#e5e7eb"} onChange={(v) => onChange("color", v)} /></PropRow>
      <PropRow label="Thickness"><PropInput value={(props.thickness as string) || "1px"} onChange={(v) => onChange("thickness", v)} placeholder="1px" /></PropRow>
      <PropRow label="Margin"><PropInput value={(props.margin as string) || "1.5rem 0"} onChange={(v) => onChange("margin", v)} placeholder="1.5rem 0" /></PropRow>
    </>
  );
}

function SpacerProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return <PropRow label="Height"><PropInput value={(props.height as string) || "48px"} onChange={(v) => onChange("height", v)} placeholder="48px" /></PropRow>;
}

function ContainerProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Bg color"><PropInput type="color" value={(props.backgroundColor as string) || "#ffffff"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Padding"><PropInput value={(props.padding as string) || "2rem"} onChange={(v) => onChange("padding", v)} placeholder="2rem" /></PropRow>
      <PropRow label="Max width"><PropInput value={(props.maxWidth as string) || "100%"} onChange={(v) => onChange("maxWidth", v)} placeholder="1200px" /></PropRow>
      <PropRow label="Radius"><PropInput value={(props.borderRadius as string) || "0"} onChange={(v) => onChange("borderRadius", v)} placeholder="8px" /></PropRow>
    </>
  );
}

function ColumnsProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const count = Math.min(6, Math.max(1, Number(props.columns) || 2));
  const cols = (props.columnContent as string[]) || Array(count).fill("");
  return (
    <>
      <PropRow label="Columns">
        <PropSelect value={String(count)} onChange={(v) => { const n = Number(v); onChange("columns", n); onChange("columnContent", Array(n).fill("").map((_, i) => cols[i] ?? "")); }} options={[2, 3, 4].map((n) => ({ label: `${n} columns`, value: String(n) }))} />
      </PropRow>
      <PropRow label="Gap"><PropInput value={(props.gap as string) || "1.5rem"} onChange={(v) => onChange("gap", v)} placeholder="1.5rem" /></PropRow>
      {Array.from({ length: count }, (_, i) => (
        <PropRow key={i} label={`Col ${i + 1}`}>
          <PropTextarea value={cols[i] || ""} onChange={(v) => { const n = [...cols]; while (n.length < count) n.push(""); n[i] = v; onChange("columnContent", n); }} rows={2} />
        </PropRow>
      ))}
    </>
  );
}

function ProductCardProps({ props, onChange, products }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void; products: Product[] }) {
  return (
    <>
      <PropRow label="Product">
        <select value={(props.productId as string) || ""} onChange={(e) => onChange("productId", e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
          <option value="">Select a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </PropRow>
      <PropRow label="Show price"><PropToggle value={props.showPrice !== false} onChange={(v) => onChange("showPrice", v)} label="Show price" /></PropRow>
      <PropRow label="Show desc"><PropToggle value={props.showDescription === true} onChange={(v) => onChange("showDescription", v)} label="Show description" /></PropRow>
    </>
  );
}

function BookingFormProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Book an Appointment" /></PropRow>
      <PropRow label="Button text"><PropInput value={(props.submitLabel as string) || ""} onChange={(v) => onChange("submitLabel", v)} placeholder="Book Now" /></PropRow>
    </>
  );
}

function CouponProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Code"><PropInput value={(props.code as string) || ""} onChange={(v) => onChange("code", v)} placeholder="SAVE10" /></PropRow>
      <PropRow label="Description"><PropInput value={(props.description as string) || ""} onChange={(v) => onChange("description", v)} placeholder="Get 10% off!" /></PropRow>
      <PropRow label="Bg color"><PropInput type="color" value={(props.backgroundColor as string) || "#fef3c7"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropInput type="color" value={(props.textColor as string) || "#92400e"} onChange={(v) => onChange("textColor", v)} /></PropRow>
    </>
  );
}

function PricingProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const plans = (props.plans as { name: string; price: string; features: string[]; ctaLabel: string; ctaHref: string; highlighted: boolean }[]) || [];
  return (
    <div className="space-y-3">
      {plans.map((plan, i) => (
        <div key={i} className="rounded border border-border p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium">{plan.name || `Plan ${i + 1}`}</span>
            <button onClick={() => onChange("plans", plans.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
          <input value={plan.name} onChange={(e) => { const n = [...plans]; n[i] = { ...n[i], name: e.target.value }; onChange("plans", n); }} placeholder="Plan name" className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <input value={plan.price} onChange={(e) => { const n = [...plans]; n[i] = { ...n[i], price: e.target.value }; onChange("plans", n); }} placeholder="$29/mo" className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <input value={plan.ctaLabel} onChange={(e) => { const n = [...plans]; n[i] = { ...n[i], ctaLabel: e.target.value }; onChange("plans", n); }} placeholder="Get Started" className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={(plan.features || []).join("\n")} onChange={(e) => { const n = [...plans]; n[i] = { ...n[i], features: e.target.value.split("\n") }; onChange("plans", n); }} placeholder={"Feature 1\nFeature 2"} rows={3} className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring resize-none" />
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={plan.highlighted} onChange={(e) => { const n = [...plans]; n[i] = { ...n[i], highlighted: e.target.checked }; onChange("plans", n); }} /> <span className="text-xs">Highlighted</span></label>
        </div>
      ))}
      <button onClick={() => onChange("plans", [...plans, { name: "New Plan", price: "$0/mo", features: [], ctaLabel: "Get Started", ctaHref: "#", highlighted: false }])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add plan</button>
    </div>
  );
}

function TestimonialProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Quote"><PropTextarea value={(props.quote as string) || ""} onChange={(v) => onChange("quote", v)} /></PropRow>
      <PropRow label="Author"><PropInput value={(props.author as string) || ""} onChange={(v) => onChange("author", v)} placeholder="Jane D." /></PropRow>
      <PropRow label="Role"><PropInput value={(props.role as string) || ""} onChange={(v) => onChange("role", v)} placeholder="Happy Customer" /></PropRow>
      <PropRow label="Avatar URL"><PropInput value={(props.avatar as string) || ""} onChange={(v) => onChange("avatar", v)} placeholder="https://…" /></PropRow>
      <PropRow label="Rating">
        <PropSelect value={String(Number(props.rating) || 5)} onChange={(v) => onChange("rating", Number(v))} options={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} stars`, value: String(n) }))} />
      </PropRow>
    </>
  );
}

function FaqProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const items = (props.items as { question: string; answer: string }[]) || [];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded border border-border p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium">Q{i + 1}</span>
            <button onClick={() => onChange("items", items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
          </div>
          <input value={item.question} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], question: e.target.value }; onChange("items", n); }} placeholder="Question" className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={item.answer} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], answer: e.target.value }; onChange("items", n); }} placeholder="Answer" rows={2} className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring resize-none" />
        </div>
      ))}
      <button onClick={() => onChange("items", [...items, { question: "New question?", answer: "Answer here." }])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add item</button>
    </div>
  );
}

function GalleryProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const images = (props.images as { src: string; alt: string }[]) || [];
  return (
    <>
      <PropRow label="Columns">
        <PropSelect value={String(Number(props.columns) || 3)} onChange={(v) => onChange("columns", Number(v))} options={[2, 3, 4].map((n) => ({ label: `${n} columns`, value: String(n) }))} />
      </PropRow>
      <PropRow label="Gap"><PropInput value={(props.gap as string) || "0.5rem"} onChange={(v) => onChange("gap", v)} placeholder="0.5rem" /></PropRow>
      <PropRow label="Images">
        <div className="space-y-1">
          {images.map((img, i) => (
            <div key={i} className="flex gap-1">
              <input value={img.src} onChange={(e) => { const n = [...images]; n[i] = { ...n[i], src: e.target.value }; onChange("images", n); }} placeholder="https://…" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => onChange("images", images.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <button onClick={() => onChange("images", [...images, { src: "", alt: "" }])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add image</button>
        </div>
      </PropRow>
    </>
  );
}

function HtmlProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return <PropRow label="HTML"><PropTextarea value={(props.html as string) || ""} onChange={(v) => onChange("html", v)} rows={6} /></PropRow>;
}

function LoginFormProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Sign In" /></PropRow>
      <PropRow label="Redirect URL"><PropInput value={(props.redirectUrl as string) || ""} onChange={(v) => onChange("redirectUrl", v)} placeholder="/dashboard" /></PropRow>
    </>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ element, onChange, products }: { element: SiteElement; onChange: (k: string, v: unknown) => void; products: Product[] }) {
  const typeLabels: Record<string, string> = {
    text: "Text", image: "Image", button: "Button", hero: "Hero", nav: "Navigation",
    footer: "Footer", divider: "Divider", spacer: "Spacer", container: "Container",
    columns: "Columns", "product-card": "Product Card", "booking-form": "Booking Form",
    "coupon-banner": "Coupon Banner", "pricing-table": "Pricing Table", testimonial: "Testimonial",
    faq: "FAQ", gallery: "Gallery", "custom-html": "Custom HTML", "login-form": "Login Form",
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Properties</span>
        <p className="text-xs font-medium mt-0.5">{typeLabels[element.type] || element.type}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {element.type === "text"          && <TextProps props={element.props} onChange={onChange} />}
        {element.type === "image"         && <ImageProps props={element.props} onChange={onChange} />}
        {element.type === "button"        && <ButtonProps props={element.props} onChange={onChange} />}
        {element.type === "hero"          && <HeroProps props={element.props} onChange={onChange} />}
        {element.type === "nav"           && <NavProps props={element.props} onChange={onChange} />}
        {element.type === "footer"        && <FooterProps props={element.props} onChange={onChange} />}
        {element.type === "divider"       && <DividerProps props={element.props} onChange={onChange} />}
        {element.type === "spacer"        && <SpacerProps props={element.props} onChange={onChange} />}
        {element.type === "container"     && <ContainerProps props={element.props} onChange={onChange} />}
        {element.type === "columns"       && <ColumnsProps props={element.props} onChange={onChange} />}
        {element.type === "product-card"  && <ProductCardProps props={element.props} onChange={onChange} products={products} />}
        {element.type === "booking-form"  && <BookingFormProps props={element.props} onChange={onChange} />}
        {element.type === "coupon-banner" && <CouponProps props={element.props} onChange={onChange} />}
        {element.type === "pricing-table" && <PricingProps props={element.props} onChange={onChange} />}
        {element.type === "testimonial"   && <TestimonialProps props={element.props} onChange={onChange} />}
        {element.type === "faq"           && <FaqProps props={element.props} onChange={onChange} />}
        {element.type === "gallery"       && <GalleryProps props={element.props} onChange={onChange} />}
        {element.type === "custom-html"   && <HtmlProps props={element.props} onChange={onChange} />}
        {element.type === "login-form"    && <LoginFormProps props={element.props} onChange={onChange} />}
      </div>
    </div>
  );
}

// ─── Theme editor modal ────────────────────────────────────────────────────────

function ThemeModal({ theme, onSave, onClose }: { theme: SiteTheme; onSave: (t: SiteTheme) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<SiteTheme>(theme);

  const f = (k: keyof SiteTheme, v: unknown) => setDraft((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-sm w-full max-w-sm shadow-lg z-10 overflow-y-auto max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="font-semibold text-sm flex items-center gap-2"><Palette className="h-4 w-4" /> Site Theme</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Colors</p>
            {[
              { label: "Primary", key: "primary" as const },
              { label: "Secondary", key: "secondary" as const },
              { label: "Accent", key: "accent" as const },
              { label: "Background", key: "background" as const },
              { label: "Text", key: "text" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs w-24">{label}</span>
                <input type="color" value={draft[key] as string} onChange={(e) => f(key, e.target.value)} className="h-7 w-10 rounded border border-border cursor-pointer" />
                <input type="text" value={draft[key] as string} onChange={(e) => f(key, e.target.value)} className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring" />
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Typography</p>
            {[
              { label: "Heading font", key: "headingFont" as const },
              { label: "Body font", key: "bodyFont" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs w-24">{label}</span>
                <input type="text" value={draft[key] as string} onChange={(e) => f(key, e.target.value)} className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" placeholder="Inter, sans-serif" />
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Shape</p>
            <div className="flex items-center gap-2 py-1.5">
              <span className="text-xs w-24">Border radius</span>
              <input type="range" min="0" max="24" value={Number(draft.borderRadius)} onChange={(e) => f("borderRadius", Number(e.target.value))} className="flex-1" />
              <span className="text-xs font-mono w-12">{draft.borderRadius}px</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4 sticky bottom-0">
          <button onClick={onClose} className="flex-1 rounded border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
          <button onClick={() => { onSave(draft); onClose(); }} className="flex-1 rounded bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90">Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor page ─────────────────────────────────────────────────────────

export default function BuilderEditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const { organizationId } = usePermissions();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const [elements, setElements] = useState<SiteElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Load initial data
  useEffect(() => {
    Promise.all([
      getSiteById(siteId),
      getPages(siteId),
      getProducts(),
    ])
      .then(([s, pgs, prods]) => {
        if (!s) return;
        setSite(s);
        setPages(pgs);
        setProducts(prods);
        const first = pgs[0];
        if (first) {
          setActivePageId(first.id);
          setElements(first.elements ?? []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  // Sync elements when page changes
  const handlePageSwitch = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setActivePageId(pageId);
    setElements(page.elements ?? []);
    setSelectedId(null);
    setDirty(false);
  };

  // Auto-save (debounced)
  const saveCurrentPage = useCallback(async () => {
    if (!activePageId || !dirty) return;
    setSaving(true);
    try {
      await updatePage(activePageId, { elements });
      // Sync page cache
      setPages((prev) => prev.map((p) => p.id === activePageId ? { ...p, elements } : p));
      setDirty(false);
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [activePageId, elements, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(saveCurrentPage, 1500);
    return () => clearTimeout(timer);
  }, [dirty, saveCurrentPage]);

  // Element operations
  const addElement = (type: ElementType) => {
    const el: SiteElement = { id: uid(), type, props: defaultProps(type) };
    const idx = selectedId ? elements.findIndex((e) => e.id === selectedId) : -1;
    const newEls = idx >= 0 ? [...elements.slice(0, idx + 1), el, ...elements.slice(idx + 1)] : [...elements, el];
    setElements(newEls);
    setSelectedId(el.id);
    setDirty(true);
  };

  const deleteElement = (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
    setDirty(true);
  };

  const duplicateElement = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const clone: SiteElement = { ...el, id: uid(), props: { ...el.props } };
    const idx = elements.findIndex((e) => e.id === id);
    const newEls = [...elements.slice(0, idx + 1), clone, ...elements.slice(idx + 1)];
    setElements(newEls);
    setSelectedId(clone.id);
    setDirty(true);
  };

  const moveElement = (id: string, dir: "up" | "down") => {
    const idx = elements.findIndex((e) => e.id === id);
    if (idx === -1) return;
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === elements.length - 1) return;
    const newEls = [...elements];
    const target = dir === "up" ? idx - 1 : idx + 1;
    [newEls[idx], newEls[target]] = [newEls[target], newEls[idx]];
    setElements(newEls);
    setDirty(true);
  };

  const updateElementProp = (id: string, key: string, value: unknown) => {
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, props: { ...e.props, [key]: value } } : e));
    setDirty(true);
  };

  const handleAddPage = async () => {
    if (!newPageName.trim()) return;
    const slug = newPageName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      const page = await createPage(siteId, newPageName.trim(), slug, pages.length);
      setPages((prev) => [...prev, page]);
      setShowAddPage(false);
      setNewPageName("");
      handlePageSwitch(page.id);
    } catch (err) {
      console.error("Failed to create page:", err);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    if (pages.length <= 1) { alert("Cannot delete the last page."); return; }
    if (!confirm("Delete this page?")) return;
    try {
      await deletePage(pageId);
      const newPages = pages.filter((p) => p.id !== pageId);
      setPages(newPages);
      if (activePageId === pageId) handlePageSwitch(newPages[0].id);
    } catch (err) {
      console.error("Failed to delete page:", err);
    }
  };

  const handleTogglePublish = async () => {
    if (!site) return;
    setPublishing(true);
    try {
      const next = !site.published;
      await updateSite(site.id, { published: next });
      setSite((prev) => prev ? { ...prev, published: next } : prev);
    } catch (err) {
      console.error("Failed to toggle publish:", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleThemeSave = async (theme: SiteTheme) => {
    if (!site) return;
    try {
      await updateSite(site.id, { theme });
      setSite((prev) => prev ? { ...prev, theme } : prev);
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  };

  const selectedElement = elements.find((e) => e.id === selectedId);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-3">
        <p className="text-sm text-muted-foreground">Site not found</p>
        <Link href="/builder" className="text-xs underline text-muted-foreground">Back to sites</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted/20">
      {/* ── Toolbar ── */}
      <header className="flex items-center gap-2 px-3 h-11 border-b border-border bg-background shrink-0">
        <Link href="/builder" className="text-muted-foreground hover:text-foreground mr-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold truncate max-w-[140px]">{site.name}</span>
        <span className="text-border">|</span>

        {/* Page tabs */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {pages.map((p) => (
            <div key={p.id} className="relative group shrink-0">
              <button
                onClick={() => handlePageSwitch(p.id)}
                className={cn("px-2.5 py-1 text-xs rounded font-medium transition-colors", p.id === activePageId ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
              >
                {p.name}
              </button>
              {pages.length > 1 && (
                <button onClick={() => handleDeletePage(p.id)} className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive/80 text-white items-center justify-center hidden group-hover:flex">
                  <X className="h-2 w-2" />
                </button>
              )}
            </div>
          ))}
          {showAddPage ? (
            <div className="flex items-center gap-1 shrink-0">
              <input
                autoFocus
                type="text"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") { setShowAddPage(false); setNewPageName(""); } }}
                placeholder="Page name"
                className="rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring w-28"
              />
              <button onClick={handleAddPage} disabled={!newPageName.trim()} className="text-xs font-medium text-foreground disabled:opacity-50">Add</button>
              <button onClick={() => { setShowAddPage(false); setNewPageName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
            </div>
          ) : (
            <button onClick={() => setShowAddPage(true)} className="shrink-0 text-muted-foreground hover:text-foreground px-1.5 py-1 rounded hover:bg-muted/50">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {dirty && <span className="text-[10px] text-muted-foreground">Unsaved…</span>}
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <button
            onClick={() => setShowTheme(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
          >
            <Palette className="h-3.5 w-3.5" /> Theme
          </button>
          <Link
            href={`/s/${site.slug}`}
            target="_blank"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </Link>
          <button
            onClick={handleTogglePublish}
            disabled={publishing}
            className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors", site.published ? "bg-green-600 text-white hover:bg-green-700" : "bg-foreground text-background hover:bg-foreground/90")}
          >
            {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
            {site.published ? "Published" : "Publish"}
          </button>
        </div>
      </header>

      {/* ── Three-column layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Element palette */}
        <aside className="w-48 border-r border-border bg-background overflow-y-auto shrink-0">
          {PALETTE.map((group, gi) => (
            <div key={gi}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border/50">
                {PALETTE_LABELS[gi]}
              </div>
              <div className="p-1.5 grid grid-cols-2 gap-1">
                {group.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => addElement(item.type)}
                    className="flex flex-col items-center gap-1 p-2 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border/80 transition-colors text-center"
                  >
                    {item.icon}
                    <span className="text-[10px] leading-none">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Center: Canvas */}
        <main
          className="flex-1 overflow-y-auto bg-stone-100"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          {elements.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-16">
              <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Empty page</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Click elements in the left panel to add them</p>
            </div>
          ) : (
            <div className="bg-white min-h-full shadow-sm mx-auto" style={{ maxWidth: "900px" }}>
              {elements.map((el, idx) => (
                <div
                  key={el.id}
                  className={cn(
                    "relative group cursor-pointer",
                    selectedId === el.id && "outline outline-2 outline-blue-500 outline-offset-[-2px] z-10"
                  )}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                >
                  {/* Hover/select overlay */}
                  <div className={cn("absolute inset-0 z-10 pointer-events-none", selectedId !== el.id && "group-hover:ring-1 group-hover:ring-blue-300 group-hover:ring-inset")} />

                  {/* Element controls */}
                  <div className={cn("absolute top-1 right-1 z-20 flex gap-0.5", selectedId === el.id ? "flex" : "hidden group-hover:flex")}>
                    <button onClick={(e) => { e.stopPropagation(); moveElement(el.id, "up"); }} disabled={idx === 0} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveElement(el.id, "down"); }} disabled={idx === elements.length - 1} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); duplicateElement(el.id); }} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteElement(el.id); }} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>

                  {/* Element type badge */}
                  {selectedId === el.id && (
                    <div className="absolute top-1 left-1 z-20 px-1.5 py-0.5 text-[10px] font-medium bg-blue-500 text-white rounded-sm">{el.type}</div>
                  )}

                  {/* Rendered element */}
                  <div style={{ padding: ["nav", "hero", "footer", "divider", "spacer"].includes(el.type) ? 0 : "0.75rem" }}>
                    <SiteElementRenderer element={el} products={products} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right: Properties panel */}
        <aside className="w-60 border-l border-border bg-background overflow-hidden shrink-0 flex flex-col">
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              onChange={(k, v) => updateElementProp(selectedElement.id, k, v)}
              products={products}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <p className="text-xs text-muted-foreground">Select an element on the canvas to edit its properties</p>
            </div>
          )}
        </aside>
      </div>

      {/* Theme modal */}
      {showTheme && site && (
        <ThemeModal theme={site.theme} onSave={handleThemeSave} onClose={() => setShowTheme(false)} />
      )}
    </div>
  );
}
