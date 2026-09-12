"use client";

import { Check, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { IconTile } from "@/components/ui/icon-tile";

export interface OptionRowProps extends Omit<React.ComponentProps<"button">, "title" | "onSelect"> {
  selected?: boolean;
  onSelect?: () => void;
  icon?: LucideIcon;
  /** Custom leading slot (logo, avatar) instead of `icon`. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned meta (price, badge). Rendered before the check mark. */
  meta?: React.ReactNode;
  /** Hide the trailing check mark (e.g. when `meta` already conveys selection). */
  hideCheck?: boolean;
}

/**
 * Full-width selectable row for plan pickers, provider choices, locale/currency lists.
 * Selected = `border-foreground bg-muted/40`; default = `border-border hover:bg-muted/50`.
 * Replaces the 11 hand-rolled `<button className="w-full … rounded-[0.3rem] border …">` rows.
 */
export function OptionRow({
  selected = false,
  onSelect,
  icon,
  leading,
  title,
  description,
  meta,
  hideCheck = false,
  disabled,
  className,
  onClick,
  ...props
}: OptionRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      data-slot="option-row"
      data-selected={selected || undefined}
      onClick={(e) => {
        hapticLight();
        onSelect?.();
        onClick?.(e);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-foreground bg-muted/40" : "border-border bg-background hover:bg-muted/50",
        className,
      )}
      {...props}
    >
      {leading ?? (icon && <IconTile icon={icon} />)}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {meta && <div className="shrink-0 text-right text-sm">{meta}</div>}
      {!hideCheck && (
        <Check className={cn("h-4 w-4 shrink-0 text-foreground transition-opacity", selected ? "opacity-100" : "opacity-0")} />
      )}
    </button>
  );
}
