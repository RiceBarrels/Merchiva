"use client";

import { useState, useEffect, use } from "react";
import { hapticLight } from "@/lib/haptics";
import { ProductCard } from "@/components/site-elements/product-card";
import { BookingForm } from "@/components/site-elements/booking-form";
import { CouponBanner } from "@/components/site-elements/coupon-banner";
import { PricingTable } from "@/components/site-elements/pricing-table";
import { Testimonial } from "@/components/site-elements/testimonial";
import type { SiteTheme } from "@/lib/types";

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
    headingFont: "Georgia, serif",
    bodyFont: "Inter, sans-serif",
    borderRadius: 4,
    presetName: "Warm Coffee",
  },
  "Ocean Blue": {
    primary: "#0f172a",
    secondary: "#64748b",
    accent: "#0891b2",
    background: "#f0f9ff",
    text: "#0f172a",
    headingFont: "Inter, sans-serif",
    bodyFont: "Inter, sans-serif",
    borderRadius: 8,
    presetName: "Ocean Blue",
  },
  "Forest Green": {
    primary: "#14532d",
    secondary: "#4b7c5e",
    accent: "#16a34a",
    background: "#f0fdf4",
    text: "#14532d",
    headingFont: "Georgia, serif",
    bodyFont: "Inter, sans-serif",
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

const FONT_OPTIONS = [
  { label: "Inter (Sans-serif)", value: "Inter, sans-serif" },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Courier New (Mono)", value: "Courier New, monospace" },
  { label: "System UI", value: "system-ui, sans-serif" },
  { label: "Helvetica", value: "Helvetica Neue, Helvetica, sans-serif" },
];

// ─── Color picker row ─────────────────────────────────────────────────────

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
      <span className="text-xs font-medium text-stone-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-stone-400">{value}</span>
        <div className="relative">
          <div
            className="h-7 w-7 rounded border border-stone-300 cursor-pointer"
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

// ─── Live preview mini-site ───────────────────────────────────────────────

function Preview({ theme }: { theme: SiteTheme }) {
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
          Your Business Name
        </h1>
        <p style={{ fontSize: 13, color: theme.secondary, margin: "0 0 14px" }}>
          Great coffee · Fresh food · Good vibes
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
          Reserve a Table
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
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ─── Left panel: controls ─────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-border bg-white flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold tracking-tight">Theme Editor</h2>
          <button
            onClick={save}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              saved
                ? "bg-green-600 text-white"
                : "bg-stone-900 text-white hover:bg-stone-700"
            }`}
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {/* Presets */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">Presets</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(PRESETS).map(([name, p]) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className={`text-left px-2.5 py-2 border rounded text-xs font-medium transition-all ${
                    theme.presetName === name
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 hover:border-stone-400 text-stone-700"
                  }`}
                  style={{ borderRadius: 4 }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full mr-1.5"
                    style={{ background: p.accent }}
                  />
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">Colors</p>
            <div className="border border-border rounded divide-y divide-border px-3">
              <ColorRow label="Background" value={theme.background} onChange={(v) => update({ background: v })} />
              <ColorRow label="Text" value={theme.text} onChange={(v) => update({ text: v })} />
              <ColorRow label="Accent / CTA" value={theme.accent} onChange={(v) => update({ accent: v })} />
              <ColorRow label="Secondary" value={theme.secondary} onChange={(v) => update({ secondary: v })} />
              <ColorRow label="Primary" value={theme.primary} onChange={(v) => update({ primary: v })} />
            </div>
          </div>

          {/* Fonts */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">Fonts</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-stone-600 block mb-1">Heading</label>
                <select
                  value={theme.headingFont}
                  onChange={(e) => { hapticLight(); update({ headingFont: e.target.value }); }}
                  className="w-full border border-border rounded px-2.5 py-1.5 text-sm text-stone-800 outline-none bg-white"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 block mb-1">Body</label>
                <select
                  value={theme.bodyFont}
                  onChange={(e) => { hapticLight(); update({ bodyFont: e.target.value }); }}
                  className="w-full border border-border rounded px-2.5 py-1.5 text-sm text-stone-800 outline-none bg-white"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Border radius */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-1">
              Border Radius
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={20}
                value={theme.borderRadius}
                onChange={(e) => update({ borderRadius: Number(e.target.value) })}
                className="flex-1 accent-stone-900"
              />
              <span className="font-mono text-xs text-stone-500 w-8 text-right">{theme.borderRadius}px</span>
            </div>
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>Sharp</span>
              <span>Rounded</span>
            </div>
          </div>

          {/* Preview of key tokens */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">Preview tokens</p>
            <div className="flex gap-2 flex-wrap">
              {[theme.background, theme.text, theme.accent, theme.secondary, theme.primary].map((c, i) => (
                <div
                  key={i}
                  className="h-7 w-7 border border-stone-200"
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
                Button
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
                Card
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Right panel: live preview ────────────────────────── */}
      <div className="flex-1 flex flex-col bg-stone-100 overflow-hidden">
        {/* Preview toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-white">
          <div className="flex border border-border overflow-hidden rounded">
            {(["desktop", "mobile"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setPreviewTab(tab)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  previewTab === tab
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <span className="text-xs text-stone-400">Site ID: {siteId}</span>
          <span className="ml-auto text-xs text-stone-400 font-mono">
            Preview updates live
          </span>
        </div>

        {/* Preview frame */}
        <div className="flex-1 overflow-auto p-6 flex justify-center">
          <div
            className="overflow-auto shadow-lg"
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
  );
}
