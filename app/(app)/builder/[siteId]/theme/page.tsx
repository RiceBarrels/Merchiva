"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSiteById, updateTheme, defaultTheme } from "@/lib/db/sites";
import { ThemePreview } from "@/components/site-renderer";
import type { Site, SiteTheme } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  "Inter",
  "Poppins",
  "Playfair Display",
  "Montserrat",
  "Roboto",
  "Space Grotesk",
  "DM Sans",
  "Outfit",
];

interface Preset {
  name: string;
  description: string;
  theme: SiteTheme;
}

const PRESETS: Preset[] = [
  {
    name: "Modern Dark",
    description: "Dark, sleek, high-contrast",
    theme: {
      primaryColor: "#6366f1",
      secondaryColor: "#8b5cf6",
      accentColor: "#f59e0b",
      backgroundColor: "#0f172a",
      textColor: "#f1f5f9",
      headingFont: "Space Grotesk",
      bodyFont: "Inter",
      baseFontSize: 16,
      borderRadius: 8,
      maxContentWidth: 1200,
      sectionPadding: 48,
    },
  },
  {
    name: "Clean Light",
    description: "Minimal, white, professional",
    theme: {
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
      accentColor: "#0ea5e9",
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      headingFont: "Inter",
      bodyFont: "Inter",
      baseFontSize: 16,
      borderRadius: 6,
      maxContentWidth: 1100,
      sectionPadding: 48,
    },
  },
  {
    name: "Warm Coffee",
    description: "Cozy, earthy, inviting",
    theme: {
      primaryColor: "#92400e",
      secondaryColor: "#78350f",
      accentColor: "#f59e0b",
      backgroundColor: "#fef3c7",
      textColor: "#1c1917",
      headingFont: "Playfair Display",
      bodyFont: "DM Sans",
      baseFontSize: 16,
      borderRadius: 4,
      maxContentWidth: 1100,
      sectionPadding: 56,
    },
  },
  {
    name: "Ocean Blue",
    description: "Fresh, calm, ocean tones",
    theme: {
      primaryColor: "#0284c7",
      secondaryColor: "#0369a1",
      accentColor: "#06b6d4",
      backgroundColor: "#f0f9ff",
      textColor: "#0c4a6e",
      headingFont: "Outfit",
      bodyFont: "Inter",
      baseFontSize: 16,
      borderRadius: 12,
      maxContentWidth: 1200,
      sectionPadding: 48,
    },
  },
  {
    name: "Forest Green",
    description: "Natural, organic, fresh",
    theme: {
      primaryColor: "#15803d",
      secondaryColor: "#166534",
      accentColor: "#84cc16",
      backgroundColor: "#f0fdf4",
      textColor: "#14532d",
      headingFont: "Poppins",
      bodyFont: "DM Sans",
      baseFontSize: 16,
      borderRadius: 8,
      maxContentWidth: 1100,
      sectionPadding: 48,
    },
  },
  {
    name: "Minimal Mono",
    description: "Pure black and white, typographic",
    theme: {
      primaryColor: "#000000",
      secondaryColor: "#404040",
      accentColor: "#737373",
      backgroundColor: "#ffffff",
      textColor: "#171717",
      headingFont: "Montserrat",
      bodyFont: "Inter",
      baseFontSize: 15,
      borderRadius: 0,
      maxContentWidth: 960,
      sectionPadding: 40,
    },
  },
];

// ─── ColorInput ───────────────────────────────────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 shrink-0">
        <Label className="text-xs text-stone-500">{label}</Label>
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded border border-stone-200 p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
        }}
        className="h-7 w-24 rounded border border-stone-200 bg-white px-2 font-mono text-xs focus:border-stone-400 focus:outline-none"
        maxLength={7}
        placeholder="#000000"
      />
    </div>
  );
}

// ─── SliderInput ──────────────────────────────────────────────────────────────

function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-stone-500">{label}</Label>
        <span className="font-mono text-xs text-stone-700">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-stone-100 pb-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        {title}
      </h3>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ThemePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();

  const [site, setSite] = useState<Site | null>(null);
  const [theme, setTheme] = useState<SiteTheme>(defaultTheme());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSiteById(siteId)
      .then((s) => {
        if (s) {
          setSite(s);
          setTheme(s.theme);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  const patch = useCallback((partial: Partial<SiteTheme>) => {
    setTheme((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await updateTheme(siteId, theme);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save theme:", err);
    } finally {
      setSaving(false);
    }
  }

  function handlePreset(preset: Preset) {
    setTheme(preset.theme);
    setSaved(false);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      {/* ── Left panel ── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-stone-200 bg-white">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <button
            onClick={() => router.push(`/builder/${siteId}`)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-stone-100"
          >
            <ArrowLeft className="h-4 w-4 text-stone-500" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold text-stone-800">
              Theme — {site?.name ?? "…"}
            </h1>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-7 gap-1.5 px-3 text-xs"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : saved ? (
              <Check className="h-3 w-3" />
            ) : null}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>

        {/* Scrollable settings */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* ── Presets ── */}
          <div className="space-y-3">
            <SectionHeader title="Presets" />
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePreset(preset)}
                  className="rounded border border-stone-200 p-2 text-left hover:border-stone-400 hover:bg-stone-50 transition-colors"
                >
                  <div className="mb-1.5 flex gap-1">
                    {[
                      preset.theme.primaryColor,
                      preset.theme.secondaryColor,
                      preset.theme.accentColor,
                      preset.theme.backgroundColor,
                    ].map((c, i) => (
                      <div
                        key={i}
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] font-semibold text-stone-700">{preset.name}</div>
                  <div className="text-[10px] text-stone-400">{preset.description}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setTheme(defaultTheme());
                setSaved(false);
              }}
              className="flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-stone-600"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to defaults
            </button>
          </div>

          {/* ── Colors ── */}
          <div className="space-y-3">
            <SectionHeader title="Colors" />
            <div className="space-y-2.5">
              <ColorInput
                label="Primary"
                value={theme.primaryColor}
                onChange={(v) => patch({ primaryColor: v })}
              />
              <ColorInput
                label="Secondary"
                value={theme.secondaryColor}
                onChange={(v) => patch({ secondaryColor: v })}
              />
              <ColorInput
                label="Accent"
                value={theme.accentColor}
                onChange={(v) => patch({ accentColor: v })}
              />
              <ColorInput
                label="Background"
                value={theme.backgroundColor}
                onChange={(v) => patch({ backgroundColor: v })}
              />
              <ColorInput
                label="Text"
                value={theme.textColor}
                onChange={(v) => patch({ textColor: v })}
              />
            </div>
          </div>

          {/* ── Typography ── */}
          <div className="space-y-3">
            <SectionHeader title="Typography" />
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Heading Font</Label>
                <Select
                  value={theme.headingFont}
                  onValueChange={(v) => patch({ headingFont: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-stone-500">Body Font</Label>
                <Select
                  value={theme.bodyFont}
                  onValueChange={(v) => patch({ bodyFont: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SliderInput
                label="Base Font Size"
                value={theme.baseFontSize}
                min={14}
                max={20}
                unit="px"
                onChange={(v) => patch({ baseFontSize: v })}
              />
            </div>
          </div>

          {/* ── Layout ── */}
          <div className="space-y-3">
            <SectionHeader title="Layout" />
            <div className="space-y-3">
              <SliderInput
                label="Border Radius"
                value={theme.borderRadius}
                min={0}
                max={24}
                unit="px"
                onChange={(v) => patch({ borderRadius: v })}
              />
              <SliderInput
                label="Max Content Width"
                value={theme.maxContentWidth}
                min={800}
                max={1400}
                step={50}
                unit="px"
                onChange={(v) => patch({ maxContentWidth: v })}
              />
              <SliderInput
                label="Section Padding"
                value={theme.sectionPadding}
                min={16}
                max={80}
                step={4}
                unit="px"
                onChange={(v) => patch({ sectionPadding: v })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: live preview ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
          <span className="text-[11px] uppercase tracking-widest text-stone-400">
            Live Preview
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: theme.primaryColor }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: theme.secondaryColor }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: theme.accentColor }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <div
            className="mx-auto"
            style={{ maxWidth: theme.maxContentWidth + "px" }}
          >
            <ThemePreview theme={theme} />
          </div>
        </div>
      </div>
    </div>
  );
}
