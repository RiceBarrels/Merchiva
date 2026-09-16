/**
 * HTML string building for the DOCX reader.
 *
 * The reader produces HTML text rather than a DOM tree: it is streamed straight into `prepareImportHtml`, which
 * sanitizes it with DOMPurify and parses it with the editor schema. DOMPurify is the backstop, never the plan, so
 * every piece of document text and every attribute value is escaped here first.
 *
 * Images are the one thing that can't be written during the walk (uploading is async), so a run emits an opaque
 * token instead and `index.ts` swaps in the real `<img>` once the uploads settle. The token is delimited by NUL,
 * which `escapeText` strips from document text — so no document can forge one.
 */

/** XML forbids these anyway; a stray one would only confuse the HTML parser. */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const TEXT_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const ATTR_ESCAPES: Readonly<Record<string, string>> = { ...TEXT_ESCAPES, '"': "&quot;", "'": "&#39;" };

/** Document text → HTML text. Tabs, newlines and carriage returns survive; other control characters don't. */
export function escapeText(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/[&<>]/g, (ch) => TEXT_ESCAPES[ch]);
}

/** Any attribute value we write, including ones we built ourselves (a URL, a style string). */
export function escapeAttr(value: string): string {
  return value.replace(CONTROL_CHARS, "").replace(/["'&<>]/g, (ch) => ATTR_ESCAPES[ch]);
}

/** `["color:#f00", "font-size:11pt"]` → ` style="color:#f00;font-size:11pt"`, or `""` when there is nothing to say. */
export function styleAttribute(declarations: readonly string[]): string {
  const style = declarations.filter((d) => d.length > 0).join(";");
  return style ? ` style="${escapeAttr(style)}"` : "";
}

/** `{ class: "doc-title", start: null }` → ` class="doc-title"`. Null and undefined values are left out. */
export function attributes(pairs: Readonly<Record<string, string | null | undefined>>): string {
  let out = "";
  for (const [name, value] of Object.entries(pairs)) {
    if (value === null || value === undefined) continue;
    out += value === "" ? ` ${name}=""` : ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

/** The editor's `PageBreak` node (`lib/docs/extensions/page-break.ts` parses `div[data-page-break]`). */
export const PAGE_BREAK_HTML = '<div data-page-break=""></div>';

const TOKEN_RE = /\x00img:(\d+)\x00/g;

/** Stands in for an embedded image until its upload resolves. */
export function imageToken(index: number): string {
  return `\x00img:${index}\x00`;
}

/** Replaces every placeholder with the `<img>` (or nothing) that `render` returns for its index. */
export function replaceImageTokens(html: string, render: (index: number) => string): string {
  return html.replace(TOKEN_RE, (_match, index: string) => render(Number(index)));
}

/** Text content of rendered HTML, for the "is this header actually empty?" check. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * A CSS font family name safe to interpolate into a `style` attribute. Word stores arbitrary strings here, so
 * anything that could close the declaration or the attribute is dropped rather than escaped — a mangled font name
 * is better than a mangled rule.
 */
export function cssFontFamily(name: string): string | null {
  const cleaned = name.replace(/["'`;:{}()<>\\/]/g, "").trim();
  return cleaned ? `'${cleaned}'` : null;
}
