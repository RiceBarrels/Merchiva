/**
 * `w:sectPr` → page setup, and the header/footer parts the section points at.
 *
 * The body's last `w:sectPr` describes the document as a whole: paper, orientation, margins and the distances Word
 * reserves for the header and footer boxes. Everything there is twips, and `w:pgMar w:top` / `w:bottom` may be
 * negative (which is how Word says "let the header hang into the text"), so magnitudes are what matter.
 *
 * Paper is named rather than measured wherever possible — `matchPaper` turns 11906 × 16838 twips back into "A4", so
 * the page-setup dialog shows a paper size instead of a custom one that only looks like A4.
 *
 * Pure: a parsed element in, a `Partial<DocPageSetup>` out, which the caller normalises.
 */
import type { HeaderFooterVariant } from "@/lib/docs/header-footer";
import { matchPaper, twipsToIn, type DocMargins, type DocPageSetup } from "@/lib/docs/page-setup";

import { attr, child, children, intAttr, intAttrAny, toggle, type XmlElement } from "./xml";

export interface SectionInfo {
  readonly pageSetup: Partial<DocPageSetup> | null;
  /** Variant → relationship id of a `word/headerN.xml`. */
  readonly headerRefs: Partial<Record<HeaderFooterVariant, string>>;
  readonly footerRefs: Partial<Record<HeaderFooterVariant, string>>;
}

export const EMPTY_SECTION: SectionInfo = { pageSetup: null, headerRefs: {}, footerRefs: {} };

const REFERENCE_VARIANTS: Readonly<Record<string, HeaderFooterVariant>> = {
  default: "default",
  first: "first",
  even: "even",
};

function readReferences(sectPr: XmlElement, name: string): Partial<Record<HeaderFooterVariant, string>> {
  const refs: Partial<Record<HeaderFooterVariant, string>> = {};
  for (const ref of children(sectPr, name)) {
    const variant = REFERENCE_VARIANTS[(attr(ref, "w:type") ?? "default").trim().toLowerCase()];
    const id = attr(ref, "r:id");
    if (variant && id) refs[variant] = id;
  }
  return refs;
}

/** `w:pgSz` → paper (named when it matches a known size), orientation, and the portrait dimensions for custom. */
function readPaper(pgSz: XmlElement | null): Partial<DocPageSetup> {
  const width = intAttr(pgSz, "w:w");
  const height = intAttr(pgSz, "w:h");
  if (width === null || height === null || width <= 0 || height <= 0) return {};
  const widthIn = twipsToIn(width);
  const heightIn = twipsToIn(height);
  const orientAttr = (attr(pgSz, "w:orient") ?? "").trim().toLowerCase();
  const orientation = orientAttr === "landscape" || (orientAttr !== "portrait" && widthIn > heightIn) ? "landscape" : "portrait";
  // `customWidth` / `customHeight` are always the portrait pair, whichever way the page is turned.
  const portraitWidth = Math.min(widthIn, heightIn);
  const portraitHeight = Math.max(widthIn, heightIn);
  const paper = matchPaper(portraitWidth, portraitHeight);
  if (paper) return { paper, orientation };
  return { paper: "custom", orientation, customWidth: portraitWidth, customHeight: portraitHeight };
}

/** `w:pgMar` → margins and the header/footer distances, in inches. */
function readMargins(pgMar: XmlElement | null): Partial<DocPageSetup> {
  if (!pgMar) return {};
  const inches = (names: readonly string[]): number | null => {
    const twips = intAttrAny(pgMar, ...names);
    // A negative top or bottom margin means the header box overlaps the text; the distance is what we keep.
    return twips === null ? null : twipsToIn(Math.abs(twips));
  };
  const top = inches(["w:top"]);
  const right = inches(["w:right", "w:end"]);
  const bottom = inches(["w:bottom"]);
  const left = inches(["w:left", "w:start"]);
  const header = inches(["w:header"]);
  const footer = inches(["w:footer"]);
  const hasMargins = top !== null || right !== null || bottom !== null || left !== null;
  const margins: DocMargins = { top: top ?? 1, right: right ?? 1, bottom: bottom ?? 1, left: left ?? 1 };
  return {
    ...(hasMargins ? { margins } : {}),
    ...(header !== null ? { headerDistance: header } : {}),
    ...(footer !== null ? { footerDistance: footer } : {}),
  };
}

/**
 * Reads one section. `evenAndOddHeaders` comes from `word/settings.xml`, not from the section, because Word stores
 * that switch once for the whole document.
 */
export function readSection(sectPr: XmlElement | null, evenAndOddHeaders: boolean): SectionInfo {
  if (!sectPr) return EMPTY_SECTION;
  const pageSetup: Partial<DocPageSetup> = {
    ...readPaper(child(sectPr, "w:pgSz")),
    ...readMargins(child(sectPr, "w:pgMar")),
    differentFirstPage: toggle(sectPr, "w:titlePg") === true,
    differentOddEven: evenAndOddHeaders,
  };
  return {
    pageSetup,
    headerRefs: readReferences(sectPr, "w:headerReference"),
    footerRefs: readReferences(sectPr, "w:footerReference"),
  };
}

/** `w:settings/w:evenAndOddHeaders`. */
export function readEvenAndOddHeaders(settings: XmlElement | null): boolean {
  return toggle(settings, "w:evenAndOddHeaders") === true;
}

/** The last `w:sectPr` directly inside `w:body` — the one that describes the document as it ends. */
export function lastSectionProperties(body: XmlElement | null): XmlElement | null {
  const all = children(body, "w:sectPr");
  return all.length > 0 ? all[all.length - 1] : null;
}
