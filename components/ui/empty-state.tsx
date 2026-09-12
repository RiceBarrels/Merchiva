import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  icon?: LucideIcon;
  /** Optional one-line title (`text-sm font-medium`). */
  title?: React.ReactNode;
  /** Body copy (`text-sm text-muted-foreground`). */
  description?: React.ReactNode;
  /** Usually a `<Button variant="outline" size="sm">`. */
  action?: React.ReactNode;
  /** `compact` halves the padding and icon for table cells / small panels. */
  compact?: boolean;
}

/**
 * The one empty state (design-system/README.md §10):
 * `flex flex-col items-center justify-center gap-3 p-8 text-center`,
 * icon `h-10 w-10 text-muted-foreground`, copy `text-sm text-muted-foreground`.
 * No `opacity-*` hacks, no dashed borders — wrap in a Card if a border is needed.
 */
export function EmptyState({ icon: Icon, title, description, action, compact = false, className, children, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 p-4" : "gap-3 p-8",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={cn("shrink-0 text-muted-foreground", compact ? "h-6 w-6" : "h-10 w-10")} />}
      {(title || description) && (
        <div className="space-y-1">
          {title && <p className="text-sm font-medium text-foreground">{title}</p>}
          {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
