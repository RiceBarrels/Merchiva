"use client";

/**
 * Header and footer boxes drawn on every sheet.
 *
 * Pages read their content from the static HTML in `useHeaderFooterHtml`, with the page-number fields filled in per
 * page. Double-clicking a box swaps that one page's static markup for a real editor bound to the matching
 * Y.XmlFragment, so edits sync live and every other page updates as the member types.
 */
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Hash, X } from "lucide-react";
import type * as Y from "yjs";

import type { CollaborationProviderLike } from "@/lib/docs/editor-extensions";
import { buildHeaderFooterExtensions } from "@/lib/docs/header-footer-extensions";
import {
  headerFooterField,
  substitutePageFields,
  variantForPage,
  type HeaderFooterVariant,
  type HeaderFooterZone,
} from "@/lib/docs/header-footer";
import { pageMetricsPx, type DocPageSetup } from "@/lib/docs/page-setup";
import type { PaginationLayout } from "@/lib/docs/pagination/measure";
import type { HeaderFooterHtml } from "@/lib/docs/use-header-footer";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface HeaderFooterTarget {
  readonly zone: HeaderFooterZone;
  readonly variant: HeaderFooterVariant;
  /** The page the editor is mounted on — one variant can cover many pages. */
  readonly pageIndex: number;
  /** Insert ▸ Page number opens the box and drops the field in. */
  readonly insertPageField?: boolean;
}

const VARIANT_LABEL_KEYS: Readonly<Record<HeaderFooterVariant, string>> = {
  default: "docs.headerFooter.variantDefault",
  first: "docs.headerFooter.variantFirst",
  even: "docs.headerFooter.variantEven",
};

export function HeaderFooterLayer({
  ydoc,
  provider,
  setup,
  layout,
  html,
  canEdit,
  editing,
  onEditingChange,
}: {
  ydoc: Y.Doc;
  provider: CollaborationProviderLike;
  setup: DocPageSetup;
  layout: PaginationLayout;
  html: HeaderFooterHtml;
  canEdit: boolean;
  editing: HeaderFooterTarget | null;
  onEditingChange: (next: HeaderFooterTarget | null) => void;
}) {
  const t = useT();
  const metrics = pageMetricsPx(setup);
  const pageCount = layout.pages.length;

  return (
    <div className="doc-hf-layer">
      {layout.pages.map((page, index) => {
        const pageNumber = index + 1;
        const variant = variantForPage(pageNumber, setup);
        return (["header", "footer"] as const).map((zone) => {
          const field = headerFooterField(zone, variant);
          const content = html[field] ?? "";
          const active = editing?.zone === zone && editing.variant === variant && editing.pageIndex === index;
          const style =
            zone === "header"
              ? { top: page.top + metrics.headerDistance }
              : { top: page.top + page.height - metrics.footerDistance, transform: "translateY(-100%)" };

          return (
            <div
              key={`${zone}-${index}`}
              className={cn("doc-hf", `doc-hf-${zone}`, active && "is-editing", canEdit && "is-editable")}
              style={{ ...style, left: metrics.marginLeft, width: metrics.contentWidth }}
              onDoubleClick={canEdit && !active ? () => onEditingChange({ zone, variant, pageIndex: index }) : undefined}
            >
              {active ? (
                <HeaderFooterEditor
                  ydoc={ydoc}
                  provider={provider}
                  field={field}
                  insertPageField={editing.insertPageField === true}
                  label={`${t(zone === "header" ? "docs.headerFooter.header" : "docs.headerFooter.footer")} · ${t(VARIANT_LABEL_KEYS[variant])}`}
                  onDone={() => onEditingChange(null)}
                />
              ) : content ? (
                <div className="doc-hf-body doc-prose" dangerouslySetInnerHTML={{ __html: substitutePageFields(content, pageNumber, pageCount) }} />
              ) : (
                canEdit && (
                  <div className="doc-hf-hint">
                    {t(zone === "header" ? "docs.headerFooter.addHeader" : "docs.headerFooter.addFooter")}
                  </div>
                )
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

function HeaderFooterEditor({
  ydoc,
  provider,
  field,
  label,
  insertPageField,
  onDone,
}: {
  ydoc: Y.Doc;
  provider: CollaborationProviderLike;
  field: string;
  label: string;
  insertPageField: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: buildHeaderFooterExtensions({ mode: "live", ydoc, field, provider, canEdit: true }),
      editorProps: { attributes: { class: "doc-hf-body doc-prose", "aria-label": label } },
    },
    [ydoc, provider, field],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (insertPageField) editor.chain().focus("end").insertPageField("page").run();
    else editor.commands.focus("end");
    // Only on mount: re-running would insert a second field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div
      className="doc-hf-edit"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          doneRef.current();
        }
      }}
    >
      <div className="doc-hf-chip" contentEditable={false}>
        <span className="truncate">{label}</span>
        <button
          type="button"
          title={t("docs.headerFooter.pageNumber")}
          aria-label={t("docs.headerFooter.pageNumber")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor?.chain().focus().insertPageField("page").run()}
        >
          <Hash className="h-3 w-3" />
        </button>
        <button type="button" title={t("docs.headerFooter.done")} aria-label={t("docs.headerFooter.done")} onClick={() => doneRef.current()}>
          <X className="h-3 w-3" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Closes the header/footer editor when focus or a click lands anywhere else. */
export function useHeaderFooterEditing(): [HeaderFooterTarget | null, (next: HeaderFooterTarget | null) => void] {
  const [editing, setEditing] = useState<HeaderFooterTarget | null>(null);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".doc-hf.is-editing")) return;
      setEditing(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editing]);

  return [editing, setEditing];
}
