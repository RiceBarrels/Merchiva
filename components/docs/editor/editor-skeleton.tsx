"use client";

import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/**
 * Placeholder while the route resolves the document or the editor chunk loads: header bar, toolbar bar, grey canvas
 * with a white sheet (desktop) / a plain page (mobile, via CSS breakpoints so it matches before JS runs).
 */
export function EditorSkeleton({ status, className }: { status?: string; className?: string }) {
  const t = useT();
  const label = status ?? t("docs.editor.loading");
  return (
    <div role="status" aria-live="polite" aria-label={label} className={cn("flex h-full min-h-0 flex-1 flex-col bg-background", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <SkeletonText width="1.75rem" className="h-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <SkeletonText width="12rem" className="max-w-[60%]" />
          <div className="hidden gap-2 md:flex">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonText key={i} width="2.25rem" className="h-2.5" />
            ))}
          </div>
        </div>
        <SkeletonText width="5rem" className="hidden h-7 md:block" />
      </div>
      <div className="hidden h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 md:flex">
        {Array.from({ length: 14 }, (_, i) => (
          <SkeletonText key={i} width={i % 4 === 3 ? "4rem" : "1.5rem"} className="h-6" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-background md:bg-muted md:px-6 md:py-6">
        <div className="flex w-full max-w-[816px] flex-col gap-3 bg-white px-4 py-5 md:min-h-[11in] md:border md:border-border md:px-[1in] md:py-[1in]">
          <SkeletonText width="55%" className="h-6" />
          <SkeletonText width="90%" />
          <SkeletonText width="80%" />
          <SkeletonText width="85%" />
          <SkeletonText width="40%" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
