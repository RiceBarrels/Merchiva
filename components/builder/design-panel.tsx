"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useEditor } from "@craftjs/core";
import {
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Columns3,
  Rows3,
  LayoutGrid,
  Move,
  Lock,
  Unlock,
  X,
  ArrowRightLeft,
  ArrowUpDown,
  Square,
  Palette,
  PaintBucket,
  Minus,
  Circle,
  Sparkles,
  AlignHorizontalJustifyCenter,
  MoveHorizontal,
  MoveVertical,
  Maximize2,
  SlidersHorizontal,
  Code,
  Type,
  ALargeSmall,
  Bold,
  Paintbrush,
  AlignLeft,
  CaseSensitive,
  ArrowUpNarrowWide,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { FontPicker } from "./font-picker";
import { ImageUpload } from "@/components/image-upload";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Deferred input (only commits on blur or Enter) ─────────────────────────

function DeferredInput({
  value: externalValue,
  onCommit,
  ...rest
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "onBlur" | "value"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(externalValue);
  const [focused, setFocused] = useState(false);

  // Sync from outside when not focused
  useEffect(() => {
    if (!focused) setLocal(externalValue);
  }, [externalValue, focused]);

  return (
    <Input
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (local !== externalValue) onCommit(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseNumeric(v: string | undefined, fb = 0) {
  if (!v) return fb;
  const n = parseFloat(v);
  return isNaN(n) ? fb : n;
}
function stripUnit(v: string | undefined) {
  return (v || "").replace(/px|rem|em|%|vh|vw/g, "").trim();
}
function ensurePx(v: string) {
  if (!v) return "";
  return /^\d+(\.\d+)?$/.test(v.trim()) ? `${v.trim()}px` : v.trim();
}

// ─── Collapsible Section ────────────────────────────────────────────────────

function Section({
  title,
  onAdd,
  defaultOpen = true,
  children,
}: {
  title: string;
  onAdd?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Separator />
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        {onAdd && (
          <span
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            role="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

// ─── Field components ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground font-normal">{label}</Label>
      {children}
    </div>
  );
}

function FieldRow({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon ? (
        <div className="flex w-6 shrink-0 items-center justify-center" title={label}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : (
        <Label className="w-10 shrink-0 text-[10px] text-muted-foreground font-normal">{label}</Label>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Unit dropdown + input ──────────────────────────────────────────────────

const ALL_UNITS = ["px", "%", "rem", "em", "vh", "vw", "auto", "fit-content", "max-content", "min-content"] as const;
type UnitValue = typeof ALL_UNITS[number];

const KEYWORD_UNITS = new Set(["auto", "fit-content", "max-content", "min-content"]);


function UnitDropdown({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => { if (v != null) onChange(v); }}>
      <SelectTrigger className="h-5 w-auto min-w-0 gap-0.5 border-0 bg-transparent px-1 py-0 text-[10px] text-muted-foreground shadow-none hover:text-foreground focus:ring-0" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ALL_UNITS.map((u) => (
          <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UnitInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  const { num, unit } = parseValueUnit(value);
  const isKeyword = KEYWORD_UNITS.has(value);

  const handleUnitChange = (newUnit: string) => {
    if (KEYWORD_UNITS.has(newUnit)) {
      onChange(newUnit);
    } else {
      onChange(num ? `${num}${newUnit}` : "");
    }
  };

  const handleCommit = (v: string) => {
    if (/[a-z%]/.test(v)) { onChange(v); return; }
    onChange(v ? `${v}${unit}` : "");
  };

  return (
    <div className="relative flex items-center">
      <DeferredInput
        className="h-7 flex-1 text-xs focus-visible:ring-0 focus-visible:ring-offset-0 pr-[4.5rem]"
        value={isKeyword ? "" : num}
        placeholder={isKeyword ? value : (placeholder || "0")}
        onCommit={handleCommit}
        disabled={isKeyword}
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <UnitDropdown value={isKeyword ? value : unit} onChange={handleUnitChange} />
      </div>
    </div>
  );
}

// ─── Padding control (H/V or individual T/R/B/L) ───────────────────────────

function parsePadding(raw: string): { top: string; right: string; bottom: string; left: string } {
  if (!raw) return { top: "0", right: "0", bottom: "0", left: "0" };
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function SpacingControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [individual, setIndividual] = useState(false);
  const parsed = parsePadding(value);
  const { unit } = parseValueUnit(parsed.top || "0px");

  const handleUnitChange = (newUnit: string) => {
    if (KEYWORD_UNITS.has(newUnit)) {
      onChange(newUnit);
      return;
    }
    const reunit = (s: string) => { const n = stripUnit(s); return n ? `${n}${newUnit}` : "0"; };
    onChange(`${reunit(parsed.top)} ${reunit(parsed.right)} ${reunit(parsed.bottom)} ${reunit(parsed.left)}`);
  };

  const commitSide = (key: "top" | "right" | "bottom" | "left", v: string) => {
    const next = { ...parsed, [key]: v ? ensurePx(v) : "0" };
    onChange(`${next.top} ${next.right} ${next.bottom} ${next.left}`);
  };

  const commitHV = (axis: "h" | "v", v: string) => {
    const val = v ? ensurePx(v) : "0";
    if (axis === "h") onChange(`${parsed.top} ${val} ${parsed.bottom} ${val}`);
    else onChange(`${val} ${parsed.right} ${val} ${parsed.left}`);
  };

  if (individual) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground font-normal">{label}</Label>
          <div className="flex items-center gap-0.5">
            <UnitDropdown value={unit} onChange={handleUnitChange} />
            <button type="button" onClick={() => setIndividual(false)} className="text-muted-foreground hover:text-foreground" title="Uniform">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {([
            { key: "top" as const, icon: "↑" },
            { key: "right" as const, icon: "→" },
            { key: "bottom" as const, icon: "↓" },
            { key: "left" as const, icon: "←" },
          ]).map((side) => (
            <div key={side.key} className="relative">
              <DeferredInput className="h-7 text-xs pl-6 focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(parsed[side.key])} placeholder="0" onCommit={(v) => commitSide(side.key, v)} />
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{side.icon}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground font-normal">{label}</Label>
        <div className="flex items-center gap-0.5">
          <UnitDropdown value={unit} onChange={handleUnitChange} />
          <button type="button" onClick={() => setIndividual(true)} className="text-muted-foreground hover:text-foreground" title="Individual">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="relative">
          <DeferredInput className="h-7 text-xs pl-6 focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(parsed.left)} placeholder="0" onCommit={(v) => commitHV("h", v)} />
          <MoveHorizontal className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="relative">
          <DeferredInput className="h-7 text-xs pl-6 focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(parsed.top)} placeholder="0" onCommit={(v) => commitHV("v", v)} />
          <MoveVertical className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function parseValueUnit(raw: string): { num: string; unit: string } {
  const match = raw.match(/^(-?\d*\.?\d*)\s*(px|%|rem|em|vh|vw)?$/);
  if (match) return { num: match[1] || "", unit: match[2] || "px" };
  return { num: raw, unit: "px" };
}

function FieldInput({
  label,
  icon,
  value,
  onChange,
  suffix,
  placeholder,
  type = "text",
  noUnit,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
  type?: string;
  noUnit?: boolean;
}) {
  const showUnit = !!suffix && !noUnit;
  const { num, unit } = showUnit ? parseValueUnit(value) : { num: value, unit: "px" };
  const isKeyword = KEYWORD_UNITS.has(value);

  const handleUnitChange = (newUnit: string) => {
    if (KEYWORD_UNITS.has(newUnit)) {
      onChange(newUnit);
    } else {
      onChange(num ? `${num}${newUnit}` : "");
    }
  };

  const handleCommit = (v: string) => {
    if (showUnit) {
      if (/[a-z%]/.test(v)) { onChange(v); return; }
      onChange(v ? `${v}${unit}` : "");
    } else {
      onChange(v);
    }
  };

  return (
    <FieldRow label={label} icon={icon}>
      <div className="relative flex items-center">
        <DeferredInput
          type={type}
          className={cn("h-7 text-xs focus-visible:ring-0 focus-visible:ring-offset-0", showUnit && "pr-[4.5rem]")}
          value={isKeyword ? "" : (showUnit ? num : value)}
          placeholder={isKeyword ? value : (placeholder || "0")}
          onCommit={handleCommit}
          disabled={isKeyword}
        />
        {showUnit && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <UnitDropdown value={isKeyword ? value : unit} onChange={handleUnitChange} />
          </div>
        )}
      </div>
    </FieldRow>
  );
}

function FieldSelect({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <FieldRow label={label} icon={icon}>
      <Select value={value} onValueChange={(v) => { if (v != null) onChange(v); }}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

function FieldCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `cb-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="h-3.5 w-3.5 rounded-[0.2rem]" />
      <Label htmlFor={id} className="text-[11px] text-muted-foreground font-normal cursor-pointer">{label}</Label>
    </div>
  );
}

// ─── Color row ──────────────────────────────────────────────────────────────

function ColorRow({ color, onColorChange, onRemove }: { color: string; onColorChange: (c: string) => void; onRemove: () => void }) {
  const hex = color.startsWith("#") ? color : color || "#000000";
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-[0.3rem] border border-border">
        <div className="absolute inset-0" style={{ backgroundColor: hex }} />
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={hex} onChange={(e) => onColorChange(e.target.value)} />
      </label>
      <DeferredInput className="h-7 flex-1 font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0" value={hex} onCommit={(v) => onColorChange(v)} />
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Toggle group ───────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; icon: React.ComponentType<{ className?: string }>; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-[0.3rem] border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          title={opt.label}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-[0.2rem] py-1 text-[10px] transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          onClick={() => onChange(opt.value)}
        >
          <opt.icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-center text-xs text-muted-foreground">Select an element to edit its properties.</p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LAYOUT_TYPES = new Set(["Layout", "Viewport", "Columns", "Canvas"]);

function isLayoutNode(node: Record<string, unknown>) {
  const data = node.data as { displayName?: string; type?: unknown } | undefined;
  if (!data) return false;
  const name = data.displayName || (typeof data.type === "object" && data.type !== null && "resolvedName" in (data.type as Record<string, unknown>) ? ((data.type as Record<string, string>).resolvedName ?? "") : "");
  return LAYOUT_TYPES.has(name);
}

function getDisplayName(node: Record<string, unknown>) {
  const data = node.data as { displayName?: string; type?: unknown } | undefined;
  if (!data) return "Element";
  return data.displayName || (typeof data.type === "object" && data.type !== null && "resolvedName" in (data.type as Record<string, unknown>) ? ((data.type as Record<string, string>).resolvedName ?? "Element") : "Element");
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Panel
// ═══════════════════════════════════════════════════════════════════════════

export function DesignPanel() {
  const { selected, node, actions } = useEditor((state) => {
    const [currentNodeId] = state.events.selected;
    if (currentNodeId) return { selected: currentNodeId, node: state.nodes[currentNodeId] };
    return { selected: null, node: null };
  });

  const [lockAspect, setLockAspect] = useState(false);

  const style: Record<string, string> = ((node?.data?.props as Record<string, unknown>)?.style as Record<string, string>) || {};

  const setStyle = useCallback((key: string, value: string) => {
    if (!selected) return;
    actions.setProp(selected, (props: Record<string, unknown>) => {
      const s = (props.style as Record<string, string>) || {};
      if (value) s[key] = value; else delete s[key];
      props.style = { ...s };
    });
  }, [selected, actions]);

  const setProp = useCallback((key: string, value: unknown) => {
    if (!selected) return;
    actions.setProp(selected, (props: Record<string, unknown>) => { props[key] = value; });
  }, [selected, actions]);

  if (!selected || !node) return <EmptyState />;

  const props = (node.data?.props ?? {}) as Record<string, unknown>;
  const displayName = getDisplayName(node as unknown as Record<string, unknown>);
  const showAutoLayout = isLayoutNode(node as unknown as Record<string, unknown>);

  const position = style.position || "static";
  const showPositionInputs = position === "absolute" || position === "fixed";
  const hasFill = !!style.backgroundColor;
  const hasStroke = !!style.border && style.border !== "none";
  const hasEffect = !!style.boxShadow && style.boxShadow !== "none";

  return (
    <div className="w-64 shrink-0 overflow-y-auto border-l border-border bg-background">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-sm font-semibold">{displayName}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => { hapticLight(); actions.delete(selected); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Content (for Text elements) ────────────────────────────────── */}
      {displayName === "Text" && (
        <Section title="Content">
          <FieldSelect
            label="Tag"
            icon={Code}
            value={(props.tag as string) || "p"}
            options={[
              { value: "h1", label: "<h1>" },
              { value: "h2", label: "<h2>" },
              { value: "h3", label: "<h3>" },
              { value: "h4", label: "<h4>" },
              { value: "h5", label: "<h5>" },
              { value: "h6", label: "<h6>" },
              { value: "p", label: "<p>" },
              { value: "span", label: "<span>" },
            ]}
            onChange={(v) => setProp("tag", v)}
          />
          <textarea
            value={(props.content as string) || ""}
            onChange={(e) => setProp("content", e.target.value)}
            rows={3}
            placeholder="Type your text..."
            className="flex w-full rounded-[0.3rem] border border-input bg-transparent px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
          />
        </Section>
      )}

      {/* ── Image (for Image elements) ────────────────────────────────── */}
      {displayName === "Image" && (
        <Section title="Image">
          <ImageUpload
            value={(props.src as string) || ""}
            orgId=""
            onChange={(url) => setProp("src", url)}
          />
          <FieldInput label="Alt" value={(props.alt as string) || ""} placeholder="Image description" onChange={(v) => setProp("alt", v)} noUnit />
        </Section>
      )}

      {/* ── Typography ──────────────────────────────────────────────────── */}
      <Section title="Typography" defaultOpen={displayName === "Text"}>
        <FieldRow label="Font" icon={Type}>
          <FontPicker
            value={style.fontFamily || ""}
            onChange={(v) => setStyle("fontFamily", v)}
          />
        </FieldRow>
        <FieldInput label="Size" icon={ALargeSmall} value={style.fontSize || (props.fontSize as string) || ""} suffix="px" placeholder="16" onChange={(v) => { setStyle("fontSize", v); if (displayName === "Text") setProp("fontSize", v); }} />
        <FieldSelect
          label="Weight"
          icon={Bold}
          value={style.fontWeight || (props.fontWeight as string) || "normal"}
          options={[
            { value: "100", label: "Thin" },
            { value: "200", label: "Extra Light" },
            { value: "300", label: "Light" },
            { value: "normal", label: "Regular" },
            { value: "500", label: "Medium" },
            { value: "600", label: "Semibold" },
            { value: "bold", label: "Bold" },
            { value: "800", label: "Extra Bold" },
            { value: "900", label: "Black" },
          ]}
          onChange={(v) => { setStyle("fontWeight", v); if (displayName === "Text") setProp("fontWeight", v); }}
        />
        <FieldInput label="Color" icon={Paintbrush} value={style.color || (props.color as string) || ""} placeholder="#000000" onChange={(v) => { setStyle("color", v); if (displayName === "Text") setProp("color", v); }} />
        <FieldSelect
          label="Align"
          icon={AlignLeft}
          value={style.textAlign || (props.align as string) || "left"}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
            { value: "justify", label: "Justify" },
          ]}
          onChange={(v) => { setStyle("textAlign", v); if (displayName === "Text") setProp("align", v); }}
        />
        <FieldInput label="Line height" icon={ArrowUpNarrowWide} value={style.lineHeight || ""} placeholder="1.6" onChange={(v) => setStyle("lineHeight", v)} noUnit />
        <FieldInput label="Letter spacing" icon={CaseSensitive} value={style.letterSpacing || ""} suffix="px" placeholder="0" onChange={(v) => setStyle("letterSpacing", v)} />
      </Section>

      {/* ── Layout ─────────────────────────────────────────────────────── */}
      {showAutoLayout && (
        <Section title="Layout">
          <FieldSelect
            label="Tag"
            icon={Code}
            value={(props.tag as string) || "div"}
            options={[
              { value: "div", label: "<div>" },
              { value: "a", label: "<a> (link)" },
              { value: "header", label: "<header>" },
              { value: "footer", label: "<footer>" },
              { value: "main", label: "<main>" },
              { value: "section", label: "<section>" },
              { value: "nav", label: "<nav>" },
              { value: "article", label: "<article>" },
              { value: "aside", label: "<aside>" },
            ]}
            onChange={(v) => setProp("tag", v)}
          />
          {(props.tag as string) === "a" && (
            <FieldInput label="Href" value={(props.href as string) || ""} placeholder="https://..." onChange={(v) => setProp("href", v)} noUnit />
          )}
          <Field label="Direction">
            <ToggleGroup
              options={[
                { value: "free", icon: Move, label: "Free" },
                { value: "stack", icon: Rows3, label: "Stack" },
                { value: "row", icon: Columns3, label: "Row" },
                { value: "grid", icon: LayoutGrid, label: "Grid" },
              ]}
              value={(props.direction as string) || "stack"}
              onChange={(v) => setProp("direction", v)}
            />
          </Field>

          <FieldSelect
            label="Align items"
            icon={AlignHorizontalJustifyCenter}
            value={(props.align as string) || "stretch"}
            options={[
              { value: "stretch", label: "Stretch" },
              { value: "flex-start", label: "Start" },
              { value: "center", label: "Center" },
              { value: "flex-end", label: "End" },
              { value: "baseline", label: "Baseline" },
            ]}
            onChange={(v) => setProp("align", v)}
          />

          <FieldSelect
            label="Justify"
            icon={ArrowRightLeft}
            value={(props.justify as string) || "flex-start"}
            options={[
              { value: "flex-start", label: "Start" },
              { value: "center", label: "Center" },
              { value: "flex-end", label: "End" },
              { value: "space-between", label: "Space between" },
              { value: "space-around", label: "Space around" },
              { value: "space-evenly", label: "Space evenly" },
            ]}
            onChange={(v) => setProp("justify", v)}
          />

          <FieldInput label="Gap" icon={MoveVertical} value={(props.spacing as string) || "16px"} placeholder="16" suffix="px" onChange={(v) => setProp("spacing", v)} />

          <SpacingControl
            label="Padding"
            value={(props.padding as string) || ""}
            onChange={(v) => setProp("padding", v)}
          />

          {(props.direction as string) === "grid" && (
            <FieldInput label="Columns" value={String((props.columns as number) || 2)} type="number" onChange={(v) => setProp("columns", parseInt(v) || 2)} />
          )}

          <FieldCheckbox label="Clip content" checked={style.overflow === "hidden"} onChange={(v) => setStyle("overflow", v ? "hidden" : "")} />
        </Section>
      )}

      {/* ── Position ───────────────────────────────────────────────────── */}
      <Section title="Position" defaultOpen={position === "fixed" || position === "absolute"}>
        <FieldSelect
          label="Type"
          value={position}
          options={[
            { value: "static", label: "Default" },
            { value: "relative", label: "Relative" },
            { value: "sticky", label: "Sticky" },
            { value: "absolute", label: "Absolute" },
            { value: "fixed", label: "Fixed" },
          ]}
          onChange={(v) => setStyle("position", v === "static" ? "" : v)}
        />

        {/* Constraints — shown for fixed/absolute */}
        {showPositionInputs && (
          <>
            {/* Constraint inputs: Top, Right, Bottom, Left */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 items-center">
              {/* Top */}
              <div />
              <Field label="Top">
                <DeferredInput className="h-6 w-16 text-xs text-center focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(style.top)} placeholder="—" onCommit={(v) => setStyle("top", v ? ensurePx(v) : "")} />
              </Field>
              <div />

              {/* Left - visual - Right */}
              <Field label="Left">
                <DeferredInput className="h-6 w-16 text-xs text-center focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(style.left)} placeholder="—" onCommit={(v) => setStyle("left", v ? ensurePx(v) : "")} />
              </Field>
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 rounded-[0.2rem] border border-border bg-muted" />
              </div>
              <Field label="Right">
                <DeferredInput className="h-6 w-16 text-xs text-center focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(style.right)} placeholder="—" onCommit={(v) => setStyle("right", v ? ensurePx(v) : "")} />
              </Field>

              {/* Bottom */}
              <div />
              <Field label="Bottom">
                <DeferredInput className="h-6 w-16 text-xs text-center focus-visible:ring-0 focus-visible:ring-offset-0" value={stripUnit(style.bottom)} placeholder="—" onCommit={(v) => setStyle("bottom", v ? ensurePx(v) : "")} />
              </Field>
              <div />
            </div>

            {/* Z-Index */}
            <FieldInput label="Z-Index" value={style.zIndex || ""} placeholder="auto" onChange={(v) => setStyle("zIndex", v)} noUnit />
          </>
        )}

        {position === "sticky" && (
          <>
            <FieldInput label="Top" icon={MoveVertical} value={stripUnit(style.top)} suffix="px" onChange={(v) => setStyle("top", ensurePx(v))} />
            <FieldInput label="Z-Index" value={style.zIndex || ""} placeholder="auto" onChange={(v) => setStyle("zIndex", v)} noUnit />
          </>
        )}
      </Section>

      {/* ── Size ────────────────────────────────────────────────────────── */}
      <Section title="Size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width">
            <UnitInput value={style.width || ""} placeholder="auto" onChange={(v) => setStyle("width", v)} />
          </Field>
          <Field label="Height">
            <UnitInput value={style.height || style.minHeight || ""} placeholder="auto" onChange={(v) => { setStyle("height", v); setStyle("minHeight", ""); }} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Width mode">
            <Select value={style.width === "100%" ? "fill" : style.width === "fit-content" ? "hug" : "fixed"} onValueChange={(v) => { if (!v) return; if (v === "fill") setStyle("width", "100%"); else if (v === "hug") setStyle("width", "fit-content"); }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed" className="text-xs">Fixed</SelectItem>
                <SelectItem value="hug" className="text-xs">Hug</SelectItem>
                <SelectItem value="fill" className="text-xs">Fill</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Height mode">
            <Select value={style.height === "100%" ? "fill" : style.height === "fit-content" ? "hug" : "fixed"} onValueChange={(v) => { if (!v) return; if (v === "fill") setStyle("height", "100%"); else if (v === "hug") setStyle("height", "fit-content"); }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed" className="text-xs">Fixed</SelectItem>
                <SelectItem value="hug" className="text-xs">Hug</SelectItem>
                <SelectItem value="fill" className="text-xs">Fill</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <button
          className={cn(
            "flex items-center gap-1.5 text-[11px] rounded-[0.3rem] px-2 py-1 transition-colors",
            lockAspect ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          onClick={() => setLockAspect(!lockAspect)}
        >
          {lockAspect ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          Lock aspect ratio
        </button>
      </Section>

      {/* ── Spacing (Margin) ────────────────────────────────────────────── */}
      <Section title="Margin" defaultOpen={false}>
        <SpacingControl
          label="Margin"
          value={style.margin || ""}
          onChange={(v) => setStyle("margin", v)}
        />
      </Section>

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <Section title="Appearance">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Opacity">
            <div className="relative">
              <DeferredInput className="h-7 text-xs focus-visible:ring-0 focus-visible:ring-offset-0 pr-6" value={String(parseNumeric(style.opacity, 1) * 100)} onCommit={(v) => { const n = parseFloat(v); if (!isNaN(n)) setStyle("opacity", String(Math.min(1, Math.max(0, n / 100)))); }} />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
            </div>
          </Field>
          <Field label="Radius">
            <UnitInput
              value={style.borderRadius || (props.borderRadius as string) || ""}
              placeholder="0"
              onChange={(v) => { setStyle("borderRadius", v); if (showAutoLayout) setProp("borderRadius", v); }}
            />
          </Field>
        </div>
      </Section>

      {/* ── Fill ────────────────────────────────────────────────────────── */}
      <Section title="Fill" onAdd={() => { if (!hasFill) { setStyle("backgroundColor", "#ffffff"); if (showAutoLayout) setProp("backgroundColor", "#ffffff"); } }}>
        {hasFill ? (
          <ColorRow
            color={style.backgroundColor}
            onColorChange={(c) => { setStyle("backgroundColor", c); if (showAutoLayout) setProp("backgroundColor", c); }}
            onRemove={() => { setStyle("backgroundColor", ""); if (showAutoLayout) setProp("backgroundColor", ""); }}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">No fill. Click + to add.</p>
        )}
      </Section>

      {/* ── Stroke ──────────────────────────────────────────────────────── */}
      <Section title="Stroke" onAdd={() => { if (!hasStroke) setStyle("border", "1px solid #d4d4d4"); }} defaultOpen={false}>
        {hasStroke ? (
          <div className="space-y-2">
            <ColorRow
              color={style.borderColor || (style.border?.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? "#d4d4d4")}
              onColorChange={(c) => {
                const w = style.borderWidth || (style.border?.match(/(\d+)px/)?.[1] ?? "1");
                setStyle("border", `${w}px solid ${c}`);
                setStyle("borderColor", c);
              }}
              onRemove={() => { setStyle("border", ""); setStyle("borderColor", ""); setStyle("borderWidth", ""); }}
            />
            <FieldInput
              label="Width"
              icon={Minus}
              value={style.borderWidth?.replace("px", "") || (style.border?.match(/(\d+)px/)?.[1] ?? "1")}
              suffix="px"
              onChange={(v) => {
                const c = style.borderColor || (style.border?.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? "#d4d4d4");
                setStyle("border", `${v}px solid ${c}`);
                setStyle("borderWidth", `${v}px`);
              }}
            />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No stroke. Click + to add.</p>
        )}
      </Section>

      {/* ── Effects ─────────────────────────────────────────────────────── */}
      <Section title="Effects" onAdd={() => { if (!hasEffect) setStyle("boxShadow", "0px 4px 12px rgba(0,0,0,0.15)"); }} defaultOpen={false}>
        {hasEffect ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <DeferredInput className="h-7 flex-1 font-mono text-xs focus-visible:ring-0 focus-visible:ring-offset-0" value={style.boxShadow || ""} onCommit={(v) => setStyle("boxShadow", v)} />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setStyle("boxShadow", "")}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-1">
              {[
                { label: "Small", value: "0px 1px 3px rgba(0,0,0,0.12)" },
                { label: "Medium", value: "0px 4px 12px rgba(0,0,0,0.15)" },
                { label: "Large", value: "0px 8px 24px rgba(0,0,0,0.2)" },
                { label: "XL", value: "0px 16px 48px rgba(0,0,0,0.25)" },
              ].map((p) => (
                <button
                  key={p.label}
                  className={cn(
                    "flex-1 rounded-[0.3rem] border border-border py-1 text-[10px] font-medium transition-colors",
                    style.boxShadow === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => setStyle("boxShadow", p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No effects. Click + to add.</p>
        )}
      </Section>
    </div>
  );
}
