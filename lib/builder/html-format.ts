// Pretty-print an HTML fragment. Browser-only (uses DOMParser). Returns input
// unchanged when DOMParser isn't available (SSR) or input is empty.
//
// Design choices:
//   - Block-style elements get their own line + indentation.
//   - Inline runs (a/span/strong/em/...) stay together on one line, including
//     short text-only blocks like `<p>Welcome.</p>`.
//   - <script>, <style>, <pre>, <textarea>, <code> contents are preserved
//     verbatim — reformatting CSS/JS/code makes things worse.
//   - Void elements (br, img, input, ...) emit as `<tag attr="…" />`.
//   - Attribute order is preserved as the parser stores them.

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "data", "dfn", "em", "i",
  "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time",
  "u", "var", "wbr", "label",
]);

const PRESERVE = new Set(["script", "style", "pre", "textarea"]);

const SINGLE_LINE_THRESHOLD = 80;

function attrsString(el: Element): string {
  const out: string[] = [];
  for (const a of Array.from(el.attributes)) {
    // Quote-escape the attribute value
    const v = a.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    out.push(`${a.name}="${v}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

function isInlineish(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = (node as Element).tagName.toLowerCase();
  return INLINE.has(tag);
}

// Render an inline subtree as a single string (no line breaks injected).
function renderInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const a = attrsString(el);
  if (VOID.has(tag)) return `<${tag}${a} />`;
  let inner = "";
  for (const child of Array.from(el.childNodes)) inner += renderInline(child);
  return `<${tag}${a}>${inner}</${tag}>`;
}

function indentLines(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length ? indent + line : line))
    .join("\n");
}

function walk(parent: Element, depth: number, out: string[]): void {
  const indent = "  ".repeat(depth);
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      out.push(`${indent}<!--${child.textContent}-->`);
      continue;
    }
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent || "").trim();
      if (text) out.push(indent + text.replace(/\s+/g, " "));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const a = attrsString(el);

    if (VOID.has(tag)) {
      out.push(`${indent}<${tag}${a} />`);
      continue;
    }

    if (PRESERVE.has(tag)) {
      const raw = el.innerHTML;
      if (!raw.trim()) {
        out.push(`${indent}<${tag}${a}></${tag}>`);
      } else if (raw.includes("\n")) {
        out.push(`${indent}<${tag}${a}>`);
        out.push(indentLines(raw.replace(/\r\n?/g, "\n"), "  ".repeat(depth + 1)));
        out.push(`${indent}</${tag}>`);
      } else {
        out.push(`${indent}<${tag}${a}>${raw}</${tag}>`);
      }
      continue;
    }

    const children = Array.from(el.childNodes);
    if (children.length === 0) {
      out.push(`${indent}<${tag}${a}></${tag}>`);
      continue;
    }

    // Single-line if everything inside is inline AND the result is short.
    const allInline = children.every(isInlineish);
    if (allInline) {
      const inlineRendered = children.map(renderInline).join("").replace(/\s+/g, " ").trim();
      const single = `${indent}<${tag}${a}>${inlineRendered}</${tag}>`;
      if (single.length - indent.length <= SINGLE_LINE_THRESHOLD) {
        out.push(single);
        continue;
      }
    }

    // Multi-line: open tag, recurse, close tag
    out.push(`${indent}<${tag}${a}>`);
    walk(el, depth + 1, out);
    out.push(`${indent}</${tag}>`);
  }
}

export function prettyPrintHtml(html: string): string {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body>${html}</body></html>`,
      "text/html",
    );
    const out: string[] = [];
    walk(doc.body, 0, out);
    return out.join("\n").trim();
  } catch {
    return html;
  }
}
