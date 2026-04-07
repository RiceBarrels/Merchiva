"use client";

import { useCallback, useEffect, useRef, useState, use, createContext, useContext } from "react";
import Link from "next/link";
import {
  Menu,
  ChevronDown,
  ChevronUp,
  ChevronRight,
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
  ShoppingCart,
  Gift,
  Star,
  Library,
  Blocks,
  Paintbrush,
  BookMarked,
  GripVertical,
  LayoutGrid,
  MoveHorizontal,
  Maximize,
  Maximize2,
  ArrowLeftRight,
  ArrowUpDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Link as LinkIcon,
  Layers,
  Sparkles,
  Frame,
  BoxSelect,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Rows3,
  Columns3,
  Grid3X3,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { useSidebarOpen } from "@/components/sidebar";
import { getSiteById, getPages, createPage, updatePage, updateSite, deletePage, getSavedComponents, saveComponent, deleteComponent } from "@/lib/db/sites";
import { getProducts } from "@/lib/db/products";
import { SiteElementRenderer, buildGoogleFontsUrl } from "@/components/site-renderer";
import { ImageUpload } from "@/components/image-upload";
import { Combobox } from "@/components/ui/combobox";
import { IconPicker } from "@/components/icon-picker";
import * as LucideIcons from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { createClient } from "@/lib/supabase/client";
import { hapticLight } from "@/lib/haptics";
import type { Site, SitePage, SiteElement, ElementType, SiteTheme, SiteComponent } from "@/lib/types";
import type { Product } from "@/lib/types";

// ─── Theme context (for color swatches in properties panel) ──────────────────

const ThemeContext = createContext<SiteTheme | null>(null);

const THEME_SWATCH_KEYS: { key: keyof SiteTheme; label: string }[] = [
  { key: "primary",    label: "Primary" },
  { key: "secondary",  label: "Secondary" },
  { key: "accent",     label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text",       label: "Text" },
];

// ─── Custom color picker (no native <input type="color">) ────────────────────

const PRESET_COLORS = [
  // Grayscale (12)
  "#ffffff","#f5f5f4","#e7e5e4","#d6d3d1","#a8a29e","#78716c",
  "#57534e","#44403c","#292524","#1c1917","#0c0a09","#000000",
  // Red
  "#fef2f2","#fecaca","#f87171","#ef4444","#dc2626","#991b1b",
  // Orange
  "#fff7ed","#fed7aa","#fb923c","#f97316","#ea580c","#9a3412",
  // Amber
  "#fffbeb","#fde68a","#fbbf24","#f59e0b","#d97706","#92400e",
  // Green
  "#f0fdf4","#bbf7d0","#4ade80","#22c55e","#16a34a","#166534",
  // Blue
  "#eff6ff","#bfdbfe","#60a5fa","#3b82f6","#2563eb","#1e40af",
  // Purple
  "#faf5ff","#e9d5ff","#a78bfa","#8b5cf6","#7c3aed","#5b21b6",
  // Pink
  "#fdf2f8","#fbcfe8","#f472b6","#ec4899","#db2777","#9d174d",
];

// Light-colored swatches that need a subtle inset border to show against white bg
const LIGHT_SWATCHES = new Set([
  "#ffffff","#f5f5f4","#e7e5e4","#d6d3d1",
  "#fef2f2","#fff7ed","#fffbeb","#f0fdf4","#eff6ff","#faf5ff","#fdf2f8",
]);

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function ColorSwatchGrid({
  value,
  onSelect,
  onChange,
  circleSize,
}: {
  value: string;
  onSelect: (v: string) => void; // swatch click: apply + close
  onChange: (v: string) => void; // hex input: apply only
  circleSize: number;
}) {
  const theme = useContext(ThemeContext);
  const [hexInput, setHexInput] = useState(
    value && value !== "transparent" ? value.replace("#", "") : ""
  );

  useEffect(() => {
    if (value && value !== "transparent") setHexInput(value.replace("#", ""));
    else if (value === "transparent") setHexInput("");
  }, [value]);

  const isSelected = (c: string) => value?.toLowerCase() === c.toLowerCase();

  const swatchCls = (c: string) =>
    cn(
      "rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex-shrink-0",
      isSelected(c) ? "border-foreground scale-110" : "border-transparent"
    );

  const swatchStyle = (c: string, sz: number): React.CSSProperties => ({
    width: sz, height: sz,
    backgroundColor: c,
    boxShadow: LIGHT_SWATCHES.has(c) ? "inset 0 0 0 1px rgba(0,0,0,0.1)" : undefined,
  });

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    setHexInput(raw);
    if (raw.length === 6) onChange("#" + raw);
  };

  const sz = circleSize;

  return (
    <div className="space-y-2.5 p-3">
      {/* Theme colors */}
      {theme && (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Theme</p>
          <div className="flex gap-1.5 flex-wrap">
            {THEME_SWATCH_KEYS.map(({ key, label }) => {
              const c = theme[key] as string;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => onSelect(c)}
                  className={swatchCls(c)}
                  style={swatchStyle(c, sz)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Preset grid */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Colors</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(6, ${sz}px)` }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onSelect(c)}
              className={swatchCls(c)}
              style={swatchStyle(c, sz)}
            />
          ))}
          {/* Transparent */}
          <button
            type="button"
            title="Transparent"
            onClick={() => onSelect("transparent")}
            className={cn(
              "rounded-full border-2 cursor-pointer flex-shrink-0 transition-transform hover:scale-110",
              value === "transparent" ? "border-foreground scale-110" : "border-transparent"
            )}
            style={{
              width: sz, height: sz,
              background: "repeating-linear-gradient(45deg,#e5e7eb 0px,#e5e7eb 2px,#fff 2px,#fff 5px)",
            }}
          />
        </div>
      </div>

      {/* Hex input */}
      <div className="flex items-center gap-1.5">
        <div
          className="rounded border border-border shrink-0"
          style={{
            width: 24, height: 24,
            backgroundColor: value && value !== "transparent" ? value : "#ffffff",
            backgroundImage: value === "transparent"
              ? "repeating-linear-gradient(45deg,#e5e7eb 0px,#e5e7eb 2px,#fff 2px,#fff 5px)"
              : undefined,
          }}
        />
        <span className="text-xs text-muted-foreground font-mono">#</span>
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          placeholder="000000"
          spellCheck={false}
          maxLength={6}
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring min-w-0"
        />
      </div>
    </div>
  );
}

function PropColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close desktop popover on outside click
  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isMobile]);

  const handleSelect = (color: string) => {
    hapticLight();
    onChange(color);
    setOpen(false);
  };

  const isTransparent = value === "transparent";
  const displayColor = !isTransparent && value ? value : undefined;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
      >
        <span
          className="h-4 w-4 rounded border border-black/10 shrink-0"
          style={{
            backgroundColor: displayColor ?? "#ffffff",
            backgroundImage: isTransparent
              ? "repeating-linear-gradient(45deg,#e5e7eb 0px,#e5e7eb 2px,#fff 2px,#fff 5px)"
              : undefined,
          }}
        />
        <span className="font-mono truncate" style={{ maxWidth: 64 }}>
          {value || "—"}
        </span>
      </button>

      {/* Desktop popover */}
      {open && !isMobile && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-full left-0 mt-1 rounded border border-border bg-background shadow-lg"
          style={{ width: 180 }}
        >
          <ColorSwatchGrid
            value={value}
            onSelect={handleSelect}
            onChange={onChange}
            circleSize={20}
          />
        </div>
      )}

      {/* Mobile bottom sheet */}
      {open && isMobile && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t border-border bg-background"
            style={{ animation: "slideUp 0.2s ease-out" }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="pb-6">
              <ColorSwatchGrid
                value={value}
                onSelect={handleSelect}
                onChange={onChange}
                circleSize={24}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function deepCopyElement(el: SiteElement): SiteElement {
  return {
    ...el,
    id: uid(),
    props: { ...el.props },
    children: el.children?.map(deepCopyElement),
  };
}

// ─── Tree helpers for nested elements ────────────────────────────────────────

function findInTree(roots: SiteElement[], id: string): SiteElement | null {
  for (const el of roots) {
    if (el.id === id) return el;
    if (el.children) {
      const found = findInTree(el.children, id);
      if (found) return found;
    }
  }
  return null;
}

function removeFromTree(roots: SiteElement[], id: string): [SiteElement[], SiteElement | null] {
  let removed: SiteElement | null = null;
  const next = roots.filter((el) => {
    if (el.id === id) { removed = el; return false; }
    return true;
  }).map((el) => {
    if (el.children) {
      const [newChildren, r] = removeFromTree(el.children, id);
      if (r) removed = r;
      return { ...el, children: newChildren };
    }
    return el;
  });
  return [next, removed];
}

function updateInTree(roots: SiteElement[], id: string, updater: (el: SiteElement) => SiteElement): SiteElement[] {
  return roots.map((el) => {
    if (el.id === id) return updater(el);
    if (el.children) return { ...el, children: updateInTree(el.children, id, updater) };
    return el;
  });
}

function addToLayout(roots: SiteElement[], layoutId: string, el: SiteElement): SiteElement[] {
  return updateInTree(roots, layoutId, (layout) => ({
    ...layout,
    children: [...(layout.children ?? []), el],
  }));
}

// Find parent ID of an element in the tree
function findParentId(roots: SiteElement[], id: string, parentId: string | null = null): string | null {
  for (const el of roots) {
    if (el.id === id) return parentId;
    if (el.children) {
      const found = findParentId(el.children, id, el.id);
      if (found !== undefined) return found;
    }
  }
  return undefined as unknown as string | null;
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
    case "layout":     return { direction: "stack", spacing: "medium", align: "stretch", padding: "1rem", backgroundColor: "", columns: 2, children: [] };
    case "container":  return { direction: "stack", spacing: "medium", align: "stretch", padding: "1rem", backgroundColor: "" }; // legacy
    case "columns":    return { columns: 2, gap: "1.5rem", columnContent: ["", ""] };
    case "product-card":  return { productId: "", showPrice: true, showDescription: false };
    case "booking-form":  return { title: "Book an Appointment", submitLabel: "Book Now" };
    case "coupon-banner": return { code: "SAVE10", description: "Get 10% off your next order!", backgroundColor: "#fef3c7", textColor: "#92400e" };
    case "pricing-table": return { plans: [{ name: "Basic", price: "Free", features: ["Feature 1", "Feature 2"], ctaLabel: "Get Started", ctaHref: "#", highlighted: false }, { name: "Pro", price: "$29/mo", features: ["Everything in Basic", "Priority support", "Advanced features"], ctaLabel: "Start Pro", ctaHref: "#", highlighted: true }] };
    case "testimonial":   return { quote: "This product is amazing!", author: "Jane D.", role: "Happy Customer", avatar: "", rating: 5 };
    case "faq":           return { items: [{ question: "What is your return policy?", answer: "We offer a 30-day return policy on all items." }, { question: "How do I contact support?", answer: "Email us at hello@example.com anytime." }] };
    case "gallery":       return { images: [], columns: 3, gap: "0.5rem" };
    case "custom-html":        return { html: "<p>Your custom HTML here</p>" };
    case "login-form":         return { title: "Sign In", redirectUrl: "/dashboard" };
    case "code-block":         return { language: "html", code: "<h1>Hello World</h1>", execute: false, height: "300px" };
    case "membership-widget":  return { title: "Member Benefits", tierName: "Gold Member", tierColor: "#f59e0b", tierIcon: "⭐", showPoints: true, previewPerks: ["Free drink every 3 hours", "10% off weekends", "Priority seating"] };
    case "cart":               return { title: "Your Cart", emptyText: "Your cart is empty.", checkoutLabel: "Checkout" };
    case "checkout":           return { title: "Checkout", submitLabel: "Place Order" };
    case "reward":             return { title: "Earn Rewards", description: "Earn points on every purchase!", pointsLabel: "Points", backgroundColor: "#f0fdf4", textColor: "#166534" };
    case "icon":               return { name: "Star", size: 32, color: "", align: "left" };
    default:                   return {};
  }
}

// ─── Element palette config ───────────────────────────────────────────────────

const PALETTE: { label: string; icon: React.ReactNode; type: ElementType }[][] = [
  // Layout
  [
    { label: "Text",      icon: <Type className="h-3.5 w-3.5" />,             type: "text" },
    { label: "Image",     icon: <Image className="h-3.5 w-3.5" />,            type: "image" },
    { label: "Button",    icon: <MousePointerClick className="h-3.5 w-3.5" />, type: "button" },
    { label: "Layout",    icon: <LayoutGrid className="h-3.5 w-3.5" />,        type: "layout" },
    { label: "Columns",   icon: <Columns2 className="h-3.5 w-3.5" />,         type: "columns" },
    { label: "Divider",   icon: <Minus className="h-3.5 w-3.5" />,            type: "divider" },
    { label: "Spacer",    icon: <SeparatorHorizontal className="h-3.5 w-3.5" />, type: "spacer" },
    { label: "Icon",      icon: <Star className="h-3.5 w-3.5" />,             type: "icon" },
  ],
  // Sections
  [
    { label: "Hero",      icon: <LayoutDashboard className="h-3.5 w-3.5" />,  type: "hero" },
    { label: "Nav",       icon: <Navigation className="h-3.5 w-3.5" />,       type: "nav" },
    { label: "Footer",    icon: <Footprints className="h-3.5 w-3.5" />,       type: "footer" },
  ],
  // Content
  [
    { label: "Review",    icon: <MessageSquare className="h-3.5 w-3.5" />,    type: "testimonial" },
    { label: "FAQ",       icon: <HelpCircle className="h-3.5 w-3.5" />,       type: "faq" },
    { label: "Gallery",   icon: <GalleryHorizontal className="h-3.5 w-3.5" />, type: "gallery" },
    { label: "Pricing",   icon: <CreditCard className="h-3.5 w-3.5" />,       type: "pricing-table" },
  ],
  // Commerce
  [
    { label: "Product",   icon: <ShoppingBag className="h-3.5 w-3.5" />,      type: "product-card" },
    { label: "Booking",   icon: <CalendarDays className="h-3.5 w-3.5" />,     type: "booking-form" },
    { label: "Coupon",    icon: <Tag className="h-3.5 w-3.5" />,              type: "coupon-banner" },
    { label: "Cart",      icon: <ShoppingCart className="h-3.5 w-3.5" />,     type: "cart" },
    { label: "Checkout",  icon: <CreditCard className="h-3.5 w-3.5" />,       type: "checkout" },
  ],
  // Account
  [
    { label: "Login",      icon: <LogIn className="h-3.5 w-3.5" />,            type: "login-form" },
    { label: "Membership", icon: <Star className="h-3.5 w-3.5" />,             type: "membership-widget" },
    { label: "Reward",     icon: <Gift className="h-3.5 w-3.5" />,             type: "reward" },
  ],
  // Advanced
  [
    { label: "HTML",       icon: <Code2 className="h-3.5 w-3.5" />,            type: "custom-html" },
    { label: "Code",       icon: <Code2 className="h-3.5 w-3.5" />,            type: "code-block" },
  ],
];

const PALETTE_LABELS = ["Layout", "Sections", "Content", "Commerce", "Account", "Advanced"];

// ─── Properties panel components ─────────────────────────────────────────────

function PropRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-muted-foreground pt-1.5 leading-none flex items-center gap-1">
        {icon && <span className="opacity-60 shrink-0">{icon}</span>}
        {label}
      </span>
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
  return <Combobox value={value} onValueChange={onChange} options={options} />;
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

function Section({ label, icon, children, defaultOpen = true, actions }: { label: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/50 mt-2 pt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {icon && <span className="opacity-70">{icon}</span>}
          {label}
        </span>
        <span className="flex items-center gap-1">
          {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
          <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        </span>
      </button>
      {open && <div className="pt-0.5">{children}</div>}
    </div>
  );
}

// ─── Universal style panel (simplified for non-technical users) ──────────────

// Helper: parse a single px/rem number out of a shorthand like "16px" or "1rem"
function parseSingleNum(val: string): string {
  if (!val) return "";
  const m = val.match(/^(\d+(?:\.\d+)?)(px|rem)?$/);
  if (m) return m[1];
  return "";
}

// Figma-style compact input with label
function FigmaInput({ label, value, onChange, suffix, className }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-1", className)}>
      <span className="text-[10px] text-muted-foreground shrink-0 font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-xs outline-none text-right"
      />
      {suffix && <span className="text-[10px] text-muted-foreground shrink-0">{suffix}</span>}
    </div>
  );
}

// Figma-style icon toggle group
function FigmaToggleGroup({ options, value, onChange }: { options: { icon: React.ReactNode; value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded border border-border bg-muted/30 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          title={opt.label}
          onClick={() => onChange(opt.value)}
          className={cn("p-1.5 transition-colors", value === opt.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

function StyleProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const theme = useContext(ThemeContext);
  const style = (props.style as Record<string, string>) || {};
  const [showAdvancedPad, setShowAdvancedPad] = useState(false);

  const s = (key: string) => style[key] || "";
  const set = (key: string, val: string) => {
    const next = { ...style };
    if (val) next[key] = val; else delete next[key];
    onChange("style", next);
  };

  const padNum = parseSingleNum(s("padding"));
  const hasBorder = !!s("border");

  // Parse border parts
  const borderParts = s("border").match(/^(\d+)px\s+(\w+)\s+(.+)$/);
  const borderWidth = borderParts?.[1] || "1";
  const borderColor = borderParts?.[3] || theme?.secondary || "#e5e7eb";

  const currentLayout = (() => {
    if (s("display") === "grid") return s("gridTemplateColumns").includes("3") ? "grid|3" : "grid|2";
    if (s("display") === "flex") return s("flexDirection") === "row" ? "flex|row" : "flex|column";
    return "";
  })();

  const opacityPct = s("opacity") ? Math.round(parseFloat(s("opacity")) * 100) : 100;
  const bgColor = s("backgroundColor") || "";
  const bgHex = bgColor.replace("#", "").toUpperCase();

  return (
    <>
      {/* Position / Spacing */}
      <Section label="Position" defaultOpen={false}>
        <div className="space-y-2">
          {/* Alignment */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Alignment</span>
            <div className="flex gap-2">
              <FigmaToggleGroup
                value={s("textAlign") || "left"}
                onChange={(v) => set("textAlign", v)}
                options={[
                  { icon: <AlignLeft className="h-3 w-3" />, value: "left", label: "Left" },
                  { icon: <AlignCenter className="h-3 w-3" />, value: "center", label: "Center" },
                  { icon: <AlignRight className="h-3 w-3" />, value: "right", label: "Right" },
                ]}
              />
              <FigmaToggleGroup
                value={s("alignItems") || "flex-start"}
                onChange={(v) => set("alignItems", v)}
                options={[
                  { icon: <AlignStartVertical className="h-3 w-3" />, value: "flex-start", label: "Top" },
                  { icon: <AlignCenterVertical className="h-3 w-3" />, value: "center", label: "Center" },
                  { icon: <AlignEndVertical className="h-3 w-3" />, value: "flex-end", label: "Bottom" },
                ]}
              />
            </div>
          </div>
          {/* Padding */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Padding</span>
              <button onClick={() => setShowAdvancedPad(p => !p)} className="text-[10px] text-muted-foreground hover:text-foreground">
                {showAdvancedPad ? "Simple" : "···"}
              </button>
            </div>
            {showAdvancedPad ? (
              <div className="grid grid-cols-2 gap-1">
                {(["paddingTop","paddingRight","paddingBottom","paddingLeft"] as const).map((k) => (
                  <FigmaInput key={k} label={k.replace("padding","").charAt(0)} value={parseSingleNum(s(k))} onChange={(v) => set(k, v ? `${v}px` : "")} />
                ))}
              </div>
            ) : (
              <FigmaInput label="All" value={padNum} onChange={(v) => set("padding", v ? `${v}px` : "")} suffix="px" />
            )}
          </div>
          {/* Margin */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Margin</span>
            <FigmaInput label="All" value={parseSingleNum(s("margin"))} onChange={(v) => set("margin", v ? `${v}px` : "")} suffix="px" />
          </div>
        </div>
      </Section>

      {/* Layout + Dimensions */}
      <Section label="Layout" defaultOpen={false}>
        <div className="space-y-2">
          {/* Flow */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Flow</span>
            <FigmaToggleGroup
              value={currentLayout}
              onChange={(v) => {
                const [disp, sub] = v.split("|");
                if (disp === "flex") {
                  const next = { ...style, display: "flex", flexDirection: sub };
                  delete (next as Record<string, string>).gridTemplateColumns;
                  onChange("style", next);
                } else {
                  const cols = sub === "3" ? "repeat(3, 1fr)" : "repeat(2, 1fr)";
                  const next = { ...style, display: "grid", gridTemplateColumns: cols };
                  delete (next as Record<string, string>).flexDirection;
                  onChange("style", next);
                }
              }}
              options={[
                { icon: <Rows3 className="h-3 w-3" />, value: "flex|column", label: "Stack" },
                { icon: <Columns3 className="h-3 w-3" />, value: "flex|row", label: "Row" },
                { icon: <LayoutGrid className="h-3 w-3" />, value: "grid|2", label: "Grid 2" },
                { icon: <Grid3X3 className="h-3 w-3" />, value: "grid|3", label: "Grid 3" },
              ]}
            />
          </div>
          {/* Dimensions */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Dimensions</span>
            <div className="grid grid-cols-2 gap-1">
              <FigmaInput label="W" value={s("width") || "auto"} onChange={(v) => set("width", v)} />
              <FigmaInput label="H" value={s("height") || "auto"} onChange={(v) => set("height", v)} />
            </div>
          </div>
          {/* Gap */}
          <FigmaInput label="Gap" value={parseSingleNum(s("gap"))} onChange={(v) => set("gap", v ? `${v}px` : "")} suffix="px" />
        </div>
      </Section>

      {/* Appearance */}
      <Section label="Appearance" defaultOpen={false}>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Opacity</span>
              <FigmaInput label="" value={`${opacityPct}%`} onChange={(v) => {
                const n = parseInt(v.replace("%",""));
                if (isNaN(n)) return;
                if (n >= 100) { const next = { ...style }; delete next.opacity; onChange("style", next); }
                else set("opacity", String(Math.max(0, Math.min(100, n)) / 100));
              }} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Corner radius</span>
              <FigmaInput label="" value={parseSingleNum(s("borderRadius")) || "0"} onChange={(v) => set("borderRadius", v ? `${v}px` : "")} suffix="px" />
            </div>
          </div>
          {/* Quick radius presets */}
          <div className="flex gap-1">
            {[{ l: "0", v: "0" }, { l: "4", v: "4px" }, { l: "8", v: "8px" }, { l: "16", v: "16px" }, { l: "Full", v: "9999px" }].map((r) => (
              <button key={r.v} onClick={() => set("borderRadius", r.v)} className={cn("flex-1 rounded border py-0.5 text-[10px] transition-colors", s("borderRadius") === r.v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{r.l}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* Fill */}
      <Section label="Fill" defaultOpen={false} actions={
        <button onClick={() => set("backgroundColor", bgColor ? "" : "#ffffff")} className="text-muted-foreground hover:text-foreground">
          {bgColor ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      }>
        {bgColor !== "" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <div
                  className="h-6 w-6 rounded border border-border shrink-0"
                  style={{ backgroundColor: bgColor || "transparent", backgroundImage: !bgColor ? "linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)" : undefined, backgroundSize: "6px 6px" }}
                />
                <input
                  type="color"
                  value={bgColor || "#ffffff"}
                  onChange={(e) => set("backgroundColor", e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <FigmaInput label="" value={bgHex || "transparent"} onChange={(v) => set("backgroundColor", v.startsWith("#") ? v : `#${v}`)} className="flex-1" />
              <FigmaInput label="" value={`${opacityPct}`} onChange={(v) => {
                const n = parseInt(v);
                if (isNaN(n)) return;
                if (n >= 100) { const next = { ...style }; delete next.opacity; onChange("style", next); }
                else set("opacity", String(Math.max(0, n) / 100));
              }} suffix="%" className="w-20" />
            </div>
            {/* Background image */}
            {s("backgroundImage") && (
              <FigmaInput label="Image" value={s("backgroundImage")} onChange={(v) => { set("backgroundImage", v); if (v) { set("backgroundSize", "cover"); set("backgroundPosition", "center"); } }} />
            )}
            {/* Quick swatches */}
            <div className="flex flex-wrap gap-1.5">
              {(theme ? [
                { c: "#ffffff" }, { c: "#f5f5f5" }, { c: "#18181b" },
                { c: theme.primary }, { c: theme.secondary }, { c: theme.accent }, { c: theme.background },
              ] : [
                { c: "#ffffff" }, { c: "#f5f5f5" }, { c: "#18181b" }, { c: "#3b82f6" }, { c: "#ef4444" }, { c: "#22c55e" },
              ]).map((sw) => (
                <button
                  key={sw.c}
                  onClick={() => set("backgroundColor", sw.c)}
                  className={cn("h-4 w-4 rounded-full border transition-transform hover:scale-125", bgColor === sw.c ? "border-foreground border-2" : "border-border")}
                  style={{ backgroundColor: sw.c }}
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Stroke */}
      <Section label="Stroke" defaultOpen={false} actions={
        <button onClick={() => {
          if (hasBorder) { const next = { ...style }; delete next.border; onChange("style", next); }
          else set("border", `1px solid ${theme?.secondary || "#e5e7eb"}`);
        }} className="text-muted-foreground hover:text-foreground">
          {hasBorder ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      }>
        {hasBorder && (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className="h-6 w-6 rounded border border-border shrink-0" style={{ backgroundColor: borderColor }} />
              <input
                type="color"
                value={borderColor}
                onChange={(e) => set("border", `${borderWidth}px solid ${e.target.value}`)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <FigmaInput label="" value={borderColor.replace("#","").toUpperCase()} onChange={(v) => set("border", `${borderWidth}px solid #${v}`)} className="flex-1" />
            <FigmaInput label="" value={borderWidth} onChange={(v) => set("border", `${v || "1"}px solid ${borderColor}`)} suffix="px" className="w-16" />
          </div>
        )}
      </Section>

      {/* Effects */}
      <Section label="Effects" icon={<Sparkles className="h-3 w-3" />} defaultOpen={false} actions={
        <button onClick={() => set("boxShadow", s("boxShadow") ? "" : "0 1px 3px rgba(0,0,0,0.12)")} className="text-muted-foreground hover:text-foreground">
          {s("boxShadow") ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      }>
        <div className="flex flex-wrap gap-1">
          {[
            { label: "None", value: "" },
            { label: "S", value: "0 1px 3px rgba(0,0,0,0.12)" },
            { label: "M", value: "0 4px 12px rgba(0,0,0,0.15)" },
            { label: "L", value: "0 8px 30px rgba(0,0,0,0.18)" },
          ].map((sh) => (
            <button key={sh.label} onClick={() => set("boxShadow", sh.value)} className={cn("flex-1 rounded border py-0.5 text-[10px] transition-colors", s("boxShadow") === sh.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{sh.label}</button>
          ))}
        </div>
      </Section>
    </>
  );
}

// ─── Type-specific property panels ───────────────────────────────────────────

const TEXT_STYLES = [
  { label: "Heading 1", tag: "h1", fontSize: "36px", fontWeight: "bold",    font: "heading", muted: false },
  { label: "Heading 2", tag: "h2", fontSize: "28px", fontWeight: "bold",    font: "heading", muted: false },
  { label: "Heading 3", tag: "h3", fontSize: "22px", fontWeight: "600",     font: "heading", muted: false },
  { label: "Body",      tag: "p",  fontSize: "16px", fontWeight: "normal",  font: "body",    muted: false },
  { label: "Small",     tag: "p",  fontSize: "14px", fontWeight: "normal",  font: "body",    muted: true  },
  { label: "Caption",   tag: "p",  fontSize: "12px", fontWeight: "normal",  font: "body",    muted: true  },
];

function TextProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const theme = useContext(ThemeContext);

  const applyTextStyle = (style: typeof TEXT_STYLES[number]) => {
    onChange("tag", style.tag);
    onChange("fontSize", style.fontSize);
    onChange("fontWeight", style.fontWeight);
    onChange("color", style.muted
      ? (theme?.secondary || "#71717a")
      : (theme?.text || "#09090b"));
    // font family
    const font = style.font === "heading" ? (theme?.headingFont || "Inter, sans-serif") : (theme?.bodyFont || "Inter, sans-serif");
    onChange("fontFamily", font);
  };

  return (
    <>
      <PropRow label="Style">
        <div className="flex flex-col gap-1">
          {TEXT_STYLES.map((s) => (
            <button
              key={s.label}
              onClick={() => applyTextStyle(s)}
              className="w-full text-left rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
              style={{ fontSize: Math.min(parseInt(s.fontSize), 16) + "px", fontWeight: s.fontWeight }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Content">
        <PropTextarea value={(props.content as string) || ""} onChange={(v) => onChange("content", v)} />
      </PropRow>
      <PropRow label="Tag">
        <PropSelect value={(props.tag as string) || "p"} onChange={(v) => onChange("tag", v)} options={[{ label: "Heading 1", value: "h1" }, { label: "Heading 2", value: "h2" }, { label: "Heading 3", value: "h3" }, { label: "Heading 4", value: "h4" }, { label: "Paragraph", value: "p" }, { label: "Span", value: "span" }]} />
      </PropRow>
      <PropRow label="Align" icon={<AlignLeft className="h-3 w-3" />}>
        <PropSelect value={(props.align as string) || "left"} onChange={(v) => onChange("align", v)} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
      </PropRow>
      <PropRow label="Font size" icon={<Type className="h-3 w-3" />}><PropInput value={(props.fontSize as string) || ""} onChange={(v) => onChange("fontSize", v)} placeholder="1rem" /></PropRow>
      <PropRow label="Weight" icon={<Bold className="h-3 w-3" />}>
        <PropSelect value={(props.fontWeight as string) || "normal"} onChange={(v) => onChange("fontWeight", v)} options={[{ label: "Normal", value: "normal" }, { label: "Medium", value: "500" }, { label: "Semibold", value: "600" }, { label: "Bold", value: "bold" }]} />
      </PropRow>
      <PropRow label="Color" icon={<Palette className="h-3 w-3" />}><PropColorInput value={(props.color as string) || "#000000"} onChange={(v) => onChange("color", v)} /></PropRow>
      <PropRow label="Padding"><PropInput value={(props.padding as string) || ""} onChange={(v) => onChange("padding", v)} placeholder="0.5rem 1rem" /></PropRow>
    </>
  );
}

function ImageProps({ props, onChange, orgId }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void; orgId: string }) {
  return (
    <>
      <PropRow label="Upload">
        <ImageUpload value={(props.src as string) || ""} orgId={orgId} onChange={(url) => onChange("src", url)} />
      </PropRow>
      <PropRow label="URL" icon={<Image className="h-3 w-3" />}><PropInput value={(props.src as string) || ""} onChange={(v) => onChange("src", v)} placeholder="https://…" /></PropRow>
      <PropRow label="Alt text"><PropInput value={(props.alt as string) || ""} onChange={(v) => onChange("alt", v)} placeholder="Image description" /></PropRow>
      <PropRow label="Width" icon={<ArrowLeftRight className="h-3 w-3" />}><PropInput value={(props.width as string) || "100%"} onChange={(v) => onChange("width", v)} placeholder="100%" /></PropRow>
      <PropRow label="Height" icon={<ArrowUpDown className="h-3 w-3" />}><PropInput value={(props.height as string) || "auto"} onChange={(v) => onChange("height", v)} placeholder="auto" /></PropRow>
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
      <PropRow label="Label" icon={<MousePointerClick className="h-3 w-3" />}><PropInput value={(props.label as string) || ""} onChange={(v) => onChange("label", v)} placeholder="Click me" /></PropRow>
      <PropRow label="Link" icon={<LinkIcon className="h-3 w-3" />}><PropInput value={(props.href as string) || "#"} onChange={(v) => onChange("href", v)} placeholder="/page or https://…" /></PropRow>
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

function HeroProps({ props, onChange, orgId }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void; orgId: string }) {
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
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || "#f9fafb"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Bg image">
        <ImageUpload value={(props.backgroundImage as string) || ""} orgId={orgId} onChange={(url) => onChange("backgroundImage", url)} />
        <PropInput value={(props.backgroundImage as string) || ""} onChange={(v) => onChange("backgroundImage", v)} placeholder="https://…" />
      </PropRow>
      <PropRow label="Text color"><PropColorInput value={(props.textColor as string) || "#09090b"} onChange={(v) => onChange("textColor", v)} /></PropRow>
    </>
  );
}

function NavProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const links = (props.links as { label: string; href: string }[]) || [];
  return (
    <>
      <PropRow label="Logo"><PropInput value={(props.logo as string) || ""} onChange={(v) => onChange("logo", v)} placeholder="My Site" /></PropRow>
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || "#ffffff"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropColorInput value={(props.textColor as string) || "#09090b"} onChange={(v) => onChange("textColor", v)} /></PropRow>
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
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || "#18181b"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropColorInput value={(props.textColor as string) || "#9ca3af"} onChange={(v) => onChange("textColor", v)} /></PropRow>
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
      <PropRow label="Color"><PropColorInput value={(props.color as string) || "#e5e7eb"} onChange={(v) => onChange("color", v)} /></PropRow>
      <PropRow label="Thickness"><PropInput value={(props.thickness as string) || "1px"} onChange={(v) => onChange("thickness", v)} placeholder="1px" /></PropRow>
      <PropRow label="Margin"><PropInput value={(props.margin as string) || "1.5rem 0"} onChange={(v) => onChange("margin", v)} placeholder="1.5rem 0" /></PropRow>
    </>
  );
}

function SpacerProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return <PropRow label="Height"><PropInput value={(props.height as string) || "48px"} onChange={(v) => onChange("height", v)} placeholder="48px" /></PropRow>;
}

function LayoutProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const DIRECTIONS = [
    { label: "Stack", value: "stack" },
    { label: "Row", value: "row" },
    { label: "Grid", value: "grid" },
  ];
  const SPACINGS = [
    { label: "Small", value: "small" },
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" },
  ];
  const ALIGNS = [
    { label: "Start", value: "flex-start" },
    { label: "Center", value: "center" },
    { label: "End", value: "flex-end" },
    { label: "Stretch", value: "stretch" },
  ];
  const dir = (props.direction as string) || "stack";
  const spacing = (props.spacing as string) || "medium";
  const align = (props.align as string) || "stretch";

  return (
    <>
      <PropRow label="Direction">
        <div className="flex gap-1">
          {DIRECTIONS.map((d) => (
            <button key={d.value} onClick={() => onChange("direction", d.value)} className={cn("flex-1 rounded border py-1 text-[11px] transition-colors", dir === d.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{d.label}</button>
          ))}
        </div>
      </PropRow>
      {dir === "grid" && (
        <PropRow label="Columns">
          <div className="flex gap-1">
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => onChange("columns", n)} className={cn("flex-1 rounded border py-1 text-[11px] transition-colors", (props.columns ?? 2) === n ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{n}</button>
            ))}
          </div>
        </PropRow>
      )}
      <PropRow label="Spacing">
        <div className="flex gap-1">
          {SPACINGS.map((s) => (
            <button key={s.value} onClick={() => onChange("spacing", s.value)} className={cn("flex-1 rounded border py-1 text-[11px] transition-colors", spacing === s.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{s.label}</button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Align">
        <div className="grid grid-cols-2 gap-1">
          {ALIGNS.map((a) => (
            <button key={a.value} onClick={() => onChange("align", a.value)} className={cn("rounded border py-1 text-[11px] transition-colors", align === a.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted")}>{a.label}</button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Padding"><PropInput value={(props.padding as string) || "1rem"} onChange={(v) => onChange("padding", v)} placeholder="1rem" /></PropRow>
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || ""} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
    </>
  );
}

// Legacy alias
const ContainerProps = LayoutProps;

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
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || "#fef3c7"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropColorInput value={(props.textColor as string) || "#92400e"} onChange={(v) => onChange("textColor", v)} /></PropRow>
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

function GalleryProps({ props, onChange, orgId }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void; orgId: string }) {
  const images = (props.images as { src: string; alt: string }[]) || [];
  return (
    <>
      <PropRow label="Columns">
        <PropSelect value={String(Number(props.columns) || 3)} onChange={(v) => onChange("columns", Number(v))} options={[2, 3, 4].map((n) => ({ label: `${n} columns`, value: String(n) }))} />
      </PropRow>
      <PropRow label="Gap"><PropInput value={(props.gap as string) || "0.5rem"} onChange={(v) => onChange("gap", v)} placeholder="0.5rem" /></PropRow>
      <PropRow label="Images">
        <div className="space-y-2">
          {images.map((img, i) => (
            <div key={i} className="space-y-1 rounded border border-border p-1.5">
              <ImageUpload
                value={img.src}
                orgId={orgId}
                onChange={(url) => { const n = [...images]; n[i] = { ...n[i], src: url }; onChange("images", n); }}
              />
              <div className="flex gap-1">
                <input value={img.src} onChange={(e) => { const n = [...images]; n[i] = { ...n[i], src: e.target.value }; onChange("images", n); }} placeholder="https://…" className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
                <button onClick={() => onChange("images", images.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
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

function CodeBlockProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Language">
        <PropSelect
          value={(props.language as string) || "html"}
          onChange={(v) => onChange("language", v)}
          options={[
            { label: "HTML", value: "html" },
            { label: "CSS", value: "css" },
            { label: "JavaScript", value: "javascript" },
          ]}
        />
      </PropRow>
      <PropRow label="Code"><PropTextarea value={(props.code as string) || ""} onChange={(v) => onChange("code", v)} rows={8} /></PropRow>
      <PropRow label="Execute"><PropToggle value={props.execute === true} onChange={(v) => onChange("execute", v)} label="Run in iframe sandbox" /></PropRow>
      {props.execute && (
        <PropRow label="Height"><PropInput value={(props.height as string) || "300px"} onChange={(v) => onChange("height", v)} placeholder="300px" /></PropRow>
      )}
    </>
  );
}

function MembershipWidgetProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const perks = (props.previewPerks as string[]) || [];
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Member Benefits" /></PropRow>
      <PropRow label="Tier name"><PropInput value={(props.tierName as string) || ""} onChange={(v) => onChange("tierName", v)} placeholder="Gold Member" /></PropRow>
      <PropRow label="Tier color"><PropColorInput value={(props.tierColor as string) || "#f59e0b"} onChange={(v) => onChange("tierColor", v)} /></PropRow>
      <PropRow label="Tier icon"><PropInput value={(props.tierIcon as string) || "⭐"} onChange={(v) => onChange("tierIcon", v)} placeholder="⭐" /></PropRow>
      <PropRow label="Show points"><PropToggle value={props.showPoints !== false} onChange={(v) => onChange("showPoints", v)} label="Show points balance" /></PropRow>
      <PropRow label="Perks">
        <div className="space-y-1">
          {perks.map((perk, i) => (
            <div key={i} className="flex gap-1">
              <input value={perk} onChange={(e) => { const n = [...perks]; n[i] = e.target.value; onChange("previewPerks", n); }} className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => onChange("previewPerks", perks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <button onClick={() => onChange("previewPerks", [...perks, "New perk"])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> Add perk</button>
        </div>
      </PropRow>
    </>
  );
}

function IconProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CurrentIcon = (LucideIcons as any)[(props.name as string) || "Star"];

  return (
    <>
      <PropRow label="Icon">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((p) => !p)}
            className="flex items-center gap-2 w-full rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted transition-colors"
          >
            {CurrentIcon && <CurrentIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="flex-1 text-left truncate">{(props.name as string) || "Star"}</span>
          </button>
          {pickerOpen && (
            <IconPicker
              value={(props.name as string) || "Star"}
              onValueChange={(name) => onChange("name", name)}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </PropRow>
      <PropRow label="Size">
        <PropInput value={String(Number(props.size) || 32)} onChange={(v) => onChange("size", Number(v) || 32)} placeholder="32" type="number" />
      </PropRow>
      <PropRow label="Color">
        <PropColorInput value={(props.color as string) || ""} onChange={(v) => onChange("color", v)} />
      </PropRow>
      <PropRow label="Align">
        <PropSelect value={(props.align as string) || "left"} onChange={(v) => onChange("align", v)} options={[{ label: "Left", value: "left" }, { label: "Center", value: "center" }, { label: "Right", value: "right" }]} />
      </PropRow>
    </>
  );
}

function CartProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Your Cart" /></PropRow>
      <PropRow label="Empty text"><PropInput value={(props.emptyText as string) || ""} onChange={(v) => onChange("emptyText", v)} placeholder="Your cart is empty." /></PropRow>
      <PropRow label="Checkout btn"><PropInput value={(props.checkoutLabel as string) || ""} onChange={(v) => onChange("checkoutLabel", v)} placeholder="Checkout" /></PropRow>
    </>
  );
}

function CheckoutProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Checkout" /></PropRow>
      <PropRow label="Submit btn"><PropInput value={(props.submitLabel as string) || ""} onChange={(v) => onChange("submitLabel", v)} placeholder="Place Order" /></PropRow>
    </>
  );
}

function RewardProps({ props, onChange }: { props: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <PropRow label="Title"><PropInput value={(props.title as string) || ""} onChange={(v) => onChange("title", v)} placeholder="Earn Rewards" /></PropRow>
      <PropRow label="Description"><PropTextarea value={(props.description as string) || ""} onChange={(v) => onChange("description", v)} rows={2} /></PropRow>
      <PropRow label="Points label"><PropInput value={(props.pointsLabel as string) || ""} onChange={(v) => onChange("pointsLabel", v)} placeholder="Points" /></PropRow>
      <PropRow label="Bg color"><PropColorInput value={(props.backgroundColor as string) || "#f0fdf4"} onChange={(v) => onChange("backgroundColor", v)} /></PropRow>
      <PropRow label="Text color"><PropColorInput value={(props.textColor as string) || "#166534"} onChange={(v) => onChange("textColor", v)} /></PropRow>
    </>
  );
}

// ─── DnD canvas components ────────────────────────────────────────────────────

const GAP_MAP: Record<string, string> = { small: "8px", medium: "16px", large: "24px" };

interface CanvasElementProps {
  el: SiteElement;
  idx: number;
  total: number;
  selectedId: string | null;
  overLayoutId: string | null;
  parentId: string | null;
  products: Product[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onAddChild: (layoutId: string) => void;
  updateProp: (id: string, key: string, value: unknown) => void;
}

function CanvasElement({ el, idx, total, selectedId, overLayoutId, parentId, products, onSelect, onDelete, onDuplicate, onMove, onAddChild, updateProp }: CanvasElementProps) {
  const isLayout = el.type === "layout" || el.type === "container";
  const isSelected = selectedId === el.id;
  const isDropTarget = overLayoutId === el.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: el.id,
    data: { source: "canvas", parentId: parentId ?? "root", isLayout },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const noPad = ["nav", "hero", "footer", "divider", "spacer"].includes(el.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group cursor-pointer",
        isSelected && "outline outline-2 outline-blue-500 outline-offset-[-2px] z-10",
        isLayout && isDropTarget && !isSelected && "outline outline-2 outline-dashed outline-blue-400 z-10",
      )}
      onClick={(e) => { e.stopPropagation(); onSelect(el.id); }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 rounded bg-white/80 border border-border shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Hover/select overlay */}
      <div className={cn("absolute inset-0 z-10 pointer-events-none", selectedId !== el.id && "group-hover:ring-1 group-hover:ring-blue-300 group-hover:ring-inset")} />

      {/* Element controls */}
      <div className={cn("absolute top-1 right-1 z-20 flex gap-0.5", isSelected ? "flex" : "hidden group-hover:flex")}>
        {parentId === null && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onMove(el.id, "up"); }} disabled={idx === 0} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
            <button onClick={(e) => { e.stopPropagation(); onMove(el.id, "down"); }} disabled={idx === total - 1} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
          </>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(el.id); }} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(el.id); }} className="p-1 rounded bg-white border border-border shadow-sm text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
      </div>

      {/* Type badge */}
      {isSelected && (
        <div className="absolute top-1 left-6 z-20 px-1.5 py-0.5 text-[10px] font-medium bg-blue-500 text-white rounded-sm">{el.type}</div>
      )}

      {/* Content */}
      {isLayout ? (
        <LayoutDropZone
          el={el}
          isSelected={isSelected}
          isDropTarget={isDropTarget}
          selectedId={selectedId}
          overLayoutId={overLayoutId}
          products={products}
          onSelect={onSelect}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMove={onMove}
          onAddChild={onAddChild}
          updateProp={updateProp}
        />
      ) : (
        <div style={{ padding: noPad ? 0 : "0.75rem" }}>
          <SiteElementRenderer element={el} products={products} />
        </div>
      )}
    </div>
  );
}

function LayoutDropZone({
  el, isSelected, isDropTarget, selectedId, overLayoutId, products, onSelect, onDelete, onDuplicate, onMove, onAddChild, updateProp,
}: {
  el: SiteElement; isSelected: boolean; isDropTarget: boolean; selectedId: string | null; overLayoutId: string | null;
  products: Product[]; onSelect: (id: string) => void; onDelete: (id: string) => void;
  onDuplicate: (id: string) => void; onMove: (id: string, dir: "up" | "down") => void;
  onAddChild: (layoutId: string) => void; updateProp: (id: string, key: string, value: unknown) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `layout-drop-${el.id}`,
    data: { type: "layout-drop", layoutId: el.id },
  });

  const children = el.children ?? [];
  const dir = (el.props.direction as string) || "stack";
  const spacing = (el.props.spacing as string) || "medium";
  const gridCols = Number(el.props.columns) || 2;

  const containerStyle: React.CSSProperties = {
    backgroundColor: (el.props.backgroundColor as string) || undefined,
    padding: (el.props.padding as string) || "1rem",
    minHeight: "80px",
  };
  if (dir === "row") {
    containerStyle.display = "flex";
    containerStyle.flexDirection = "row";
    containerStyle.flexWrap = "wrap";
    containerStyle.gap = GAP_MAP[spacing] ?? spacing;
    containerStyle.alignItems = (el.props.align as string) || "flex-start";
  } else if (dir === "grid") {
    containerStyle.display = "grid";
    containerStyle.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
    containerStyle.gap = GAP_MAP[spacing] ?? spacing;
  } else {
    containerStyle.display = "flex";
    containerStyle.flexDirection = "column";
    containerStyle.gap = GAP_MAP[spacing] ?? spacing;
  }

  return (
    <div
      ref={setNodeRef}
      style={containerStyle}
      className={cn(
        "transition-colors relative",
        (isOver || isDropTarget) && "bg-blue-50/50",
        children.length === 0 && "border-2 border-dashed border-stone-200",
        isSelected && children.length === 0 && "border-blue-300",
      )}
    >
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.map((child, cidx) => (
          <CanvasElement
            key={child.id}
            el={child}
            idx={cidx}
            total={children.length}
            selectedId={selectedId}
            overLayoutId={overLayoutId}
            parentId={el.id}
            products={products}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onMove={onMove}
            onAddChild={onAddChild}
            updateProp={updateProp}
          />
        ))}
      </SortableContext>
      {children.length === 0 && (
        <div className="flex flex-col items-center justify-center py-4 gap-1">
          <p className="text-[11px] text-muted-foreground/50">Drop elements here</p>
          {isSelected && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(el.id); }}
              className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" /> Add element
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Draggable palette item
function DraggablePaletteItem({ item, onAdd }: { item: { label: string; icon: React.ReactNode; type: ElementType }; onAdd: (type: ElementType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { source: "palette", elementType: item.type },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onAdd(item.type)}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border/80 transition-colors text-center cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-40",
      )}
    >
      {item.icon}
      <span className="text-[10px] leading-tight">{item.label}</span>
    </div>
  );
}

// Draggable library card
function DraggableLibraryCard({ comp, onInsert, onDelete }: { comp: SiteComponent; onInsert: (comp: SiteComponent) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${comp.id}`,
    data: { source: "library", comp },
  });

  // Mini preview text
  const preview = (() => {
    const t = comp.elementData.type;
    const p = comp.elementData.props;
    if (t === "text") return String(p.content || "").slice(0, 40) || "Text";
    if (t === "button") return String(p.label || "Button");
    if (t === "image") return String(p.alt || "Image");
    if (t === "layout" || t === "container") return `Layout · ${(comp.elementData.children ?? []).length} children`;
    if (t === "hero") return String(p.title || "Hero");
    return t.replace(/-/g, " ");
  })();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group flex items-start gap-2 rounded border border-border p-2 hover:bg-muted cursor-grab active:cursor-grabbing transition-colors select-none",
        isDragging && "opacity-40",
      )}
      onClick={() => onInsert(comp)}
      title={`Insert "${comp.name}"`}
    >
      <BookMarked className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{comp.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{preview}{comp.category ? ` · ${comp.category}` : ""}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(comp.id); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({
  element, onChange, products, orgId, onSaveToLibrary, onApplyFromLibrary, savedComponents,
}: {
  element: SiteElement;
  onChange: (k: string, v: unknown) => void;
  products: Product[];
  orgId: string;
  onSaveToLibrary: () => void;
  onApplyFromLibrary: (comp: SiteComponent) => void;
  savedComponents: SiteComponent[];
}) {
  const [showApplyPicker, setShowApplyPicker] = useState(false);
  const typeLabels: Record<string, string> = {
    text: "Text", image: "Image", button: "Button", hero: "Hero", nav: "Navigation",
    footer: "Footer", divider: "Divider", spacer: "Spacer", layout: "Layout", container: "Layout",
    columns: "Columns", "product-card": "Product Card", "booking-form": "Booking Form",
    "coupon-banner": "Coupon Banner", "pricing-table": "Pricing Table", testimonial: "Testimonial",
    faq: "FAQ", gallery: "Gallery", "custom-html": "Custom HTML", "login-form": "Login Form",
    "code-block": "Code Block", "membership-widget": "Membership Widget",
    cart: "Cart", checkout: "Checkout", reward: "Reward", icon: "Icon",
  };

  const compatibleComponents = savedComponents.filter(
    (c) => c.elementData.type === element.type
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Properties</span>
            <p className="text-xs font-medium mt-0.5">{typeLabels[element.type] || element.type}</p>
          </div>
          <div className="flex items-center gap-1">
            {compatibleComponents.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowApplyPicker((p) => !p)}
                  title="Apply from Library"
                  className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Paintbrush className="h-3 w-3" />
                </button>
                {showApplyPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded border border-border bg-background shadow-md py-1">
                    <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border mb-1">Apply from Library</p>
                    {compatibleComponents.map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => { onApplyFromLibrary(comp); setShowApplyPicker(false); }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted text-left"
                      >
                        <BookMarked className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{comp.name}</span>
                        {comp.category && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{comp.category}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onSaveToLibrary}
              title="Save to Library"
              className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <BookMarked className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {element.type === "text"          && <TextProps props={element.props} onChange={onChange} />}
        {element.type === "image"         && <ImageProps props={element.props} onChange={onChange} orgId={orgId} />}
        {element.type === "button"        && <ButtonProps props={element.props} onChange={onChange} />}
        {element.type === "hero"          && <HeroProps props={element.props} onChange={onChange} orgId={orgId} />}
        {element.type === "nav"           && <NavProps props={element.props} onChange={onChange} />}
        {element.type === "footer"        && <FooterProps props={element.props} onChange={onChange} />}
        {element.type === "divider"       && <DividerProps props={element.props} onChange={onChange} />}
        {element.type === "spacer"        && <SpacerProps props={element.props} onChange={onChange} />}
        {(element.type === "layout" || element.type === "container") && <LayoutProps props={element.props} onChange={onChange} />}
        {element.type === "columns"       && <ColumnsProps props={element.props} onChange={onChange} />}
        {element.type === "product-card"  && <ProductCardProps props={element.props} onChange={onChange} products={products} />}
        {element.type === "booking-form"  && <BookingFormProps props={element.props} onChange={onChange} />}
        {element.type === "coupon-banner" && <CouponProps props={element.props} onChange={onChange} />}
        {element.type === "pricing-table" && <PricingProps props={element.props} onChange={onChange} />}
        {element.type === "testimonial"   && <TestimonialProps props={element.props} onChange={onChange} />}
        {element.type === "faq"           && <FaqProps props={element.props} onChange={onChange} />}
        {element.type === "gallery"       && <GalleryProps props={element.props} onChange={onChange} orgId={orgId} />}
        {element.type === "custom-html"        && <HtmlProps props={element.props} onChange={onChange} />}
        {element.type === "login-form"         && <LoginFormProps props={element.props} onChange={onChange} />}
        {element.type === "code-block"         && <CodeBlockProps props={element.props} onChange={onChange} />}
        {element.type === "membership-widget"  && <MembershipWidgetProps props={element.props} onChange={onChange} />}
        {element.type === "cart"               && <CartProps props={element.props} onChange={onChange} />}
        {element.type === "checkout"           && <CheckoutProps props={element.props} onChange={onChange} />}
        {element.type === "reward"             && <RewardProps props={element.props} onChange={onChange} />}
        {element.type === "icon"               && <IconProps props={element.props} onChange={onChange} />}
        <StyleProps props={element.props} onChange={onChange} />
      </div>
    </div>
  );
}

// ─── Theme editor modal ────────────────────────────────────────────────────────

// ─── Theme presets ────────────────────────────────────────────────────────────

const THEME_PRESETS: (SiteTheme & { presetName: string })[] = [
  { presetName: "Default",     primary: "#18181b", secondary: "#71717a", accent: "#3b82f6", background: "#ffffff", text: "#09090b", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 6  },
  { presetName: "Modern Dark", primary: "#3b82f6", secondary: "#6b7280", accent: "#60a5fa", background: "#09090b", text: "#f9fafb", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 8  },
  { presetName: "Warm Earth",  primary: "#92400e", secondary: "#a16207", accent: "#d97706", background: "#fefce8", text: "#1c1917", headingFont: "Georgia, serif",             bodyFont: "Inter, sans-serif",          borderRadius: 4  },
  { presetName: "Ocean",       primary: "#0369a1", secondary: "#64748b", accent: "#06b6d4", background: "#f0f9ff", text: "#0c4a6e", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 8  },
  { presetName: "Forest",      primary: "#166534", secondary: "#4b7c5e", accent: "#22c55e", background: "#f0fdf4", text: "#14532d", headingFont: "Georgia, serif",             bodyFont: "Inter, sans-serif",          borderRadius: 6  },
  { presetName: "Sunset",      primary: "#c2410c", secondary: "#9a3412", accent: "#f97316", background: "#fff7ed", text: "#1c1917", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 10 },
  { presetName: "Minimal",     primary: "#000000", secondary: "#737373", accent: "#000000", background: "#ffffff", text: "#000000", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 0  },
  { presetName: "Lavender",    primary: "#7c3aed", secondary: "#a78bfa", accent: "#8b5cf6", background: "#faf5ff", text: "#2e1065", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 12 },
  { presetName: "Coffee",      primary: "#6f4e37", secondary: "#a0785a", accent: "#c9956c", background: "#fdf8f0", text: "#2d1b0e", headingFont: "Georgia, serif",             bodyFont: "Inter, sans-serif",          borderRadius: 6  },
  { presetName: "Neon",        primary: "#a3e635", secondary: "#4b5563", accent: "#facc15", background: "#030712", text: "#f9fafb", headingFont: "'Courier New', monospace",  bodyFont: "'Courier New', monospace",   borderRadius: 4  },
  { presetName: "Pastel",      primary: "#f9a8d4", secondary: "#a5b4fc", accent: "#86efac", background: "#fdf4ff", text: "#374151", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 16 },
  { presetName: "Corporate",   primary: "#1e3a5f", secondary: "#4b6a8a", accent: "#2563eb", background: "#f8fafc", text: "#1e293b", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 4  },
  { presetName: "Candy",       primary: "#db2777", secondary: "#ec4899", accent: "#f472b6", background: "#fff0f6", text: "#831843", headingFont: "Inter, sans-serif",          bodyFont: "Inter, sans-serif",          borderRadius: 20 },
  { presetName: "Retro",       primary: "#854d0e", secondary: "#a16207", accent: "#ca8a04", background: "#fefce8", text: "#1c1917", headingFont: "'Courier New', monospace",  bodyFont: "'Courier New', monospace",   borderRadius: 0  },
];

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
          {/* Presets */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Browse Presets</p>
            <div className="grid grid-cols-2 gap-1.5">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.presetName}
                  onClick={() => setDraft({ ...preset })}
                  className={cn(
                    "flex items-center gap-2 rounded border p-2 text-left transition-colors hover:bg-muted",
                    draft.presetName === preset.presetName ? "border-foreground" : "border-border"
                  )}
                >
                  {/* Color swatches */}
                  <div className="flex gap-0.5 shrink-0">
                    {[preset.background, preset.primary, preset.accent].map((c, i) => (
                      <div key={i} className="h-4 w-2 rounded-sm border border-black/10" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[11px] truncate">{preset.presetName}</span>
                </button>
              ))}
            </div>
          </div>
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
  const openSidebar = useSidebarOpen();

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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedComponents, setSavedComponents] = useState<SiteComponent[]>([]);
  const [leftTab, setLeftTab] = useState<"elements" | "library">("elements");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");
  const [saveDialogCategory, setSaveDialogCategory] = useState("");
  const [savingComponent, setSavingComponent] = useState(false);
  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overLayoutId, setOverLayoutId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<{ source: string; elementType?: ElementType; comp?: SiteComponent; element?: SiteElement } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  // Load saved components when orgId is available
  useEffect(() => {
    if (!organizationId) return;
    getSavedComponents(organizationId)
      .then(setSavedComponents)
      .catch(console.error);
  }, [organizationId]);

  // Save selected element to component library
  const handleSaveToLibrary = async () => {
    const el = elements.find((e) => e.id === selectedId);
    if (!el || !organizationId || !siteId) return;
    setSavingComponent(true);
    try {
      const { data: { user } } = await createClient().auth.getUser();
      const comp = await saveComponent(
        organizationId,
        siteId,
        saveDialogName.trim() || el.type,
        saveDialogCategory.trim() || null,
        el,
        user?.id ?? ""
      );
      setSavedComponents((prev) => [comp, ...prev]);
      setShowSaveDialog(false);
      setSaveDialogName("");
      setSaveDialogCategory("");
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      console.error("Failed to save component:", err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSavingComponent(false);
    }
  };

  // Insert a saved component onto the canvas (deep copy with new IDs)
  const insertFromLibrary = (comp: SiteComponent) => {
    const el = deepCopyElement(comp.elementData);
    const idx = selectedId ? elements.findIndex((e) => e.id === selectedId) : -1;
    const newEls = idx >= 0
      ? [...elements.slice(0, idx + 1), el, ...elements.slice(idx + 1)]
      : [...elements, el];
    setElements(newEls);
    setSelectedId(el.id);
    setDirty(true);
  };

  // Apply library component style to selected element (keep ID, replace props/children)
  const applyFromLibrary = (comp: SiteComponent) => {
    if (!selectedId) return;
    setElements((prev) => updateInTree(prev, selectedId, (el) => ({
      ...el,
      props: { ...comp.elementData.props },
      children: comp.elementData.children,
    })));
    setDirty(true);
  };

  // Delete a saved component
  const handleDeleteComponent = async (id: string) => {
    if (!confirm("Delete this saved component?")) return;
    try {
      await deleteComponent(id);
      setSavedComponents((prev) => prev.filter((c) => c.id !== id));
      if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
    } catch (err) {
      console.error("Failed to delete component:", err);
    }
  };

  // Sync elements when page changes
  const handlePageSwitch = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    setActivePageId(pageId);
    setElements(page.elements ?? []);
    setSelectedId(null);
    setDirty(false);
  };

  // Auto-save (debounced) — tracks a revision counter so every edit resets the timer
  const elementsRef = useRef(elements);
  const activePageIdRef = useRef(activePageId);
  elementsRef.current = elements;
  activePageIdRef.current = activePageId;

  const [saveRevision, setSaveRevision] = useState(0);
  const saveRetries = useRef(0);

  // Bump revision whenever elements change and dirty is true
  const prevElementsRef = useRef(elements);
  useEffect(() => {
    if (elements !== prevElementsRef.current && dirty) {
      setSaveRevision((r) => r + 1);
    }
    prevElementsRef.current = elements;
  }, [elements, dirty]);

  useEffect(() => {
    if (!dirty) { saveRetries.current = 0; return; }
    if (saveRetries.current >= 3) {
      console.warn("Auto-save: giving up after 3 retries");
      return;
    }
    const timer = setTimeout(async () => {
      const pageId = activePageIdRef.current;
      const els = elementsRef.current;
      if (!pageId) return;
      setSaving(true);
      try {
        await updatePage(pageId, { elements: els });
        setPages((prev) => prev.map((p) => p.id === pageId ? { ...p, elements: els } : p));
        setDirty(false);
        setSavedAt(Date.now());
        saveRetries.current = 0;
      } catch (err) {
        console.error("Auto-save failed:", err);
        saveRetries.current += 1;
        if (saveRetries.current >= 3) setDirty(false);
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, saveRevision]);

  // Element operations (tree-aware for nested layout support)
  const addElement = (type: ElementType) => {
    const el: SiteElement = { id: uid(), type, props: defaultProps(type) };
    if (type === "layout") el.children = [];
    const idx = selectedId ? elements.findIndex((e) => e.id === selectedId) : -1;
    const newEls = idx >= 0 ? [...elements.slice(0, idx + 1), el, ...elements.slice(idx + 1)] : [...elements, el];
    setElements(newEls);
    setSelectedId(el.id);
    setDirty(true);
  };

  const addChildElement = (layoutId: string) => {
    const el: SiteElement = { id: uid(), type: "text", props: defaultProps("text") };
    setElements((prev) => addToLayout(prev, layoutId, el));
    setSelectedId(el.id);
    setDirty(true);
  };

  const deleteElement = (id: string) => {
    const [newRoots] = removeFromTree(elements, id);
    setElements(newRoots);
    setSelectedId(null);
    setDirty(true);
  };

  const duplicateElement = (id: string) => {
    const el = findInTree(elements, id);
    if (!el) return;
    const clone = deepCopyElement(el);
    // Find parent context and insert after
    const parentId = findParentId(elements, id);
    if (parentId === null) {
      // Root level
      const idx = elements.findIndex((e) => e.id === id);
      const newEls = [...elements.slice(0, idx + 1), clone, ...elements.slice(idx + 1)];
      setElements(newEls);
    } else {
      // Inside a layout
      setElements((prev) => updateInTree(prev, parentId, (layout) => {
        const children = [...(layout.children ?? [])];
        const idx = children.findIndex((c) => c.id === id);
        children.splice(idx + 1, 0, clone);
        return { ...layout, children };
      }));
    }
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
    setElements((prev) => updateInTree(prev, id, (el) => ({ ...el, props: { ...el.props, [key]: value } })));
    setDirty(true);
  };

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as { source: string; elementType?: ElementType; comp?: SiteComponent; parentId?: string } | undefined;
    setActiveId(active.id as string);
    const el = data?.source === "canvas" ? findInTree(elements, active.id as string) : undefined;
    setActiveDragData({
      source: data?.source ?? "canvas",
      elementType: data?.elementType,
      comp: data?.comp,
      element: el ?? undefined,
    });
  }, [elements]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverLayoutId(null); return; }
    const overData = over.data.current as { type?: string; layoutId?: string } | undefined;
    if (overData?.type === "layout-drop") {
      setOverLayoutId(overData.layoutId ?? null);
    } else {
      setOverLayoutId(null);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverLayoutId(null);
    setActiveDragData(null);

    if (!over) return;

    const activeData = active.data.current as { source: string; elementType?: ElementType; comp?: SiteComponent; parentId?: string; isLayout?: boolean } | undefined;
    const overData = over.data.current as { type?: string; layoutId?: string; source?: string; parentId?: string } | undefined;

    // From palette → canvas
    if (activeData?.source === "palette" && activeData.elementType) {
      const el: SiteElement = { id: uid(), type: activeData.elementType, props: defaultProps(activeData.elementType) };
      if (activeData.elementType === "layout") el.children = [];
      if (overData?.type === "layout-drop") {
        setElements((prev) => addToLayout(prev, overData.layoutId!, el));
      } else {
        // Insert at root, near the drop target
        const overIdx = elements.findIndex((e) => e.id === over.id);
        setElements((prev) => {
          const idx = overIdx >= 0 ? overIdx + 1 : prev.length;
          return [...prev.slice(0, idx), el, ...prev.slice(idx)];
        });
      }
      setSelectedId(el.id);
      setDirty(true);
      return;
    }

    // From library → canvas
    if (activeData?.source === "library" && activeData.comp) {
      const el = deepCopyElement(activeData.comp.elementData);
      if (overData?.type === "layout-drop") {
        setElements((prev) => addToLayout(prev, overData.layoutId!, el));
      } else {
        const overIdx = elements.findIndex((e) => e.id === over.id);
        setElements((prev) => {
          const idx = overIdx >= 0 ? overIdx + 1 : prev.length;
          return [...prev.slice(0, idx), el, ...prev.slice(idx)];
        });
      }
      setSelectedId(el.id);
      setDirty(true);
      return;
    }

    // Canvas element reorder/move
    if (active.id === over.id) return;

    const activeParent = activeData?.parentId ?? "root";

    // Dropped into a layout drop zone
    if (overData?.type === "layout-drop") {
      const layoutId = overData.layoutId!;
      if (activeParent === layoutId) return; // already in this layout
      const [newRoots, removed] = removeFromTree(elements, active.id as string);
      if (!removed) return;
      setElements(addToLayout(newRoots, layoutId, removed));
      setDirty(true);
      return;
    }

    const overParent = overData?.parentId ?? "root";

    if (activeParent === overParent) {
      // Same list reorder
      if (activeParent === "root") {
        const oldIdx = elements.findIndex((e) => e.id === active.id);
        const newIdx = elements.findIndex((e) => e.id === over.id);
        if (oldIdx !== -1 && newIdx !== -1) {
          setElements(arrayMove(elements, oldIdx, newIdx));
          setDirty(true);
        }
      } else {
        setElements((prev) => updateInTree(prev, activeParent, (layout) => {
          const children = [...(layout.children ?? [])];
          const oldIdx = children.findIndex((c) => c.id === active.id);
          const newIdx = children.findIndex((c) => c.id === over.id);
          if (oldIdx === -1 || newIdx === -1) return layout;
          return { ...layout, children: arrayMove(children, oldIdx, newIdx) };
        }));
        setDirty(true);
      }
    } else {
      // Cross-list move
      const [newRoots, removed] = removeFromTree(elements, active.id as string);
      if (!removed) return;
      if (overParent === "root") {
        const overIdx = newRoots.findIndex((e) => e.id === over.id);
        const insertIdx = overIdx >= 0 ? overIdx + 1 : newRoots.length;
        setElements([...newRoots.slice(0, insertIdx), removed, ...newRoots.slice(insertIdx)]);
      } else {
        setElements(addToLayout(newRoots, overParent, removed));
      }
      setDirty(true);
    }
  }, [elements]);

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

  const selectedElement = findInTree(elements, selectedId ?? "");

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
    <ThemeContext.Provider value={site?.theme ?? null}>
    <div className="flex flex-col h-screen overflow-hidden bg-muted/20">
      {/* ── Toolbar ── */}
      <header className="flex items-center gap-2 px-3 h-11 border-b border-border bg-background shrink-0">
        <button
          onClick={openSidebar}
          className="text-muted-foreground hover:text-foreground mr-1 p-0.5 rounded hover:bg-muted"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
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
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {!saving && savedAt && !dirty && (
            <span
              key={savedAt}
              className="text-[10px] text-green-600 animate-[fadeout_2s_ease-in-out_forwards]"
              style={{ animation: "fadeout 2s ease-in-out forwards" }}
            >
              Saved
            </span>
          )}
          {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
          <button
            onClick={() => setShowTheme(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
          >
            <Palette className="h-3.5 w-3.5" /> Theme
          </button>
          <Link
            href={`/builder/${siteId}/membership`}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
          >
            <CreditCard className="h-3.5 w-3.5" /> Members
          </Link>
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
        {/* Left: Element palette + Library */}
        <aside className="w-48 border-r border-border bg-background overflow-hidden shrink-0 flex flex-col">
          {/* Tab switcher */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setLeftTab("elements")}
              className={cn("flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors", leftTab === "elements" ? "bg-background text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:bg-muted/50")}
            >
              <Blocks className="h-3 w-3" /> Elements
            </button>
            <button
              onClick={() => setLeftTab("library")}
              className={cn("flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors", leftTab === "library" ? "bg-background text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:bg-muted/50")}
            >
              <Library className="h-3 w-3" /> Library
              {savedComponents.length > 0 && (
                <span className="ml-0.5 rounded-full bg-foreground text-background text-[9px] px-1 leading-4">{savedComponents.length}</span>
              )}
            </button>
          </div>

          {/* Elements tab */}
          {leftTab === "elements" && (
            <div className="flex-1 overflow-y-auto">
              {PALETTE.map((group, gi) => (
                <div key={gi}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border/50">
                    {PALETTE_LABELS[gi]}
                  </div>
                  <div className="p-1.5 grid grid-cols-2 gap-1">
                    {group.map((item) => (
                      <DraggablePaletteItem key={item.type} item={item} onAdd={addElement} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Library tab */}
          {leftTab === "library" && (
            <div className="flex-1 overflow-y-auto">
              {savedComponents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-3 py-8">
                  <Library className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-[11px] text-muted-foreground">No saved components yet</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Select an element and click Save to Library</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-1">
                  {savedComponents.map((comp) => (
                    <DraggableLibraryCard
                      key={comp.id}
                      comp={comp}
                      onInsert={insertFromLibrary}
                      onDelete={handleDeleteComponent}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center: Canvas (DnD-enabled) */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <main
            className="flex-1 overflow-y-auto bg-stone-100"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            {elements.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-full text-center px-8 py-16">
                <Globe className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Empty page</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Click or drag elements from the left panel</p>
              </div>
            ) : (
              <div className="bg-white min-h-full shadow-sm mx-auto" style={{ maxWidth: "900px" }}>
                {/* Load theme fonts so the canvas preview is accurate */}
                {site.theme && (() => {
                  const url = buildGoogleFontsUrl([site.theme.headingFont, site.theme.bodyFont]);
                  // eslint-disable-next-line @next/next/no-page-custom-font
                  return url ? <link rel="stylesheet" href={url} /> : null;
                })()}
                <SortableContext items={elements.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {elements.map((el, idx) => (
                    <CanvasElement
                      key={el.id}
                      el={el}
                      idx={idx}
                      total={elements.length}
                      selectedId={selectedId}
                      overLayoutId={overLayoutId}
                      parentId={null}
                      products={products}
                      onSelect={setSelectedId}
                      onDelete={deleteElement}
                      onDuplicate={duplicateElement}
                      onMove={moveElement}
                      onAddChild={addChildElement}
                      updateProp={updateElementProp}
                    />
                  ))}
                </SortableContext>
              </div>
            )}
          </main>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeDragData?.source === "canvas" && activeDragData.element ? (
              <div className="opacity-70 shadow-xl pointer-events-none scale-95 bg-white rounded border border-blue-300" style={{ maxWidth: "860px" }}>
                <div style={{ padding: ["nav", "hero", "footer", "divider", "spacer"].includes(activeDragData.element.type) ? 0 : "0.75rem" }}>
                  <SiteElementRenderer element={activeDragData.element} products={products} />
                </div>
              </div>
            ) : activeDragData?.source === "palette" && activeDragData.elementType ? (
              <div className="flex items-center gap-2 bg-white border border-blue-300 px-3 py-2 rounded-sm shadow-lg text-sm font-medium text-blue-700">
                <Plus className="h-4 w-4" />
                <span>{PALETTE.flat().find((p) => p.type === activeDragData.elementType)?.label ?? activeDragData.elementType}</span>
              </div>
            ) : activeDragData?.source === "library" && activeDragData.comp ? (
              <div className="flex items-center gap-2 bg-white border border-stone-200 px-3 py-2 rounded-sm shadow-lg text-sm">
                <BookMarked className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{activeDragData.comp.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Right: Properties panel */}
        <aside className="w-60 border-l border-border bg-background overflow-hidden shrink-0 flex flex-col">
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              onChange={(k, v) => updateElementProp(selectedElement.id, k, v)}
              products={products}
              orgId={organizationId ?? ""}
              onSaveToLibrary={() => { setSaveDialogName(selectedElement.type); setShowSaveDialog(true); }}
              onApplyFromLibrary={applyFromLibrary}
              savedComponents={savedComponents}
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

      {/* Save to Library dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSaveDialog(false)} />
          <div className="relative bg-background border border-border rounded-sm w-full max-w-xs shadow-lg z-10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm flex items-center gap-2"><BookMarked className="h-4 w-4" /> Save to Library</h2>
              <button onClick={() => setShowSaveDialog(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Component name</label>
                <input
                  autoFocus
                  type="text"
                  value={saveDialogName}
                  onChange={(e) => setSaveDialogName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveToLibrary(); }}
                  placeholder="My Button Style"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Category <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={saveDialogCategory}
                  onChange={(e) => setSaveDialogCategory(e.target.value)}
                  placeholder="e.g. Buttons, Heroes, Cards"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowSaveDialog(false)} className="flex-1 rounded border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={handleSaveToLibrary}
                disabled={savingComponent || !saveDialogName.trim()}
                className="flex-1 rounded bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingComponent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ThemeContext.Provider>
  );
}
