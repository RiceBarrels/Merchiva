"use client";

import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/context/permissions";

interface PageHeaderAction {
  icon: React.ReactNode;
  onClick?: () => void;
  badge?: number;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  right,
  actions,
  sticky = true,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  right?: React.ReactNode;
  actions?: PageHeaderAction[];
  sticky?: boolean;
  children?: React.ReactNode;
}) {
  const { currentOrg } = usePermissions();
  const crumbs = breadcrumbs ?? (currentOrg ? [currentOrg.name, title] : [title]);

  return (
    <>
      {/* Desktop */}
      <header className="hidden lg:flex h-14 border-b border-border bg-background items-center px-6 gap-3 shrink-0">
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {crumbs.length > 0 && (
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-muted-foreground">
              {crumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-border">/</span>}
                  <span className={i === crumbs.length - 1 ? "text-foreground" : ""}>{b}</span>
                </span>
              ))}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-tight truncate">{title}</div>
            {subtitle && <div className="text-[11.5px] text-muted-foreground leading-tight truncate">{subtitle}</div>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2">{right}</div>}
      </header>

      {/* Mobile */}
      <div
        className={cn(
          "flex lg:hidden items-center justify-between bg-background border-b border-border px-4 py-3 gap-3",
          sticky && "sticky top-0 z-20"
        )}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>
        {(actions?.length || right) && (
          <div className="flex items-center gap-1 shrink-0">
            {right}
            {actions?.map((action, i) => (
              <button
                key={i}
                onClick={action.onClick}
                className="h-8 w-8 flex items-center justify-center rounded-[0.3rem] border border-border text-foreground hover:bg-muted transition-colors relative"
              >
                {action.icon}
                {action.badge != null && action.badge > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 flex items-center justify-center bg-foreground text-background text-[9px] font-bold rounded-full">
                    {action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
