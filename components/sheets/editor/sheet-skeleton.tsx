"use client";

// Placeholder while the spreadsheet route resolves its document, the editor chunk loads, or the grid loads its
// content: header bar, ribbon bar (desktop), and a grid of empty cells. Imported by the route, so no Univer here.
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const COLUMNS = 8;
const ROWS = 14;

export function SheetSkeleton({ status, chrome = true, className }: { status?: string; chrome?: boolean; className?: string }) {
  const t = useT();
  const label = status ?? t("sheets.editor.loading");
  return (
    <div role="status" aria-live="polite" aria-label={label} className={cn("flex h-full min-h-0 flex-1 flex-col bg-background", className)}>
      {chrome && (
        <>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <SkeletonText width="1.75rem" className="h-7 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SkeletonText width="12rem" className="max-w-[60%]" />
              <SkeletonText width="2.25rem" className="hidden h-2.5 md:block" />
            </div>
            <SkeletonText width="5rem" className="hidden h-7 md:block" />
          </div>
          <div className="hidden h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 md:flex">
            {Array.from({ length: 16 }, (_, i) => (
              <SkeletonText key={i} width={i % 5 === 4 ? "4rem" : "1.5rem"} className="h-6" />
            ))}
          </div>
        </>
      )}
      <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
        <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `2.5rem repeat(${COLUMNS}, minmax(0, 1fr))` }}>
          {Array.from({ length: COLUMNS + 1 }, (_, i) => (
            <div key={i} className="h-6 border-e border-border" />
          ))}
        </div>
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="grid border-b border-border" style={{ gridTemplateColumns: `2.5rem repeat(${COLUMNS}, minmax(0, 1fr))` }}>
            <div className="h-6 border-e border-border bg-muted/40" />
            {Array.from({ length: COLUMNS }, (_, col) => (
              <div key={col} className="flex h-6 items-center border-e border-border px-1.5">
                {row < 6 && (row + col) % 3 === 0 && <SkeletonText width={col % 2 ? "70%" : "45%"} className="h-2" />}
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
