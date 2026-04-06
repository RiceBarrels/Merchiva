"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { getSite, updateSite } from "@/lib/db/sites";
import { SiteRenderer } from "@/components/site-renderer";
import { getDefaultProps } from "@/components/site-renderer";
import type { Site, SiteTheme, SiteElement } from "@/lib/types";

// ─── Theme presets ────────────────────────────────────────────────────────────

const PRESETS: { name: string; theme: SiteTheme }[] = [
  {
    name: "Minimal",
    theme: {
      primaryColor: "#111827",
      secondaryColor: "#6b7280",
      accentColor: "#111827",
      bgColor: "#ffffff",
      textColor: "#111827",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "0.125rem",
    },
  },
  {
    name: "Modern",
    theme: {
      primaryColor: "#1e3a5f",
      secondaryColor: "#64748b",
      accentColor: "#2563eb",
      bgColor: "#f8fafc",
      textColor: "#0f172a",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "0.5rem",
    },
  },
  {
    name: "Bold",
    theme: {
      primaryColor: "#0f172a",
      secondaryColor: "#475569",
      accentColor: "#dc2626",
      bgColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Georgia",
      bodyFont: "Inter",
      borderRadius: "0rem",
    },
  },
  {
    name: "Warm",
    theme: {
      primaryColor: "#292524",
      secondaryColor: "#78716c",
      accentColor: "#d97706",
      bgColor: "#fafaf9",
      textColor: "#1c1917",
      headingFont: "Georgia",
      bodyFont: "Inter",
      borderRadius: "0.375rem",
    },
  },
  {
    name: "Soft",
    theme: {
      primaryColor: "#374151",
      secondaryColor: "#9ca3af",
      accentColor: "#8b5cf6",
      bgColor: "#f9fafb",
      textColor: "#374151",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "0.75rem",
    },
  },
  {
    name: "Dark",
    theme: {
      primaryColor: "#f9fafb",
      secondaryColor: "#9ca3af",
      accentColor: "#3b82f6",
      bgColor: "#111827",
      textColor: "#f9fafb",
      headingFont: "Inter",
      bodyFont: "Inter",
      borderRadius: "0.375rem",
    },
  },
];

const FONTS = ["Inter", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Arial", "system-ui"];

// ─── Preview elements ─────────────────────────────────────────────────────────

function makePreviewElements(siteId: string): SiteElement[] {
  return [
    { id: "prev-nav",  pageId: "p", siteId, organizationId: "", type: "nav",   props: { ...getDefaultProps("nav"),  logo: "Your Brand" }, sortOrder: 0 },
    { id: "prev-hero", pageId: "p", siteId, organizationId: "", type: "hero",  props: { ...getDefaultProps("hero"), title: "Your Business Headline", subtitle: "A short tagline that describes what makes you great.", minHeight: "280px" }, sortOrder: 1 },
    { id: "prev-text", pageId: "p", siteId, organizationId: "", type: "text",  props: { tag: "h2", content: "Welcome to our store", align: "center" }, sortOrder: 2 },
    { id: "prev-btn",  pageId: "p", siteId, organizationId: "", type: "button", props: { label: "Shop Now", href: "#", variant: "primary", align: "center" }, sortOrder: 3 },
    { id: "prev-test", pageId: "p", siteId, organizationId: "", type: "testimonial", props: getDefaultProps("testimonial"), sortOrder: 4 },
    { id: "prev-foot", pageId: "p", siteId, organizationId: "", type: "footer", props: getDefaultProps("footer"), sortOrder: 5 },
  ];
}

// ─── Theme Page ───────────────────────────────────────────────────────────────

export default function ThemePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const router = useRouter();

  const [site, setSite] = useState<Site | null>(null);
  const [theme, setTheme] = useState<SiteTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSite(siteId)
      .then((s) => {
        if (!s) { router.push("/builder"); return; }
        setSite(s);
        setTheme(s.theme);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [siteId, router]);

  const setColor = (key: keyof SiteTheme, value: string) => {
    setTheme((t) => t ? { ...t, [key]: value } : t);
  };

  const handleSave = async () => {
    if (!theme) return;
    setSaving(true);
    updateSite(siteId, { theme })
      .then(() => {
        setSite((s) => s ? { ...s, theme } : s);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch((e) => console.error(e))
      .finally(() => setSaving(false));
  };

  if (loading || !theme) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const previewElements = makePreviewElements(siteId);

  const inputClass = "w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-foreground";
  const labelClass = "block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";
  const sectionClass = "mb-5";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0 h-11">
        <Link href={`/builder/${siteId}`} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold">Theme Editor</span>
        <span className="text-xs text-muted-foreground">— {site?.name}</span>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-foreground text-background text-xs font-medium px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saved ? "Saved!" : "Save Theme"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: controls */}
        <div className="w-[280px] shrink-0 border-r border-border bg-card overflow-y-auto p-4">

          {/* Presets */}
          <div className={sectionClass}>
            <p className={labelClass}>Presets</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setTheme(preset.theme)}
                  className="border border-border rounded p-1.5 text-center hover:border-foreground transition-colors"
                  style={{ background: preset.theme.bgColor }}
                >
                  <div
                    className="h-3 rounded-sm mb-1 w-full"
                    style={{ background: preset.theme.primaryColor, borderRadius: preset.theme.borderRadius }}
                  />
                  <div
                    className="h-1.5 rounded-sm mb-1 w-2/3 mx-auto"
                    style={{ background: preset.theme.accentColor, borderRadius: preset.theme.borderRadius }}
                  />
                  <p className="text-[9px] font-medium" style={{ color: preset.theme.textColor }}>{preset.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className={sectionClass}>
            <p className={labelClass}>Colors</p>
            <div className="space-y-2">
              {[
                { key: "primaryColor" as const, label: "Primary" },
                { key: "secondaryColor" as const, label: "Secondary" },
                { key: "accentColor" as const, label: "Accent / CTA" },
                { key: "bgColor" as const, label: "Background" },
                { key: "textColor" as const, label: "Text" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    className="h-7 w-7 rounded border border-border cursor-pointer shrink-0"
                  />
                  <div className="flex-1">
                    <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                    <input
                      type="text"
                      value={theme[key]}
                      onChange={(e) => setColor(key, e.target.value)}
                      className="text-[11px] font-mono w-full bg-transparent border-none focus:outline-none text-muted-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className={sectionClass}>
            <p className={labelClass}>Typography</p>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Heading Font</label>
                <select value={theme.headingFont} onChange={(e) => setTheme((t) => t ? { ...t, headingFont: e.target.value } : t)} className={inputClass}>
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-0.5">Body Font</label>
                <select value={theme.bodyFont} onChange={(e) => setTheme((t) => t ? { ...t, bodyFont: e.target.value } : t)} className={inputClass}>
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Border radius */}
          <div className={sectionClass}>
            <p className={labelClass}>Border Radius</p>
            <div className="grid grid-cols-4 gap-1">
              {["0rem", "0.25rem", "0.5rem", "1rem"].map((r) => (
                <button
                  key={r}
                  onClick={() => setTheme((t) => t ? { ...t, borderRadius: r } : t)}
                  className={`border rounded p-1.5 text-[10px] text-center transition-colors ${theme.borderRadius === r ? "border-foreground bg-muted font-semibold" : "border-border hover:border-foreground/50"}`}
                >
                  {r === "0rem" ? "None" : r === "0.25rem" ? "Sm" : r === "0.5rem" ? "Md" : "Lg"}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <input
                type="text"
                value={theme.borderRadius}
                onChange={(e) => setTheme((t) => t ? { ...t, borderRadius: e.target.value } : t)}
                placeholder="0.375rem"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Live Preview</p>
          <div className="bg-white border border-border shadow-sm overflow-hidden" style={{ maxWidth: "900px", margin: "0 auto" }}>
            <SiteRenderer elements={previewElements} theme={theme} />
          </div>
        </div>
      </div>
    </div>
  );
}
