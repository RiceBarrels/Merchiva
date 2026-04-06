"use client";

import { useState, useEffect, useRef, useCallback, use, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, Trash2, Undo2, Redo2, Eye, Globe, Plus,
  Loader2, Type, Image as ImageIcon, Square, Columns2,
  Minus, Minus as Spacer, Code2, Map, Share2, Star,
  Tag, HelpCircle, LayoutGrid, Video, ShoppingBag,
  CalendarCheck, Ticket, LogIn, Monitor, ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSite, getPages, getElements, saveElements, createPage, updateSite } from "@/lib/db/sites";
import { usePermissions } from "@/lib/context/permissions";
import { cn } from "@/lib/utils";
import type { Site, SitePage, SiteElement, ElementType } from "@/lib/types";

// ─── Element categories ───────────────────────────────────────────────────────

type ElementDef = { type: ElementType; label: string; icon: React.ComponentType<{ className?: string }> };

const ELEMENT_CATEGORIES: { label: string; items: ElementDef[] }[] = [
  {
    label: "Layout",
    items: [
      { type: "container", label: "Container", icon: Square },
      { type: "columns", label: "Columns", icon: Columns2 },
      { type: "spacer", label: "Spacer", icon: Spacer },
      { type: "divider", label: "Divider", icon: Minus },
    ],
  },
  {
    label: "Content",
    items: [
      { type: "text", label: "Text", icon: Type },
      { type: "image", label: "Image", icon: ImageIcon },
      { type: "video", label: "Video", icon: Video },
      { type: "button", label: "Button", icon: Monitor },
      { type: "gallery", label: "Gallery", icon: LayoutGrid },
      { type: "hero", label: "Hero", icon: Star },
      { type: "nav", label: "Nav", icon: Monitor },
      { type: "footer", label: "Footer", icon: Minus },
    ],
  },
  {
    label: "Commerce",
    items: [
      { type: "product-card", label: "Product Card", icon: ShoppingBag },
      { type: "booking-form", label: "Booking Form", icon: CalendarCheck },
      { type: "coupon-banner", label: "Coupon Banner", icon: Ticket },
      { type: "pricing-table", label: "Pricing Table", icon: Tag },
    ],
  },
  {
    label: "Advanced",
    items: [
      { type: "testimonial", label: "Testimonial", icon: Star },
      { type: "faq", label: "FAQ", icon: HelpCircle },
      { type: "social-links", label: "Social Links", icon: Share2 },
      { type: "map", label: "Map", icon: Map },
      { type: "login-form", label: "Login Form", icon: LogIn },
      { type: "custom-html", label: "Custom HTML", icon: Code2 },
    ],
  },
];

// ─── Default element factories ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeElement(type: ElementType, pageId: string, sortOrder: number): Omit<SiteElement, "id"> {
  const defaults: Record<ElementType, { props: Record<string, unknown>; styles: Record<string, unknown> }> = {
    text:           { props: { content: "Your text here" }, styles: { fontSize: "16px", color: "#1c1917", padding: "8px 0", lineHeight: "1.6" } },
    image:          { props: { src: "", alt: "" }, styles: { width: "100%", height: "200px", objectFit: "cover" } },
    button:         { props: { label: "Click Me", href: "#", variant: "primary" }, styles: { padding: "10px 20px", display: "inline-block" } },
    container:      { props: {}, styles: { padding: "16px", backgroundColor: "#f5f5f4", minHeight: "80px" } },
    hero:           { props: { title: "Welcome", subtitle: "Your subtitle here", ctaLabel: "Get Started", ctaHref: "#" }, styles: { backgroundColor: "#1c1917", color: "#ffffff", padding: "64px 32px", textAlign: "center" } },
    nav:            { props: { brand: "My Site", links: [{ label: "Home", href: "#" }, { label: "About", href: "#" }] }, styles: { backgroundColor: "#ffffff", padding: "12px 24px", borderBottom: "1px solid #e7e5e4" } },
    footer:         { props: { text: "© 2024 My Business. All rights reserved." }, styles: { backgroundColor: "#1c1917", color: "#a8a29e", padding: "32px 24px", textAlign: "center" } },
    divider:        { props: {}, styles: { margin: "16px 0", borderColor: "#e7e5e4", borderWidth: "1px" } },
    spacer:         { props: {}, styles: { height: "48px" } },
    columns:        { props: { columns: 2, items: ["Column 1 content", "Column 2 content"] }, styles: { gap: "16px", padding: "16px" } },
    video:          { props: { src: "", poster: "", autoplay: false }, styles: { width: "100%", height: "360px" } },
    map:            { props: { address: "1 Apple Park Way, Cupertino, CA", zoom: 14 }, styles: { width: "100%", height: "300px" } },
    "social-links": { props: { links: [{ platform: "Twitter", url: "#" }, { platform: "Instagram", url: "#" }] }, styles: { padding: "16px", textAlign: "center", gap: "12px" } },
    testimonial:    { props: { quote: "This product changed my life!", author: "Happy Customer", role: "Business Owner" }, styles: { padding: "32px", backgroundColor: "#f5f5f4", textAlign: "center" } },
    "pricing-table": { props: { plans: [{ name: "Starter", price: "$9", features: ["Feature 1", "Feature 2"] }] }, styles: { padding: "32px" } },
    faq:            { props: { items: [{ q: "What is this?", a: "This is your answer." }] }, styles: { padding: "24px" } },
    gallery:        { props: { images: [] }, styles: { padding: "16px", gap: "8px" } },
    "product-card": { props: { title: "Product Name", price: "$29.99", description: "Product description", image: "" }, styles: { padding: "16px", border: "1px solid #e7e5e4", borderRadius: "0.3rem" } },
    "booking-form": { props: { title: "Book Appointment", description: "Schedule a time that works for you." }, styles: { padding: "24px", backgroundColor: "#f5f5f4" } },
    "coupon-banner": { props: { code: "SAVE10", message: "Use code SAVE10 for 10% off your order!" }, styles: { backgroundColor: "#1c1917", color: "#ffffff", padding: "12px 24px", textAlign: "center" } },
    "login-form":   { props: { title: "Sign In", buttonLabel: "Continue" }, styles: { padding: "32px", maxWidth: "400px", margin: "0 auto" } },
    "custom-html":  { props: { html: "<p>Custom HTML content here</p>" }, styles: {} },
  };
  return { pageId, parentId: null, type, ...defaults[type], sortOrder };
}

// ─── Element renderer ─────────────────────────────────────────────────────────

function ElementRenderer({
  element,
  selected,
  onSelect,
}: {
  element: SiteElement;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const p = element.props;
  const s = element.styles as CSSProperties & Record<string, unknown>;

  const wrapper = cn(
    "relative cursor-pointer transition-all select-none",
    selected && "ring-2 ring-blue-500 ring-offset-1"
  );

  const click = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(element.id); };

  switch (element.type) {
    case "text":
      return (
        <div className={wrapper} onClick={click} style={{ padding: s.padding as string, margin: s.margin as string }}>
          <p style={{ fontSize: s.fontSize as string, fontWeight: s.fontWeight as string, color: s.color as string, textAlign: s.textAlign as CSSProperties["textAlign"], lineHeight: s.lineHeight as string }}>
            {p.content || "Your text here"}
          </p>
        </div>
      );

    case "image":
      return (
        <div className={cn(wrapper, "overflow-hidden")} onClick={click}
          style={{ width: s.width as string, height: s.height as string, margin: s.margin as string }}>
          {p.src ? (
            <img src={p.src as string} alt={(p.alt as string) || ""} style={{ width: "100%", height: "100%", objectFit: (s.objectFit as CSSProperties["objectFit"]) || "cover" }} />
          ) : (
            <div className="flex items-center justify-center bg-stone-100 border border-dashed border-stone-300 w-full h-full text-stone-400 text-xs gap-1.5">
              <ImageIcon className="h-4 w-4" /> No image set
            </div>
          )}
        </div>
      );

    case "button": {
      const variantClass = p.variant === "outline"
        ? "border border-current bg-transparent"
        : p.variant === "secondary"
        ? "bg-stone-200 text-stone-800"
        : "bg-stone-900 text-white";
      return (
        <div className={cn(wrapper, "p-2")} onClick={click}>
          <span className={cn("rounded inline-block text-sm font-medium cursor-pointer", variantClass)}
            style={{ padding: s.padding as string }}>
            {(p.label as string) || "Button"}
          </span>
        </div>
      );
    }

    case "hero":
      return (
        <div className={wrapper} onClick={click}
          style={{ backgroundColor: s.backgroundColor as string, color: s.color as string, padding: s.padding as string, textAlign: s.textAlign as CSSProperties["textAlign"] }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "700", marginBottom: "1rem" }}>{(p.title as string) || "Hero Title"}</h1>
          <p style={{ fontSize: "1.125rem", marginBottom: "2rem", opacity: 0.8 }}>{(p.subtitle as string) || "Subtitle text"}</p>
          {p.ctaLabel && (
            <span className="rounded inline-block px-6 py-3 font-medium text-sm"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
              {p.ctaLabel as string}
            </span>
          )}
        </div>
      );

    case "nav":
      return (
        <div className={wrapper} onClick={click}
          style={{ backgroundColor: s.backgroundColor as string, padding: s.padding as string, borderBottom: s.borderBottom as string }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: "600", fontSize: "0.875rem" }}>{(p.brand as string) || "Site Name"}</span>
            <div style={{ display: "flex", gap: "16px" }}>
              {((p.links as { label: string }[]) || []).map((link, i) => (
                <span key={i} style={{ fontSize: "0.8125rem", color: "#44403c" }}>{link.label}</span>
              ))}
            </div>
          </div>
        </div>
      );

    case "footer":
      return (
        <div className={wrapper} onClick={click}
          style={{ backgroundColor: s.backgroundColor as string, color: s.color as string, padding: s.padding as string, textAlign: s.textAlign as CSSProperties["textAlign"] }}>
          <p style={{ fontSize: "0.8125rem" }}>{(p.text as string) || "Footer text"}</p>
        </div>
      );

    case "divider":
      return (
        <div className={wrapper} onClick={click} style={{ margin: s.margin as string }}>
          <hr style={{ borderColor: s.borderColor as string, borderWidth: s.borderWidth as string }} />
        </div>
      );

    case "spacer":
      return (
        <div className={cn(wrapper, "flex items-center justify-center text-stone-300 text-[10px] border border-dashed border-stone-200")}
          onClick={click} style={{ height: s.height as string }}>
          {selected && "spacer"}
        </div>
      );

    case "columns":
      return (
        <div className={wrapper} onClick={click}
          style={{ display: "grid", gridTemplateColumns: `repeat(${p.columns || 2}, 1fr)`, gap: s.gap as string, padding: s.padding as string }}>
          {((p.items as string[]) || ["Column 1", "Column 2"]).map((item, i) => (
            <div key={i} className="rounded border border-dashed border-stone-200 p-3 text-sm text-stone-500 min-h-[60px]">
              {item}
            </div>
          ))}
        </div>
      );

    case "testimonial":
      return (
        <div className={wrapper} onClick={click}
          style={{ padding: s.padding as string, backgroundColor: s.backgroundColor as string, textAlign: s.textAlign as CSSProperties["textAlign"] }}>
          <p style={{ fontSize: "1rem", fontStyle: "italic", marginBottom: "12px" }}>&ldquo;{(p.quote as string) || "Quote"}&rdquo;</p>
          <p style={{ fontSize: "0.875rem", fontWeight: "600" }}>{(p.author as string) || "Author"}</p>
          {p.role && <p style={{ fontSize: "0.75rem", color: "#78716c" }}>{p.role as string}</p>}
        </div>
      );

    case "coupon-banner":
      return (
        <div className={wrapper} onClick={click}
          style={{ backgroundColor: s.backgroundColor as string, color: s.color as string, padding: s.padding as string, textAlign: s.textAlign as CSSProperties["textAlign"] }}>
          <span style={{ fontSize: "0.875rem" }}>{(p.message as string) || "Coupon message"}</span>
          {p.code && (
            <span style={{ marginLeft: "12px", padding: "2px 8px", border: "1px dashed currentColor", borderRadius: "0.25rem", fontFamily: "monospace", fontSize: "0.875rem", fontWeight: "700" }}>
              {p.code as string}
            </span>
          )}
        </div>
      );

    case "product-card":
      return (
        <div className={wrapper} onClick={click}
          style={{ padding: s.padding as string, border: s.border as string, borderRadius: s.borderRadius as string }}>
          <div className="bg-stone-100 w-full h-32 rounded mb-2 flex items-center justify-center text-stone-400">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <p style={{ fontWeight: "600", fontSize: "0.875rem", marginBottom: "4px" }}>{(p.title as string) || "Product"}</p>
          <p style={{ fontSize: "0.75rem", color: "#78716c", marginBottom: "8px" }}>{(p.description as string) || ""}</p>
          <p style={{ fontWeight: "700", fontSize: "1rem" }}>{(p.price as string) || "$0.00"}</p>
        </div>
      );

    case "faq":
      return (
        <div className={wrapper} onClick={click} style={{ padding: s.padding as string }}>
          {((p.items as { q: string; a: string }[]) || []).map((item, i) => (
            <div key={i} className="border-b border-stone-200 py-3">
              <p style={{ fontWeight: "600", fontSize: "0.875rem", marginBottom: "4px" }}>{item.q}</p>
              <p style={{ fontSize: "0.8125rem", color: "#78716c" }}>{item.a}</p>
            </div>
          ))}
          {!p.items?.length && <p className="text-stone-400 text-sm">No FAQ items yet</p>}
        </div>
      );

    default:
      return (
        <div className={cn(wrapper, "rounded border border-dashed border-stone-300 bg-stone-50 p-4 flex items-center gap-2")}
          onClick={click}>
          <Code2 className="h-4 w-4 text-stone-400" />
          <span className="text-xs text-stone-500">{element.type}</span>
        </div>
      );
  }
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <label className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function PropInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
    />
  );
}

function PropSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-foreground/20"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function PropertiesPanel({
  element,
  onUpdateProps,
  onUpdateStyles,
  onDelete,
}: {
  element: SiteElement | null;
  onUpdateProps: (id: string, props: Record<string, unknown>) => void;
  onUpdateStyles: (id: string, styles: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  if (!element) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Monitor className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-xs text-muted-foreground">Select an element to edit its properties</p>
      </div>
    );
  }

  const p = element.props;
  const s = element.styles;

  const up = (key: string, val: unknown) => onUpdateProps(element.id, { ...p, [key]: val });
  const us = (key: string, val: unknown) => onUpdateStyles(element.id, { ...s, [key]: val });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium capitalize">{element.type.replace(/-/g, " ")}</span>
        <button
          onClick={() => onDelete(element.id)}
          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
          title="Delete element"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 space-y-4 text-sm">
        {/* Content section — type-specific */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Content</p>

          {element.type === "text" && (
            <>
              <div className="py-1">
                <label className="text-[11px] text-muted-foreground block mb-1">Text</label>
                <textarea
                  value={(p.content as string) || ""}
                  onChange={e => up("content", e.target.value)}
                  rows={3}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-foreground/20 resize-none"
                />
              </div>
            </>
          )}

          {element.type === "image" && (
            <>
              <PropRow label="Image URL">
                <PropInput value={(p.src as string) || ""} onChange={v => up("src", v)} placeholder="https://..." />
              </PropRow>
              <PropRow label="Alt text">
                <PropInput value={(p.alt as string) || ""} onChange={v => up("alt", v)} placeholder="Description" />
              </PropRow>
              <PropRow label="Fit">
                <PropSelect value={(s.objectFit as string) || "cover"} onChange={v => us("objectFit", v)}
                  options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "fill", label: "Fill" }, { value: "none", label: "None" }]} />
              </PropRow>
            </>
          )}

          {element.type === "button" && (
            <>
              <PropRow label="Label">
                <PropInput value={(p.label as string) || ""} onChange={v => up("label", v)} placeholder="Button text" />
              </PropRow>
              <PropRow label="Link">
                <PropInput value={(p.href as string) || ""} onChange={v => up("href", v)} placeholder="#" />
              </PropRow>
              <PropRow label="Style">
                <PropSelect value={(p.variant as string) || "primary"} onChange={v => up("variant", v)}
                  options={[{ value: "primary", label: "Primary" }, { value: "secondary", label: "Secondary" }, { value: "outline", label: "Outline" }]} />
              </PropRow>
            </>
          )}

          {element.type === "hero" && (
            <>
              <PropRow label="Title"><PropInput value={(p.title as string) || ""} onChange={v => up("title", v)} /></PropRow>
              <PropRow label="Subtitle"><PropInput value={(p.subtitle as string) || ""} onChange={v => up("subtitle", v)} /></PropRow>
              <PropRow label="CTA Label"><PropInput value={(p.ctaLabel as string) || ""} onChange={v => up("ctaLabel", v)} placeholder="Get Started" /></PropRow>
              <PropRow label="CTA Link"><PropInput value={(p.ctaHref as string) || ""} onChange={v => up("ctaHref", v)} placeholder="#" /></PropRow>
            </>
          )}

          {element.type === "nav" && (
            <PropRow label="Brand"><PropInput value={(p.brand as string) || ""} onChange={v => up("brand", v)} placeholder="Site Name" /></PropRow>
          )}

          {element.type === "footer" && (
            <PropRow label="Text"><PropInput value={(p.text as string) || ""} onChange={v => up("text", v)} placeholder="Footer text" /></PropRow>
          )}

          {element.type === "testimonial" && (
            <>
              <PropRow label="Quote">
                <textarea value={(p.quote as string) || ""} onChange={e => up("quote", e.target.value)} rows={2}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-foreground/20 resize-none" />
              </PropRow>
              <PropRow label="Author"><PropInput value={(p.author as string) || ""} onChange={v => up("author", v)} /></PropRow>
              <PropRow label="Role"><PropInput value={(p.role as string) || ""} onChange={v => up("role", v)} placeholder="CEO, Company" /></PropRow>
            </>
          )}

          {element.type === "coupon-banner" && (
            <>
              <PropRow label="Message"><PropInput value={(p.message as string) || ""} onChange={v => up("message", v)} /></PropRow>
              <PropRow label="Code"><PropInput value={(p.code as string) || ""} onChange={v => up("code", v)} placeholder="SAVE10" /></PropRow>
            </>
          )}

          {element.type === "product-card" && (
            <>
              <PropRow label="Title"><PropInput value={(p.title as string) || ""} onChange={v => up("title", v)} /></PropRow>
              <PropRow label="Price"><PropInput value={(p.price as string) || ""} onChange={v => up("price", v)} placeholder="$0.00" /></PropRow>
              <PropRow label="Description"><PropInput value={(p.description as string) || ""} onChange={v => up("description", v)} /></PropRow>
              <PropRow label="Image URL"><PropInput value={(p.image as string) || ""} onChange={v => up("image", v)} placeholder="https://..." /></PropRow>
            </>
          )}

          {element.type === "custom-html" && (
            <div className="py-1">
              <label className="text-[11px] text-muted-foreground block mb-1">HTML</label>
              <textarea value={(p.html as string) || ""} onChange={e => up("html", e.target.value)} rows={5}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-foreground/20 resize-none" />
            </div>
          )}

          {element.type === "spacer" && (
            <PropRow label="Height"><PropInput value={(s.height as string) || ""} onChange={v => us("height", v)} placeholder="48px" /></PropRow>
          )}

          {element.type === "columns" && (
            <PropRow label="Columns">
              <PropSelect value={String(p.columns || 2)} onChange={v => up("columns", Number(v))}
                options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }]} />
            </PropRow>
          )}
        </div>

        {/* Typography */}
        {["text", "hero", "footer", "testimonial", "coupon-banner"].includes(element.type) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Typography</p>
            <PropRow label="Font Size"><PropInput value={(s.fontSize as string) || ""} onChange={v => us("fontSize", v)} placeholder="16px" /></PropRow>
            <PropRow label="Font Weight">
              <PropSelect value={(s.fontWeight as string) || "400"} onChange={v => us("fontWeight", v)}
                options={[{ value: "300", label: "Light" }, { value: "400", label: "Normal" }, { value: "500", label: "Medium" }, { value: "600", label: "Semibold" }, { value: "700", label: "Bold" }]} />
            </PropRow>
            <PropRow label="Color"><PropInput value={(s.color as string) || ""} onChange={v => us("color", v)} placeholder="#1c1917" type="color" /></PropRow>
            <PropRow label="Align">
              <PropSelect value={(s.textAlign as string) || "left"} onChange={v => us("textAlign", v)}
                options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
            </PropRow>
          </div>
        )}

        {/* Spacing */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Spacing</p>
          <PropRow label="Padding"><PropInput value={(s.padding as string) || ""} onChange={v => us("padding", v)} placeholder="16px" /></PropRow>
          <PropRow label="Margin"><PropInput value={(s.margin as string) || ""} onChange={v => us("margin", v)} placeholder="0" /></PropRow>
        </div>

        {/* Size */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Size</p>
          <PropRow label="Width"><PropInput value={(s.width as string) || ""} onChange={v => us("width", v)} placeholder="100%" /></PropRow>
          <PropRow label="Height"><PropInput value={(s.height as string) || ""} onChange={v => us("height", v)} placeholder="auto" /></PropRow>
        </div>

        {/* Appearance */}
        {element.type !== "divider" && element.type !== "spacer" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Appearance</p>
            <PropRow label="Background">
              <PropInput value={(s.backgroundColor as string) || ""} onChange={v => us("backgroundColor", v)} placeholder="#ffffff" type="color" />
            </PropRow>
            <PropRow label="Border R."><PropInput value={(s.borderRadius as string) || ""} onChange={v => us("borderRadius", v)} placeholder="0.3rem" /></PropRow>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function EditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const router = useRouter();
  const { currentOrg } = usePermissions();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [elements, setElements] = useState<SiteElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Drag state
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragSourceRef = useRef<{ kind: "panel"; type: ElementType } | { kind: "canvas"; id: string } | null>(null);

  // History
  const historyRef = useRef<SiteElement[][]>([[]]);
  const historyIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Debounce timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageIdRef = useRef<string | null>(null);
  currentPageIdRef.current = currentPageId;

  // ─── Load ───

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    (async () => {
      try {
        const s = await getSite(siteId);
        if (cancelled || !s) return;
        setSite(s);

        let pgs = await getPages(siteId);
        if (cancelled) return;

        if (pgs.length === 0) {
          // Create default home page
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const newPage = await createPage(siteId, "Home", "/", 0, true);
            pgs = [newPage];
          }
        }

        setPages(pgs);
        const firstPage = pgs[0];
        setCurrentPageId(firstPage.id);

        const els = await getElements(firstPage.id);
        if (cancelled) return;
        setElements(els);
        historyRef.current = [els];
        historyIdxRef.current = 0;
      } catch (err) {
        console.error("Failed to load editor:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [siteId]);

  // Load elements when page changes
  useEffect(() => {
    if (!currentPageId) return;
    getElements(currentPageId)
      .then(els => {
        setElements(els);
        setSelectedId(null);
        historyRef.current = [els];
        historyIdxRef.current = 0;
        setCanUndo(false);
        setCanRedo(false);
      })
      .catch(console.error);
  }, [currentPageId]);

  // ─── Debounced save ───

  const scheduleSave = useCallback((els: SiteElement[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pageId = currentPageIdRef.current;
      if (!pageId) return;
      setSaving(true);
      try {
        await saveElements(pageId, els);
        setLastSaved(new Date());
      } catch (err) {
        console.error("Save failed:", err);
      } finally {
        setSaving(false);
      }
    }, 1000);
  }, []);

  // ─── History ───

  const pushHistory = useCallback((els: SiteElement[]) => {
    const newHistory = historyRef.current.slice(0, historyIdxRef.current + 1);
    newHistory.push(els);
    if (newHistory.length > 50) newHistory.shift();
    historyRef.current = newHistory;
    historyIdxRef.current = newHistory.length - 1;
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  }, []);

  const applyElements = useCallback((els: SiteElement[]) => {
    setElements(els);
    scheduleSave(els);
  }, [scheduleSave]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const els = historyRef.current[historyIdxRef.current];
    setElements(els);
    scheduleSave(els);
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const els = historyRef.current[historyIdxRef.current];
    setElements(els);
    scheduleSave(els);
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }, [scheduleSave]);

  // ─── Element operations ───

  const addElement = useCallback((type: ElementType, atIndex: number) => {
    const id = crypto.randomUUID();
    const pageId = currentPageIdRef.current;
    if (!pageId) return;
    const newEl: SiteElement = { id, ...makeElement(type, pageId, atIndex) };
    setElements(prev => {
      const next = [...prev];
      next.splice(atIndex, 0, newEl);
      const reindexed = next.map((el, i) => ({ ...el, sortOrder: i }));
      pushHistory(reindexed);
      scheduleSave(reindexed);
      return reindexed;
    });
    setSelectedId(id);
  }, [pushHistory, scheduleSave]);

  const updateElementProps = useCallback((id: string, props: Record<string, unknown>) => {
    setElements(prev => {
      const next = prev.map(el => el.id === id ? { ...el, props } : el);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const updateElementStyles = useCallback((id: string, styles: Record<string, unknown>) => {
    setElements(prev => {
      const next = prev.map(el => el.id === id ? { ...el, styles } : el);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const deleteElement = useCallback((id: string) => {
    setElements(prev => {
      const next = prev.filter(el => el.id !== id).map((el, i) => ({ ...el, sortOrder: i }));
      pushHistory(next);
      scheduleSave(next);
      return next;
    });
    setSelectedId(null);
  }, [pushHistory, scheduleSave]);

  const reorderElement = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setElements(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
      next.splice(insertAt, 0, moved);
      const reindexed = next.map((el, i) => ({ ...el, sortOrder: i }));
      pushHistory(reindexed);
      scheduleSave(reindexed);
      return reindexed;
    });
  }, [pushHistory, scheduleSave]);

  // ─── Keyboard shortcuts ───

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !isInput) {
        e.preventDefault();
        deleteElement(selectedId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement, undo, redo]);

  // ─── Drag handlers ───

  const handlePanelDragStart = (type: ElementType) => {
    dragSourceRef.current = { kind: "panel", type };
    setDragging(true);
  };

  const handleCanvasDragStart = (id: string) => {
    dragSourceRef.current = { kind: "canvas", id };
    setDragging(true);
  };

  const handleDragEnd = () => {
    dragSourceRef.current = null;
    setDragging(false);
    setDropIdx(null);
  };

  const handleDropZoneOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDropIdx(idx);
  };

  const handleDropZoneDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const src = dragSourceRef.current;
    if (!src) return;
    if (src.kind === "panel") {
      addElement(src.type, idx);
    } else if (src.kind === "canvas") {
      const fromIndex = elements.findIndex(el => el.id === src.id);
      if (fromIndex !== -1) reorderElement(fromIndex, idx);
    }
    setDropIdx(null);
    setDragging(false);
    dragSourceRef.current = null;
  };

  // ─── Publish ───

  const handlePublish = async () => {
    if (!site) return;
    setPublishing(true);
    try {
      await updateSite(site.id, { published: !site.published });
      setSite(prev => prev ? { ...prev, published: !prev.published } : prev);
    } catch (err) {
      console.error("Publish failed:", err);
    } finally {
      setPublishing(false);
    }
  };

  // ─── Selected element ───

  const selectedElement = elements.find(el => el.id === selectedId) ?? null;

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Site not found</p>
        <button onClick={() => router.push("/builder")} className="text-xs underline">Back to sites</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone-100" onClick={() => setSelectedId(null)}>
      {/* ── Toolbar ── */}
      <div className="flex h-11 items-center gap-2 border-b border-border bg-card px-3 shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={() => router.push("/builder")} className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-medium truncate max-w-[160px]">{site.name}</span>

        {pages.length > 0 && (
          <div className="relative">
            <select
              value={currentPageId ?? ""}
              onChange={e => setCurrentPageId(e.target.value)}
              className="h-7 rounded border border-border bg-background pl-2 pr-6 text-xs outline-none focus:ring-1 focus:ring-foreground/20 appearance-none cursor-pointer"
            >
              {pages.map(pg => (
                <option key={pg.id} value={pg.id}>{pg.title}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          </div>
        )}

        <button
          onClick={async () => {
            if (!currentPageId) return;
            const title = prompt("Page title:");
            if (!title) return;
            const slug = "/" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const pg = await createPage(siteId, title, slug, pages.length, false);
            setPages(prev => [...prev, pg]);
            setCurrentPageId(pg.id);
          }}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
          title="Add page"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        <button
          onClick={() => window.open(`/preview/${site.slug}`, "_blank")}
          className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>

        <button
          onClick={handlePublish}
          disabled={publishing}
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
            site.published
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-foreground text-background hover:bg-foreground/90"
          )}
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          {site.published ? "Published" : "Publish"}
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Left panel ── */}
        <div className="w-48 shrink-0 border-r border-border bg-card overflow-y-auto">
          {ELEMENT_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.label}
              </p>
              {cat.items.map(item => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={() => handlePanelDragStart(item.type)}
                  onDragEnd={handleDragEnd}
                  className="mx-2 mb-0.5 flex cursor-grab active:cursor-grabbing items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors select-none"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </div>
              ))}
            </div>
          ))}
          <div className="h-4" />
        </div>

        {/* ── Canvas ── */}
        <div
          className="flex-1 overflow-y-auto p-6"
          onDragLeave={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIdx(null);
          }}
        >
          <div
            className="mx-auto bg-white shadow-md"
            style={{ maxWidth: "860px", minHeight: "600px" }}
            onClick={() => setSelectedId(null)}
          >
            {/* Drop zone before first element */}
            <DropZone
              idx={0}
              active={dropIdx === 0 && dragging}
              onDragOver={e => handleDropZoneOver(e, 0)}
              onDrop={e => handleDropZoneDrop(e, 0)}
            />

            {elements.map((el, i) => (
              <div key={el.id}>
                <div
                  draggable
                  onDragStart={() => handleCanvasDragStart(el.id)}
                  onDragEnd={handleDragEnd}
                  className="relative group"
                >
                  {/* Drag handle */}
                  {selectedId === el.id && (
                    <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-40 z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                      <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                      <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                    </div>
                  )}
                  <ElementRenderer
                    element={el}
                    selected={selectedId === el.id}
                    onSelect={id => { setSelectedId(id); }}
                  />
                </div>

                {/* Drop zone after this element */}
                <DropZone
                  idx={i + 1}
                  active={dropIdx === i + 1 && dragging}
                  onDragOver={e => handleDropZoneOver(e, i + 1)}
                  onDrop={e => handleDropZoneDrop(e, i + 1)}
                />
              </div>
            ))}

            {elements.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-stone-300">
                <Monitor className="h-10 w-10 mb-3" />
                <p className="text-sm">Drag elements here to build your page</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="w-72 shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
          <PropertiesPanel
            element={selectedElement}
            onUpdateProps={updateElementProps}
            onUpdateStyles={updateElementStyles}
            onDelete={deleteElement}
          />
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex h-7 items-center gap-3 border-t border-border bg-card px-3 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-[11px] text-muted-foreground">
          {saving ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
          ) : lastSaved ? (
            `Saved ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          ) : (
            "No changes"
          )}
        </span>
        <div className="flex-1" />
        <button onClick={undo} disabled={!canUndo}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground transition-colors"
          title="Undo (⌘Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={redo} disabled={!canRedo}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground transition-colors"
          title="Redo (⌘Y)">
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] text-muted-foreground">
          {elements.length} element{elements.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ idx, active, onDragOver, onDrop }: {
  idx: number;
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "transition-all",
        active
          ? "h-8 bg-blue-50 border-2 border-dashed border-blue-400 rounded mx-2 my-1 flex items-center justify-center"
          : "h-1"
      )}
    >
      {active && <span className="text-[10px] text-blue-400 font-medium">Drop here</span>}
    </div>
  );
}
