// The notification dot: something new waits behind this entry point. A plain
// red dot, no count, pinned to the entry's top inline-end corner (the top-left
// in RTL), so the parent must be `relative`. Spec: design-system/README.md
// ("Notification dot"). Whether to show it comes from lib/notifications/dots-context.tsx
// (useDot, useAnyDot, …); this component only draws it.

import { cn } from "@/lib/utils";

export interface NotificationDotProps {
  /** Draw nothing when false, so `show={useDot(…)}` reads straight. */
  show?: boolean;
  /** `sm` (size-2) on shell rows, tabs and icons; `md` (size-3) on device tiles. */
  size?: "sm" | "md";
  /** In the text flow (after a sub-row's label) instead of pinned to the corner. */
  inline?: boolean;
  /** Screen-reader text, e.g. t("notify.dot.label"). The dot itself is aria-hidden; or name the state on the entry's own label. */
  label?: string;
  /** Extra classes, e.g. `ring-foreground` on an inverted (active) row. */
  className?: string;
}

export function NotificationDot({ show = true, size = "sm", inline = false, label, className }: NotificationDotProps) {
  if (!show) return null;
  return (
    <>
      <span
        aria-hidden
        data-notification-dot=""
        className={cn(
          "pointer-events-none rounded-full bg-destructive ring-2 ring-background",
          size === "md" ? "size-3" : "size-2",
          inline ? "inline-block shrink-0 align-middle" : "absolute -top-0.5 -end-0.5",
          className,
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
