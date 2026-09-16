/**
 * XML access for the DOCX reader.
 *
 * WordprocessingML is namespace-heavy, but every producer writes the same prefixes (`w:`, `a:`, `r:`, `wp:`, `v:`),
 * so prefixed `tagName` lookups are both correct in practice and far cheaper than `getElementsByTagNameNS` over a
 * multi-megabyte part. Lookups fall back to the local name, which rescues the rare part that binds a different
 * prefix without costing anything on the common path.
 *
 * Everything below this module works on `XmlElement` — a structural subset of the DOM `Element` that a parsed
 * element satisfies as is. That keeps `DOMParser` (browser only, like the rest of the import pipeline) in one place
 * and lets the Bun tests drive the whole reader with plain records instead of a DOM shim.
 */

/** The slice of `Element` the reader uses. A real DOM `Element` is assignable to it; so is a plain test record. */
export interface XmlElement {
  readonly tagName: string;
  readonly children: ArrayLike<XmlElement>;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
}

const EMPTY: readonly XmlElement[] = [];

/** `"w:pPr"` → `"pPr"`. */
export function localName(qualified: string): string {
  const colon = qualified.indexOf(":");
  return colon < 0 ? qualified : qualified.slice(colon + 1);
}

function matches(tagName: string, wanted: string): boolean {
  return tagName === wanted || localName(tagName) === localName(wanted);
}

/**
 * Parses one package part. Returns null for anything unusable (no DOM, not XML, a browser `parsererror`
 * placeholder) so callers can degrade instead of throwing.
 */
export function parseXml(text: string | null): XmlElement | null {
  if (!text || typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const root: Element | null = doc.documentElement;
    if (!root) return null;
    // Browsers report a malformed document as a `<parsererror>` element, either as the root or inside it.
    if (localName(root.tagName) === "parsererror") return null;
    if (root.firstElementChild && localName(root.firstElementChild.tagName) === "parsererror") return null;
    return root;
  } catch {
    return null;
  }
}

/** Element children, optionally filtered by qualified name. */
export function children(el: XmlElement | null | undefined, name?: string): XmlElement[] {
  if (!el) return EMPTY as XmlElement[];
  const list = el.children;
  const out: XmlElement[] = [];
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (!node) continue;
    if (!name || matches(node.tagName, name)) out.push(node);
  }
  return out;
}

/** First element child with this qualified name. */
export function child(el: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!el) return null;
  const list = el.children;
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node && matches(node.tagName, name)) return node;
  }
  return null;
}

export function attr(el: XmlElement | null | undefined, name: string): string | null {
  if (!el) return null;
  const exact = el.getAttribute(name);
  if (exact !== null) return exact;
  const local = localName(name);
  return local === name ? null : el.getAttribute(local);
}

/** First present attribute among `names` (`w:left` / `w:start` and friends). */
export function attrAny(el: XmlElement | null | undefined, ...names: readonly string[]): string | null {
  for (const name of names) {
    const value = attr(el, name);
    if (value !== null) return value;
  }
  return null;
}

/** An integer attribute (Word writes signed values in `w:pgMar`), or null when absent or unparsable. */
export function intAttr(el: XmlElement | null | undefined, name: string): number | null {
  const raw = attr(el, name);
  if (raw === null) return null;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) ? value : null;
}

export function intAttrAny(el: XmlElement | null | undefined, ...names: readonly string[]): number | null {
  for (const name of names) {
    const value = intAttr(el, name);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Word's on/off toggle (`w:b`, `w:i`, `w:vanish`, …): the element's presence turns it on unless `w:val` says
 * otherwise. Returns null when the element is absent, which means "inherit" — not "off" — during style resolution.
 */
export function toggle(parent: XmlElement | null | undefined, name: string): boolean | null {
  const el = child(parent, name);
  if (!el) return null;
  const value = attr(el, "w:val");
  if (value === null) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

/** Depth-first search for the first descendant with this qualified name (the root itself never matches). */
export function descendant(root: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!root) return null;
  const stack: XmlElement[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as XmlElement;
    if (node !== root && matches(node.tagName, name)) return node;
    const list = node.children;
    for (let i = list.length - 1; i >= 0; i--) {
      const kid = list[i];
      if (kid) stack.push(kid);
    }
  }
  return null;
}

/** Collapsed text of an element and its descendants. */
export function textOf(el: XmlElement | null | undefined): string {
  return el?.textContent ?? "";
}
