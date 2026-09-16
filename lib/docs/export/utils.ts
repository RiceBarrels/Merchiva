/**
 * Pure export helpers shared by the exporters and re-exported from `lib/docs/export` (the public entry).
 * No Tiptap, no DOM at module scope.
 */

/** Characters that are invalid in file names on Windows/macOS, plus C0 controls. CJK and other Unicode are kept. */
const FORBIDDEN_FILENAME_CHARS = "\\/:*?\"<>|";

function stripForbiddenFilenameChars(value: string): string {
  let out = "";
  for (const ch of value) {
    if ((ch.codePointAt(0) ?? 0) < 0x20 || ch === "" || FORBIDDEN_FILENAME_CHARS.includes(ch)) continue;
    out += ch;
  }
  return out;
}

/** `"Q3 plan.docx"`; blank or fully stripped titles fall back to `untitled`. Max 120 characters before the extension. */
export function exportFilename(title: string, ext: string, untitled: string): string {
  const clean = (value: string) =>
    Array.from(stripForbiddenFilenameChars(value).replace(/\s+/g, " ").trim())
      .slice(0, 120)
      .join("")
      .trim()
      // Windows refuses names ending in a dot or space.
      .replace(/[. ]+$/, "");
  const base = clean(title) || clean(untitled) || "document";
  const extension = ext.replace(/^\.+/, "");
  return extension ? `${base}.${extension}` : base;
}

/**
 * Unwraps `<span data-comment-thread>` elements (the comment mark) and keeps their content. Synchronous,
 * so `PrintPortal` can call it inside `beforeprint`. Without a DOM (SSR, Bun tests) the HTML is returned as is.
 */
export function stripCommentSpans(html: string): string {
  if (typeof document === "undefined" || !html.includes("data-comment-thread")) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const span of Array.from(template.content.querySelectorAll("span[data-comment-thread]"))) {
    span.replaceWith(...Array.from(span.childNodes));
  }
  return template.innerHTML;
}

/** Escapes text for use inside HTML element content or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
