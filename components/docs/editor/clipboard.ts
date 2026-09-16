"use client";

/**
 * Edit ▸ Paste through the async Clipboard API (docs-editor-ui spec §4.6, §6.5). Native Mod+V paste goes through
 * ProseMirror's own clipboard parser; this path is only for the menu items.
 *
 * HTML is sanitized with DOMPurify before it reaches the schema parser (which already drops unknown markup and
 * disallowed link protocols); base64 images are rejected by the Image extension.
 *
 * `insertContent` never runs the view's `transformPasted`, where Mod+V drops comment marks, so the sanitizer removes
 * `data-comment-thread` here: a copied comment span would otherwise anchor its thread a second time.
 */
import type { Editor } from "@tiptap/core";

export type ClipboardPasteResult = "pasted" | "empty" | "blocked";

const FORBID_TAGS = ["style", "script", "iframe", "object", "embed", "form", "input", "button", "link", "meta"];

/** Attributes removed from pasted HTML (exported for tests). */
export const CLIPBOARD_FORBID_ATTR: readonly string[] = ["srcset", "style", "data-comment-thread"];

async function sanitizeClipboardHtml(html: string): Promise<string> {
  const DOMPurify = (await import("dompurify")).default;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: [...CLIPBOARD_FORBID_ATTR],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
  });
}

export async function pasteFromClipboard(editor: Editor, plain: boolean): Promise<ClipboardPasteResult> {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!clipboard) return "blocked";
  try {
    if (!plain && typeof clipboard.read === "function") {
      const items = await clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          const clean = await sanitizeClipboardHtml(html);
          if (!clean.trim()) continue;
          editor.chain().focus().insertContent(clean, { parseOptions: { preserveWhitespace: false } }).run();
          return "pasted";
        }
      }
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const text = await (await item.getType("text/plain")).text();
          if (!text) continue;
          editor.chain().focus().insertContent({ type: "text", text }).run();
          return "pasted";
        }
      }
      return "empty";
    }
    if (typeof clipboard.readText !== "function") return "blocked";
    const text = await clipboard.readText();
    if (!text) return "empty";
    editor.chain().focus().insertContent({ type: "text", text }).run();
    return "pasted";
  } catch {
    return "blocked";
  }
}

/** Edit ▸ Cut / Copy: the browser still owns the clipboard write; focus the editor first so the selection applies. */
export function execClipboardCommand(editor: Editor, command: "cut" | "copy"): boolean {
  editor.commands.focus();
  try {
    return document.execCommand(command);
  } catch {
    return false;
  }
}
