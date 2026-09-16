/**
 * Runs and everything that lives beside them inside a paragraph: hyperlinks, fields, breaks, symbols and images.
 *
 * A run is the smallest formatted piece of a Word document, and it is where the old importer lost almost
 * everything: colour, size, font, highlight and vertical alignment all live in `w:rPr`. Here each run becomes a
 * `<span style="…">` wrapped in the semantic tags the editor schema parses (`<strong>`, `<em>`, `<u>`, `<s>`,
 * `<sup>`, `<sub>`, `<mark>`).
 *
 * Two things make this more than a loop:
 *
 * - **Page breaks split the paragraph.** `<w:br w:type="page"/>` can sit in the middle of a run, and the editor's
 *   page break is a block node, so the renderer returns *segments* — one block's worth of inline HTML each — and
 *   the paragraph writes a `<div data-page-break>` between them.
 * - **Fields span runs.** `PAGE` is a `begin` / `instrText` / `separate` / cached result / `end` sequence of
 *   sibling runs, so output is redirected into a frame until the field closes and can be rendered as a whole.
 *
 * Images can't be written during the walk (uploading is async), so a run parks the bytes on the tally and emits a
 * placeholder token that `index.ts` swaps out.
 */
import { PAGE_FIELD_ATTR } from "@/lib/docs/header-footer";

import { addImage, warn, warnOnce, type RenderContext } from "./context";
import { attributes, escapeText, imageToken, styleAttribute } from "./emit";
import { mergeRunProps, readRunProps, runStyleString, type RunProps } from "./props";
import { mimeForPath, relTarget } from "./parts";
import { resolveCharacterStyle } from "./styles";
import { cssLengthToPx, emuToPx, vmlStyleValue } from "./units";
import { attr, child, children, descendant, intAttr, localName, textOf, type XmlElement } from "./xml";

/** Word's tab has no HTML equivalent inside a paragraph; two spaces is the least-wrong stand-in. */
const TAB_HTML = "&nbsp;&nbsp;";

interface FieldFrame {
  instruction: string;
  result: string;
  /** Output after `w:fldChar w:fldCharType="separate"` is the field's cached result, which we may reuse. */
  inResult: boolean;
}

interface Emitter {
  readonly ctx: RenderContext;
  /** One entry per page-break-delimited block; always at least one. */
  readonly segments: string[];
  readonly fields: FieldFrame[];
}

function emit(em: Emitter, html: string): void {
  if (!html) return;
  const field = em.fields[em.fields.length - 1];
  if (field) {
    // Before `separate` the runs are the instruction, which is not shown.
    if (field.inResult) field.result += html;
    return;
  }
  em.segments[em.segments.length - 1] += html;
}

function breakPage(em: Emitter): void {
  if (em.fields.length > 0) return;
  em.segments.push("");
}

/* --------------------------------------------------------------- symbols */

/**
 * `w:sym` characters that Word stores in the Private Use Area of a symbol font. Only the glyphs people actually
 * type are mapped; anything else is dropped with a warning rather than rendered as `` in a fallback font.
 */
const WINGDINGS: Readonly<Record<number, string>> = {
  0x6c: "●",
  0x6e: "■",
  0x6f: "□",
  0x75: "◆",
  0x9f: "•",
  0xa7: "▪",
  0xa8: "☐",
  0xfb: "✘",
  0xfc: "✔",
  0xfd: "☒",
  0xfe: "☑",
};

const SYMBOL_FONT: Readonly<Record<number, string>> = {
  0xa5: "∞",
  0xac: "←",
  0xad: "↑",
  0xae: "→",
  0xaf: "↓",
  0xb0: "°",
  0xb1: "±",
  0xb7: "•",
  0xd7: "×",
  0xb8: "÷",
  0xa3: "≤",
  0xb3: "≥",
  0xb9: "≠",
  0xbb: "≈",
};

/** `w:sym w:font="Wingdings" w:char="F0FC"` → `✔`, or null when the glyph has no sensible equivalent. */
export function symbolChar(font: string | null, charHex: string | null): string | null {
  if (!charHex) return null;
  const code = Number.parseInt(charHex.trim(), 16);
  if (!Number.isFinite(code) || code <= 0) return null;
  const low = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
  const family = (font ?? "").trim().toLowerCase();
  if (family.startsWith("wingdings") || family.startsWith("webdings")) return WINGDINGS[low] ?? null;
  if (family === "symbol") return SYMBOL_FONT[low] ?? null;
  // A font we don't know about, but a code point outside the Private Use Area is just a character.
  if (code < 0xe000 || code > 0xf8ff) {
    try {
      return String.fromCodePoint(code);
    } catch {
      return null;
    }
  }
  return WINGDINGS[low] ?? SYMBOL_FONT[low] ?? null;
}

/* ---------------------------------------------------------------- images */

function imageHtml(ctx: RenderContext, relId: string | null, widthPx: number | null, heightPx: number | null): string {
  // The header/footer schema is paragraphs and inline marks; a picture there would be dropped on parse anyway.
  if (ctx.zone !== "body") {
    warn(ctx);
    return "";
  }
  const rel = relTarget(ctx.rels, relId);
  if (!rel) {
    warn(ctx);
    return "";
  }
  const size = { width: widthPx && widthPx > 0 ? String(widthPx) : null, height: heightPx && heightPx > 0 ? String(heightPx) : null };
  if (rel.external) {
    // Linked (not embedded) art: `prepareImportHtml` keeps http(s) sources as they are.
    if (!/^https?:\/\//i.test(rel.target)) {
      warn(ctx);
      return "";
    }
    return `<img${attributes({ src: rel.target, ...size })}>`;
  }
  const bytes = ctx.pkg.zip.bytes(rel.target);
  if (!bytes || bytes.length === 0) {
    warn(ctx);
    return "";
  }
  const index = addImage(ctx, {
    bytes,
    contentType: mimeForPath(ctx.pkg.contentTypes, rel.target),
    name: `image-${ctx.tally.images.length + 1}`,
    widthPx: widthPx && widthPx > 0 ? widthPx : null,
    heightPx: heightPx && heightPx > 0 ? heightPx : null,
  });
  return imageToken(index);
}

/**
 * A shape with no picture in it is usually a text box, and a text box usually holds prose the document needs —
 * a pull quote, a label on a cover page, the address block of a letterhead. The editor has no shape to put it in,
 * so its paragraphs come back as lines of plain text: the box and its run formatting are lost, the words are not.
 * Charts and SmartArt have no `w:txbxContent` and are still dropped.
 */
function textBoxHtml(shape: XmlElement, ctx: RenderContext): string {
  const lines: string[] = [];
  const collect = (element: XmlElement): void => {
    for (const child of children(element)) {
      if (localName(child.tagName) !== "txbxContent") {
        collect(child);
        continue;
      }
      // A text box holds blocks; each one (paragraph or table) becomes a line.
      for (const block of children(child)) {
        const text = inlineText(block);
        if (text) lines.push(escapeText(text));
      }
    }
  };
  collect(shape);
  if (lines.length === 0) return "";
  warnOnce(ctx, "textBox");
  return lines.join("<br>");
}

/** DrawingML picture: `wp:inline` / `wp:anchor` → `wp:extent` for the size, `a:blip r:embed` for the bytes. */
function renderDrawing(drawing: XmlElement, ctx: RenderContext): string {
  const blip = descendant(drawing, "a:blip");
  if (!blip) {
    const text = textBoxHtml(drawing, ctx);
    if (text) return text;
    // A chart, SmartArt or an empty shape — real content, but nothing the editor can hold.
    warn(ctx);
    return "";
  }
  const extent = descendant(drawing, "wp:extent") ?? descendant(drawing, "a:ext");
  const cx = intAttr(extent, "cx");
  const cy = intAttr(extent, "cy");
  const relId = attr(blip, "r:embed") ?? attr(blip, "r:link");
  return imageHtml(ctx, relId, cx === null ? null : emuToPx(cx), cy === null ? null : emuToPx(cy));
}

/** Legacy VML picture (`w:pict`, and the preview inside `w:object`): `v:imagedata r:id`, sized by a CSS style. */
function renderPict(pict: XmlElement, ctx: RenderContext): string {
  const imagedata = descendant(pict, "v:imagedata");
  if (!imagedata) {
    const text = textBoxHtml(pict, ctx);
    if (text) return text;
    warn(ctx);
    return "";
  }
  const shape = descendant(pict, "v:shape") ?? descendant(pict, "v:rect");
  const style = attr(shape, "style");
  const relId = attr(imagedata, "r:id") ?? attr(imagedata, "r:embed") ?? attr(imagedata, "o:relid");
  return imageHtml(ctx, relId, cssLengthToPx(vmlStyleValue(style, "width")), cssLengthToPx(vmlStyleValue(style, "height")));
}

/* ---------------------------------------------------------------- fields */

export type PageFieldKind = "page" | "pages";

/** The field instruction's first keyword: `" PAGE  \\* MERGEFORMAT "` → `page`. */
export function pageFieldKind(instruction: string): PageFieldKind | null {
  const keyword = /^\s*([A-Za-z]+)/.exec(instruction.trim());
  if (!keyword) return null;
  const name = keyword[1].toUpperCase();
  if (name === "PAGE") return "page";
  if (name === "NUMPAGES" || name === "SECTIONPAGES") return "pages";
  return null;
}

function pageFieldHtml(kind: PageFieldKind): string {
  return `<span${attributes({ [PAGE_FIELD_ATTR]: kind })}>#</span>`;
}

/**
 * A finished field. Page numbers become the editor's `pageField` atom inside a header or footer box; everywhere
 * else the field's cached result (what Word last drew) is the honest answer, and a field with no cached result is
 * dropped as a lost construct.
 */
function renderField(ctx: RenderContext, frame: FieldFrame): string {
  const kind = pageFieldKind(frame.instruction);
  if (kind && ctx.zone !== "body") return pageFieldHtml(kind);
  if (frame.result) return frame.result;
  warn(ctx);
  return "";
}

/* ------------------------------------------------------------------ runs */

/** Wraps a run's inline HTML in the tags and the span its properties call for. */
export function wrapRun(inner: string, props: RunProps): string {
  if (!inner) return "";
  let html = inner;
  if (props.strike === true) html = `<s>${html}</s>`;
  if (props.underline === true) html = `<u>${html}</u>`;
  if (props.italic === true) html = `<em>${html}</em>`;
  if (props.bold === true) html = `<strong>${html}</strong>`;
  if (props.vertAlign === "superscript") html = `<sup>${html}</sup>`;
  else if (props.vertAlign === "subscript") html = `<sub>${html}</sub>`;
  const style = runStyleString(props);
  if (style) html = `<span${styleAttribute([style])}>${html}</span>`;
  if (props.highlight) html = `<mark${attributes({ "data-color": props.highlight })}>${html}</mark>`;
  return html;
}

/** Direct `w:rPr` on top of the character style it names, on top of what the paragraph already carries. */
function runProperties(r: XmlElement, ctx: RenderContext, inherited: RunProps): RunProps {
  const direct = readRunProps(child(r, "w:rPr"), ctx.pkg.theme);
  const characterStyle = direct.styleId ? resolveCharacterStyle(ctx.pkg.styles, direct.styleId) : null;
  const base = characterStyle ? mergeRunProps(inherited, characterStyle) : inherited;
  return mergeRunProps(base, direct);
}

function renderRun(r: XmlElement, em: Emitter, inherited: RunProps): void {
  const ctx = em.ctx;
  const props = runProperties(r, ctx, inherited);
  // Hidden text is hidden: showing it would put content on screen the author chose to hide.
  if (props.vanish === true) return;

  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    emit(em, wrapRun(buffer, props));
    buffer = "";
  };

  const handle = (node: XmlElement): void => {
    switch (localName(node.tagName)) {
      case "rPr":
        break;
      case "t":
        buffer += escapeText(textOf(node));
        break;
      case "tab":
      case "ptab":
        warnOnce(ctx, "tab");
        buffer += TAB_HTML;
        break;
      case "br": {
        const type = (attr(node, "w:type") ?? "").trim().toLowerCase();
        if (type === "page") {
          flush();
          breakPage(em);
        } else {
          buffer += "<br>";
        }
        break;
      }
      case "cr":
        buffer += "<br>";
        break;
      case "noBreakHyphen":
        buffer += "&#8209;";
        break;
      case "softHyphen":
        buffer += "&shy;";
        break;
      case "sym": {
        const glyph = symbolChar(attr(node, "w:font"), attr(node, "w:char"));
        if (glyph) buffer += escapeText(glyph);
        else warnOnce(ctx, "symbol");
        break;
      }
      case "drawing":
        flush();
        emit(em, renderDrawing(node, ctx));
        break;
      case "pict":
      case "object":
        flush();
        emit(em, renderPict(node, ctx));
        break;
      case "fldChar": {
        flush();
        const type = (attr(node, "w:fldCharType") ?? "").trim().toLowerCase();
        if (type === "begin") {
          em.fields.push({ instruction: "", result: "", inResult: false });
        } else if (type === "separate") {
          const frame = em.fields[em.fields.length - 1];
          if (frame) frame.inResult = true;
        } else if (type === "end") {
          const frame = em.fields.pop();
          if (frame) emit(em, renderField(ctx, frame));
        }
        break;
      }
      case "instrText":
      case "delInstrText": {
        const frame = em.fields[em.fields.length - 1];
        if (frame && !frame.inResult) frame.instruction += textOf(node);
        break;
      }
      case "footnoteReference":
      case "endnoteReference":
        warnOnce(ctx, "notes");
        break;
      case "AlternateContent": {
        // Markup compatibility: the `Choice` is the modern drawing, the `Fallback` its VML picture.
        const branch = child(node, "mc:Choice") ?? child(node, "mc:Fallback");
        for (const inner of children(branch)) handle(inner);
        break;
      }
      default:
        // `w:lastRenderedPageBreak`, `w:commentReference`, `w:annotationRef`, … carry nothing to show.
        break;
    }
  };

  for (const node of children(r)) handle(node);
  flush();
}

/* ------------------------------------------------------- paragraph inline */

export interface InlineOptions {
  /** Run properties the paragraph's style already contributes. */
  readonly base: RunProps;
  /** Subtrees the paragraph consumed itself (a checkbox content control it turned into a task item). */
  readonly skip?: ReadonlySet<XmlElement>;
}

function walkInline(parent: XmlElement, em: Emitter, options: InlineOptions): void {
  for (const node of children(parent)) {
    if (options.skip?.has(node)) continue;
    switch (localName(node.tagName)) {
      case "pPr":
      case "bookmarkStart":
      case "bookmarkEnd":
      case "proofErr":
      case "commentRangeStart":
      case "commentRangeEnd":
      case "permStart":
      case "permEnd":
      case "lastRenderedPageBreak":
        break;
      case "r":
        renderRun(node, em, options.base);
        break;
      case "hyperlink":
        emit(em, renderHyperlink(node, em.ctx, options));
        break;
      case "fldSimple": {
        const frame: FieldFrame = { instruction: attr(node, "w:instr") ?? "", result: "", inResult: true };
        em.fields.push(frame);
        walkInline(node, em, options);
        em.fields.pop();
        emit(em, renderField(em.ctx, frame));
        break;
      }
      case "sdt":
        walkInline(child(node, "w:sdtContent") ?? node, em, options);
        break;
      case "del":
        // Tracked deletion: the text is not part of the document any more.
        break;
      case "AlternateContent":
        walkInline(child(node, "mc:Choice") ?? child(node, "mc:Fallback") ?? node, em, options);
        break;
      case "ins":
      case "smartTag":
      case "customXml":
      case "bdo":
      case "dir":
      case "sdtContent":
        walkInline(node, em, options);
        break;
      case "subDoc":
        warn(em.ctx);
        break;
      default:
        break;
    }
  }
}

/** `w:hyperlink r:id` → the relationship's URL; `w:anchor` → a fragment link to a bookmark. */
function renderHyperlink(link: XmlElement, ctx: RenderContext, options: InlineOptions): string {
  const inner = renderInline(link, ctx, options).join("");
  if (!inner) return "";
  const rel = relTarget(ctx.rels, attr(link, "r:id"));
  const anchor = attr(link, "w:anchor");
  let href: string | null = null;
  if (rel && /^(https?:|mailto:|tel:)/i.test(rel.target)) href = anchor ? `${rel.target}#${anchor}` : rel.target;
  else if (anchor) href = `#${anchor}`;
  if (!href) return inner;
  return `<a${attributes({ href })}>${inner}</a>`;
}

/**
 * Inline content of a paragraph (or of anything that holds runs), as one HTML string per page-break-delimited
 * block. Always returns at least one segment, empty for an empty paragraph.
 */
export function renderInline(parent: XmlElement, ctx: RenderContext, options: InlineOptions): string[] {
  const em: Emitter = { ctx, segments: [""], fields: [] };
  walkInline(parent, em, options);
  // An unbalanced field (no `end`) still has to give its cached result back.
  while (em.fields.length > 0) {
    const frame = em.fields.pop() as FieldFrame;
    const html = renderField(ctx, frame);
    if (em.fields.length === 0) em.segments[em.segments.length - 1] += html;
    else em.fields[em.fields.length - 1].result += html;
  }
  return em.segments;
}

/** Plain text of a paragraph, for the document title. */
export function inlineText(parent: XmlElement): string {
  let text = "";
  const walk = (el: XmlElement): void => {
    for (const node of children(el)) {
      const name = localName(node.tagName);
      if (name === "t") text += textOf(node);
      else if (name === "tab" || name === "br" || name === "cr") text += " ";
      else if (name === "del" || name === "instrText" || name === "delInstrText" || name === "pPr") continue;
      else walk(node);
    }
  };
  walk(parent);
  return text.replace(/\s+/g, " ").trim();
}
