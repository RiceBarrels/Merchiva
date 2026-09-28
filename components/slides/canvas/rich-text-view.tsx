"use client";

// Slide text as React elements (slides.md §5.2, §6.4): a whitelist walk over the ProseMirror JSON of the slide text
// schema, never an HTML string. It emits the same element types the TipTap editor renders (p, ul/ol/li, strong, em,
// u, s, sub, sup, mark, span, a), so the pre-mounted editor and this view lay text out identically and selecting a
// box never moves its text. Every attribute is re-checked here with the same sanitizers the schema uses; unknown
// nodes and marks from a newer schema render as their plain text.
import type { JSONContent } from "@tiptap/core";
import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { SLIDE_TEXT_CLASS } from "@/components/slides/canvas/slide-text-class";
import { SLIDES_MAX_TEXT_DEPTH } from "@/lib/slides/constants";
import { safeColor, safeHref } from "@/lib/slides/model/safe-values";
import { sanitizeFontRef } from "@/lib/slides/model/sanitize-parts";
import type { ColorValue, TextDefaults } from "@/lib/slides/model/types";
import { paragraphDir, paragraphLineHeight, paragraphSpace } from "@/lib/slides/text/paragraph-attrs";
import { textJsonToPlain } from "@/lib/slides/text/plain";
import { slideFontSizePt } from "@/lib/slides/text/slide-font-size";
import { colorCss, fontCss } from "@/lib/slides/text/theme-css";

export interface RichTextViewProps {
  json: JSONContent;
  /**
   * Present mode only: links render as <a> and a click calls this with the checked href (and never reaches the
   * slide, so it does not advance). Without it, link text is a plain <span>.
   */
  onLinkClick?: (href: string) => void;
}

type LinkHandler = ((href: string) => void) | undefined;

const ALIGNS = new Set(["left", "center", "right", "justify"]);
const LIST_TYPES = new Set(["1", "a", "A", "i", "I"]);

function attrsOf(node: JSONContent): Record<string, unknown> {
  return node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {};
}

function childrenOf(node: JSONContent): JSONContent[] {
  return Array.isArray(node.content) ? node.content.filter((c): c is JSONContent => !!c && typeof c === "object") : [];
}

function linkElement(href: string, onLinkClick: (href: string) => void, children: ReactNode): ReactNode {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onLinkClick(href);
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={onClick}>
      {children}
    </a>
  );
}

function wrapMark(mark: unknown, children: ReactNode, onLinkClick: LinkHandler): ReactNode {
  if (!mark || typeof mark !== "object") return children;
  const { type, attrs } = mark as { type?: unknown; attrs?: Record<string, unknown> };
  const a = attrs ?? {};
  switch (type) {
    case "bold":
      return <strong>{children}</strong>;
    case "italic":
      return <em>{children}</em>;
    case "underline":
      return <u>{children}</u>;
    case "strike":
      return <s>{children}</s>;
    case "subscript":
      return <sub>{children}</sub>;
    case "superscript":
      return <sup>{children}</sup>;
    case "highlight": {
      const color = safeColor(a.color);
      return <mark style={color ? { backgroundColor: colorCss(color), color: "inherit" } : undefined}>{children}</mark>;
    }
    case "textStyle": {
      const color = safeColor(a.color);
      const font = sanitizeFontRef(a.fontFamily);
      const size = slideFontSizePt(a.fontSize);
      if (color === null && font === null && size === null) return children;
      const style: CSSProperties = {};
      if (color !== null) style.color = colorCss(color);
      if (font !== null) style.fontFamily = fontCss(font);
      if (size !== null) style.fontSize = `${size}px`;
      return <span style={style}>{children}</span>;
    }
    case "link": {
      const href = typeof a.href === "string" ? safeHref(a.href) : "";
      return href !== "" && onLinkClick ? linkElement(href, onLinkClick, children) : <span>{children}</span>;
    }
    default:
      return children;
  }
}

function renderInline(node: JSONContent, key: string, onLinkClick: LinkHandler): ReactNode {
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type !== "text") return <span key={key}>{textJsonToPlain(node)}</span>;
  let out: ReactNode = typeof node.text === "string" ? node.text : "";
  const marks = Array.isArray(node.marks) ? node.marks : [];
  // The first mark is the outermost element, as ProseMirror's DOM serializer nests them.
  for (let i = marks.length - 1; i >= 0; i--) out = wrapMark(marks[i], out, onLinkClick);
  return <Fragment key={key}>{out}</Fragment>;
}

function paragraphStyle(attrs: Record<string, unknown>): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (typeof attrs.textAlign === "string" && ALIGNS.has(attrs.textAlign)) {
    style.textAlign = attrs.textAlign as CSSProperties["textAlign"];
  }
  const before = paragraphSpace(attrs.spaceBefore);
  const after = paragraphSpace(attrs.spaceAfter);
  const lineHeight = paragraphLineHeight(attrs.lineHeight);
  if (before !== null) style.marginTop = `${before}px`;
  if (after !== null) style.marginBottom = `${after}px`;
  if (lineHeight !== null) style.lineHeight = lineHeight;
  return Object.keys(style).length > 0 ? style : undefined;
}

function renderParagraph(node: JSONContent, key: string, onLinkClick: LinkHandler): ReactNode {
  const attrs = attrsOf(node);
  const inline = childrenOf(node);
  const last = inline[inline.length - 1];
  // An empty paragraph, or one ending in a hard break, needs a trailing <br> to keep its line (ProseMirror adds the
  // same one), so text and editor have equal height.
  const trailing = !last || last.type === "hardBreak";
  return (
    <p key={key} dir={paragraphDir(attrs.dir) ?? "auto"} style={paragraphStyle(attrs)}>
      {inline.map((child, i) => renderInline(child, `${key}.${i}`, onLinkClick))}
      {trailing ? <br /> : null}
    </p>
  );
}

function renderBlock(node: JSONContent, key: string, onLinkClick: LinkHandler, depth: number): ReactNode {
  if (depth > SLIDES_MAX_TEXT_DEPTH) return <p key={key}>{textJsonToPlain(node)}</p>;
  const blocks = (list: JSONContent[]) => list.map((child, i) => renderBlock(child, `${key}.${i}`, onLinkClick, depth + 1));
  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, key, onLinkClick);
    case "bulletList":
      return <ul key={key}>{blocks(childrenOf(node))}</ul>;
    case "orderedList": {
      const attrs = attrsOf(node);
      const start = typeof attrs.start === "number" && Number.isFinite(attrs.start) ? Math.floor(attrs.start) : 1;
      const type = typeof attrs.type === "string" && LIST_TYPES.has(attrs.type) ? (attrs.type as "1" | "a" | "A" | "i" | "I") : undefined;
      return (
        <ol key={key} start={start === 1 ? undefined : start} type={type}>
          {blocks(childrenOf(node))}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{blocks(childrenOf(node))}</li>;
    default: {
      // Unknown (newer) block: its blocks when it has any, else its text as a paragraph.
      const children = childrenOf(node);
      if (children.some((c) => c.type !== "text" && c.type !== "hardBreak")) return <Fragment key={key}>{blocks(children)}</Fragment>;
      return <p key={key}>{textJsonToPlain(node)}</p>;
    }
  }
}

/** The blocks of a slide text; the caller supplies the container (SlideTextBlock, or its own SLIDE_TEXT_CLASS box). */
export function RichTextView({ json, onLinkClick }: RichTextViewProps) {
  const blocks = json && json.type === "doc" ? childrenOf(json) : json ? [json] : [];
  if (blocks.length === 0) return <p dir="auto"><br /></p>;
  return <>{blocks.map((block, i) => renderBlock(block, String(i), onLinkClick, 1))}</>;
}

export interface SlideTextBlockProps {
  json: JSONContent;
  /** The element's (or table's) text defaults; `color` / `bold` override them (table header cells). */
  defaults: TextDefaults;
  color?: ColorValue;
  bold?: boolean;
  wrap?: boolean;
  vertical?: boolean;
  onLinkClick?: (href: string) => void;
  /** Rendered in place of the text (the pre-mounted editor, §6.2): same container, so nothing moves. */
  editor?: ReactNode;
  /** Prompt of an empty placeholder (edit mode only), shown in place of the empty text. */
  prompt?: string | null;
}

/** The text container of an element or table cell: SLIDE_TEXT_CLASS plus the defaults as inline styles. */
export function SlideTextBlock({ json, defaults, color, bold, wrap = true, vertical = false, onLinkClick, editor, prompt }: SlideTextBlockProps) {
  const style: CSSProperties = {
    fontFamily: fontCss(defaults.font),
    fontSize: `${defaults.size}px`,
    color: colorCss(color ?? defaults.color),
    fontWeight: (bold ?? defaults.bold) ? 700 : 400,
    textAlign: defaults.align,
    lineHeight: defaults.lineHeight,
  };
  if (!wrap) style.whiteSpace = "pre";
  if (vertical) style.writingMode = "vertical-rl";
  let body: ReactNode;
  if (editor !== undefined && editor !== null) body = editor;
  else if (prompt) body = <p dir="auto" style={{ opacity: 0.5 }}>{prompt}</p>;
  else body = <RichTextView json={json} onLinkClick={onLinkClick} />;
  return (
    <div className={SLIDE_TEXT_CLASS} style={style}>
      {body}
    </div>
  );
}
