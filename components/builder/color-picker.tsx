"use client";

import * as React from "react";
import ReactDOM from "react-dom";
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Color math ─────────────────────────────────────────────────────────────

interface HSVA { h: number; s: number; v: number; a: number }
interface RGBA { r: number; g: number; b: number; a: number }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hsvToRgb({ h, s, v, a }: HSVA): RGBA {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}

function rgbToHsv({ r, g, b, a }: RGBA): HSVA {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rN)      h = ((gN - bN) / d) % 6;
    else if (max === gN) h = (bN - rN) / d + 2;
    else                 h = (rN - gN) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}

function rgbaToHex({ r, g, b, a }: RGBA, withAlpha = false): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (withAlpha && a < 1) return `${hex}${toHex(a * 255)}`;
  return hex;
}

function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const s = input.trim();

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return Number.isNaN(r) ? null : { r, g, b, a: 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return Number.isNaN(r) ? null : { r, g, b, a };
    }
    return null;
  }

  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return null;
}

function rgbaToCss({ r, g, b, a }: RGBA): string {
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

const CHECKER_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12'><rect width='6' height='6' fill='%23e4e4e7'/><rect x='6' y='6' width='6' height='6' fill='%23e4e4e7'/></svg>\") 0 0/12px 12px";

const PRESETS = [
  "#000000", "#ffffff", "#18181b", "#52525b", "#a1a1aa", "#e4e4e7",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

// ─── Drag tracker ────────────────────────────────────────────────────────────

function useDragTracker(
  ref: React.RefObject<HTMLDivElement | null>,
  onChange: (xRatio: number, yRatio: number) => void,
) {
  const dragging = useRef(false);

  const emit = useCallback((e: MouseEvent | React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    onChange(x, y);
  }, [ref, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) emit(e); };
    const onUp = () => { dragging.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [emit]);

  return useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dragging.current = true;
    emit(e);
  }, [emit]);
}

// ─── ColorPicker ─────────────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  showAlpha?: boolean;
  className?: string;
  trigger?: React.ReactNode;
}

export function ColorPicker({
  value,
  onChange,
  showAlpha = true,
  className,
  trigger,
}: ColorPickerProps) {
  const parsed = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const [hsva, setHsva] = useState<HSVA>(() => rgbToHsv(parsed));
  const [hexInput, setHexInput] = useState(() => rgbaToHex(parsed, showAlpha));
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Sync from external value changes
  useEffect(() => {
    const p = parseColor(value);
    if (!p) return;
    setHsva((prev) => {
      const current = hsvToRgb(prev);
      if (current.r === p.r && current.g === p.g && current.b === p.b && Math.abs(current.a - p.a) < 0.01) {
        return prev;
      }
      return rgbToHsv(p);
    });
    setHexInput(rgbaToHex(p, showAlpha));
  }, [value, showAlpha]);

  // Position popup relative to trigger
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popupWidth = 240;
    const popupHeight = 320;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + popupWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popupWidth - 8);
    }
    if (top + popupHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popupHeight - 4);
    }
    setCoords({ top, left });
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popupRef.current || !triggerRef.current) return;
      const t = e.target as Node;
      if (popupRef.current.contains(t) || triggerRef.current.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const commit = useCallback((next: HSVA) => {
    setHsva(next);
    const rgba = hsvToRgb(next);
    setHexInput(rgbaToHex(rgba, showAlpha));
    onChange(next.a < 1 ? rgbaToCss(rgba) : rgbaToHex(rgba, false));
  }, [onChange, showAlpha]);

  const rgba = hsvToRgb(hsva);
  const hueColor = rgbaToHex(hsvToRgb({ h: hsva.h, s: 1, v: 1, a: 1 }));
  const swatchColor = hsva.a < 1 ? rgbaToCss(rgba) : rgbaToHex(rgba);

  // ── Interactive areas ───────────────────────────────────────────────────
  const svRef = useRef<HTMLDivElement | null>(null);
  const onSvDrag = useDragTracker(svRef, (x, y) => {
    commit({ ...hsva, s: x, v: 1 - y });
  });

  const hueRef = useRef<HTMLDivElement | null>(null);
  const onHueDrag = useDragTracker(hueRef, (x) => {
    commit({ ...hsva, h: x * 360 });
  });

  const alphaRef = useRef<HTMLDivElement | null>(null);
  const onAlphaDrag = useDragTracker(alphaRef, (x) => {
    commit({ ...hsva, a: x });
  });

  const handleHexCommit = (raw: string) => {
    const p = parseColor(raw);
    if (p) {
      setHsva(rgbToHsv(p));
      setHexInput(rgbaToHex(p, showAlpha));
      onChange(p.a < 1 ? rgbaToCss(p) : rgbaToHex(p, false));
    } else {
      setHexInput(rgbaToHex(rgba, showAlpha));
    }
  };

  const handleRgbChange = (key: "r" | "g" | "b", raw: string) => {
    const n = clamp(parseInt(raw, 10) || 0, 0, 255);
    const next = { ...rgba, [key]: n };
    commit(rgbToHsv(next));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Pick color"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative h-7 w-7 shrink-0 overflow-hidden rounded-[0.3rem] border border-border transition-colors hover:border-foreground/40 cursor-pointer",
          className,
        )}
      >
        {trigger ?? (
          <>
            <span className="absolute inset-0 pointer-events-none" style={{ background: CHECKER_BG }} />
            <span className="absolute inset-0 pointer-events-none" style={{ backgroundColor: swatchColor }} />
          </>
        )}
      </button>

      {open && typeof window !== "undefined" && ReactDOM.createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] w-60 rounded-[0.3rem] border border-border bg-popover p-2 text-popover-foreground shadow-lg space-y-2"
          style={{ top: coords.top, left: coords.left }}
        >
          {/* Saturation / value square */}
          <div
            ref={svRef}
            onMouseDown={onSvDrag}
            className="relative h-36 w-full cursor-crosshair rounded-[0.3rem] select-none"
            style={{
              backgroundColor: hueColor,
              backgroundImage:
                "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
            }}
          >
            <div
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{
                left: `${hsva.s * 100}%`,
                top: `${(1 - hsva.v) * 100}%`,
                backgroundColor: rgbaToHex(rgba),
              }}
            />
          </div>

          {/* Hue slider */}
          <div
            ref={hueRef}
            onMouseDown={onHueDrag}
            className="relative h-3 w-full cursor-pointer rounded-full select-none"
            style={{
              background:
                "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
            }}
          >
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
              style={{
                left: `${(hsva.h / 360) * 100}%`,
                backgroundColor: hueColor,
              }}
            />
          </div>

          {/* Alpha slider */}
          {showAlpha && (
            <div
              ref={alphaRef}
              onMouseDown={onAlphaDrag}
              className="relative h-3 w-full cursor-pointer rounded-full overflow-hidden select-none"
              style={{ background: CHECKER_BG }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `linear-gradient(to right, transparent, ${rgbaToHex(hsvToRgb({ ...hsva, a: 1 }))})`,
                }}
              />
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
                style={{
                  left: `${hsva.a * 100}%`,
                  backgroundColor: swatchColor,
                }}
              />
            </div>
          )}

          {/* Hex + RGB inputs */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1">
            <div className="space-y-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground">Hex</label>
              <Input
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={(e) => handleHexCommit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-6 text-[11px] font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            {(["r", "g", "b"] as const).map((key) => (
              <div key={key} className="space-y-0.5 w-9">
                <label className="text-[9px] uppercase tracking-wider text-muted-foreground text-center block">{key}</label>
                <Input
                  type="number"
                  min={0}
                  max={255}
                  value={rgba[key]}
                  onChange={(e) => handleRgbChange(key, e.target.value)}
                  className="h-6 px-1 text-[11px] font-mono text-center focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            ))}
          </div>

          {/* Preset palette */}
          <div className="grid grid-cols-11 gap-1 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleHexCommit(p)}
                className="h-4 w-4 rounded-[0.2rem] border border-border transition-transform hover:scale-110"
                style={{ backgroundColor: p }}
                aria-label={`Use ${p}`}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
