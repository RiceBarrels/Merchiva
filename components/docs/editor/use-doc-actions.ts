"use client";

/**
 * Every editor command behind the menubar, toolbar, mobile sheets and shortcuts (docs-editor-ui spec §4.7).
 * Formatting commands run `editor.chain().focus()` first, which restores the selection the `Selection` extension
 * kept painted while a menu held focus. Comment writes are owned by the comments panel (WP-7B); this file only
 * starts drafts and tracks the active thread. On /store (a device panel with a PIN operator) new documents and
 * renames go through Drive for the operator; star and copy are refused while the operator is not the tablet account.
 */
import { useMemo, type Dispatch } from "react";
import type { ChainedCommands, Editor } from "@tiptap/core";
import { toast } from "sonner";
import type * as Y from "yjs";

import type { TabActions } from "@/lib/browser-shell";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import { useDocCreatePlacement } from "@/components/drive/drive-actor";
import { createBlankDocument, createDocumentFromTemplate, placedCreateErrorKey, renameDocumentFor } from "@/lib/docs/create";
import { exportDocument, printDocument, type ExportContext, type ExportFormat } from "@/lib/docs/export";
import { startImageUpload } from "@/lib/docs/extensions/image-upload-plugin";
import { getBlockStyle } from "@/lib/docs/extensions/paragraph-style";
import { BLOCK_DEFAULT_PT, clampFontSize, parseFontSizePt, stepFontSize, type BlockStyle, type DocZoom, type LineSpacing } from "@/lib/docs/fonts";
import { formatDateTime, formatInsertedDate } from "@/lib/docs/format";
import { readHeaderFooterContent } from "@/lib/docs/header-footer-content";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import type { DocPageSetup } from "@/lib/docs/page-setup";
import type { DocTemplateId } from "@/lib/docs/templates";
import type { DocAccess, DocVersion, DocumentMeta } from "@/lib/docs/types";
import { normalizeImageUrl, probeImageUrl } from "@/lib/docs/uploads";
import { restoreDocumentVersion, type VersionSaver } from "@/lib/docs/versions";
import { fmt } from "@/lib/i18n/fmt";
import { duplicateDocument, restoreDocument, toggleDocumentStar, trashDocument } from "@/lib/spacetimedb/actions";
import { execClipboardCommand, pasteFromClipboard } from "./clipboard";
import type { DocEditorRefs, DocEditorUiAction, DocEditorUiState } from "./doc-editor-context";
import { reportDocError } from "./notify";

export type MarkName = "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript";
export type ListKind = "bullet" | "ordered" | "task";
export type AlignValue = "left" | "center" | "right" | "justify";
export type TableCommand =
  | "addRowBefore"
  | "addRowAfter"
  | "addColumnBefore"
  | "addColumnAfter"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable"
  | "toggleHeaderRow"
  | "mergeCells"
  | "splitCell";

export interface DocEditorActions {
  // Formatting
  setBlockStyle(style: BlockStyle): void;
  toggleMark(mark: MarkName): void;
  setTextColor(hex: string | null): void;
  setHighlight(hex: string | null): void;
  setFontFamily(css: string | null): void;
  setFontSize(pt: number | null): void;
  stepFontSize(dir: 1 | -1): void;
  setAlign(align: AlignValue): void;
  setLineSpacing(value: LineSpacing): void;
  indent(): void;
  outdent(): void;
  toggleList(kind: ListKind): void;
  clearFormatting(): void;
  tableCommand(command: TableCommand): void;
  // Insert
  insertTable(rows: number, cols: number): void;
  pickImageFile(): void;
  insertImageFromFile(file: File): void;
  /** Resolves true when inserted; shows `docs.image.urlInvalid` otherwise. */
  insertImageFromUrl(url: string): Promise<boolean>;
  openLinkEditor(): void;
  /** False when the link is invalid (caller shows `docs.link.invalid`). */
  applyLink(href: string, text?: string): boolean;
  unsetLink(): void;
  insertHorizontalRule(): void;
  insertPageBreak(): void;
  insertDate(date: Date): void;
  startComment(): void;
  // Edit
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(plain: boolean): Promise<void>;
  selectAll(): void;
  openFind(withReplace: boolean): void;
  // File
  createBlank(): Promise<void>;
  createFromTemplate(id: DocTemplateId): Promise<void>;
  makeCopy(): Promise<void>;
  openShare(): void;
  exportAs(format: ExportFormat): Promise<void>;
  print(): Promise<void>;
  openImport(): void;
  openDocumentPicker(): void;
  nameCurrentVersion(): void;
  saveNamedVersion(name: string): Promise<void>;
  showVersionHistory(): void;
  rename(): void;
  renameTo(title: string): Promise<void>;
  trash(): Promise<void>;
  restoreFromTrash(): Promise<void>;
  toggleStar(): Promise<void>;
  openImported(documentId: string): void;
  // View
  toggleOutline(): void;
  toggleComments(): void;
  setShowWordCount(show: boolean): void;
  setShowRuler(show: boolean): void;
  setZoom(zoom: DocZoom): void;
  toggleFullScreen(): void;
  openWordCount(): void;
  /** File ▸ Page setup. */
  openPageSetup(): void;
  // Versions
  selectVersion(versionId: string | null): void;
  requestRestore(versionId: string): void;
  /** Rejects on failure (the confirmation stays open). */
  confirmRestore(): Promise<void>;
  // Comments
  activateThread(threadId: string | null): void;
  finishDraft(threadId: string | null): void;
  // Mobile
  enterEditing(pos?: number): void;
  exitEditing(): void;
}

export interface DocActionDeps {
  doc: DocumentMeta;
  access: DocAccess;
  canEditNow: boolean;
  editor: Editor | null;
  contentEditor: Editor | null;
  provider: VersionSaver | null;
  ui: DocEditorUiState;
  dispatch: Dispatch<DocEditorUiAction>;
  refs: DocEditorRefs;
  pendingFocus: { current: number | "start" | "end" | null };
  t: (key: string) => string;
  locale: string;
  pageSetup: DocPageSetup;
  /** The document's Y.Doc, so an export can read the header/footer fragments. */
  ydoc: Y.Doc | null;
  isMobile: boolean;
  tabActions: TabActions;
  /**
   * How this surface opens another Docs URL.
   *
   * The device panel renders these same screens with no browser shell bound,
   * so `tabActions` falls back to the router and every navigation throws
   * /store or /personal into /manager with no way back. Everything that opens
   * or replaces a Docs screen goes through here instead — the manager back
   * office passes the shell's openUrl, the device panel swaps its own screen.
   */
  openDocsUrl: DocsOpenUrl;
  storeName: string | null;
  authorName: string | null;
  findVersion(versionId: string): DocVersion | undefined;
  setPreviewVersion(versionId: string | null): void;
  /** Formatted paste shortcut for the "clipboard blocked" hint. */
  pasteShortcut: string;
  /** useDocsSender().actingForOther: star and copy would be written for someone other than the operator. */
  actingForOther: boolean;
}

/** Font size (pt) at the selection: the text-style mark, else the block style's default. */
export function currentFontSizePt(editor: Editor): number {
  return parseFontSizePt(editor.getAttributes("textStyle").fontSize) ?? BLOCK_DEFAULT_PT[getBlockStyle(editor)];
}

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Normalizes user-typed links: adds https:// (or mailto: for emails); null when not a safe URL. */
export function normalizeLinkHref(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    value = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value) ? `mailto:${value}` : `https://${value.replace(/^\/+/, "")}`;
  }
  try {
    const url = new URL(value);
    if (!LINK_PROTOCOLS.has(url.protocol)) return null;
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function useDocActions(deps: DocActionDeps): DocEditorActions {
  const {
    doc,
    access,
    canEditNow,
    editor,
    contentEditor,
    provider,
    ui,
    dispatch,
    refs,
    pendingFocus,
    t,
    locale,
    pageSetup,
    ydoc,
    isMobile,
    tabActions,
    openDocsUrl,
    storeName,
    authorName,
    findVersion,
    setPreviewVersion,
    pasteShortcut,
    actingForOther,
  } = deps;
  // A device panel on /store: new documents belong to the PIN operator (null elsewhere).
  const placement = useDocCreatePlacement();

  return useMemo<DocEditorActions>(() => {
    const format = (build: (chain: ChainedCommands) => ChainedCommands) => {
      if (!editor || editor.isDestroyed || !canEditNow) return;
      // Mobile sheets keep the keyboard down: commands apply to the kept selection without refocusing.
      build(isMobile ? editor.chain() : editor.chain().focus()).run();
    };
    const exportContext = (ed: Editor): ExportContext => ({
      title: doc.title || t("docs.untitled"),
      json: ed.getJSON(),
      html: ed.getHTML(),
      text: ed.getText({ blockSeparator: "\n\n" }),
      locale,
      pageSetup,
      headerFooter: readHeaderFooterContent(ydoc, pageSetup),
    });
    const openNewDocument = (id: string) => openDocsUrl(documentHref(id, { isNew: true }), "new-foreground");
    // A placed create (/store) fails with Drive codes; "[drive.operator]" asks for the PIN again.
    const reportCreateError = (err: unknown) => {
      const driveKey = placedCreateErrorKey(err);
      if (driveKey) toast.error(t(driveKey));
      else reportDocError(err, t, "docs.home.createFailed");
    };
    // Star and copy are written for the signed-in account, which on /store is the tablet, not always the operator:
    // toggleDocumentStar would star for the tablet (drive-ui §5.2), duplicateDocument would make the copy its own.
    // The menus hide them then (DocEditorContextValue.actingForOther); this also refuses them.
    const refusedWhileActing = () => {
      if (!actingForOther) return false;
      toast.error(t("drive.errors.forbidden"));
      return true;
    };
    const activateThread = (threadId: string | null) => {
      dispatch({ type: "activateThread", threadId });
      if (!threadId) return;
      if (isMobile) {
        if (ui.mobilePage !== "comments") dispatch({ type: "openMobilePage", page: "comments" });
      } else if (ui.rightPanel !== "comments") {
        dispatch({ type: "openPanel", panel: "comments" });
      }
    };

    return {
      setBlockStyle: (style) => format((c) => c.setBlockStyle(style)),
      toggleMark: (mark) =>
        format((c) => {
          switch (mark) {
            case "bold":
              return c.toggleBold();
            case "italic":
              return c.toggleItalic();
            case "underline":
              return c.toggleUnderline();
            case "strike":
              return c.toggleStrike();
            case "superscript":
              return c.toggleSuperscript();
            case "subscript":
              return c.toggleSubscript();
          }
        }),
      setTextColor: (hex) => format((c) => (hex ? c.setColor(hex) : c.unsetColor())),
      setHighlight: (hex) => format((c) => (hex ? c.setHighlight({ color: hex }) : c.unsetHighlight())),
      setFontFamily: (css) => format((c) => (css ? c.setFontFamily(css) : c.unsetFontFamily())),
      setFontSize: (pt) => format((c) => (pt ? c.setFontSize(`${clampFontSize(pt)}pt`) : c.unsetFontSize())),
      stepFontSize: (dir) => {
        if (!editor) return;
        const next = stepFontSize(currentFontSizePt(editor), dir);
        format((c) => c.setFontSize(`${clampFontSize(next)}pt`));
      },
      setAlign: (align) => format((c) => c.setTextAlign(align)),
      setLineSpacing: (value) => format((c) => c.setLineSpacing(value)),
      indent: () => format((c) => c.indent()),
      outdent: () => format((c) => c.outdent()),
      toggleList: (kind) =>
        format((c) => (kind === "bullet" ? c.toggleBulletList() : kind === "ordered" ? c.toggleOrderedList() : c.toggleTaskList())),
      // Keeps comment anchors and links (lib/docs/extensions/doc-keymap.ts).
      clearFormatting: () => format((c) => c.clearDocFormatting()),
      tableCommand: (command) =>
        format((c) => {
          switch (command) {
            case "addRowBefore":
              return c.addRowBefore();
            case "addRowAfter":
              return c.addRowAfter();
            case "addColumnBefore":
              return c.addColumnBefore();
            case "addColumnAfter":
              return c.addColumnAfter();
            case "deleteRow":
              return c.deleteRow();
            case "deleteColumn":
              return c.deleteColumn();
            case "deleteTable":
              return c.deleteTable();
            case "toggleHeaderRow":
              return c.toggleHeaderRow();
            case "mergeCells":
              return c.mergeCells();
            case "splitCell":
              return c.splitCell();
          }
        }),

      insertTable: (rows, cols) =>
        format((c) => c.insertTable({ rows: Math.max(1, Math.min(20, rows)), cols: Math.max(1, Math.min(10, cols)), withHeaderRow: false })),
      pickImageFile: () => {
        if (canEditNow) refs.imageInput.current?.click();
      },
      insertImageFromFile: (file) => {
        if (editor && canEditNow) startImageUpload(editor, file);
      },
      insertImageFromUrl: async (raw) => {
        const url = normalizeImageUrl(raw);
        if (!url || !(await probeImageUrl(url))) {
          toast.error(t("docs.image.urlInvalid"));
          return false;
        }
        if (!editor || editor.isDestroyed || !canEditNow) return false;
        editor.chain().focus().setImage({ src: url }).run();
        return true;
      },
      openLinkEditor: () => {
        if (!canEditNow) return;
        if (isMobile) dispatch({ type: "openMobileSheet", sheet: "link" });
        else dispatch({ type: "setLinkEditor", open: true });
      },
      applyLink: (rawHref, text) => {
        const href = normalizeLinkHref(rawHref);
        if (!href) return false;
        if (!editor || editor.isDestroyed || !canEditNow) return false;
        const chain = editor.chain().focus();
        if (editor.isActive("link")) chain.extendMarkRange("link");
        const { from, to, empty } = editor.state.selection;
        const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
        const label = text?.trim() ?? "";
        if (empty && !editor.isActive("link")) {
          chain.insertContent({ type: "text", text: label || href, marks: [{ type: "link", attrs: { href } }] });
        } else if (label && label !== selectedText) {
          chain.insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] });
        } else {
          chain.setLink({ href });
        }
        chain.run();
        return true;
      },
      unsetLink: () => format((c) => c.extendMarkRange("link").unsetLink()),
      insertHorizontalRule: () => format((c) => c.setHorizontalRule()),
      insertPageBreak: () => format((c) => c.setPageBreak()),
      insertDate: (date) => format((c) => c.insertContent(formatInsertedDate(date, locale))),
      startComment: () => {
        if (!editor || editor.isDestroyed || !access.canComment) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) {
          toast(t("docs.comments.selectTextFirst"));
          return;
        }
        const quote = editor.state.doc.textBetween(from, to, " ", " ").replace(/\s+/g, " ").trim().slice(0, 200);
        editor.commands.setCommentDraft({ from, to });
        dispatch({ type: "startDraft", quote });
        if (isMobile) dispatch({ type: "openMobilePage", page: "comments" });
        else {
          if (ui.commentsFilter === "resolved") dispatch({ type: "setCommentsFilter", filter: "open" });
          dispatch({ type: "openPanel", panel: "comments" });
        }
      },

      undo: () => format((c) => c.undo()),
      redo: () => format((c) => c.redo()),
      cut: () => {
        if (!editor || !canEditNow) return;
        if (!execClipboardCommand(editor, "cut")) toast(fmt(t("docs.edit.clipboardBlocked"), { shortcut: pasteShortcut.replace(/V$/, "X") }));
      },
      copy: () => {
        if (!editor) return;
        if (!execClipboardCommand(editor, "copy")) toast(fmt(t("docs.edit.clipboardBlocked"), { shortcut: pasteShortcut.replace(/V$/, "C") }));
      },
      paste: async (plain) => {
        if (!editor || !canEditNow) return;
        const result = await pasteFromClipboard(editor, plain);
        if (result === "blocked") toast(fmt(t("docs.edit.clipboardBlocked"), { shortcut: pasteShortcut }));
      },
      selectAll: () => {
        if (editor && !editor.isDestroyed) editor.chain().focus().selectAll().run();
      },
      openFind: (withReplace) => dispatch({ type: "openFind", withReplace: withReplace && canEditNow }),

      createBlank: async () => {
        try {
          // Seeded with one empty paragraph so concurrent first edits share it (lib/docs/create.ts createBlankDocument).
          openNewDocument(await createBlankDocument(placement));
        } catch (err) {
          reportCreateError(err);
        }
      },
      createFromTemplate: async (id) => {
        const toastId = toast.loading(t("docs.home.creating"));
        try {
          openNewDocument(await createDocumentFromTemplate(id, { t, locale, storeName, authorName, placement }));
        } catch (err) {
          reportCreateError(err);
        } finally {
          toast.dismiss(toastId);
        }
      },
      makeCopy: async () => {
        if (refusedWhileActing()) return;
        try {
          const id = await duplicateDocument({
            sourceDocumentId: doc.id,
            title: fmt(t("docs.copy.title"), { title: doc.title || t("docs.untitled") }),
          });
          toast.success(t("docs.copy.toast"), {
            action: { label: t("docs.menu.open"), onClick: () => openDocsUrl(documentHref(id), "new-foreground") },
          });
        } catch (err) {
          reportDocError(err, t);
        }
      },
      openShare: () => dispatch({ type: "openDialog", dialog: "share" }),
      exportAs: async (exportFormat) => {
        const ed = contentEditor;
        if (!ed || ed.isDestroyed) return;
        try {
          await exportDocument(exportFormat, exportContext(ed), { t, printTarget: refs.printTarget.current });
        } catch {
          toast.error(t("docs.export.failed"));
        }
      },
      print: async () => {
        const ed = contentEditor;
        if (!ed || ed.isDestroyed) return;
        try {
          await printDocument(exportContext(ed), { t, printTarget: refs.printTarget.current });
        } catch {
          toast.error(t("docs.export.failed"));
        }
      },
      openImport: () => dispatch({ type: "openDialog", dialog: "import" }),
      openDocumentPicker: () => dispatch({ type: "openDialog", dialog: "open" }),
      nameCurrentVersion: () => {
        if (canEditNow) dispatch({ type: "openDialog", dialog: "nameVersion" });
      },
      saveNamedVersion: async (name) => {
        if (!provider) throw new Error("No live session");
        try {
          await provider.saveVersion("named", name);
          toast.success(t("docs.versions.named"));
        } catch (err) {
          reportDocError(err, t);
          throw err;
        }
      },
      showVersionHistory: () => {
        if (isMobile) dispatch({ type: "openMobilePage", page: "history" });
        else dispatch({ type: "openPanel", panel: "history" });
      },
      rename: () => {
        if (!canEditNow) return;
        if (isMobile) {
          dispatch({ type: "openDialog", dialog: "rename" });
          return;
        }
        // After the menu that triggered this closes (its focus return sees the input and stays put).
        window.requestAnimationFrame(() => {
          const input = refs.titleInput.current;
          if (!input) return;
          input.focus();
          input.select();
        });
      },
      renameTo: async (title) => {
        try {
          // On /store through Drive: the operator's rights, and their name on it.
          await renameDocumentFor(doc.id, title, placement);
        } catch (err) {
          const driveKey = placedCreateErrorKey(err);
          if (driveKey) toast.error(t(driveKey));
          else reportDocError(err, t);
          throw err;
        }
      },
      trash: async () => {
        if (!access.canManage) return;
        try {
          await trashDocument(doc.id);
          toast(t("docs.trash.movedToast"), {
            action: {
              label: t("docs.trash.undo"),
              onClick: () => {
                restoreDocument(doc.id)
                  .then(() => toast.success(t("docs.trash.restoredToast")))
                  .catch((err: unknown) => reportDocError(err, t));
              },
            },
          });
          // `openDocsUrl(..., "current")`, not navigateActive: inside a device
          // panel there is no bound shell, so navigateActive falls back to the
          // router and throws /store or /personal into /manager with no way
          // back to the device surface.
          openDocsUrl(DOCS_HOME_HREF, "current");
        } catch (err) {
          reportDocError(err, t);
        }
      },
      restoreFromTrash: async () => {
        try {
          await restoreDocument(doc.id);
          toast.success(t("docs.trash.restoredToast"));
        } catch (err) {
          reportDocError(err, t);
        }
      },
      toggleStar: async () => {
        // toggleDocumentStar rejects a trashed document ([doc.trashed]).
        if (doc.trashedAt || refusedWhileActing()) return;
        try {
          await toggleDocumentStar(doc.id);
        } catch (err) {
          reportDocError(err, t);
        }
      },
      openImported: (documentId) => openDocsUrl(documentHref(documentId, { isNew: true }), "new-foreground"),

      toggleOutline: () => {
        if (isMobile) dispatch({ type: "openMobilePage", page: "outline" });
        else dispatch({ type: "setOutline", open: !ui.outlineOpen });
      },
      toggleComments: () => {
        if (isMobile) dispatch({ type: "openMobilePage", page: "comments" });
        else if (ui.rightPanel === "comments") dispatch({ type: "closePanel" });
        else dispatch({ type: "openPanel", panel: "comments" });
      },
      setShowWordCount: (show) => dispatch({ type: "setShowWordCount", show }),
      setShowRuler: (show) => dispatch({ type: "setShowRuler", show }),
      setZoom: (zoom) => dispatch({ type: "setZoom", zoom }),
      toggleFullScreen: () => dispatch({ type: "setFullScreen", on: !ui.fullScreen }),
      openWordCount: () => dispatch({ type: "openDialog", dialog: "wordCount" }),
      openPageSetup: () => dispatch({ type: "openDialog", dialog: "pageSetup" }),

      selectVersion: (versionId) => setPreviewVersion(versionId),
      requestRestore: (versionId) => {
        if (canEditNow) dispatch({ type: "requestRestore", versionId });
      },
      confirmRestore: async () => {
        const versionId = ui.restoreVersionId;
        const version = versionId ? findVersion(versionId) : undefined;
        if (!version || !editor || editor.isDestroyed || !provider) {
          toast.error(t("docs.versions.loadFailed"));
          throw new Error("Version unavailable");
        }
        try {
          await restoreDocumentVersion({
            editor,
            provider,
            version,
            safetyName: fmt(t("docs.versions.beforeRestore"), { time: formatDateTime(new Date(), locale) }),
          });
        } catch (err) {
          reportDocError(err, t, "docs.versions.loadFailed");
          throw err;
        }
        setPreviewVersion(null);
        if (isMobile) dispatch({ type: "closeMobilePage" });
        else dispatch({ type: "closePanel" });
        toast.success(t("docs.versions.restored"));
      },

      activateThread,
      finishDraft: (threadId) => {
        if (editor && !editor.isDestroyed) editor.commands.setCommentDraft(null);
        dispatch({ type: "endDraft" });
        if (threadId) activateThread(threadId);
      },

      enterEditing: (pos) => {
        if (!canEditNow) return;
        pendingFocus.current = pos ?? "end";
        dispatch({ type: "setMobileMode", mode: "editing" });
      },
      exitEditing: () => {
        if (editor && !editor.isDestroyed) editor.commands.blur();
        dispatch({ type: "setMobileMode", mode: "reading" });
      },
    };
  }, [
    doc,
    access,
    canEditNow,
    editor,
    contentEditor,
    provider,
    ui.mobilePage,
    ui.rightPanel,
    ui.commentsFilter,
    ui.outlineOpen,
    ui.fullScreen,
    ui.restoreVersionId,
    dispatch,
    refs,
    pendingFocus,
    t,
    locale,
    pageSetup,
    ydoc,
    isMobile,
    tabActions,
    openDocsUrl,
    storeName,
    authorName,
    placement,
    findVersion,
    setPreviewVersion,
    pasteShortcut,
    actingForOther,
  ]);
}
