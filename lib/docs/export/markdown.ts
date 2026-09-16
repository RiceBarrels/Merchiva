/**
 * Markdown export (docs-editor-ui spec §6.3): Tiptap HTML → GitHub-flavoured Markdown with turndown +
 * turndown-plugin-gfm. Loaded on demand by `exportDocument("md")`.
 *
 * Rules added here run before turndown's defaults and gfm's rules (later `addRule` calls take precedence):
 * - tight lists: a `<p>` inside a list item doesn't produce blank lines; `- item` / `1. item` prefixes
 * - task items (`li[data-type="taskItem"]`) → `- [x] text`, nested content indented
 * - title paragraphs → `# `, subtitles → `*…*`; page breaks → a blank line
 * - table cells: paragraphs and line breaks → `<br>`, pipes escaped (tables without a header row stay HTML)
 * Inline-only marks with no Markdown form (underline, highlight, sub/superscript, text style, comment spans)
 * keep their text.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function elementParent(node: Node): HTMLElement | null {
  const parent = node.parentNode;
  return parent && parent.nodeType === 1 ? (parent as HTMLElement) : null;
}

function isTaskItem(node: Node | null): boolean {
  return !!node && node.nodeName === "LI" && (node as HTMLElement).getAttribute("data-type") === "taskItem";
}

function isInTableCell(node: Node): boolean {
  for (let cur = elementParent(node); cur; cur = elementParent(cur)) {
    if (cur.nodeName === "TD" || cur.nodeName === "TH") return true;
    if (cur.nodeName === "TABLE") return false;
  }
  return false;
}

/** The list item a paragraph belongs to: `li > p`, or a task item's `li > div > p`. */
function isListParagraph(node: HTMLElement): boolean {
  if (node.nodeName !== "P") return false;
  const parent = elementParent(node);
  if (!parent) return false;
  if (parent.nodeName === "LI") return true;
  return parent.nodeName === "DIV" && isTaskItem(elementParent(parent));
}

function elementIndex(node: HTMLElement): number {
  const parent = elementParent(node);
  return parent ? Array.prototype.indexOf.call(parent.children, node) : 0;
}

function createService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.use(gfm);

  service.addRule("docPageBreak", {
    filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-page-break"),
    replacement: () => "\n\n",
  });

  service.addRule("docTitle", {
    filter: (node) => node.nodeName === "P" && node.getAttribute("data-doc-style") === "title",
    replacement: (content) => {
      const text = content.replace(/\s+/g, " ").trim();
      return text ? `\n\n# ${text}\n\n` : "";
    },
  });

  service.addRule("docSubtitle", {
    filter: (node) => node.nodeName === "P" && node.getAttribute("data-doc-style") === "subtitle",
    replacement: (content) => {
      const text = content.replace(/\s+/g, " ").trim();
      return text ? `\n\n*${text}*\n\n` : "";
    },
  });

  // Task item chrome: the checkbox label is replaced by the `[x]` prefix; the content wrapper is transparent.
  service.addRule("docTaskCheckbox", {
    filter: (node) => node.nodeName === "LABEL" && isTaskItem(elementParent(node)),
    replacement: () => "",
  });
  service.addRule("docTaskBody", {
    filter: (node) => node.nodeName === "DIV" && isTaskItem(elementParent(node)),
    replacement: (content) => content,
  });

  // A list nested in a task item sits inside its content `div`, so turndown's list rule would add blank lines
  // around it (it only tightens lists whose parent is an `li`).
  service.addRule("docTaskNestedList", {
    filter: (node) => {
      if (node.nodeName !== "UL" && node.nodeName !== "OL") return false;
      const parent = elementParent(node);
      return !!parent && parent.nodeName === "DIV" && isTaskItem(elementParent(parent));
    },
    replacement: (content) => `\n${content.replace(/\n+$/, "")}\n`,
  });

  service.addRule("docListParagraph", {
    filter: (node) => isListParagraph(node),
    replacement: (content, node) => {
      const next = (node as HTMLElement).nextElementSibling;
      if (!next) return content;
      if (next.nodeName === "UL" || next.nodeName === "OL") return content;
      return `${content}\n\n`;
    },
  });

  service.addRule("docListItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const item = node as HTMLElement;
      const parent = elementParent(item);
      let prefix: string;
      let indentWidth: number;
      if (isTaskItem(item)) {
        prefix = `- [${item.getAttribute("data-checked") === "true" ? "x" : " "}] `;
        indentWidth = 2;
      } else if (parent?.nodeName === "OL") {
        const start = Number.parseInt(parent.getAttribute("start") ?? "1", 10);
        prefix = `${(Number.isFinite(start) ? start : 1) + elementIndex(item)}. `;
        indentWidth = prefix.length;
      } else {
        prefix = `${options.bulletListMarker ?? "-"} `;
        indentWidth = prefix.length;
      }
      const indent = " ".repeat(indentWidth);
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n/g, `\n${indent}`);
      return `${prefix}${body}${item.nextElementSibling ? "\n" : ""}`;
    },
  });

  service.addRule("docCellParagraph", {
    filter: (node) => node.nodeName === "P" && isInTableCell(node),
    replacement: (content, node) => `${content.trim()}${(node as HTMLElement).nextElementSibling ? "<br>" : ""}`,
  });

  service.addRule("docCellBreak", {
    filter: (node) => node.nodeName === "BR" && isInTableCell(node),
    replacement: () => "<br>",
  });

  service.addRule("docTableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => {
      const text = content.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
      return `${elementIndex(node as HTMLElement) === 0 ? "| " : " "}${text} |`;
    },
  });

  return service;
}

let cachedService: TurndownService | null = null;

/** Converts editor HTML (comment spans already stripped or not) to Markdown ending in one newline. */
export function htmlToMarkdown(html: string): string {
  if (!cachedService) cachedService = createService();
  const markdown = cachedService
    // Tiptap renders a <colgroup> before <tbody>; gfm only treats the first row as a header when <tbody> has no
    // preceding sibling, so without this every table would be kept as raw HTML.
    .turndown(html.replace(/<colgroup\b[^>]*>[\s\S]*?<\/colgroup>/gi, ""))
    // Whitespace-only lines left by indentation.
    .replace(/^[ \t]+$/gm, "")
    .trim();
  return markdown ? `${markdown}\n` : "";
}
