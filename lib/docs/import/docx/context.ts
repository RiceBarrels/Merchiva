/**
 * What a renderer needs to know, and where it puts what it can't render.
 *
 * `DocxPackage` is the parsed, immutable half — the zip plus the three lookup tables every part shares. A
 * `RenderContext` binds that to one part: which relationships apply (headers have their own `_rels`) and whether we
 * are inside the body or inside a header/footer box, whose schema is much smaller.
 *
 * `RenderTally` is the mutable half. Warnings count constructs that could not be represented, so the import toast
 * can tell the truth about what was lost; `noted` keeps a repeated one (a document full of tabs) from counting a
 * thousand times. Image uploads can't happen mid-walk, so runs park the bytes here and `index.ts` uploads them once
 * the HTML is built.
 */
import type { NumberingTable } from "./numbering";
import type { PartRels } from "./parts";
import type { StyleTable } from "./styles";
import type { DocxTheme } from "./theme";
import type { DocxZip } from "./zip";

export interface ImageJob {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  /** Base name for the uploaded file, without an extension. */
  readonly name: string;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
}

export interface DocxPackage {
  readonly zip: DocxZip;
  /** `[Content_Types].xml` defaults: extension → media type. */
  readonly contentTypes: ReadonlyMap<string, string>;
  readonly styles: StyleTable;
  readonly numbering: NumberingTable;
  readonly theme: DocxTheme;
}

/** Body prose and header/footer boxes use the same renderers but different schemas. */
export type RenderZone = "body" | "header" | "footer";

export interface RenderTally {
  warnings: number;
  /** Keys of warnings already counted, for constructs that repeat (tabs, unmapped symbols). */
  readonly noted: Set<string>;
  readonly images: ImageJob[];
}

export interface RenderContext {
  readonly pkg: DocxPackage;
  readonly rels: PartRels;
  /** Package path of the part being rendered, e.g. `word/document.xml`. */
  readonly partPath: string;
  readonly zone: RenderZone;
  readonly tally: RenderTally;
}

export function createTally(): RenderTally {
  return { warnings: 0, noted: new Set<string>(), images: [] };
}

/** Something the editor has no way to represent was dropped. */
export function warn(ctx: RenderContext, count = 1): void {
  ctx.tally.warnings += count;
}

/** Same, but only the first occurrence counts — one lost tab stop is news, five hundred is noise. */
export function warnOnce(ctx: RenderContext, key: string): void {
  if (ctx.tally.noted.has(key)) return;
  ctx.tally.noted.add(key);
  ctx.tally.warnings += 1;
}

/** Parks an embedded image for upload and returns its placeholder index. */
export function addImage(ctx: RenderContext, job: ImageJob): number {
  ctx.tally.images.push(job);
  return ctx.tally.images.length - 1;
}
