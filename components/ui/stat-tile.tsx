import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { STATUS_TONE_TEXT, type StatusTone } from "@/components/ui/status-badge";

export interface StatTileProps extends Omit<React.ComponentProps<typeof Card>, "children" | "size"> {
  label: React.ReactNode;
  /** Pre-formatted value (use `useCurrency().format` / `<Num>` upstream). Rendered in mono tabular. */
  value: React.ReactNode;
  /** Secondary line under the value, e.g. "vs last week" or a count. */
  sub?: React.ReactNode;
  /** Optional delta rendered next to `sub`, colored by `deltaTone`. */
  delta?: React.ReactNode;
  deltaTone?: StatusTone;
  icon?: LucideIcon;
  /** `danger` / `warning` tint the border and icon tile. */
  tone?: StatusTone;
  /** `sm` for dense 4-up grids (default), `md` for dashboard headline numbers. */
  size?: "sm" | "md";
}

/**
 * KPI tile. Consolidates the four hand-rolled `SummaryCard` / `StatCard` / `StatTile` copies.
 * Value is always `font-mono font-semibold tabular-nums`; label is an Eyebrow.
 */
export function StatTile({ label, value, sub, delta, deltaTone = "neutral", icon, tone, size = "sm", className, ...props }: StatTileProps) {
  return (
    <Card
      data-slot="stat-tile"
      data-tone={tone}
      className={cn(
        tone === "danger" && "border-destructive/30",
        tone === "warning" && "border-amber-300 dark:border-amber-900",
        className,
      )}
      {...props}
    >
      <CardContent className={cn("flex items-center gap-3", size === "sm" ? "p-3" : "p-4")}>
        {icon && <IconTile icon={icon} size={size === "sm" ? "md" : "lg"} tone={tone && tone !== "neutral" ? tone : undefined} />}
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-mono font-semibold leading-tight tabular-nums", size === "sm" ? "text-lg" : "text-[22px] tracking-tight")}>{value}</p>
          {(sub || delta) && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {delta && <span className={cn("font-mono tabular-nums", STATUS_TONE_TEXT[deltaTone])}>{delta}</span>}
              {sub && <span className="truncate">{sub}</span>}
            </p>
          )}
          <Eyebrow size="xs" className="mt-1 truncate">{label}</Eyebrow>
        </div>
      </CardContent>
    </Card>
  );
}

/** Standard KPI grid: 2-up on mobile, 4-up on desktop. */
export function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="stat-grid" className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)} {...props} />;
}
