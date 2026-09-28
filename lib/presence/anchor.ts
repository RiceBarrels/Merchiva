import { fnv1a } from "./hash";

/*
 * Click anchors for page presence (contract H). When someone clicks inside a /manager page, the
 * tracker describes the element they clicked so that every colleague on the same page can point at
 * that element in their own layout — their widths, scroll offsets and loaded rows differ — and the
 * resolver finds it again.
 *
 * An anchor is a list of candidates for ONE element, most stable first, joined by "|", at most
 * ANCHOR_MAX UTF-16 units (the module's limit). The module rejects control characters, "\n"
 * included, so the separator is printable and no candidate value may contain it. `anchorX` /
 * `anchorY` on the row are the click's position inside that element, so whichever candidate
 * resolves, the point is the same.
 *
 *   id:<value>           its `data-presence-id` — opt-in, namespaced, the same on every client
 *   href:<path>@<n>      an in-app link: its /manager path (no query: doc ids live there), n-th such link
 *   aria:<hash>@<n>      its aria-label, hashed (FNV-1a, base 36), n-th element with that label
 *   name:<hash>@<n>      its `name` attribute, hashed the same way
 *   path:<tag:n>>…       tag:nth-of-type steps down from the active tab's slot (last resort)
 *
 * `page:` on its own means "arrived, no click yet": the viewer points at the page heading.
 *
 * Only attributes and tag names are read — never input values or text content — and labels leave
 * the device hashed, so a label that carries a person's name or a document title is not published.
 *
 * Pure: the DOM is reached through `AnchorNode`, which real elements satisfy, so the tests run
 * against small fake trees.
 */

/** The part of an Element the anchor code reads. */
export interface AnchorNode {
  readonly tagName: string;
  readonly parentElement: AnchorNode | null;
  readonly children: ArrayLike<AnchorNode>;
  getAttribute(name: string): string | null;
  querySelectorAll(selectors: string): ArrayLike<AnchorNode>;
}

/** The module's `anchor` limit. */
export const ANCHOR_MAX = 512;
/** Between candidates; never inside a candidate value. */
export const ANCHOR_SEPARATOR = "|";
/** "Arrived, no click yet": the viewer places the cursor at the page heading. */
export const PAGE_ANCHOR = "page:";
/** Opt-in element id for presence anchors; the sidebar rows carry `nav:<href>`. */
export const PRESENCE_ID_ATTR = "data-presence-id";
/** Clicks inside this subtree are never published. */
export const PRESENCE_OFF_SELECTOR = '[data-presence="off"]';

const MANAGER = "/manager";
/** How far up from the click a labelled element may be before the click anchors to the target itself. */
const LABEL_DEPTH = 4;
/** Deeper structural paths are left out: they would not survive any layout difference anyway. */
const PATH_DEPTH = 48;
/** An id or link path longer than this is not a candidate. */
const VALUE_MAX = 200;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const TAG_RE = /^[a-z][a-z0-9-]*$/;
const STEP_RE = /^([a-z][a-z0-9-]*):([1-9]\d*)$/;
/** SVG internals are lifted to the element they draw in (an icon's <path> → its button). */
const SVG_TAGS = new Set([
  "svg", "path", "g", "use", "circle", "rect", "line", "polyline", "polygon", "ellipse", "text", "tspan",
]);

export function navPresenceId(href: string): string {
  return `nav:${href}`;
}

export function isPageAnchor(anchor: string): boolean {
  return anchor === PAGE_ANCHOR;
}

function tagOf(el: AnchorNode): string {
  return el.tagName.toLowerCase();
}

/** A value the module accepts inside an anchor, or null. */
function cleanValue(value: string | null): string | null {
  if (value === null) return null;
  const v = value.trim();
  if (!v || v.length > VALUE_MAX || v.includes(ANCHOR_SEPARATOR) || CONTROL_RE.test(v) || LONE_SURROGATE_RE.test(v)) {
    return null;
  }
  return v;
}

function presenceIdOf(el: AnchorNode): string | null {
  return cleanValue(el.getAttribute(PRESENCE_ID_ATTR));
}

/** The /manager path an in-app link points to (no query, hash or trailing slash), else null. */
function linkPathOf(el: AnchorNode): string | null {
  if (tagOf(el) !== "a") return null;
  const href = el.getAttribute("href");
  if (!href) return null;
  const path = (href.split(/[?#]/, 1)[0] ?? "").replace(/\/+$/, "");
  if (path !== MANAGER && !path.startsWith(`${MANAGER}/`)) return null;
  return cleanValue(path);
}

function hashedAttr(el: AnchorNode, name: string): string | null {
  const value = el.getAttribute(name);
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? fnv1a(normalized).toString(36) : null;
}

const labelKeyOf = (el: AnchorNode) => hashedAttr(el, "aria-label");
const nameKeyOf = (el: AnchorNode) => hashedAttr(el, "name");

/** Whether `el` is `root` or inside it. */
function isWithin(el: AnchorNode, root: AnchorNode): boolean {
  for (let node: AnchorNode | null = el; node; node = node.parentElement) {
    if (node === root) return true;
  }
  return false;
}

/** The nearest element from `start` up (never `root` itself) that passes `test`, within `depth` steps. */
function closestWithin(
  start: AnchorNode,
  root: AnchorNode,
  test: (el: AnchorNode) => boolean,
  depth = Number.POSITIVE_INFINITY,
): AnchorNode | null {
  let steps = 0;
  for (let node: AnchorNode | null = start; node && node !== root && steps <= depth; node = node.parentElement, steps++) {
    if (test(node)) return node;
  }
  return null;
}

/**
 * The element a click on `target` anchors to: the nearest opted-in element, else the nearest in-app
 * link, else a nearby labelled element, else the target itself (out of SVG internals). null when the
 * target is not inside `root`.
 */
export function anchorElementOf(target: AnchorNode, root: AnchorNode): AnchorNode | null {
  if (!isWithin(target, root)) return null;
  const labelled = (el: AnchorNode) => labelKeyOf(el) !== null || nameKeyOf(el) !== null;
  const found =
    closestWithin(target, root, (el) => presenceIdOf(el) !== null) ??
    closestWithin(target, root, (el) => linkPathOf(el) !== null) ??
    closestWithin(target, root, labelled, LABEL_DEPTH);
  if (found) return found;
  let el = target;
  while (el !== root && SVG_TAGS.has(tagOf(el)) && el.parentElement) el = el.parentElement;
  return el;
}

/** Index of `el` among the elements of `selector` in `root` that share its key; -1 when it has none. */
function nthAmong(root: AnchorNode, selector: string, el: AnchorNode, keyOf: (el: AnchorNode) => string | null): number {
  const key = keyOf(el);
  if (key === null) return -1;
  const list = root.querySelectorAll(selector);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const other = list[i];
    if (other === el) return n;
    if (keyOf(other) === key) n++;
  }
  return -1;
}

/** tag:nth-of-type steps from `root` down to `el`; "" for the root itself, null when too deep. */
function structuralPath(el: AnchorNode, root: AnchorNode): string | null {
  const steps: string[] = [];
  for (let node: AnchorNode = el; node !== root; ) {
    const parent = node.parentElement;
    if (!parent || steps.length >= PATH_DEPTH) return null;
    const tag = tagOf(node);
    if (!TAG_RE.test(tag)) return null;
    let nth = 1;
    const siblings = parent.children;
    for (let i = 0; i < siblings.length && siblings[i] !== node; i++) {
      if (tagOf(siblings[i]) === tag) nth++;
    }
    steps.push(`${tag}:${nth}`);
    node = parent;
  }
  return steps.reverse().join(">");
}

/** Joins candidates, dropping the least stable ones until the anchor fits the module's limit. */
export function encodeAnchor(candidates: readonly string[]): string {
  const kept = [...candidates];
  let anchor = kept.join(ANCHOR_SEPARATOR);
  while (anchor.length > ANCHOR_MAX && kept.length > 0) {
    kept.pop();
    anchor = kept.join(ANCHOR_SEPARATOR);
  }
  return anchor;
}

export function decodeAnchor(anchor: string): string[] {
  return anchor.split(ANCHOR_SEPARATOR).filter((candidate) => candidate.length > 0);
}

/**
 * Describes where a click on `target` landed: the anchor element and its candidates, most stable
 * first. null when the target is outside `root` (the active tab's slot).
 */
export function describeAnchor(target: AnchorNode, root: AnchorNode): { element: AnchorNode; anchor: string } | null {
  const element = anchorElementOf(target, root);
  if (!element) return null;
  const candidates: string[] = [];
  if (element !== root) {
    const id = presenceIdOf(element);
    if (id) candidates.push(`id:${id}`);
    const link = linkPathOf(element);
    const linkN = link ? nthAmong(root, "a[href]", element, linkPathOf) : -1;
    if (link && linkN >= 0) candidates.push(`href:${link}@${linkN}`);
    const label = labelKeyOf(element);
    const labelN = label ? nthAmong(root, "[aria-label]", element, labelKeyOf) : -1;
    if (label && labelN >= 0) candidates.push(`aria:${label}@${labelN}`);
    const name = nameKeyOf(element);
    const nameN = name ? nthAmong(root, "[name]", element, nameKeyOf) : -1;
    if (name && nameN >= 0) candidates.push(`name:${name}@${nameN}`);
  }
  const path = structuralPath(element, root);
  if (path !== null) candidates.push(`path:${path}`);
  return { element, anchor: encodeAnchor(candidates) };
}

/** "value@n" → [value, n]; null when malformed. */
function splitNth(body: string): [string, number] | null {
  const at = body.lastIndexOf("@");
  if (at <= 0) return null;
  const n = Number(body.slice(at + 1));
  if (!Number.isInteger(n) || n < 0) return null;
  return [body.slice(0, at), n];
}

function nthMatch(
  root: AnchorNode,
  selector: string,
  keyOf: (el: AnchorNode) => string | null,
  body: string,
): AnchorNode | null {
  const parsed = splitNth(body);
  if (!parsed) return null;
  const [value, n] = parsed;
  const list = root.querySelectorAll(selector);
  let seen = 0;
  for (let i = 0; i < list.length; i++) {
    if (keyOf(list[i]) !== value) continue;
    if (seen === n) return list[i];
    seen++;
  }
  return null;
}

function followPath(root: AnchorNode, chain: string): AnchorNode | null {
  if (chain === "") return root;
  let node = root;
  for (const step of chain.split(">")) {
    const m = STEP_RE.exec(step);
    if (!m) return null;
    const tag = m[1];
    let remaining = Number(m[2]);
    let next: AnchorNode | null = null;
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      if (tagOf(kids[i]) === tag && --remaining === 0) {
        next = kids[i];
        break;
      }
    }
    if (!next) return null;
    node = next;
  }
  return node;
}

function resolveCandidate(root: AnchorNode, candidate: string): AnchorNode | null {
  const colon = candidate.indexOf(":");
  if (colon < 0) return null;
  const body = candidate.slice(colon + 1);
  switch (candidate.slice(0, colon)) {
    case "id": {
      const list = root.querySelectorAll(`[${PRESENCE_ID_ATTR}]`);
      for (let i = 0; i < list.length; i++) if (presenceIdOf(list[i]) === body) return list[i];
      return null;
    }
    case "href":
      return nthMatch(root, "a[href]", linkPathOf, body);
    case "aria":
      return nthMatch(root, "[aria-label]", labelKeyOf, body);
    case "name":
      return nthMatch(root, "[name]", nameKeyOf, body);
    case "path":
      return followPath(root, body);
    default:
      return null;
  }
}

/**
 * Finds an anchor's element inside `root`: the first candidate that resolves to an element `usable`
 * accepts (the caller passes "is displayed"). null → the caller uses the row's point fallback.
 */
export function resolveAnchor(
  root: AnchorNode,
  anchor: string,
  usable: (el: AnchorNode) => boolean = () => true,
): AnchorNode | null {
  if (isPageAnchor(anchor)) return null;
  for (const candidate of decodeAnchor(anchor)) {
    const el = resolveCandidate(root, candidate);
    if (el && usable(el)) return el;
  }
  return null;
}
