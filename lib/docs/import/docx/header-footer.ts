/**
 * `word/headerN.xml` / `word/footerN.xml` → the HTML for one header or footer box.
 *
 * Each part is rendered with the same paragraph and run code as the body, with the context's zone set so that
 * `blocks.ts` and `paragraph.ts` drop what the small header/footer schema can't hold (tables, list markup) and
 * `run.ts` turns `PAGE` / `NUMPAGES` fields into the editor's page-field atom instead of their cached number.
 *
 * Header parts have their own `_rels`, so a context is built per part rather than reusing the document's.
 */
import type { HeaderFooterVariant } from "@/lib/docs/header-footer";
import { PAGE_FIELD_ATTR } from "@/lib/docs/header-footer";

import { renderBlocks } from "./blocks";
import type { DocxPackage, RenderTally, RenderZone } from "./context";
import { stripTags } from "./emit";
import { readRels, relsPathFor, relTarget, type PartRels } from "./parts";
import { parseXml, type XmlElement } from "./xml";

/** An empty box is one with no text and no page number — not one whose only paragraph is blank. */
export function isEmptyHeaderFooter(html: string): boolean {
  if (!html) return true;
  if (html.includes(PAGE_FIELD_ATTR)) return false;
  return stripTags(html).replace(/&nbsp;/g, " ").trim() === "";
}

export interface HeaderFooterDeps {
  readonly pkg: DocxPackage;
  /** `word/_rels/document.xml.rels` — where the `w:headerReference r:id` resolves. */
  readonly documentRels: PartRels;
  readonly tally: RenderTally;
}

/** Renders every referenced part of one zone, leaving out the ones that turn out to be empty. */
export function renderHeaderFooterParts(
  refs: Partial<Record<HeaderFooterVariant, string>>,
  zone: Exclude<RenderZone, "body">,
  deps: HeaderFooterDeps,
): Partial<Record<HeaderFooterVariant, string>> {
  const out: Partial<Record<HeaderFooterVariant, string>> = {};
  // Several variants can point at the same part; render it once.
  const cache = new Map<string, string>();

  for (const [variant, relId] of Object.entries(refs) as [HeaderFooterVariant, string][]) {
    const rel = relTarget(deps.documentRels, relId);
    if (!rel || rel.external || !rel.target) continue;

    let html = cache.get(rel.target);
    if (html === undefined) {
      const root: XmlElement | null = parseXml(deps.pkg.zip.text(rel.target));
      if (!root) {
        // A header part we can't read is a header the document had and we don't.
        deps.tally.warnings += 1;
        cache.set(rel.target, "");
        continue;
      }
      const rels = readRels(parseXml(deps.pkg.zip.text(relsPathFor(rel.target))), rel.target);
      html = renderBlocks(root, { pkg: deps.pkg, rels, partPath: rel.target, zone, tally: deps.tally });
      cache.set(rel.target, html);
    }
    if (!isEmptyHeaderFooter(html)) out[variant] = html;
  }
  return out;
}
