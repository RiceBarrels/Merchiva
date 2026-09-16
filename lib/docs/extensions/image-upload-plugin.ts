/**
 * ImageUploadPlugin (docs-editor-ui spec §2.7): pasted or dropped image files are uploaded (UploadThing, no base64)
 * and inserted where they landed. While uploading, a local widget decoration marks the spot; it is never synced.
 */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { docImageProblemKey, validateDocImage } from "@/lib/docs/uploads";

export interface ImageUploadOptions {
  /** Uploads a file and resolves to its hosted URL. */
  upload: ((file: File) => Promise<string>) | null;
  /** Shows an error message for an i18n key (`docs.image.*`). */
  onError: ((messageKey: string) => void) | null;
  /** Accessible label of the placeholder (`docs.image.uploading`). */
  uploadingLabel: string;
}

type UploadMeta = { add: { id: string; pos: number } } | { remove: { id: string } };

const uploadPluginKey = new PluginKey<DecorationSet>("docImageUpload");

let uploadCounter = 0;

function findPlaceholder(set: DecorationSet, id: string): number | null {
  const found = set.find(undefined, undefined, (spec: { uploadId?: string }) => spec.uploadId === id);
  return found.length ? found[0].from : null;
}

const NON_CONTENT_BLOCKS = /<(head|style|script|xml|title|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const CONTENT_ELEMENTS = /<(table|hr|ul|ol|li|pre|blockquote|h[1-6])\b/i;
const WHITESPACE_ENTITIES = /&(nbsp|#160|#x0*a0|ensp|emsp|thinsp|zwnj|zwj|#8203|#x200b);/gi;

/**
 * Whether clipboard HTML carries anything besides images: visible text or structural elements. Comments, the head,
 * styles, Office `<xml>` islands, tags and whitespace entities do not count.
 */
export function clipboardHtmlHasContent(html: string): boolean {
  if (!html.trim()) return false;
  const body = html.replace(/<!--[\s\S]*?-->/g, "").replace(NON_CONTENT_BLOCKS, "");
  if (CONTENT_ELEMENTS.test(body)) return true;
  const text = body.replace(/<[^>]*>/g, "").replace(WHITESPACE_ENTITIES, " ");
  return text.trim().length > 0;
}

function imageFiles(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith("image/"));
}

/** Uploads `file` and inserts an image at `pos` (usable from menus too). */
export function startImageUpload(editor: Editor, file: File, pos?: number): void {
  const upload = (editor.extensionManager.extensions.find((ext) => ext.name === "imageUpload")?.options as ImageUploadOptions | undefined);
  if (!upload) return;
  beginUpload(editor.view, file, pos ?? editor.state.selection.from, upload);
}

function beginUpload(view: EditorView, file: File, pos: number, options: ImageUploadOptions): void {
  const problem = validateDocImage(file);
  if (problem) {
    options.onError?.(docImageProblemKey(problem));
    return;
  }
  if (!options.upload) return;
  const id = `upload-${Date.now().toString(36)}-${(uploadCounter++).toString(36)}`;
  view.dispatch(view.state.tr.setMeta(uploadPluginKey, { add: { id, pos } } satisfies UploadMeta).setMeta("addToHistory", false));

  options
    .upload(file)
    .then((src) => {
      if (view.isDestroyed) return;
      const set = uploadPluginKey.getState(view.state);
      const at = set ? findPlaceholder(set, id) : null;
      const imageType = view.state.schema.nodes.image;
      const tr = view.state.tr.setMeta(uploadPluginKey, { remove: { id } } satisfies UploadMeta);
      if (at !== null && imageType) {
        tr.replaceRangeWith(at, at, imageType.create({ src }));
      }
      view.dispatch(tr);
    })
    .catch(() => {
      if (!view.isDestroyed) {
        view.dispatch(view.state.tr.setMeta(uploadPluginKey, { remove: { id } } satisfies UploadMeta).setMeta("addToHistory", false));
      }
      options.onError?.("docs.image.failed");
    });
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
  name: "imageUpload",

  addOptions() {
    return { upload: null, onError: null, uploadingLabel: "Uploading image…" };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;
    return [
      new Plugin<DecorationSet>({
        key: uploadPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            let next = set.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(uploadPluginKey) as UploadMeta | undefined;
            if (meta && "add" in meta) {
              const widget = document.createElement("span");
              widget.className = "doc-upload-placeholder";
              widget.setAttribute("role", "status");
              widget.setAttribute("aria-label", options.uploadingLabel);
              const pos = Math.max(0, Math.min(meta.add.pos, tr.doc.content.size));
              next = next.add(tr.doc, [Decoration.widget(pos, widget, { uploadId: meta.add.id })]);
            } else if (meta && "remove" in meta) {
              next = next.remove(next.find(undefined, undefined, (spec: { uploadId?: string }) => spec.uploadId === meta.remove.id));
            }
            return next;
          },
        },
        props: {
          decorations: (state) => uploadPluginKey.getState(state) ?? DecorationSet.empty,
          handlePaste: (view, event) => {
            if (!editor.isEditable || !options.upload) return false;
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            // Office (Excel ranges, Word text and tables) puts a picture of the selection next to its HTML: paste
            // the content. Only image-only HTML (a browser's "Copy image") uploads the file.
            if (clipboardHtmlHasContent(event.clipboardData?.getData("text/html") ?? "")) return false;
            event.preventDefault();
            for (const file of files) beginUpload(view, file, view.state.selection.from, options);
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved || !editor.isEditable || !options.upload) return false;
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
            for (const file of files) beginUpload(view, file, at, options);
            return true;
          },
        },
      }),
    ];
  },
});
