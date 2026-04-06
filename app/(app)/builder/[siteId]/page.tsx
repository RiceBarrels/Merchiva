"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ChevronDown, Loader2, Eye, Globe, Palette,
  Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Sparkles,
  Type, Image, MousePointer, LayoutTemplate, Minus, AlignJustify,
  Star, HelpCircle, ShoppingBag, CalendarDays, Tag, LogIn, DollarSign,
  MessageSquare, Code, Film, Grid, Columns, Square, FileText,
} from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import {
  getSite, getPages, getElements, createPage, deletePage,
  savePageElements, updateSite, publishSite,
} from "@/lib/db/sites";
import { getDefaultProps } from "@/components/site-renderer";
import { SiteRenderer } from "@/components/site-renderer";
import type { Site, SitePage, SiteElement, ElementType, SiteTheme } from "@/lib/types";

// ─── Element palette definition ───────────────────────────────────────────────

type ElementDef = { type: ElementType; label: string; icon: React.ComponentType<{ className?: string }> };
type ElementCategory = { category: string; items: ElementDef[] };

const ELEMENT_PALETTE: ElementCategory[] = [
  {
    category: "Layout",
    items: [
      { type: "container",  label: "Container",  icon: Square },
      { type: "spacer",     label: "Spacer",     icon: Minus },
      { type: "divider",    label: "Divider",    icon: AlignJustify },
      { type: "columns",    label: "Columns",    icon: Columns },
    ],
  },
  {
    category: "Content",
    items: [
      { type: "text",    label: "Text",    icon: Type },
      { type: "image",   label: "Image",   icon: Image },
      { type: "button",  label: "Button",  icon: MousePointer },
      { type: "video",   label: "Video",   icon: Film },
      { type: "gallery", label: "Gallery", icon: Grid },
    ],
  },
  {
    category: "Sections",
    items: [
      { type: "hero",   label: "Hero",   icon: LayoutTemplate },
      { type: "nav",    label: "Nav Bar", icon: AlignJustify },
      { type: "footer", label: "Footer", icon: FileText },
    ],
  },
  {
    category: "Commerce",
    items: [
      { type: "product-card",   label: "Product Card",   icon: ShoppingBag },
      { type: "pricing-table",  label: "Pricing Table",  icon: DollarSign },
      { type: "booking-form",   label: "Booking Form",   icon: CalendarDays },
      { type: "coupon-banner",  label: "Coupon Banner",  icon: Tag },
    ],
  },
  {
    category: "Social",
    items: [
      { type: "testimonial", label: "Testimonial", icon: Star },
      { type: "faq",         label: "FAQ",         icon: HelpCircle },
    ],
  },
  {
    category: "Advanced",
    items: [
      { type: "login-form",  label: "Login Form",  icon: LogIn },
      { type: "custom-html", label: "Custom HTML", icon: Code },
    ],
  },
];

// ─── AI Content helper suggestions ────────────────────────────────────────────

function getAISuggestion(type: string, businessName: string): Record<string, unknown> {
  const name = businessName || "Our Business";
  const suggestions: Record<string, Record<string, unknown>> = {
    headline: { tag: "h1", content: `Welcome to ${name}` },
    description: { tag: "p", content: `${name} offers premium quality products and services tailored to your needs. We're committed to excellence in everything we do.` },
    hero_title: { title: `Experience the Best at ${name}`, subtitle: "Serving our community with passion, quality, and care." },
    cta: { label: "Get Started Today", variant: "primary" },
  };
  if (type === "text") return suggestions.description;
  if (type === "hero") return suggestions.hero_title;
  if (type === "button") return suggestions.cta;
  return {};
}

// ─── Props Panel ──────────────────────────────────────────────────────────────

function PropsPanel({
  element,
  theme,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onAI,
}: {
  element: SiteElement;
  theme: SiteTheme;
  onChange: (props: Record<string, unknown>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onAI: () => void;
}) {
  const p = element.props;

  const set = (key: string, value: unknown) => onChange({ ...p, [key]: value });

  const inputClass = "w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-foreground";
  const labelClass = "block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";
  const fieldClass = "mb-3";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{element.type}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors" title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {(element.type === "text" || element.type === "hero" || element.type === "button") && (
            <button onClick={onAI} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="AI suggestions">
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onDelete} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive" title="Delete element">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* TEXT */}
        {element.type === "text" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Tag</label>
              <select value={(p.tag as string) || "p"} onChange={(e) => set("tag", e.target.value)} className={inputClass}>
                <option value="p">Paragraph</option>
                <option value="h1">H1</option>
                <option value="h2">H2</option>
                <option value="h3">H3</option>
                <option value="h4">H4</option>
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Content</label>
              <textarea value={(p.content as string) || ""} onChange={(e) => set("content", e.target.value)} className={inputClass + " h-20 resize-none"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Align</label>
              <select value={(p.align as string) || "left"} onChange={(e) => set("align", e.target.value)} className={inputClass}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Font Size</label>
              <input type="text" value={(p.fontSize as string) || "1rem"} onChange={(e) => set("fontSize", e.target.value)} className={inputClass} placeholder="1rem" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Color</label>
              <input type="color" value={(p.color as string) || theme.textColor} onChange={(e) => set("color", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
          </>
        )}

        {/* IMAGE */}
        {element.type === "image" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Image URL</label>
              <input type="url" value={(p.src as string) || ""} onChange={(e) => set("src", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Alt Text</label>
              <input type="text" value={(p.alt as string) || ""} onChange={(e) => set("alt", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Width</label>
              <input type="text" value={(p.width as string) || "100%"} onChange={(e) => set("width", e.target.value)} className={inputClass} placeholder="100%" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Height</label>
              <input type="text" value={(p.height as string) || "300px"} onChange={(e) => set("height", e.target.value)} className={inputClass} placeholder="300px" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Object Fit</label>
              <select value={(p.objectFit as string) || "cover"} onChange={(e) => set("objectFit", e.target.value)} className={inputClass}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Fill</option>
              </select>
            </div>
          </>
        )}

        {/* BUTTON */}
        {element.type === "button" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Label</label>
              <input type="text" value={(p.label as string) || ""} onChange={(e) => set("label", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Link</label>
              <input type="text" value={(p.href as string) || "#"} onChange={(e) => set("href", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Variant</label>
              <select value={(p.variant as string) || "primary"} onChange={(e) => set("variant", e.target.value)} className={inputClass}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="accent">Accent</option>
                <option value="outline">Outline</option>
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Align</label>
              <select value={(p.align as string) || "center"} onChange={(e) => set("align", e.target.value)} className={inputClass}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </>
        )}

        {/* HERO */}
        {element.type === "hero" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Subtitle</label>
              <textarea value={(p.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} className={inputClass + " h-16 resize-none"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>CTA Label</label>
              <input type="text" value={(p.ctaLabel as string) || ""} onChange={(e) => set("ctaLabel", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>CTA Link</label>
              <input type="text" value={(p.ctaHref as string) || "#"} onChange={(e) => set("ctaHref", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Secondary CTA</label>
              <input type="text" value={(p.ctaSecondaryLabel as string) || ""} onChange={(e) => set("ctaSecondaryLabel", e.target.value)} className={inputClass} placeholder="Optional" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Align</label>
              <select value={(p.align as string) || "center"} onChange={(e) => set("align", e.target.value)} className={inputClass}>
                <option value="center">Center</option>
                <option value="left">Left</option>
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || "#111827"} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Image URL</label>
              <input type="url" value={(p.bgImage as string) || ""} onChange={(e) => set("bgImage", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Text Color</label>
              <input type="color" value={(p.textColor as string) || "#ffffff"} onChange={(e) => set("textColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Min Height</label>
              <input type="text" value={(p.minHeight as string) || "500px"} onChange={(e) => set("minHeight", e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* NAV */}
        {element.type === "nav" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Logo Text</label>
              <input type="text" value={(p.logo as string) || ""} onChange={(e) => set("logo", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || "#ffffff"} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Text Color</label>
              <input type="color" value={(p.textColor as string) || theme.textColor} onChange={(e) => set("textColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Sticky</label>
              <input type="checkbox" checked={p.sticky as boolean} onChange={(e) => set("sticky", e.target.checked)} className="h-4 w-4" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Links</label>
              {((p.links as { label: string; href: string }[]) || []).map((link, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => {
                      const links = [...((p.links as { label: string; href: string }[]) || [])];
                      links[i] = { ...links[i], label: e.target.value };
                      set("links", links);
                    }}
                    placeholder="Label"
                    className={inputClass + " flex-1"}
                  />
                  <input
                    type="text"
                    value={link.href}
                    onChange={(e) => {
                      const links = [...((p.links as { label: string; href: string }[]) || [])];
                      links[i] = { ...links[i], href: e.target.value };
                      set("links", links);
                    }}
                    placeholder="URL"
                    className={inputClass + " flex-1"}
                  />
                  <button
                    onClick={() => {
                      const links = [...((p.links as { label: string; href: string }[]) || [])];
                      links.splice(i, 1);
                      set("links", links);
                    }}
                    className="px-1 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => set("links", [...((p.links as { label: string; href: string }[]) || []), { label: "Link", href: "#" }])}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-1"
              >
                <Plus className="h-3 w-3" /> Add link
              </button>
            </div>
          </>
        )}

        {/* FOOTER */}
        {element.type === "footer" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Copyright Text</label>
              <input type="text" value={(p.text as string) || ""} onChange={(e) => set("text", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || "#111827"} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Text Color</label>
              <input type="color" value={(p.textColor as string) || "#9ca3af"} onChange={(e) => set("textColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
          </>
        )}

        {/* SPACER */}
        {element.type === "spacer" && (
          <div className={fieldClass}>
            <label className={labelClass}>Height</label>
            <input type="text" value={(p.height as string) || "3rem"} onChange={(e) => set("height", e.target.value)} className={inputClass} placeholder="3rem" />
          </div>
        )}

        {/* DIVIDER */}
        {element.type === "divider" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Color</label>
              <input type="color" value={(p.color as string) || "#e5e7eb"} onChange={(e) => set("color", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Thickness</label>
              <input type="text" value={(p.thickness as string) || "1px"} onChange={(e) => set("thickness", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Style</label>
              <select value={(p.style as string) || "solid"} onChange={(e) => set("style", e.target.value)} className={inputClass}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
          </>
        )}

        {/* COUPON BANNER */}
        {element.type === "coupon-banner" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Promo Code</label>
              <input type="text" value={(p.code as string) || ""} onChange={(e) => set("code", e.target.value)} className={inputClass + " font-mono uppercase"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Description</label>
              <textarea value={(p.description as string) || ""} onChange={(e) => set("description", e.target.value)} className={inputClass + " h-16 resize-none"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || theme.accentColor} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
          </>
        )}

        {/* BOOKING FORM */}
        {element.type === "booking-form" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Subtitle</label>
              <input type="text" value={(p.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || "#f9fafb"} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
          </>
        )}

        {/* PRODUCT CARD */}
        {element.type === "product-card" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Price</label>
              <input type="text" value={(p.price as string) || ""} onChange={(e) => set("price", e.target.value)} className={inputClass} placeholder="$0.00" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Description</label>
              <textarea value={(p.description as string) || ""} onChange={(e) => set("description", e.target.value)} className={inputClass + " h-16 resize-none"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Image URL</label>
              <input type="url" value={(p.image as string) || ""} onChange={(e) => set("image", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>CTA Label</label>
              <input type="text" value={(p.ctaLabel as string) || "Order Now"} onChange={(e) => set("ctaLabel", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>CTA Link</label>
              <input type="text" value={(p.ctaHref as string) || "#"} onChange={(e) => set("ctaHref", e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* TESTIMONIAL */}
        {element.type === "testimonial" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Content</label>
              <textarea value={(p.content as string) || ""} onChange={(e) => set("content", e.target.value)} className={inputClass + " h-20 resize-none"} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Author Name</label>
              <input type="text" value={(p.author as string) || ""} onChange={(e) => set("author", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Author Role</label>
              <input type="text" value={(p.role as string) || ""} onChange={(e) => set("role", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Rating (1–5)</label>
              <input type="number" min={1} max={5} value={Number(p.rating) || 5} onChange={(e) => set("rating", Number(e.target.value))} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Avatar URL</label>
              <input type="url" value={(p.avatar as string) || ""} onChange={(e) => set("avatar", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
          </>
        )}

        {/* FAQ */}
        {element.type === "faq" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Section Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Items</label>
              {((p.items as { question: string; answer: string }[]) || []).map((item, i) => (
                <div key={i} className="border border-border rounded p-2 mb-2">
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => {
                      const items = [...((p.items as { question: string; answer: string }[]) || [])];
                      items[i] = { ...items[i], question: e.target.value };
                      set("items", items);
                    }}
                    placeholder="Question"
                    className={inputClass + " mb-1"}
                  />
                  <textarea
                    value={item.answer}
                    onChange={(e) => {
                      const items = [...((p.items as { question: string; answer: string }[]) || [])];
                      items[i] = { ...items[i], answer: e.target.value };
                      set("items", items);
                    }}
                    placeholder="Answer"
                    className={inputClass + " h-14 resize-none"}
                  />
                  <button
                    onClick={() => {
                      const items = [...((p.items as { question: string; answer: string }[]) || [])];
                      items.splice(i, 1);
                      set("items", items);
                    }}
                    className="text-[10px] text-destructive mt-1"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() => set("items", [...((p.items as { question: string; answer: string }[]) || []), { question: "New question?", answer: "Answer here." }])}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
          </>
        )}

        {/* CUSTOM HTML */}
        {element.type === "custom-html" && (
          <div className={fieldClass}>
            <label className={labelClass}>HTML</label>
            <textarea value={(p.html as string) || ""} onChange={(e) => set("html", e.target.value)} className={inputClass + " h-48 resize-none font-mono"} />
          </div>
        )}

        {/* VIDEO */}
        {element.type === "video" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Video URL</label>
              <input type="url" value={(p.url as string) || ""} onChange={(e) => set("url", e.target.value)} className={inputClass} placeholder="YouTube or Vimeo URL" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* GALLERY */}
        {element.type === "gallery" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Columns</label>
              <input type="number" min={1} max={6} value={Number(p.columns) || 3} onChange={(e) => set("columns", Number(e.target.value))} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Images</label>
              {((p.images as { src: string; alt: string }[]) || []).map((img, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input
                    type="url"
                    value={img.src}
                    onChange={(e) => {
                      const imgs = [...((p.images as { src: string; alt: string }[]) || [])];
                      imgs[i] = { ...imgs[i], src: e.target.value };
                      set("images", imgs);
                    }}
                    placeholder="Image URL"
                    className={inputClass + " flex-1"}
                  />
                  <button
                    onClick={() => {
                      const imgs = [...((p.images as { src: string; alt: string }[]) || [])];
                      imgs.splice(i, 1);
                      set("images", imgs);
                    }}
                    className="px-1 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => set("images", [...((p.images as { src: string; alt: string }[]) || []), { src: "", alt: "" }])}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-1"
              >
                <Plus className="h-3 w-3" /> Add image
              </button>
            </div>
          </>
        )}

        {/* LOGIN FORM */}
        {element.type === "login-form" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Title</label>
              <input type="text" value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Subtitle</label>
              <input type="text" value={(p.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Redirect URL</label>
              <input type="text" value={(p.redirectUrl as string) || "/"} onChange={(e) => set("redirectUrl", e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* PRICING TABLE */}
        {element.type === "pricing-table" && (
          <div className={fieldClass}>
            <label className={labelClass}>Plans</label>
            {((p.plans as { name: string; price: string; features: string[]; ctaLabel: string; ctaHref: string; highlighted: boolean }[]) || []).map((plan, i) => (
              <div key={i} className="border border-border rounded p-2 mb-2">
                <div className="flex gap-1 mb-1">
                  <input type="text" value={plan.name} onChange={(e) => { const plans = [...((p.plans as typeof plan[]) || [])]; plans[i] = { ...plans[i], name: e.target.value }; set("plans", plans); }} placeholder="Plan name" className={inputClass + " flex-1"} />
                  <input type="text" value={plan.price} onChange={(e) => { const plans = [...((p.plans as typeof plan[]) || [])]; plans[i] = { ...plans[i], price: e.target.value }; set("plans", plans); }} placeholder="$9/mo" className={inputClass + " w-20"} />
                </div>
                <textarea
                  value={plan.features.join("\n")}
                  onChange={(e) => { const plans = [...((p.plans as typeof plan[]) || [])]; plans[i] = { ...plans[i], features: e.target.value.split("\n") }; set("plans", plans); }}
                  placeholder="One feature per line"
                  className={inputClass + " h-16 resize-none mb-1"}
                />
                <div className="flex items-center gap-2">
                  <input type="text" value={plan.ctaLabel} onChange={(e) => { const plans = [...((p.plans as typeof plan[]) || [])]; plans[i] = { ...plans[i], ctaLabel: e.target.value }; set("plans", plans); }} placeholder="CTA label" className={inputClass + " flex-1"} />
                  <label className="flex items-center gap-1 text-[10px]">
                    <input type="checkbox" checked={plan.highlighted} onChange={(e) => { const plans = [...((p.plans as typeof plan[]) || [])]; plans[i] = { ...plans[i], highlighted: e.target.checked }; set("plans", plans); }} />
                    Featured
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* COLUMNS */}
        {element.type === "columns" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Column Count</label>
              <input type="number" min={1} max={6} value={Number(p.columns) || 2} onChange={(e) => set("columns", Number(e.target.value))} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Gap</label>
              <input type="text" value={(p.gap as string) || "2rem"} onChange={(e) => set("gap", e.target.value)} className={inputClass} />
            </div>
          </>
        )}

        {/* CONTAINER */}
        {element.type === "container" && (
          <>
            <div className={fieldClass}>
              <label className={labelClass}>Background Color</label>
              <input type="color" value={(p.bgColor as string) || "#ffffff"} onChange={(e) => set("bgColor", e.target.value)} className="h-7 w-full rounded border border-border cursor-pointer" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Padding</label>
              <input type="text" value={(p.padding as string) || "2rem"} onChange={(e) => set("padding", e.target.value)} className={inputClass} />
            </div>
            <div className={fieldClass}>
              <label className={labelClass}>Max Width</label>
              <input type="text" value={(p.maxWidth as string) || "1200px"} onChange={(e) => set("maxWidth", e.target.value)} className={inputClass} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Editor Page ─────────────────────────────────────────────────────────

export default function EditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const router = useRouter();
  const { organizationId } = usePermissions();

  const [site, setSite] = useState<Site | null>(null);
  const [pages, setPages] = useState<SitePage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [elements, setElements] = useState<SiteElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPagesMenu, setShowPagesMenu] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [draggingType, setDraggingType] = useState<ElementType | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [siteName, setSiteName] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [siteData, pagesData] = await Promise.all([getSite(siteId), getPages(siteId)]);
      if (!siteData) { router.push("/builder"); return; }
      setSite(siteData);
      setSiteName(siteData.name);
      setPages(pagesData);
      if (pagesData.length > 0) {
        const firstPage = pagesData[0];
        setCurrentPageId(firstPage.id);
        const elems = await getElements(firstPage.id);
        setElements(elems);
      }
    }
    load()
      .catch((e) => console.error("Failed to load editor:", e))
      .finally(() => setLoading(false));
  }, [siteId, router]);

  // ── Auto-save elements ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentPageId || loading || !organizationId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      savePageElements(currentPageId, siteId, organizationId, elements)
        .catch((e) => console.error("Auto-save failed:", e))
        .finally(() => setSaving(false));
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, currentPageId]);

  // ── Switch page ────────────────────────────────────────────────────────────

  const switchPage = useCallback(async (pageId: string) => {
    setSelectedId(null);
    setCurrentPageId(pageId);
    const elems = await getElements(pageId).catch(() => []);
    setElements(elems);
    setShowPagesMenu(false);
  }, []);

  // ── Add page ───────────────────────────────────────────────────────────────

  const handleAddPage = async () => {
    if (!newPageName.trim() || !organizationId) return;
    const slug = newPageName.toLowerCase().replace(/\s+/g, "-");
    const page = await createPage({ siteId, organizationId, name: newPageName.trim(), slug, sortOrder: pages.length });
    setPages((p) => [...p, page]);
    setNewPageName("");
    setShowAddPage(false);
    await switchPage(page.id);
  };

  // ── Drag from palette ──────────────────────────────────────────────────────

  const handlePaletteDragStart = (e: React.DragEvent, type: ElementType) => {
    e.dataTransfer.setData("action", "add");
    e.dataTransfer.setData("elementType", type);
    setDraggingType(type);
  };

  const getDropIndex = useCallback((clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return elements.length;
    const children = Array.from(canvas.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return children.length;
  }, [elements.length]);

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverIndex(getDropIndex(e.clientY));
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const action = e.dataTransfer.getData("action");

    if (action === "add") {
      const type = e.dataTransfer.getData("elementType") as ElementType;
      if (!type || !currentPageId) { setDragOverIndex(-1); setDraggingType(null); return; }
      const insertAt = dragOverIndex >= 0 ? dragOverIndex : elements.length;
      const newEl: SiteElement = {
        id: crypto.randomUUID(),
        pageId: currentPageId,
        siteId,
        organizationId: organizationId ?? "",
        type,
        props: getDefaultProps(type),
        sortOrder: insertAt,
      };
      setElements((prev) => {
        const updated = [...prev];
        updated.splice(insertAt, 0, newEl);
        return updated.map((el, i) => ({ ...el, sortOrder: i }));
      });
      setSelectedId(newEl.id);
    }

    if (action === "reorder" && reorderDragId) {
      const fromIndex = elements.findIndex((el) => el.id === reorderDragId);
      if (fromIndex === -1) { setDragOverIndex(-1); setReorderDragId(null); return; }
      let toIndex = dragOverIndex >= 0 ? dragOverIndex : elements.length;
      if (toIndex > fromIndex) toIndex -= 1;
      setElements((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated.map((el, i) => ({ ...el, sortOrder: i }));
      });
    }

    setDragOverIndex(-1);
    setDraggingType(null);
    setReorderDragId(null);
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    if (!canvasRef.current?.contains(e.relatedTarget as Node)) {
      setDragOverIndex(-1);
    }
  };

  // ── Element actions ────────────────────────────────────────────────────────

  const updateElement = (id: string, props: Record<string, unknown>) => {
    setElements((prev) => prev.map((el) => el.id === id ? { ...el, props } : el));
  };

  const deleteElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id).map((el, i) => ({ ...el, sortOrder: i })));
    setSelectedId(null);
  };

  const moveElement = (id: string, direction: "up" | "down") => {
    setElements((prev) => {
      const idx = prev.findIndex((el) => el.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated.map((el, i) => ({ ...el, sortOrder: i }));
    });
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedId && (e.key === "Delete" || e.key === "Backspace") && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        deleteElement(selectedId);
      }
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Publish ────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!site) return;
    setPublishing(true);
    publishSite(siteId)
      .then(() => setSite((s) => s ? { ...s, status: "published" } : s))
      .catch((e) => console.error(e))
      .finally(() => setPublishing(false));
  };

  // ── Save site name ─────────────────────────────────────────────────────────

  const handleSaveName = () => {
    if (!siteName.trim() || siteName === site?.name) { setEditingName(false); return; }
    updateSite(siteId, { name: siteName.trim() })
      .then(() => setSite((s) => s ? { ...s, name: siteName.trim() } : s))
      .catch((e) => console.error(e));
    setEditingName(false);
  };

  // ── AI helper ─────────────────────────────────────────────────────────────

  const handleAI = (action: "headline" | "description" | "rewrite") => {
    if (!selectedId) return;
    const el = elements.find((e) => e.id === selectedId);
    if (!el) return;
    const suggestion = getAISuggestion(el.type, site?.name ?? "");
    if (action === "headline" && el.type === "text") {
      updateElement(selectedId, { ...el.props, tag: "h1", content: suggestion.content ?? el.props.content });
    } else if (action === "description" && el.type === "text") {
      updateElement(selectedId, { ...el.props, tag: "p", content: suggestion.content ?? el.props.content });
    } else if (action === "rewrite") {
      updateElement(selectedId, { ...el.props, ...suggestion });
    }
    setShowAI(false);
  };

  const selectedEl = elements.find((el) => el.id === selectedId) ?? null;
  const selectedIndex = elements.findIndex((el) => el.id === selectedId);
  const currentPage = pages.find((p) => p.id === currentPageId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/30">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0 h-11">
        <Link href="/builder" className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* Site name */}
        {editingName ? (
          <input
            autoFocus
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setSiteName(site?.name ?? ""); setEditingName(false); } }}
            className="text-sm font-medium bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-foreground w-48"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="text-sm font-medium hover:text-muted-foreground transition-colors truncate max-w-[180px]">
            {site?.name || "Untitled Site"}
          </button>
        )}

        {/* Pages dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPagesMenu(!showPagesMenu)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
          >
            {currentPage?.name || "Page"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showPagesMenu && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded shadow-md min-w-[160px] z-50 py-1">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => switchPage(page.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${page.id === currentPageId ? "font-medium" : ""}`}
                >
                  {page.name}
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                {showAddPage ? (
                  <div className="px-2 pb-1">
                    <input
                      autoFocus
                      type="text"
                      value={newPageName}
                      onChange={(e) => setNewPageName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") setShowAddPage(false); }}
                      placeholder="Page name"
                      className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none"
                    />
                    <button onClick={handleAddPage} className="mt-1 w-full text-xs bg-foreground text-background rounded py-1 font-medium">Add</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddPage(true)} className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add page
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Saving indicator */}
        {saving && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>}
        {!saving && <span className="text-[10px] text-muted-foreground">{elements.length} element{elements.length !== 1 ? "s" : ""}</span>}

        {/* Theme */}
        <Link href={`/builder/${siteId}/theme`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors">
          <Palette className="h-3.5 w-3.5" />
          Theme
        </Link>

        {/* Preview */}
        {site?.status === "published" && (
          <a href={`/s/${site.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </a>
        )}

        {/* Publish */}
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="flex items-center gap-1 text-xs bg-foreground text-background rounded px-3 py-1 font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
          {site?.status === "published" ? "Published" : "Publish"}
        </button>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: element palette ───────────────────────────────── */}
        <div className="w-[180px] shrink-0 border-r border-border bg-card overflow-y-auto">
          <div className="p-2 space-y-3">
            {ELEMENT_PALETTE.map((cat) => (
              <div key={cat.category}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-1">{cat.category}</p>
                <div className="space-y-0.5">
                  {cat.items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => handlePaletteDragStart(e, item.type)}
                      onDragEnd={() => { setDraggingType(null); setDragOverIndex(-1); }}
                      onClick={() => {
                        if (!currentPageId) return;
                        const newEl: SiteElement = {
                          id: crypto.randomUUID(),
                          pageId: currentPageId,
                          siteId,
                          organizationId: organizationId ?? "",
                          type: item.type,
                          props: getDefaultProps(item.type),
                          sortOrder: elements.length,
                        };
                        setElements((prev) => [...prev, { ...newEl, sortOrder: prev.length }]);
                        setSelectedId(newEl.id);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-muted transition-colors select-none"
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto"
          onClick={() => setSelectedId(null)}
        >
          <div className="min-h-full p-6">
            <div
              className="mx-auto bg-white shadow-sm border border-border min-h-[600px] relative"
              style={{ maxWidth: "1000px" }}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
              onDragLeave={handleCanvasDragLeave}
            >
              {elements.length === 0 && !draggingType && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <p className="text-muted-foreground text-sm font-medium mb-1">Drag elements here</p>
                  <p className="text-muted-foreground text-xs">or click an element in the left panel to add it</p>
                </div>
              )}

              <div ref={canvasRef}>
                {elements.map((el, index) => (
                  <div key={el.id}>
                    {/* Drop indicator above */}
                    {dragOverIndex === index && (
                      <div className="h-0.5 bg-blue-500 mx-2 my-0.5 rounded-full" />
                    )}
                    {/* Element with editor chrome */}
                    <div
                      className="relative group"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("action", "reorder");
                        e.dataTransfer.setData("elementId", el.id);
                        setReorderDragId(el.id);
                      }}
                      onDragEnd={() => { setReorderDragId(null); setDragOverIndex(-1); }}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                      style={{
                        outline: selectedId === el.id ? "2px solid #2563eb" : "none",
                        outlineOffset: "-2px",
                        position: "relative",
                        cursor: "pointer",
                      }}
                    >
                      {/* Element type badge (on hover) */}
                      <div className={`absolute top-0 left-0 z-10 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider pointer-events-none transition-opacity ${selectedId === el.id ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
                        {el.type}
                      </div>
                      {/* Drag handle */}
                      <div className={`absolute top-1 right-1 z-10 p-0.5 bg-white/80 rounded cursor-grab transition-opacity ${selectedId === el.id ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <SiteRenderer
                        elements={[el]}
                        theme={site?.theme ?? { primaryColor: "#111", secondaryColor: "#666", accentColor: "#2563eb", bgColor: "#fff", textColor: "#111", headingFont: "Inter", bodyFont: "Inter", borderRadius: "0.375rem" }}
                      />
                    </div>
                  </div>
                ))}
                {/* Drop indicator at end */}
                {dragOverIndex === elements.length && (
                  <div className="h-0.5 bg-blue-500 mx-2 my-0.5 rounded-full" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right panel: properties ───────────────────────────────────── */}
        <div className="w-[260px] shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
          {selectedEl ? (
            <PropsPanel
              element={selectedEl}
              theme={site?.theme ?? { primaryColor: "#111", secondaryColor: "#666", accentColor: "#2563eb", bgColor: "#fff", textColor: "#111", headingFont: "Inter", bodyFont: "Inter", borderRadius: "0.375rem" }}
              onChange={(props) => updateElement(selectedEl.id, props)}
              onDelete={() => deleteElement(selectedEl.id)}
              onMoveUp={() => moveElement(selectedEl.id, "up")}
              onMoveDown={() => moveElement(selectedEl.id, "down")}
              canMoveUp={selectedIndex > 0}
              canMoveDown={selectedIndex < elements.length - 1}
              onAI={() => setShowAI(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <MousePointer className="h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-xs font-medium mb-1">No element selected</p>
              <p className="text-[11px] text-muted-foreground">Click an element on the canvas to edit its properties</p>
            </div>
          )}
        </div>
      </div>

      {/* ── AI helper panel ─────────────────────────────────────────────── */}
      {showAI && selectedEl && (
        <div className="fixed bottom-6 right-[280px] bg-card border border-border rounded shadow-lg p-3 z-50 w-56">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-yellow-500" /> AI Content</span>
            <button onClick={() => setShowAI(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="space-y-1">
            {selectedEl.type === "text" && (
              <>
                <button onClick={() => handleAI("headline")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors">✨ Write headline</button>
                <button onClick={() => handleAI("description")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors">✨ Write description</button>
              </>
            )}
            {selectedEl.type === "hero" && (
              <button onClick={() => handleAI("rewrite")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors">✨ Generate hero content</button>
            )}
            {selectedEl.type === "button" && (
              <button onClick={() => handleAI("rewrite")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors">✨ Suggest CTA text</button>
            )}
            <button onClick={() => handleAI("rewrite")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">↩ Rewrite</button>
          </div>
        </div>
      )}

      {/* Backdrop for AI */}
      {showAI && <div className="fixed inset-0 z-40" onClick={() => setShowAI(false)} />}

      {/* Backdrop for pages menu */}
      {showPagesMenu && <div className="fixed inset-0 z-40" onClick={() => setShowPagesMenu(false)} />}
    </div>
  );
}
