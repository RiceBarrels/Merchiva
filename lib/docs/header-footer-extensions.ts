/**
 * The Tiptap extension set for header and footer boxes.
 *
 * A deliberately small schema — paragraphs with alignment, the inline marks, links and page-number fields. Headers
 * hold running titles and page numbers, not documents; keeping lists, tables and images out means one line of
 * header HTML can be rendered statically into every page background without layout surprises.
 *
 * Modes mirror `buildDocExtensions`: `live` binds a Y.XmlFragment field on the document's own Y.Doc, `schema` is
 * headless (import seeding, export, static HTML rendering).
 */
import { getSchema, type AnyExtension } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { Collaboration } from "@tiptap/extension-collaboration";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { StarterKit } from "@tiptap/starter-kit";
import type * as Y from "yjs";

import { DocTextAlign } from "@/lib/docs/extensions/base-overrides";
import { PageField } from "@/lib/docs/extensions/page-field";
import type { CollaborationProviderLike } from "@/lib/docs/editor-extensions";

export interface BuildHeaderFooterExtensionsOptions {
  mode: "live" | "schema";
  /** Live only: the document's Y.Doc and the `hf:<zone>:<variant>` field inside it. */
  ydoc?: Y.Doc | null;
  field?: string;
  provider?: CollaborationProviderLike | null;
  canEdit: boolean;
  placeholder?: string;
}

export function buildHeaderFooterExtensions(o: BuildHeaderFooterExtensionsOptions): AnyExtension[] {
  const live = o.mode === "live";
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      // Collaboration ships its own y-undo stack.
      undoRedo: live ? false : {},
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      // A header box is one to three lines; nothing may append to it.
      trailingNode: false,
      dropcursor: false,
      gapcursor: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && !/^\s*(javascript|data|vbscript):/i.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    DocTextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] }),
    PageField,
  ];

  if (live && o.ydoc && o.field) {
    extensions.push(Collaboration.configure({ document: o.ydoc, field: o.field, provider: o.provider ?? null }));
  }

  return extensions;
}

let cachedSchema: Schema | null = null;

/** The header/footer schema (identical in both modes); used by static HTML rendering and by the importer. */
export function headerFooterSchema(): Schema {
  cachedSchema ??= getSchema(buildHeaderFooterExtensions({ mode: "schema", canEdit: true }));
  return cachedSchema;
}
