/**
 * Reading and seeding header/footer fragments outside React.
 *
 * The editor binds each box to a Y.XmlFragment; export and import need the same content as plain ProseMirror JSON
 * or HTML, without mounting an editor. Loads Tiptap and y-tiptap, so import it dynamically from anywhere that must
 * stay cheap.
 */
import { getHTMLFromFragment, type JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import type * as Y from "yjs";

import { headerFooterSchema } from "./header-footer-extensions";
import {
  activeVariants,
  headerFooterField,
  HEADER_FOOTER_ZONES,
  type HeaderFooterOptions,
  type HeaderFooterVariant,
  type HeaderFooterZone,
} from "./header-footer";

export interface HeaderFooterContent {
  readonly headers: Partial<Record<HeaderFooterVariant, JSONContent>>;
  readonly footers: Partial<Record<HeaderFooterVariant, JSONContent>>;
}

export const EMPTY_HEADER_FOOTER: HeaderFooterContent = Object.freeze({ headers: {}, footers: {} });

function rootNode(ydoc: Y.Doc, field: string): ProseMirrorNode | null {
  const fragment = ydoc.getXmlFragment(field);
  if (fragment.length === 0) return null;
  try {
    const node = yXmlFragmentToProseMirrorRootNode(fragment, headerFooterSchema());
    // A box the member opened and left empty still has one blank paragraph; that is not content.
    if (node.childCount === 0 || (node.childCount === 1 && node.firstChild?.content.size === 0)) return null;
    return node;
  } catch {
    // Written by a newer schema: treat the box as empty rather than failing the export.
    return null;
  }
}

/** Serialized HTML of one box, or `""` when it is empty. */
export function headerFooterHtml(ydoc: Y.Doc, zone: HeaderFooterZone, variant: HeaderFooterVariant): string {
  const node = rootNode(ydoc, headerFooterField(zone, variant));
  return node ? getHTMLFromFragment(node.content, headerFooterSchema()) : "";
}

/** Every non-empty box that the current options can put on a page. */
export function readHeaderFooterContent(ydoc: Y.Doc | null, options: HeaderFooterOptions): HeaderFooterContent {
  if (!ydoc) return EMPTY_HEADER_FOOTER;
  const headers: Partial<Record<HeaderFooterVariant, JSONContent>> = {};
  const footers: Partial<Record<HeaderFooterVariant, JSONContent>> = {};
  for (const zone of HEADER_FOOTER_ZONES) {
    for (const variant of activeVariants(options)) {
      const node = rootNode(ydoc, headerFooterField(zone, variant));
      if (!node) continue;
      (zone === "header" ? headers : footers)[variant] = node.toJSON() as JSONContent;
    }
  }
  return { headers, footers };
}

/**
 * Writes imported content into an empty fragment. Only valid before collaboration starts on that field (document
 * creation), which is where the importer uses it.
 */
export function seedHeaderFooter(ydoc: Y.Doc, zone: HeaderFooterZone, variant: HeaderFooterVariant, json: JSONContent): void {
  const schema = headerFooterSchema();
  const node = ProseMirrorNode.fromJSON(schema, json);
  node.check();
  prosemirrorJSONToYXmlFragment(schema, node.toJSON(), ydoc.getXmlFragment(headerFooterField(zone, variant)));
}
