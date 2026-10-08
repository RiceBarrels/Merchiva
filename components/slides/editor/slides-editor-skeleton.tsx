"use client";

// The Slides route's placeholder and bare states. SlidesEditorSkeleton shows while the route resolves its document,
// the editor chunk loads, or the session syncs: the header bar, the toolbar and the slide rail (desktop), and one
// empty 16:9 slide on the grey stage; the layout follows the CSS breakpoints, so it matches before any script
// measures anything. SlidesCenteredState and BackToDriveButton frame the full-page states (not found, no access,
// access lost). Imported by the route: nothing heavy here.
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { DRIVE_HOME_HREF } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const RAIL_THUMBS = 5;
const TOOLBAR_PARTS = 14;

function SlideBox({ className }: { className?: string }) {
  return (
    <div className={cn("flex aspect-video w-full flex-col justify-center gap-3 border border-border bg-background px-[8%]", className)}>
      <SkeletonText width="55%" className="h-5" />
      <SkeletonText width="35%" className="h-3" />
    </div>
  );
}

export function SlidesEditorSkeleton({ status, className }: { status?: string; className?: string }): React.JSX.Element {
  const t = useT();
  const label = status ?? t("slides.editor.loading");
  return (
    <div role="status" aria-live="polite" aria-label={label} className={cn("flex h-full min-h-0 flex-1 flex-col bg-background", className)}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <SkeletonText width="1.75rem" className="h-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <SkeletonText width="12rem" className="max-w-[60%]" />
          <div className="hidden gap-2 md:flex">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonText key={i} width="2.25rem" className="h-2.5" />
            ))}
          </div>
        </div>
        <SkeletonText width="5rem" className="hidden h-7 md:block" />
      </div>
      <div className="hidden h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 md:flex">
        {Array.from({ length: TOOLBAR_PARTS }, (_, i) => (
          <SkeletonText key={i} width={i % 5 === 4 ? "4rem" : "1.5rem"} className="h-6" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row" aria-hidden>
        <div className="hidden w-[200px] shrink-0 flex-col gap-2 overflow-hidden border-e border-border py-2 pe-2 ps-7 md:flex">
          {Array.from({ length: RAIL_THUMBS }, (_, i) => (
            <div key={i} className="aspect-video w-full border border-border bg-background" />
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-muted p-4 md:p-8">
          <SlideBox className="max-w-[960px]" />
        </div>
        <div className="flex h-20 shrink-0 gap-2 overflow-hidden border-t border-border px-2 py-2 md:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-video h-full shrink-0 border border-border bg-background" />
          ))}
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A full-height centred state (not found, no access, access lost). */
export function SlidesCenteredState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">{children}</div>;
}

/** "Back to Drive", through the surface's opener (a device panel stays in its panel). */
export function BackToDriveButton(): React.JSX.Element {
  const t = useT();
  const openUrl = useDocsOpenUrl();
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => openUrl(DRIVE_HOME_HREF, "current")}>
      {t("slides.editor.backToDrive")}
    </Button>
  );
}
