/**
 * Page setup + header/footer storage on the document's Y.Doc.
 *
 * `__merchiva_page` is a top-level Y.Map beside the editor's `default` fragment: every key is a scalar, so two
 * editors changing different fields merge instead of clobbering each other, and the whole thing rides the existing
 * snapshot/update transport with no reducer or column change.
 *
 * Yjs only — no React, no DOM — so seeding (lib/docs/seed.ts) and the importer can use it headlessly.
 */
import * as Y from "yjs";

import {
  defaultPageSetup,
  normalizePageSetup,
  samePageSetup,
  type DocMargins,
  type DocPageSetup,
  type PageOrientation,
  type PaperId,
} from "./page-setup";

/** Top-level Y.Map holding the page setup. */
export const PAGE_MAP = "__merchiva_page";

/** Transaction origin for page-setup writes, so the provider treats them as ordinary local edits. */
export const PAGE_SETUP_ORIGIN = "merchiva-page-setup";

type Scalar = string | number | boolean | null;

const KEYS = [
  "paper",
  "orientation",
  "customWidth",
  "customHeight",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "headerDistance",
  "footerDistance",
  "differentFirstPage",
  "differentOddEven",
  "background",
] as const;

function flatten(setup: DocPageSetup): Readonly<Record<(typeof KEYS)[number], Scalar>> {
  return {
    paper: setup.paper,
    orientation: setup.orientation,
    customWidth: setup.customWidth,
    customHeight: setup.customHeight,
    marginTop: setup.margins.top,
    marginRight: setup.margins.right,
    marginBottom: setup.margins.bottom,
    marginLeft: setup.margins.left,
    headerDistance: setup.headerDistance,
    footerDistance: setup.footerDistance,
    differentFirstPage: setup.differentFirstPage,
    differentOddEven: setup.differentOddEven,
    background: setup.background,
  };
}

function inflate(map: Y.Map<unknown>, fallback: DocPageSetup): DocPageSetup {
  if (map.size === 0) return fallback;
  const margins: DocMargins = {
    top: map.get("marginTop") as number,
    right: map.get("marginRight") as number,
    bottom: map.get("marginBottom") as number,
    left: map.get("marginLeft") as number,
  };
  return normalizePageSetup(
    {
      paper: map.get("paper") as PaperId,
      orientation: map.get("orientation") as PageOrientation,
      customWidth: map.get("customWidth") as number,
      customHeight: map.get("customHeight") as number,
      margins,
      headerDistance: map.get("headerDistance") as number,
      footerDistance: map.get("footerDistance") as number,
      differentFirstPage: map.get("differentFirstPage") === true,
      differentOddEven: map.get("differentOddEven") === true,
      background: map.get("background") as string | null,
    },
    fallback,
  );
}

export function pageSetupMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(PAGE_MAP);
}

/** The document's page setup, or `fallback` (the locale default) while the map is still empty. */
export function readPageSetup(ydoc: Y.Doc, fallback: DocPageSetup): DocPageSetup {
  return inflate(pageSetupMap(ydoc), fallback);
}

/** Writes only the keys that actually changed, so an unrelated concurrent edit isn't overwritten. */
export function writePageSetup(ydoc: Y.Doc, setup: DocPageSetup): void {
  const map = pageSetupMap(ydoc);
  const next = flatten(setup);
  ydoc.transact(() => {
    for (const key of KEYS) {
      if (map.get(key) !== next[key]) map.set(key, next[key]);
    }
  }, PAGE_SETUP_ORIGIN);
}

/** Calls `listener` whenever any page-setup key changes (local or remote). Returns the unsubscribe. */
export function observePageSetup(ydoc: Y.Doc, listener: () => void): () => void {
  const map = pageSetupMap(ydoc);
  map.observe(listener);
  return () => map.unobserve(listener);
}

/** True when this document has never had its page setup written (a fresh or pre-page-setup document). */
export function hasStoredPageSetup(ydoc: Y.Doc): boolean {
  return pageSetupMap(ydoc).size > 0;
}

export { defaultPageSetup, samePageSetup };
