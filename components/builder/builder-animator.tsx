"use client";

import { useState, useCallback } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { patchSelectedAttribute } from "./html-properties-panel";
import type { HtmlSelectionInfo } from "./html-canvas";
import type {
  BuilderAnimation,
  EaseType,
  EntryAnimation,
  EntryAnimationType,
  EntryEffect,
  HoverAnimation,
  TapAnimation,
} from "@/lib/builder/animation";

// ─── Public component ──────────────────────────────────────────────────────

interface BuilderAnimatorProps {
  selected: HtmlSelectionInfo | null;
  html: string;
  onHtmlChange: (html: string) => void;
}

export function BuilderAnimator({ selected, html, onHtmlChange }: BuilderAnimatorProps) {
  if (!selected) {
    return (
      <EmptyState
        compact
        icon={Sparkles}
        className="h-full"
        description="Select an element on the canvas to add or edit its animation."
      />
    );
  }

  return (
    <Inner
      key={selected.selector}
      selected={selected}
      html={html}
      onHtmlChange={onHtmlChange}
    />
  );
}

// ─── Inner (keyed on selector so state resets per element) ─────────────────

function Inner({ selected, html, onHtmlChange }: BuilderAnimatorProps & { selected: HtmlSelectionInfo }) {
  const initial = parseAnimation(selected.attrs["data-animation"] ?? "");
  const [anim, setAnim] = useState<BuilderAnimation | undefined>(initial);

  const commit = useCallback(
    (next: BuilderAnimation | undefined) => {
      const stripped = strip(next);
      setAnim(stripped);
      onHtmlChange(
        patchSelectedAttribute(
          html,
          selected.selector,
          "data-animation",
          stripped ? JSON.stringify(stripped) : null,
        ),
      );
    },
    [html, onHtmlChange, selected.selector],
  );

  const entry = anim?.entry ?? ({ type: "none" } as EntryAnimation);
  const hover = anim?.hover ?? ({} as HoverAnimation);
  const tap = anim?.tap ?? ({} as TapAnimation);

  const setEntry = (patch: Partial<EntryAnimation>) =>
    commit({ ...anim, entry: { ...entry, ...patch } });
  const setInitial = (patch: Partial<EntryEffect>) =>
    commit({
      ...anim,
      entry: { ...entry, initial: { ...(entry.initial ?? {}), ...patch } },
    });
  const setHover = (patch: Partial<HoverAnimation>) =>
    commit({ ...anim, hover: { ...hover, ...patch } });
  const setTap = (patch: Partial<TapAnimation>) =>
    commit({ ...anim, tap: { ...tap, ...patch } });
  const clearAll = () => commit(undefined);

  const entryEnabled = entry.type !== "none" || hasInitial(entry.initial);
  const hoverEnabled = hover.scale != null || hover.y != null || hover.rotate != null;
  const tapEnabled = tap.scale != null;
  const hasAny = entryEnabled || hoverEnabled || tapEnabled;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-2 shrink-0 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-muted-foreground" />
            <Eyebrow as="span">Animator</Eyebrow>
          </div>
          <div className="mt-1 font-mono text-[9.5px] text-muted-foreground/70 truncate max-w-[180px]" title={selected.selector}>
            {selected.selector}
          </div>
        </div>
        {hasAny && (
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onClick={clearAll}
            title="Clear all animations"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Trigger ─────────────────────────────────────────────────── */}
        <Section title="Trigger">
          <Row label="Type">
            <SelectField
              value={entry.trigger ?? "inView"}
              onChange={(v) => setEntry({ trigger: v as "immediate" | "inView" })}
              options={[
                { value: "immediate", label: "On Appear" },
                { value: "inView", label: "Layer in View" },
              ]}
            />
          </Row>
          {(entry.trigger ?? "inView") === "inView" && (
            <>
              <Row label="Start">
                <SegmentedControl
                  size="sm"
                  fullWidth
                  value={entry.start ?? "center"}
                  onChange={(v) => setEntry({ start: v as "top" | "center" | "bottom" })}
                  options={[
                    { value: "top", label: "Top" },
                    { value: "center", label: "Center" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                />
              </Row>
              <Row label="Replay">
                <SegmentedControl
                  size="sm"
                  fullWidth
                  value={entry.replay === false ? "no" : "yes"}
                  onChange={(v) => setEntry({ replay: v === "yes" })}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </Row>
            </>
          )}
        </Section>

        {/* ── Preset ──────────────────────────────────────────────────── */}
        <Section title="Preset">
          <Row label="Style">
            <SelectField
              value={entry.type}
              onChange={(v) => {
                const t = v as EntryAnimationType;
                setEntry({
                  type: t,
                  duration: entry.duration ?? 0.5,
                  delay: entry.delay ?? 0,
                  trigger: entry.trigger ?? "inView",
                });
              }}
              options={[
                { value: "none",       label: "None" },
                { value: "fade",       label: "Fade In" },
                { value: "scale",      label: "Scale In" },
                { value: "slideUp",    label: "Slide In Bottom" },
                { value: "slideDown",  label: "Slide In Top" },
                { value: "slideLeft",  label: "Slide In Right" },
                { value: "slideRight", label: "Slide In Left" },
              ]}
            />
          </Row>
        </Section>

        {/* ── Enter — fine controls (always available, overrides preset) ─ */}
        <Section title="Enter">
          <Row label="Opacity">
            <NumberSlider
              value={getInitial(entry, "opacity", 0)}
              min={0}
              max={1}
              step={0.05}
              onCommit={(n) => setInitial({ opacity: clamp(n, 0, 1) })}
            />
          </Row>
          <Row label="Scale">
            <NumberSlider
              value={getInitial(entry, "scale", 1)}
              min={0}
              max={3}
              step={0.05}
              onCommit={(n) => setInitial({ scale: clamp(n, 0, 10) })}
            />
          </Row>
          <Row label="Rotate">
            <NumberField
              value={getInitial(entry, "rotate", 0)}
              unit="°"
              onCommit={(n) => setInitial({ rotate: n })}
            />
          </Row>
          <Row label="Offset">
            <div className="flex gap-1">
              <NumberFieldXY
                axis="X"
                value={getInitial(entry, "offsetX", 0)}
                onCommit={(n) => setInitial({ offsetX: n })}
              />
              <NumberFieldXY
                axis="Y"
                value={getInitial(entry, "offsetY", 0)}
                onCommit={(n) => setInitial({ offsetY: n })}
              />
            </div>
          </Row>
          <Row label="Skew">
            <div className="flex gap-1">
              <NumberFieldXY
                axis="X"
                value={getInitial(entry, "skewX", 0)}
                onCommit={(n) => setInitial({ skewX: n })}
              />
              <NumberFieldXY
                axis="Y"
                value={getInitial(entry, "skewY", 0)}
                onCommit={(n) => setInitial({ skewY: n })}
              />
            </div>
          </Row>
        </Section>

        {/* ── Transition ──────────────────────────────────────────────── */}
        <Section title="Transition">
          <Row label="Duration">
            <NumberField
              value={entry.duration ?? 0.5}
              unit="s"
              step={0.05}
              onCommit={(n) => setEntry({ duration: Math.max(0, n) })}
            />
          </Row>
          <Row label="Delay">
            <NumberField
              value={entry.delay ?? 0}
              unit="s"
              step={0.05}
              onCommit={(n) => setEntry({ delay: Math.max(0, n) })}
            />
          </Row>
          <Row label="Ease">
            <SelectField
              value={entry.ease ?? "easeOut"}
              onChange={(v) => setEntry({ ease: v as EaseType })}
              options={[
                { value: "easeOut",   label: "Ease Out" },
                { value: "easeIn",    label: "Ease In" },
                { value: "easeInOut", label: "Ease In Out" },
                { value: "linear",    label: "Linear" },
              ]}
            />
          </Row>
        </Section>

        {/* ── Hover ──────────────────────────────────────────────────── */}
        <Section title="Hover">
          <Row label="Scale">
            <NumberField
              value={hover.scale ?? 1}
              step={0.01}
              placeholder="1"
              onCommit={(n) =>
                setHover({ scale: n === 1 ? undefined : n })
              }
            />
          </Row>
          <Row label="Lift">
            <NumberField
              value={hover.y ?? 0}
              unit="px"
              onCommit={(n) =>
                setHover({ y: n === 0 ? undefined : n })
              }
            />
          </Row>
          <Row label="Rotate">
            <NumberField
              value={hover.rotate ?? 0}
              unit="°"
              onCommit={(n) =>
                setHover({ rotate: n === 0 ? undefined : n })
              }
            />
          </Row>
          <Row label="Duration">
            <NumberField
              value={hover.duration ?? 0.2}
              unit="s"
              step={0.05}
              onCommit={(n) => setHover({ duration: Math.max(0, n) })}
            />
          </Row>
        </Section>

        {/* ── Tap ────────────────────────────────────────────────────── */}
        <Section title="Tap">
          <Row label="Scale">
            <NumberField
              value={tap.scale ?? 1}
              step={0.01}
              placeholder="1"
              onCommit={(n) =>
                setTap({ scale: n === 1 ? undefined : n })
              }
            />
          </Row>
        </Section>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseAnimation(raw: string): BuilderAnimation | undefined {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as BuilderAnimation; } catch { return undefined; }
}

function strip(a: BuilderAnimation | undefined): BuilderAnimation | undefined {
  if (!a) return undefined;
  const out: BuilderAnimation = {};
  // Drop noop entry
  if (a.entry) {
    const e = { ...a.entry };
    if (e.initial && Object.keys(e.initial).length === 0) delete e.initial;
    if (e.type !== "none" || (e.initial && Object.keys(e.initial).length > 0)) {
      out.entry = e;
    }
  }
  if (a.hover && (a.hover.scale != null || a.hover.y != null || a.hover.rotate != null)) {
    out.hover = a.hover;
  }
  if (a.tap && a.tap.scale != null) {
    out.tap = a.tap;
  }
  return Object.keys(out).length ? out : undefined;
}

function hasInitial(init: EntryEffect | undefined): boolean {
  if (!init) return false;
  return Object.values(init).some((v) => v !== undefined && v !== null);
}

// Compute the effective starting value the user is editing: override > preset default.
function getInitial(entry: EntryAnimation, key: keyof EntryEffect, fallback: number): number {
  if (entry.initial && entry.initial[key] != null) return entry.initial[key] as number;
  // Preset defaults
  const d = entry.distance ?? 24;
  if (entry.type === "fade" && key === "opacity") return 0;
  if (entry.type === "scale") {
    if (key === "opacity") return 0;
    if (key === "scale") return 0.9;
  }
  if (entry.type === "slideUp") {
    if (key === "opacity") return 0;
    if (key === "offsetY") return d;
  }
  if (entry.type === "slideDown") {
    if (key === "opacity") return 0;
    if (key === "offsetY") return -d;
  }
  if (entry.type === "slideLeft") {
    if (key === "opacity") return 0;
    if (key === "offsetX") return d;
  }
  if (entry.type === "slideRight") {
    if (key === "opacity") return 0;
    if (key === "offsetX") return -d;
  }
  return fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// ─── UI primitives ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-border">
      <Eyebrow size="xs" className="mb-1.5">{title}</Eyebrow>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field layout="inline" label={label} labelWidth={60}>
      {children}
    </Field>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v == null) return;
        onChange(v);
      }}
    >
      <SelectTrigger size="sm" className="h-[26px] w-full px-1.5 text-[11.5px] font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberField({
  value,
  unit,
  step = 1,
  placeholder,
  onCommit,
}: {
  value: number;
  unit?: string;
  step?: number;
  placeholder?: string;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(formatNum(value));
  const [focused, setFocused] = useState(false);

  if (!focused && text !== formatNum(value)) {
    setText(formatNum(value));
  }

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d.\-]/g, "");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) {
      setText(formatNum(value));
      return;
    }
    onCommit(n);
  };

  return (
    <div className="relative">
      <Input
        type="text"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "ArrowUp") { e.preventDefault(); onCommit(round(value + step)); }
          else if (e.key === "ArrowDown") { e.preventDefault(); onCommit(round(value - step)); }
        }}
        className="h-[26px] px-1.5 pr-5 font-mono text-[11.5px] tabular-nums md:text-[11.5px]"
      />
      {unit && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/70 pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  );
}

function NumberFieldXY({
  axis,
  value,
  onCommit,
}: {
  axis: "X" | "Y";
  value: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(formatNum(value));
  const [focused, setFocused] = useState(false);

  if (!focused && text !== formatNum(value)) {
    setText(formatNum(value));
  }

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d.\-]/g, "");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) {
      setText(formatNum(value));
      return;
    }
    onCommit(n);
  };

  return (
    <div className="relative flex-1">
      <Input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "ArrowUp") { e.preventDefault(); onCommit(round(value + 1)); }
          else if (e.key === "ArrowDown") { e.preventDefault(); onCommit(round(value - 1)); }
        }}
        className="h-[26px] px-1.5 pr-5 font-mono text-[11.5px] tabular-nums md:text-[11.5px]"
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/70 pointer-events-none">
        {axis}
      </span>
    </div>
  );
}

function NumberSlider({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onCommit(parseFloat(e.target.value))}
        className="flex-1 accent-foreground h-1"
      />
      <Input
        type="text"
        value={formatNum(value)}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onCommit(clamp(n, min, max));
        }}
        className="h-6 w-12 px-1.5 text-center font-mono text-[10.5px] tabular-nums md:text-[10.5px]"
      />
    </div>
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Show up to 2 decimals but trim trailing zeros
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
