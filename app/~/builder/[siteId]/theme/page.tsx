"use client";

import { useState, useEffect, use, useRef, useMemo } from "react";
import { hapticLight } from "@/lib/haptics";
import { ProductCard } from "@/components/site-elements/product-card";
import { BookingForm } from "@/components/site-elements/booking-form";
import { CouponBanner } from "@/components/site-elements/coupon-banner";
import { PricingTable } from "@/components/site-elements/pricing-table";
import { Testimonial } from "@/components/site-elements/testimonial";
import { buildGoogleFontsUrl } from "@/components/site-renderer";
import type { SiteTheme } from "@/lib/types";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// ─── Font options ───────────────────────────────────────────────────────────

interface FontOption {
  label: string;
  value: string;  // CSS font-family value
  google: boolean; // true = load via Google Fonts
}

const GOOGLE_FONT_LIST: FontOption[] = [
  { label: "Inter",              value: "Inter, sans-serif",              google: true },
  { label: "Poppins",            value: "Poppins, sans-serif",            google: true },
  { label: "Montserrat",         value: "Montserrat, sans-serif",         google: true },
  { label: "Roboto",             value: "Roboto, sans-serif",             google: true },
  { label: "Open Sans",          value: "Open Sans, sans-serif",          google: true },
  { label: "Lato",               value: "Lato, sans-serif",               google: true },
  { label: "Raleway",            value: "Raleway, sans-serif",            google: true },
  { label: "Nunito",             value: "Nunito, sans-serif",             google: true },
  { label: "Work Sans",          value: "Work Sans, sans-serif",          google: true },
  { label: "DM Sans",            value: "DM Sans, sans-serif",            google: true },
  { label: "Outfit",             value: "Outfit, sans-serif",             google: true },
  { label: "Space Grotesk",      value: "Space Grotesk, sans-serif",      google: true },
  { label: "Plus Jakarta Sans",  value: "Plus Jakarta Sans, sans-serif",  google: true },
  { label: "Manrope",            value: "Manrope, sans-serif",            google: true },
  { label: "Figtree",            value: "Figtree, sans-serif",            google: true },
  { label: "Mulish",             value: "Mulish, sans-serif",             google: true },
  { label: "Rubik",              value: "Rubik, sans-serif",              google: true },
  { label: "Karla",              value: "Karla, sans-serif",              google: true },
  { label: "Cabin",              value: "Cabin, sans-serif",              google: true },
  { label: "Barlow",             value: "Barlow, sans-serif",             google: true },
  { label: "Quicksand",          value: "Quicksand, sans-serif",          google: true },
  { label: "Josefin Sans",       value: "Josefin Sans, sans-serif",       google: true },
  { label: "Oswald",             value: "Oswald, sans-serif",             google: true },
  { label: "PT Sans",            value: "PT Sans, sans-serif",            google: true },
  { label: "Source Sans 3",      value: "Source Sans 3, sans-serif",      google: true },
  // Serif
  { label: "Playfair Display",   value: "Playfair Display, serif",        google: true },
  { label: "Lora",               value: "Lora, serif",                    google: true },
  { label: "Merriweather",       value: "Merriweather, serif",            google: true },
  { label: "Libre Baskerville",  value: "Libre Baskerville, serif",       google: true },
  { label: "Crimson Text",       value: "Crimson Text, serif",            google: true },
  { label: "Bitter",             value: "Bitter, serif",                  google: true },
];

const SYSTEM_FONT_LIST: FontOption[] = [
  { label: "Georgia (Serif)",     value: "Georgia, serif",                    google: false },
  { label: "Courier New (Mono)",  value: "Courier New, monospace",            google: false },
  { label: "System UI",           value: "system-ui, sans-serif",             google: false },
  { label: "Helvetica",           value: "Helvetica Neue, Helvetica, sans-serif", google: false },
];

const FONT_OPTIONS: FontOption[] = [...GOOGLE_FONT_LIST, ...SYSTEM_FONT_LIST];

// Build a Google Fonts URL that loads ALL Google fonts for dropdown preview
function buildAllPreviewFontsUrl(): string {
  const names = GOOGLE_FONT_LIST.map((f) => f.value.split(",")[0].trim());
  const query = names.map((n) => `family=${encodeURIComponent(n)}:wght@400;700`).join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

const ALL_PREVIEW_FONTS_URL = buildAllPreviewFontsUrl();

// ─── Presets ───────────────────────────────────────────────────────────────

const PRESETS: Record<string, SiteTheme> = {
  "Modern Dark": {
    primary: "#fafafa",
    secondary: "#a1a1aa",
    accent: "#6366f1",
    background: "#09090b",
    text: "#fafafa",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    borderRadius: 4,
    presetName: "Modern Dark",
  },
  "Clean Light": {
    primary: "#18181b",
    secondary: "#71717a",
    accent: "#2563eb",
    background: "#ffffff",
    text: "#18181b",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    borderRadius: 6,
    presetName: "Clean Light",
  },
  "Warm Coffee": {
    primary: "#292524",
    secondary: "#78716c",
    accent: "#b45309",
    background: "#fdf6ee",
    text: "#292524",
    headingFont: "Playfair Display, serif",
    bodyFont: "Lato, sans-serif",
    borderRadius: 4,
    presetName: "Warm Coffee",
  },
  "Ocean Blue": {
    primary: "#0f172a",
    secondary: "#64748b",
    accent: "#0891b2",
    background: "#f0f9ff",
    text: "#0f172a",
    headingFont: "Montserrat, sans-serif",
    bodyFont: "Open Sans, sans-serif",
    borderRadius: 8,
    presetName: "Ocean Blue",
  },
  "Forest Green": {
    primary: "#14532d",
    secondary: "#4b7c5e",
    accent: "#16a34a",
    background: "#f0fdf4",
    text: "#14532d",
    headingFont: "Lora, serif",
    bodyFont: "Nunito, sans-serif",
    borderRadius: 6,
    presetName: "Forest Green",
  },
  "Minimal Mono": {
    primary: "#000000",
    secondary: "#6b7280",
    accent: "#000000",
    background: "#fafafa",
    text: "#111111",
    headingFont: "Courier New, monospace",
    bodyFont: "Courier New, monospace",
    borderRadius: 0,
    presetName: "Minimal Mono",
  },
};

const DEFAULT_THEME: SiteTheme = PRESETS["Clean Light"];

const PRESET_LABEL_KEYS: Record<string, string> = {
  "Modern Dark": "builder.theme.presetModernDark",
  "Clean Light": "builder.theme.presetCleanLight",
  "Warm Coffee": "builder.theme.presetWarmCoffee",
  "Ocean Blue": "builder.theme.presetOceanBlue",
  "Forest Green": "builder.theme.presetForestGreen",
  "Minimal Mono": "builder.theme.presetMinimalMono",
};

// ─── Color picker row ──────────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
        <div className="relative">
          <div
            className="h-7 w-7 rounded border border-border cursor-pointer"
            style={{ background: value }}
          />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Font selector (custom dropdown that renders each option in its own font) ─

function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = FONT_OPTIONS.find((f) => f.value === value) ?? FONT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border border-border rounded px-2.5 py-1.5 text-sm text-foreground bg-background flex items-center justify-between gap-2 hover:border-muted-foreground transition-colors"
        style={{ fontFamily: value }}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-background border border-border rounded shadow-xl max-h-56 overflow-y-auto">
          {/* Google fonts section */}
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted border-b border-border sticky top-0">
            {t("builder.theme.googleFonts")}
          </div>
          {GOOGLE_FONT_LIST.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { onChange(f.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                value === f.value && "bg-muted"
              )}
              style={{ fontFamily: f.value }}
            >
              {f.label}
              {value === f.value && <Check className="h-3 w-3 text-muted-foreground shrink-0" />}
            </button>
          ))}
          {/* System fonts section */}
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted border-t border-b border-border sticky top-0">
            {t("builder.theme.systemFonts")}
          </div>
          {SYSTEM_FONT_LIST.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { onChange(f.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-sm hover:bg-muted transition-colors flex items-center justify-between",
                value === f.value && "bg-muted"
              )}
              style={{ fontFamily: f.value }}
            >
              {f.label}
              {value === f.value && <Check className="h-3 w-3 text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Live preview mini-site ───────────────────────────────────────────────

function Preview({ theme }: { theme: SiteTheme }) {
  const t = useT();
  // Load fonts for the preview
  const fontsUrl = useMemo(
    () => buildGoogleFontsUrl([theme.headingFont, theme.bodyFont]),
    [theme.headingFont, theme.bodyFont]
  );

  return (
    <div
      style={{
        background: theme.background,
        fontFamily: theme.bodyFont,
        color: theme.text,
        minHeight: "100%",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Load fonts */}
      {fontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={fontsUrl} />
      )}

      {/* Hero */}
      <div
        style={{
          background: `${theme.accent}12`,
          border: `1px solid ${theme.accent}25`,
          borderRadius: theme.borderRadius,
          padding: "24px 20px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: theme.headingFont,
            fontWeight: 800,
            fontSize: 22,
            color: theme.text,
            margin: "0 0 6px",
          }}
        >
          {t("builder.theme.previewBusinessName")}
        </h1>
        <p style={{ fontSize: 13, color: theme.secondary, margin: "0 0 14px" }}>
          {t("builder.theme.previewTagline")}
        </p>
        <button
          style={{
            background: theme.accent,
            color: "#fff",
            border: "none",
            borderRadius: theme.borderRadius,
            padding: "9px 20px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: theme.bodyFont,
            cursor: "pointer",
          }}
        >
          {t("builder.theme.previewButton")}
        </button>
      </div>

      {/* Coupon */}
      <CouponBanner theme={theme} />

      {/* Product card */}
      <div style={{ maxWidth: 260 }}>
        <ProductCard theme={theme} />
      </div>

      {/* Pricing */}
      <PricingTable theme={theme} />

      {/* Testimonials */}
      <Testimonial theme={theme} testimonials={[
        { id: "1", authorName: "Alex R.", rating: 5, content: "My favourite spot in the city. The coffee is exceptional!", date: "2026-03-10" },
        { id: "2", authorName: "Mia L.", rating: 5, content: "Warm, cozy, and delicious. Come for the coffee, stay for the food.", date: "2026-03-28" },
      ]} />

      {/* Booking form */}
      <BookingForm theme={theme} />
    </div>
  );
}

// ─── Theme page ───────────────────────────────────────────────────────────

export default function ThemePage({ params }: { params: Promise<{ siteId: string }> }) {
  const t = useT();
  const { siteId } = use(params);
  const storageKey = `site_theme_${siteId}`;

  const [theme, setTheme] = useState<SiteTheme>(DEFAULT_THEME);
  const [saved, setSaved] = useState(false);
  const [previewTab, setPreviewTab] = useState<"desktop" | "mobile">("desktop");

  // Load persisted theme on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setTheme(JSON.parse(raw) as SiteTheme);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = (partial: Partial<SiteTheme>) => {
    setTheme((t) => ({ ...t, ...partial, presetName: undefined }));
    setSaved(false);
  };

  const applyPreset = (name: string) => {
    hapticLight();
    setTheme({ ...PRESETS[name], presetName: name });
    setSaved(false);
  };

  const save = () => {
    hapticLight();
    try {
      localStorage.setItem(storageKey, JSON.stringify(theme));
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      {/* Preload ALL Google Fonts for dropdown preview */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={ALL_PREVIEW_FONTS_URL} />

      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* ─── Left panel: controls ─────────────────────────────── */}
        <div className="w-72 shrink-0 border-r border-border bg-background flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold tracking-tight">{t("builder.theme.title")}</h2>
            <button
              onClick={save}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                saved
                  ? "bg-green-600 text-white"
                  : "bg-foreground text-background hover:bg-foreground/90"
              }`}
            >
              {saved ? t("builder.theme.saved") : t("builder.theme.save")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
            {/* Presets */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t("builder.theme.presets")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(PRESETS).map(([name, p]) => (
                  <button
                    key={name}
                    onClick={() => applyPreset(name)}
                    className={`text-left px-2.5 py-2 border rounded text-xs font-medium transition-all ${
                      theme.presetName === name
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-muted-foreground text-foreground"
                    }`}
                    style={{ borderRadius: 4 }}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full mr-1.5"
                      style={{ background: p.accent }}
                    />
                    {t(PRESET_LABEL_KEYS[name] ?? name)}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{t("builder.theme.colors")}</p>
              <div className="border border-border rounded divide-y divide-border px-3">
                <ColorRow label={t("builder.theme.background")} value={theme.background} onChange={(v) => update({ background: v })} />
                <ColorRow label={t("builder.theme.text")} value={theme.text} onChange={(v) => update({ text: v })} />
                <ColorRow label={t("builder.theme.accent")} value={theme.accent} onChange={(v) => update({ accent: v })} />
                <ColorRow label={t("builder.theme.secondary")} value={theme.secondary} onChange={(v) => update({ secondary: v })} />
                <ColorRow label={t("builder.theme.primary")} value={theme.primary} onChange={(v) => update({ primary: v })} />
              </div>
            </div>

            {/* Fonts */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t("builder.theme.fonts")}</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("builder.theme.headingFont")}</label>
                  <FontSelect
                    value={theme.headingFont}
                    onChange={(v) => { hapticLight(); update({ headingFont: v }); }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">{t("builder.theme.bodyFont")}</label>
                  <FontSelect
                    value={theme.bodyFont}
                    onChange={(v) => { hapticLight(); update({ bodyFont: v }); }}
                  />
                </div>
              </div>
            </div>

            {/* Border radius */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {t("builder.theme.borderRadius")}
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={theme.borderRadius}
                  onChange={(e) => update({ borderRadius: Number(e.target.value) })}
                  className="flex-1 accent-foreground"
                />
                <span className="font-mono text-xs text-muted-foreground w-8 text-right">{theme.borderRadius}px</span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>{t("builder.theme.sharp")}</span>
                <span>{t("builder.theme.rounded")}</span>
              </div>
            </div>

            {/* Preview tokens */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t("builder.theme.previewTokens")}</p>
              <div className="flex gap-2 flex-wrap">
                {[theme.background, theme.text, theme.accent, theme.secondary, theme.primary].map((c, i) => (
                  <div
                    key={i}
                    className="h-7 w-7 border border-border"
                    style={{ background: c, borderRadius: theme.borderRadius }}
                    title={c}
                  />
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  style={{
                    background: theme.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: theme.borderRadius,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: theme.bodyFont,
                    cursor: "default",
                  }}
                >
                  {t("builder.theme.button")}
                </button>
                <div
                  style={{
                    border: `1px solid ${theme.secondary}40`,
                    borderRadius: theme.borderRadius,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontFamily: theme.headingFont,
                    color: theme.text,
                    background: theme.background,
                  }}
                >
                  {t("builder.theme.card")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right panel: live preview ────────────────────────── */}
        <div className="flex-1 flex flex-col bg-muted overflow-hidden">
          {/* Preview toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background">
            <div className="flex border border-border overflow-hidden rounded">
              {(["desktop", "mobile"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPreviewTab(tab)}
                  className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    previewTab === tab
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t(`builder.theme.${tab}`)}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{t("builder.theme.siteId")} {siteId}</span>
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {t("builder.theme.previewLive")}
            </span>
          </div>

          {/* Preview frame */}
          <div className="flex-1 overflow-auto p-6 flex justify-center">
            <div
              className="overflow-auto border border-border rounded-[0.3rem]"
              style={{
                width: previewTab === "mobile" ? 375 : "100%",
                maxWidth: previewTab === "mobile" ? 375 : 900,
                minHeight: 600,
                background: theme.background,
                borderRadius: 8,
                border: "1px solid #e7e5e4",
              }}
            >
              <Preview theme={theme} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
