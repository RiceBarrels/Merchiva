// Pure HTML-string mutation helpers used by the canvas context menu and
// keyboard shortcuts. Each function parses the input via DOMParser, mutates
// the matched element, and returns the new innerHTML of the wrapper. Returns
// the input unchanged on error / no match. Browser-only (DOMParser).

const ROOT_ID = "__merchiva_root";

function withRoot<T>(html: string, fn: (root: Element, doc: Document) => T): T | null {
  if (typeof window === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body><div id="${ROOT_ID}">${html}</div></body></html>`,
      "text/html",
    );
    const root = doc.getElementById(ROOT_ID);
    if (!root) return null;
    return fn(root, doc);
  } catch {
    return null;
  }
}

function findTarget(root: Element, selector: string): Element | null {
  if (!selector) return null;
  try { return root.ownerDocument.querySelector(selector); } catch { return null; }
}

export function deleteAt(html: string, selector: string): string {
  const next = withRoot(html, (root) => {
    const target = findTarget(root, selector);
    if (!target) return null;
    target.remove();
    return root.innerHTML;
  });
  return next ?? html;
}

export function duplicateAt(html: string, selector: string): { html: string; newSelector: string | null } {
  const result = withRoot<{ html: string; newSelector: string | null } | null>(html, (root) => {
    const target = findTarget(root, selector);
    if (!target || !target.parentNode) return null;
    const clone = target.cloneNode(true) as Element;
    target.parentNode.insertBefore(clone, target.nextSibling);
    return { html: root.innerHTML, newSelector: buildSelectorFor(clone) };
  });
  return result ?? { html, newSelector: null };
}

export function moveAt(html: string, selector: string, direction: "up" | "down"): { html: string; newSelector: string | null } {
  const result = withRoot<{ html: string; newSelector: string | null } | null>(html, (root) => {
    const target = findTarget(root, selector);
    if (!target || !target.parentNode) return null;
    const sibling = direction === "up" ? target.previousElementSibling : target.nextElementSibling;
    if (!sibling) return null;
    if (direction === "up") {
      target.parentNode.insertBefore(target, sibling);
    } else {
      target.parentNode.insertBefore(sibling, target);
    }
    return { html: root.innerHTML, newSelector: buildSelectorFor(target) };
  });
  return result ?? { html, newSelector: null };
}

export function wrapAt(html: string, selector: string, wrapperTag = "div"): { html: string; newSelector: string | null } {
  const result = withRoot<{ html: string; newSelector: string | null } | null>(html, (root, doc) => {
    const target = findTarget(root, selector);
    if (!target || !target.parentNode) return null;
    const wrap = doc.createElement(wrapperTag);
    target.parentNode.insertBefore(wrap, target);
    wrap.appendChild(target);
    return { html: root.innerHTML, newSelector: buildSelectorFor(wrap) };
  });
  return result ?? { html, newSelector: null };
}

// Insert a snippet relative to a target. position:
//   "before" → insert as previous sibling
//   "after"  → insert as next sibling
//   "inside" → append as last child (only valid for non-text elements;
//              caller should fall back to "after" for text tags)
export function insertAt(
  html: string,
  selector: string | null,
  snippet: string,
  position: "before" | "after" | "inside",
): { html: string; newSelector: string | null } {
  const result = withRoot<{ html: string; newSelector: string | null } | null>(html, (root, doc) => {
    const target = selector ? findTarget(root, selector) : null;
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = snippet;
    const fragment = doc.createDocumentFragment();
    let firstEl: Element | null = null;
    while (wrapper.firstChild) {
      const node = wrapper.firstChild;
      if (!firstEl && node.nodeType === 1) firstEl = node as Element;
      fragment.appendChild(node);
    }
    if (!target) {
      root.appendChild(fragment);
    } else if (position === "inside") {
      target.appendChild(fragment);
    } else if (position === "before") {
      target.parentNode?.insertBefore(fragment, target);
    } else {
      target.parentNode?.insertBefore(fragment, target.nextSibling);
    }
    return { html: root.innerHTML, newSelector: firstEl ? buildSelectorFor(firstEl) : null };
  });
  return result ?? { html, newSelector: null };
}

export function getOuterHtmlAt(html: string, selector: string): string | null {
  return withRoot(html, (root) => {
    const target = findTarget(root, selector);
    return target ? target.outerHTML : null;
  });
}

// Builds a selector matching the iframe's buildSelector format:
// "#__merchiva_root > tag:nth-of-type(N) > tag > …"
function buildSelectorFor(el: Element): string {
  if (el.id) return "#" + cssEscape(el.id);
  const path: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.id !== ROOT_ID && path.length < 8) {
    let part = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
    }
    path.unshift(part);
    cur = parent;
  }
  return `#${ROOT_ID} > ${path.join(" > ")}`;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/[^\w-]/g, "\\$&");
}
