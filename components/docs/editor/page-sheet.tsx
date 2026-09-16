"use client";

/**
 * The paper (docs-editor-ui spec §4.4).
 *
 * Paged (desktop): the sheets are an absolutely positioned background layer drawn from the pagination plugin's page
 * rectangles, the header/footer layer sits above them, and the editor flows on top inside the page margins. The
 * spacer widgets the plugin injects are what keep the text aligned with the sheets, so this component only has to
 * place rectangles.
 *
 * Continuous (mobile, version preview, a document whose first layout hasn't landed): one sheet that grows with its
 * content, which is what Docs did before pagination.
 *
 * The sheet stays light in dark mode on purpose (user colours stay readable).
 */
import type { Ref } from "react";

import { pageMetricsPx, type DocPageSetup } from "@/lib/docs/page-setup";
import type { PaginationLayout } from "@/lib/docs/pagination/measure";
import { cn } from "@/lib/utils";

export function PageSheet({
  ref,
  zoom = 1,
  setup,
  layout,
  mobile = false,
  overlay,
  className,
  children,
}: {
  ref?: Ref<HTMLDivElement>;
  zoom?: number;
  setup: DocPageSetup;
  /** Page rectangles from the pagination plugin; null renders one continuous sheet. */
  layout?: PaginationLayout | null;
  mobile?: boolean;
  /** Drawn above the sheets and below the text — the header/footer layer. */
  overlay?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const metrics = pageMetricsPx(setup);
  const paged = !mobile && !!layout;

  return (
    <div
      ref={ref}
      data-paged={paged ? "true" : "false"}
      className={cn("doc-paper relative shrink-0", mobile && "is-mobile", className)}
      style={{
        ...(mobile ? null : { width: metrics.pageWidth, minHeight: paged ? layout.totalHeight : metrics.pageHeight }),
        ...(mobile || zoom === 1 ? null : { zoom }),
        ...(setup.background ? { ["--doc-paper-bg" as string]: setup.background } : null),
      }}
    >
      {paged && (
        <div className="doc-paper-sheets" aria-hidden>
          {layout.pages.map((page, index) => (
            <div key={index} className="doc-page" style={{ top: page.top, height: page.height }} />
          ))}
        </div>
      )}
      {paged && overlay}
      <div
        className="doc-paper-body"
        style={
          mobile
            ? undefined
            : {
                paddingTop: metrics.marginTop,
                paddingRight: metrics.marginRight,
                paddingBottom: metrics.marginBottom,
                paddingLeft: metrics.marginLeft,
              }
        }
      >
        {children}
      </div>
    </div>
  );
}
