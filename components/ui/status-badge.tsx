import { cn } from "@/lib/utils";

/**
 * The only status hues the design system standardizes (design-system/README.md §2).
 * success → emerald, warning → amber, danger → red/destructive, info → sky (rare), neutral → muted.
 * Never add orange / yellow / blue / rose / violet here — map them onto one of these.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Soft-fill chip classes: light fill + border + strong text, with dark variants. */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  danger: "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  neutral: "border-border bg-muted text-muted-foreground",
};

/** Text-only classes for inline numbers / deltas / icons (e.g. "+12.4%"). */
export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-destructive",
  info: "text-sky-600 dark:text-sky-300",
  neutral: "text-muted-foreground",
};

/** Solid dot classes for presence / progress indicators. */
export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground",
};

export interface StatusBadgeProps extends React.ComponentProps<"span"> {
  tone?: StatusTone;
  /** Leading 6px dot in the tone color. */
  dot?: boolean;
  /** Icon-only chips (e.g. `text-[10px]`) can pass `size="xs"`. */
  size?: "xs" | "sm";
}

/**
 * Status chip: `h-5 rounded px-2 text-xs font-medium` (same geometry as Badge) with a
 * standardized soft-fill tone. Use this instead of hand-written emerald/amber/red class maps.
 */
export function StatusBadge({ tone = "neutral", dot = false, size = "sm", className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded border font-medium",
        size === "sm" ? "h-5 px-2 text-xs" : "h-4 px-1.5 text-[10px] uppercase tracking-wide",
        STATUS_TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {dot && <i aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
