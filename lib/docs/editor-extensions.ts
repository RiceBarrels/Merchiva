/**
 * The Tiptap v3 extension set for Merchiva Docs (docs-editor-ui spec §1.3, plan §B6 wiring rules).
 *
 * Modes:
 * - `live`    — the collaborative editor: Collaboration (Y.Doc field "default") + CollaborationCaret, no local
 *               undo stack (Collaboration ships y-undo), trailing node only when the member can edit (F11).
 * - `preview` — read-only version preview; same schema, no collaboration.
 * - `schema`  — headless use (template seeding, import, export): same schema, no view-only plugins.
 *
 * Every mode produces the same ProseMirror schema, so JSON from one mode loads in the others. Collaboration never
 * receives `content`: initial content comes from the seeded Yjs state.
 */
import type { AnyExtension } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Image } from "@tiptap/extension-image";
import { ListKit } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder, Selection } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import type * as Y from "yjs";

import { DocBlockquote, DocHighlight, DocTextAlign } from "@/lib/docs/extensions/base-overrides";
import { renderCaret, renderSelection } from "@/lib/docs/extensions/caret-render";
import { CommentMark } from "@/lib/docs/extensions/comment-mark";
import { DocKeymap } from "@/lib/docs/extensions/doc-keymap";
import { ImageUpload } from "@/lib/docs/extensions/image-upload-plugin";
import { Indent } from "@/lib/docs/extensions/indent";
import { LineSpacing } from "@/lib/docs/extensions/line-spacing";
import { PageBreak } from "@/lib/docs/extensions/page-break";
import { Pagination, type PaginationController } from "@/lib/docs/extensions/pagination";
import { ParagraphStyle } from "@/lib/docs/extensions/paragraph-style";
import { PasteGuard } from "@/lib/docs/extensions/paste-guard";
import { SearchAndReplace } from "@/lib/docs/extensions/search-replace";
import { DocTaskItem } from "@/lib/docs/extensions/task-item";
import { docWordCount } from "@/lib/docs/text";

/** What CollaborationCaret needs from the sync provider (`SpacetimeYjsProvider` satisfies it). */
export interface CollaborationProviderLike {
  readonly awareness: {
    setLocalStateField(field: string, value: unknown): void;
    on(event: "update" | "change", fn: (...args: never[]) => void): void;
    off(event: "update" | "change", fn: (...args: never[]) => void): void;
    readonly states: Map<number, Record<string, unknown>>;
  };
}

export interface DocEditorHandlers {
  /** Mod-K / toolbar link button. */
  openLinkEditor?: () => void;
  /** Mod-Alt-M. */
  addComment?: () => void;
  /** Click on a highlighted comment (thread id) or elsewhere (null). */
  activateComment?: (threadId: string | null) => void;
  /** Uploads a pasted/dropped image and resolves to its URL. */
  uploadImage?: (file: File) => Promise<string>;
  /** Shows a translated message for an i18n key (image errors, paste too large, autosave hint). */
  notify?: (messageKey: string, tone: "info" | "error") => void;
}

export interface BuildDocExtensionsOptions {
  mode: "live" | "preview" | "schema";
  /** Live only. */
  ydoc?: Y.Doc | null;
  /** Live only. */
  provider?: CollaborationProviderLike | null;
  /** Live only: shown on this member's caret. */
  user?: { name: string; color: string; memberId: string } | null;
  canEdit: boolean;
  coarsePointer: boolean;
  /** Paged layout controller (desktop only); omit to keep the continuous single sheet. */
  pagination?: PaginationController | null;
  /** Translator for placeholders and labels; identity when omitted (schema mode). */
  t?: (key: string) => string;
  handlers?: DocEditorHandlers;
}

const identity = (key: string) => key;

export function buildDocExtensions(o: BuildDocExtensionsOptions): AnyExtension[] {
  const t = o.t ?? identity;
  const live = o.mode === "live";
  const interactive = o.mode !== "schema";
  const handlers = o.handlers ?? {};
  const readOnlyTicks = live && o.canEdit;

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      // Collaboration ships its own y-undo stack; UndoRedo would conflict (collaboration.ts onCreate warning).
      undoRedo: live ? false : {},
      heading: { levels: [1, 2, 3] },
      // Lists come from ListKit (adds task lists); blockquote from DocBlockquote (no reserved shortcut).
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      // View-only clients must not append nodes (every appendTransaction would create a local Yjs update).
      trailingNode: live && o.canEdit ? {} : false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && !/^\s*(javascript|data|vbscript):/i.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
      dropcursor: interactive ? { width: 2, color: "rgb(37 99 239)" } : false,
      gapcursor: interactive ? undefined : false,
    }),
    DocBlockquote,
    // Task items come from DocTaskItem (same schema) so a tick in read mode is written, not just drawn.
    ListKit.configure({ taskItem: false }),
    DocTaskItem.configure({
      nested: true,
      // Checklists can be ticked in read mode (mobile) by anyone who could edit the live document.
      checkWhileReadOnly: readOnlyTicks,
      onReadOnlyChecked: readOnlyTicks ? () => true : undefined,
    }),
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    DocHighlight.configure({ multicolor: true }),
    DocTextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Subscript,
    Superscript,
    TableKit.configure({
      table: { resizable: live && o.canEdit && !o.coarsePointer, cellMinWidth: 48, allowTableNodeSelection: true },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { loading: "lazy" },
      resize:
        live && o.canEdit && !o.coarsePointer
          ? { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 48, minHeight: 48 }
          : false,
    }),
    ParagraphStyle,
    Indent,
    LineSpacing,
    PageBreak.configure({ label: t("docs.pageBreak.label") }),
    CommentMark.configure({ onActivate: handlers.activateComment }),
    CharacterCount.configure({ wordCounter: docWordCount }),
  ];

  if (o.pagination) extensions.push(Pagination.configure({ controller: o.pagination }));

  if (interactive) {
    extensions.push(
      Placeholder.configure({
        showOnlyCurrent: true,
        placeholder: ({ node }) =>
          node.type.name === "heading" ? t("docs.editor.headingPlaceholder") : t("docs.editor.placeholder"),
      }),
      // Keeps the selection painted while menus and popovers hold focus.
      Selection.configure({ className: "doc-selection" }),
      SearchAndReplace,
      DocKeymap.configure({
        onOpenLinkEditor: handlers.openLinkEditor ?? null,
        onAddComment: handlers.addComment ?? null,
        onSaveHint: handlers.notify ? () => handlers.notify?.("docs.status.autosave", "info") : null,
      }),
    );
  }

  if (live) {
    extensions.push(
      PasteGuard.configure({ onReject: handlers.notify ? () => handlers.notify?.("docs.errors.tooLarge", "error") : null }),
    );
    if (o.canEdit && handlers.uploadImage) {
      extensions.push(
        ImageUpload.configure({
          upload: handlers.uploadImage,
          onError: handlers.notify ? (key) => handlers.notify?.(key, "error") : null,
          uploadingLabel: t("docs.image.uploading"),
        }),
      );
    }
    if (o.ydoc) {
      extensions.push(Collaboration.configure({ document: o.ydoc, field: "default", provider: o.provider ?? null }));
      if (o.provider) {
        extensions.push(
          CollaborationCaret.configure({
            provider: o.provider,
            user: { name: o.user?.name ?? "", color: o.user?.color ?? "#57534e", memberId: o.user?.memberId ?? "" },
            render: renderCaret,
            selectionRender: renderSelection,
          }),
        );
      }
    }
  }

  return extensions;
}
