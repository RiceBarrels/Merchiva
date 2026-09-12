import { cn } from "@/lib/utils";

export interface EyebrowProps extends React.ComponentProps<"p"> {
  /** `sm` (default) = 10.5px section label. `xs` = 10px micro label for tiles / pickers. */
  size?: "sm" | "xs";
  as?: "p" | "span" | "h3" | "h4" | "div";
}

/**
 * Section / group eyebrow label. Exactly one recipe:
 * `font-semibold uppercase tracking-wider text-muted-foreground` at 10.5px (sm) or 10px (xs).
 * Replaces the six ad-hoc `text-[11px] uppercase …` variants scattered through the pages.
 */
export function Eyebrow({ size = "sm", as: Tag = "p", className, ...props }: EyebrowProps) {
  return (
    <Tag
      data-slot="eyebrow"
      className={cn(
        "font-semibold uppercase tracking-wider text-muted-foreground",
        size === "sm" ? "text-[10.5px]" : "text-[10px]",
        className,
      )}
      {...props}
    />
  );
}
