"use client";

import { usePermissions } from "@/lib/context/permissions";

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  right,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  right?: React.ReactNode;
}) {
  const { currentOrg } = usePermissions();

  const crumbs = breadcrumbs ?? (currentOrg ? [currentOrg.name, title] : [title]);

  return (
    <header className="hidden lg:flex h-14 border-b border-border bg-white items-center px-6 gap-3 shrink-0">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {crumbs.length > 0 && (
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-stone-500">
            {crumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-stone-300">/</span>}
                <span className={i === crumbs.length - 1 ? "text-stone-700" : ""}>{b}</span>
              </span>
            ))}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight truncate">{title}</div>
          {subtitle && <div className="text-[11.5px] text-stone-500 leading-tight truncate">{subtitle}</div>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
