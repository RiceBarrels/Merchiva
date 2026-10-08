// A small, pure HTML tokenizer for the restricted markup pptxtojson writes (`p`, `span`, `a`, `ul`, `ol`, `li`, `br`,
// inline `style`; slides.md §10.1 step 4). No DOM: it runs in Bun tests and never renders anything.
//
// The input is untrusted. pptxtojson interpolates run text and link targets without escaping, and CDATA in the XML
// comes through raw (F14), so any markup can appear. The tokenizer treats everything as data: tags become tokens the
// caller whitelists, `script` / `style` (and a few other raw-text elements) are dropped with their content, comments
// and declarations are skipped, and text is entity-decoded. It never throws.

export type HtmlToken =
  | { t: "open"; name: string; attrs: Readonly<Record<string, string>>; selfClosing: boolean }
  | { t: "close"; name: string }
  | { t: "text"; text: string };

/** Elements whose whole content is dropped with them. */
const DROP_WITH_CONTENT = new Set(["script", "style", "template", "textarea", "title", "noscript", "iframe", "object", "svg", "math", "xmp", "noembed", "noframes"]);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷", euro: "€", pound: "£", yen: "¥", cent: "¢",
};

/** Decodes character references. `&nbsp;` becomes a plain space (pptxtojson writes every space as one). */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});?/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
      return code === 0xa0 ? " " : String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9:-]*/;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** Index of the `>` that ends a tag starting at `from`, skipping quoted attribute values; -1 when unterminated. */
function tagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

/**
 * Tokens of `html`, at most `maxTokens` (the rest is dropped). Adjacent text is merged. Unknown and malformed markup
 * stays in the token stream as text only when it cannot be a tag (a lone "<").
 */
export function tokenizeHtml(html: string, maxTokens = 200_000): HtmlToken[] {
  const out: HtmlToken[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") out.push({ t: "text", text: decodeEntities(text) });
    text = "";
  };
  let i = 0;
  while (i < html.length && out.length < maxTokens) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    const next = html[lt + 1] ?? "";
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (next === "!" || next === "?") {
      const end = html.indexOf(">", lt + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    const closing = next === "/";
    const name = NAME_RE.exec(html.slice(lt + (closing ? 2 : 1), lt + (closing ? 2 : 1) + 64))?.[0];
    if (!name) {
      text += "<";
      i = lt + 1;
      continue;
    }
    const end = tagEnd(html, lt + 1);
    if (end < 0) {
      i = html.length; // an unterminated tag swallows the rest, as a browser would
      break;
    }
    flush();
    const lower = name.toLowerCase();
    if (closing) {
      out.push({ t: "close", name: lower });
      i = end + 1;
      continue;
    }
    const inner = html.slice(lt + 1 + name.length, end);
    const selfClosing = /\/\s*$/.test(inner);
    if (DROP_WITH_CONTENT.has(lower) && !selfClosing) {
      // `lower` matched NAME_RE, so it is safe inside a pattern. (Lowercasing the whole input could shift indices.)
      const closeRe = new RegExp(`</${lower}(?![a-z0-9:-])`, "gi");
      closeRe.lastIndex = end + 1;
      const closeAt = closeRe.exec(html)?.index ?? -1;
      if (closeAt < 0) {
        i = html.length;
        break;
      }
      const closeEnd = html.indexOf(">", closeAt);
      i = closeEnd < 0 ? html.length : closeEnd + 1;
      continue;
    }
    out.push({ t: "open", name: lower, attrs: parseAttrs(inner.replace(/\/\s*$/, "")), selfClosing });
    i = end + 1;
  }
  flush();
  return out.length > maxTokens ? out.slice(0, maxTokens) : out;
}

/** An inline `style` attribute as lowercased property → trimmed value (the last declaration of a property wins). */
export function parseStyle(style: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon <= 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (prop !== "" && value !== "") map.set(prop, value.replace(/\s*!important\s*$/i, ""));
  }
  return map;
}
