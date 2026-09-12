"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  /** Small counter shown after the label (filters). */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `joined` = one bordered strip (default). `chips` = separate pills with a gap. */
  variant?: "joined" | "chips";
  /** `sm` = h-7 text-xs, `md` = h-8 text-sm (default), `lg` = h-10 for touch/POS. */
  size?: "sm" | "md" | "lg";
  /** Stretch options to fill the row. */
  fullWidth?: boolean;
  className?: string;
  "aria-label"?: string;
}

const SIZE = {
  sm: "h-7 px-2.5 text-xs gap-1 [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-8 px-3 text-sm gap-1.5 [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-10 px-3.5 text-sm gap-2 [&_svg]:h-4 [&_svg]:w-4",
} as const;

/**
 * Single-select option row (filters, mode toggles, day pickers).
 * Active = `bg-primary text-primary-foreground`; inactive = muted text with `hover:bg-muted`.
 * Replaces the hand-rolled `bg-foreground text-white` button rows and the re-implemented TabsList.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "joined",
  size = "md",
  fullWidth = false,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-slot="segmented-control"
      data-variant={variant}
      className={cn(
        fullWidth ? "flex w-full" : "inline-flex w-fit",
        variant === "joined"
          ? "overflow-hidden rounded-lg border border-border divide-x divide-border"
          : "flex-wrap gap-1.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            data-active={active || undefined}
            onClick={() => {
              if (active) return;
              hapticLight();
              onChange(opt.value);
            }}
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors outline-none select-none",
              "focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              SIZE[size],
              fullWidth && "flex-1",
              variant === "chips" && "rounded border",
              active
                ? cn("bg-primary text-primary-foreground", variant === "chips" && "border-primary")
                : cn("bg-background text-muted-foreground hover:bg-muted hover:text-foreground", variant === "chips" && "border-border"),
            )}
          >
            {Icon && <Icon className="shrink-0" />}
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
