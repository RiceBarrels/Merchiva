import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { STATUS_TONE_CLASSES, type StatusTone } from "@/components/ui/status-badge";

export interface CalloutProps extends Omit<React.ComponentProps<"div">, "title"> {
  tone?: StatusTone;
  /** Override the default tone icon; pass `null` to hide it. */
  icon?: LucideIcon | null;
  title?: React.ReactNode;
  /** Right-aligned action (small Button / link). */
  action?: React.ReactNode;
}

const DEFAULT_ICON: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Info,
};

/**
 * Inline banner (offline notice, pending-sync warning, setup hint).
 * Soft-fill tone on a `rounded-lg` panel; copy stays at `text-xs`/`text-sm`.
 * Replaces hand-rolled `bg-amber-100 border-amber-300 text-amber-800` banners.
 */
export function Callout({ tone = "neutral", icon, title, action, className, children, ...props }: CalloutProps) {
  const Icon = icon === null ? null : icon ?? DEFAULT_ICON[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      data-slot="callout"
      data-tone={tone}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", STATUS_TONE_CLASSES[tone], className)}
      {...props}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium leading-snug">{title}</p>}
        {children && <div className={cn("text-xs leading-relaxed", title ? "opacity-90" : "text-sm")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
