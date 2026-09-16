/**
 * HTML import pipeline (docs-editor-ui spec §6.4 steps 3–5). Browser only (DOMParser, DOMPurify); loaded on demand
 * by `importFile`.
 *
 * 1. `normalizeTaskLists` — GFM / plain checkbox lists become Tiptap task lists (before sanitizing removes inputs).
 * 2. `sanitizeImportHtml` — DOMPurify with the HTML profile; scripts, styles, frames, forms and event handlers go,
 *    and only http(s) / mailto / tel / fragment links survive. Inline `style` and `data-*` attributes are kept,
 *    which is how an imported document's colours, fonts and indents reach the schema's `parseHTML` rules.
 * 3. `clampHeadingLevels` — h4–h6 become h3 (the schema has levels 1–3).
 * 4. Images: http(s) sources stay linked; `data:` images are uploaded (never stored inline); anything else
 *    (relative, `file:`, `blob:`) is dropped and counted, except converter failures that were counted already.
 * 5. Title: the first `h1` or title-styled paragraph, else the document `<title>`.
 * 6. `htmlToDocJson` — `generateJSON` with the editor's own extension set (schema mode).
 *
 * Header and footer boxes go through `headerFooterHtmlToJson`, which is the same pipeline against the smaller
 * header schema (paragraphs, inline marks, links and page-number fields).
 */
import { generateJSON, type JSONContent } from "@tiptap/core";
import DOMPurify from "dompurify";

import { buildDocExtensions } from "@/lib/docs/editor-extensions";
import { buildHeaderFooterExtensions } from "@/lib/docs/header-footer-extensions";

import { createLimiter, dataUrlToBlob, IMPORT_SKIPPED_IMAGE_ATTR, importImageAction, toUploadableImage } from "./images";

export interface PrepareImportHtmlDeps {
  uploadImage(file: File): Promise<string>;
}

export interface PreparedImportHtml {
  /** Sanitized body HTML with re-hosted images. */
  html: string;
  title: string | null;
  /** Images dropped because they couldn't be uploaded or had an unusable source. */
  skippedImages: number;
}

const FORBID_TAGS = [
  "style",
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "link",
  "meta",
  "base",
  "template",
  "noscript",
  "svg",
  "math",
  "video",
  "audio",
  "source",
  "track",
];

const UPLOAD_CONCURRENCY = 3;

function isCheckbox(node: Element | null): node is HTMLInputElement {
  return !!node && node.tagName === "INPUT" && (node as HTMLInputElement).type.toLowerCase() === "checkbox";
}

/** Whitespace-only text before `el` inside `parent`. */
function onlyWhitespaceBefore(parent: Element, el: Element): boolean {
  for (let node = parent.firstChild; node && node !== el; node = node.nextSibling) {
    if (node.nodeType === 3 && node.textContent?.trim()) return false;
    if (node.nodeType === 1) return false;
  }
  return true;
}

/** The leading checkbox of a list item: `li > input`, or `li > p > input` in loose lists. */
function leadingCheckbox(li: Element): HTMLInputElement | null {
  const first = li.firstElementChild;
  if (isCheckbox(first) && onlyWhitespaceBefore(li, first)) return first;
  if (first && first.tagName === "P" && onlyWhitespaceBefore(li, first)) {
    const inner = first.firstElementChild;
    if (isCheckbox(inner) && onlyWhitespaceBefore(first, inner)) return inner;
  }
  return null;
}

/**
 * Converts lists whose every item starts with a checkbox (marked's GFM output, many HTML exports) into
 * `ul[data-type=taskList] > li[data-type=taskItem][data-checked]`. Lists that are already task lists are untouched.
 */
export function normalizeTaskLists(doc: Document): void {
  for (const list of Array.from(doc.querySelectorAll("ul, ol"))) {
    if (list.getAttribute("data-type") === "taskList") continue;
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    if (items.length === 0) continue;
    const boxes = items.map((li) => leadingCheckbox(li));
    if (boxes.some((box) => box === null)) continue;
    items.forEach((li, index) => {
      const box = boxes[index] as HTMLInputElement;
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", box.checked || box.hasAttribute("checked") ? "true" : "false");
      const next = box.nextSibling;
      if (next && next.nodeType === 3 && next.textContent) next.textContent = next.textContent.replace(/^\s+/, "");
      box.remove();
    });
    list.setAttribute("data-type", "taskList");
  }
}

export function sanitizeImportHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ["srcset", "sizes", "formaction", "background", "ping"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
  });
}

function textOf(el: Element | null): string | null {
  const text = el?.textContent?.replace(/\s+/g, " ").trim();
  return text ? text : null;
}

async function rehostImages(doc: Document, deps: PrepareImportHtmlDeps): Promise<number> {
  const limit = createLimiter(UPLOAD_CONCURRENCY);
  let skipped = 0;
  await Promise.all(
    Array.from(doc.querySelectorAll("img")).map(async (img) => {
      const src = (img.getAttribute("src") ?? "").trim();
      // DOMPurify has already removed sources outside ALLOWED_URI_REGEXP (relative, file:, blob:), leaving no src.
      const action = importImageAction(src, img.hasAttribute(IMPORT_SKIPPED_IMAGE_ATTR));
      if (action === "keep") return;
      if (action === "dropCounted") {
        img.remove();
        return;
      }
      if (action === "upload") {
        const blob = dataUrlToBlob(src);
        const file = blob ? await toUploadableImage(blob, "image") : null;
        if (file) {
          try {
            img.setAttribute("src", await limit(() => deps.uploadImage(file)));
            return;
          } catch {
            // counted below
          }
        }
      }
      skipped += 1;
      img.remove();
    }),
  );
  return skipped;
}

/**
 * The editor schema only has headings 1–3, and ProseMirror's parser turns an unknown `h4`–`h6` into a plain
 * paragraph. Word "Heading 4+", Markdown `####` and HTML h4–h6 become level 3 so they stay headings (and outline
 * entries); attributes such as `style="text-align"` are kept.
 */
export function clampHeadingLevels(doc: Document): void {
  for (const heading of Array.from(doc.querySelectorAll("h4, h5, h6"))) {
    const replacement = doc.createElement("h3");
    for (const { name, value } of Array.from(heading.attributes)) replacement.setAttribute(name, value);
    while (heading.firstChild) replacement.appendChild(heading.firstChild);
    heading.replaceWith(replacement);
  }
}

export async function prepareImportHtml(rawHtml: string, deps: PrepareImportHtmlDeps): Promise<PreparedImportHtml> {
  const parser = new DOMParser();
  const source = parser.parseFromString(rawHtml, "text/html");
  const headTitle = textOf(source.querySelector("head > title"));
  normalizeTaskLists(source);

  const clean = parser.parseFromString(sanitizeImportHtml(source.body.innerHTML), "text/html");
  clampHeadingLevels(clean);
  const skippedImages = await rehostImages(clean, deps);
  const title = textOf(clean.querySelector('h1, p.doc-title, p[data-doc-style="title"]')) ?? headTitle;
  return { html: clean.body.innerHTML, title, skippedImages };
}

let schemaExtensions: ReturnType<typeof buildDocExtensions> | null = null;

/** Sanitized HTML → editor JSON (a `doc` with at least one block). */
export function htmlToDocJson(html: string): JSONContent {
  schemaExtensions ??= buildDocExtensions({ mode: "schema", canEdit: true, coarsePointer: false });
  const json = generateJSON(html, schemaExtensions) as JSONContent;
  const content = Array.isArray(json.content) ? json.content : [];
  return { ...json, type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

let headerFooterExtensions: ReturnType<typeof buildHeaderFooterExtensions> | null = null;

/**
 * Raw header/footer HTML → header-schema JSON, or null when the box holds nothing worth seeding. Sanitized here
 * (the converter's output never reaches the DOM otherwise) against the same profile as the body.
 */
export function headerFooterHtmlToJson(html: string): JSONContent | null {
  const clean = sanitizeImportHtml(html).trim();
  if (!clean) return null;
  headerFooterExtensions ??= buildHeaderFooterExtensions({ mode: "schema", canEdit: true });
  const json = generateJSON(clean, headerFooterExtensions) as JSONContent;
  const content = Array.isArray(json.content) ? json.content : [];
  const hasContent = content.some((node) => node.type !== "paragraph" || (node.content?.length ?? 0) > 0);
  return hasContent ? { ...json, type: "doc", content } : null;
}
