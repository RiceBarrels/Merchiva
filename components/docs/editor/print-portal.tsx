"use client";

/**
 * Print target (docs-editor-ui spec §6.1). Printing in place would be clipped by the app's fixed-height,
 * overflow-hidden layout, so print CSS hides everything except this portal on `body`.
 * `beforeprint` (menu Print, Mod+P, browser menu) writes the current content synchronously, without a React commit.
 * The jsPDF fallback in `printDocument` rasterizes the same `<article>`.
 *
 * Paper size and margins come from the document's page setup through an inline `@page` rule, so a printout matches
 * the sheets on screen. Headers and footers are `position: fixed`, which print engines repeat on every sheet.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { stripCommentSpans } from "@/lib/docs/export";
import { substitutePageFields, variantForPage, headerFooterField } from "@/lib/docs/header-footer";
import { pageSizeIn } from "@/lib/docs/page-setup";
import { useHeaderFooterHtml } from "@/lib/docs/use-header-footer";
import { useDocEditor } from "./doc-editor-context";

export function PrintPortal() {
  const { contentEditor, pageSetup, pageLayout, collab, printTargetRef } = useDocEditor();
  const headerFooterHtml = useHeaderFooterHtml(collab.ydoc, pageSetup);
  const size = pageSizeIn(pageSetup);
  const { top, right, bottom, left } = pageSetup.margins;
  // Fixed boxes repeat on every printed sheet, so they can only show the variant that covers most pages.
  const variant = variantForPage(pageSetup.differentFirstPage ? 2 : 1, pageSetup);
  const pageCount = pageLayout?.pages.length ?? 1;
  const header = headerFooterHtml[headerFooterField("header", variant)] ?? "";
  const footer = headerFooterHtml[headerFooterField("footer", variant)] ?? "";
  const editorRef = useRef(contentEditor);
  useLayoutEffect(() => {
    editorRef.current = contentEditor;
  });

  useEffect(() => {
    const onBeforePrint = () => {
      const target = printTargetRef.current;
      const editor = editorRef.current;
      if (!target || !editor || editor.isDestroyed) return;
      // Schema-serialized HTML (no scripts or event attributes can exist in it); comment spans unwrapped.
      target.innerHTML = stripCommentSpans(editor.getHTML());
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [printTargetRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="doc-print-portal" aria-hidden>
      <style>{`@page doc-print { size: ${size.width}in ${size.height}in; margin: ${top}in ${right}in ${bottom}in ${left}in; }`}</style>
      {header && (
        <div
          className="doc-print-hf doc-print-header doc-prose"
          // A fixed box is placed against the page's content area, so the header climbs into the top margin.
          style={{ top: `${pageSetup.headerDistance - top}in` }}
          dangerouslySetInnerHTML={{ __html: substitutePageFields(header, 1, pageCount) }}
        />
      )}
      {footer && (
        <div
          className="doc-print-hf doc-print-footer doc-prose"
          style={{ bottom: `${pageSetup.footerDistance - bottom}in` }}
          dangerouslySetInnerHTML={{ __html: substitutePageFields(footer, 1, pageCount) }}
        />
      )}
      <article ref={printTargetRef} className="doc-prose" />
    </div>,
    document.body,
  );
}
