import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASSES, type StatusTone } from "@/components/ui/status-badge";

export interface IconTileProps extends React.ComponentProps<"div"> {
  icon?: LucideIcon;
  /** sm = 28px, md = 32px (default), lg = 44px. */
  size?: "sm" | "md" | "lg";
  /** Optional status tone; defaults to neutral muted tile. */
  tone?: StatusTone;
  /** Render children (initials, emoji, image) instead of an icon. */
  children?: React.ReactNode;
}

const SIZE: Record<NonNullable<IconTileProps["size"]>, { box: string; icon: string }> = {
  sm: { box: "h-7 w-7 text-[11px]", icon: "h-3.5 w-3.5" },
  md: { box: "h-8 w-8 text-xs", icon: "h-4 w-4" },
  lg: { box: "h-11 w-11 text-sm", icon: "h-5 w-5" },
};

/**
 * Square icon container: `rounded-lg border bg-muted`, icon in `text-muted-foreground`.
 * Replaces the `h-8 w-8 rounded-[0.3rem] bg-muted …` tiles copied across settings / reports / reviews.
 */
export function IconTile({ icon: Icon, size = "md", tone, className, children, ...props }: IconTileProps) {
  return (
    <div
      data-slot="icon-tile"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border font-semibold",
        tone ? STATUS_TONE_CLASSES[tone] : "border-border bg-muted text-muted-foreground",
        SIZE[size].box,
        className,
      )}
      {...props}
    >
      {children ?? (Icon && <Icon className={SIZE[size].icon} />)}
    </div>
  );
}
