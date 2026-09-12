/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** "Priya Patel" → "PP". Shared so pages stop redefining it. */
export function initials(name: string | null | undefined): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export interface AvatarProps extends Omit<React.ComponentProps<"span">, "children"> {
  name: string;
  src?: string | null;
  /** xs 20 · sm 24 · md 30 (default) · lg 36 · xl 44 px. */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** `square` = rounded-lg tile (store logos, list rows); `circle` = people (default). */
  shape?: "circle" | "square";
}

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-[30px] w-[30px] text-[11px]",
  lg: "h-9 w-9 text-xs",
  xl: "h-11 w-11 text-sm",
};

/**
 * Person / store avatar with an initials fallback on neutral `bg-muted`.
 * Hue is reserved for status in this design system, so there is no per-user color ramp.
 */
export function Avatar({ name, src, size = "md", shape = "circle", className, ...props }: AvatarProps) {
  const base = cn(
    "inline-flex shrink-0 select-none items-center justify-center overflow-hidden border border-border bg-muted font-semibold text-muted-foreground",
    shape === "circle" ? "rounded-full" : "rounded-lg",
    SIZE[size],
    className,
  );
  return (
    <span data-slot="avatar" className={base} title={name} {...props}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}
