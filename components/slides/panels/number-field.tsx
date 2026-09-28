"use client";

// A compact numeric field for the format panel (slides.md §7.3): shows the model value, and while it has focus keeps
// what is being typed. Enter or leaving the field commits (one undo step); Escape puts the value back; ↑/↓ step by
// `step` (Shift: ×10) and commit at once. A comma decimal separator is accepted. Nothing is committed when the text
// is not a number or the value did not change.
import { useId, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface NumberFieldProps {
  label: string;
  value: number;
  onCommit(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown (the value is rounded to them on commit too). */
  decimals?: number;
  /** A unit shown after the number ("pt", "°", "%"). */
  suffix?: string;
  disabled?: boolean;
  className?: string;
}

function parseNumber(text: string): number | null {
  const n = Number.parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function NumberField({ label, value, onCommit, min = -Infinity, max = Infinity, step = 1, decimals = 1, suffix, disabled, className }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const factor = 10 ** decimals;
  const round = (n: number) => Math.round(n * factor) / factor;
  const shown = String(round(value));

  const commit = (next: number | null) => {
    setDraft(null);
    if (next === null) return;
    const clean = round(Math.min(max, Math.max(min, next)));
    if (clean !== round(value)) onCommit(clean);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit(parseNumber(draft ?? shown));
    } else if (event.key === "Escape") {
      if (draft === null) return;
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const base = parseNumber(draft ?? shown) ?? value;
      commit(base + (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1));
    }
  };

  return (
    <div className={cn("grid min-w-0 gap-1", className)}>
      <label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </label>
      <div className="flex h-7 min-w-0 items-center rounded-[3px] border border-input bg-transparent focus-within:ring-3 focus-within:ring-ring/50 has-[:disabled]:opacity-60">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={draft ?? shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null) commit(parseNumber(draft));
          }}
          onKeyDown={onKeyDown}
          className="h-full w-0 min-w-0 flex-1 bg-transparent px-2 font-mono text-[12px] tabular-nums outline-none"
        />
        {suffix && (
          <span aria-hidden className="pe-2 text-[11px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
