/**
 * Block-level children of `w:body`, a table cell, a header/footer part or a block content control, in order.
 *
 * Its own module because it sits between two that must not import each other: a paragraph knows nothing about
 * tables, and a table cell holds blocks — which can be more tables. It also owns the one piece of state a single
 * paragraph can't have: Word list paragraphs are flat siblings, so a consecutive run of them is buffered and handed
 * to `buildListHtml` in one go to be nested.
 *
 * Header and footer boxes use a much smaller schema, so list markup is dropped there (via `renderParagraph`) and
 * tables are flattened to their cells, both counted as lost formatting.
 */
import { warnOnce, type RenderContext } from "./context";
import { PAGE_BREAK_HTML } from "./emit";
import { buildListHtml, type ListEntry } from "./list";
import { renderParagraph } from "./paragraph";
import { renderTable } from "./table";
import { child, children, localName, type XmlElement } from "./xml";

export function renderBlocks(parent: XmlElement, ctx: RenderContext): string {
  let out = "";
  let pending: ListEntry[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    out += buildListHtml(pending);
    pending = [];
  };

  for (const node of children(parent)) {
    switch (localName(node.tagName)) {
      case "p": {
        const result = renderParagraph(node, ctx);
        if (result.list) {
          // A page break inside a list ends it; what follows starts a new one.
          if (result.before) {
            flush();
            out += result.before;
          }
          pending.push({ ...result.list, html: result.blocks.join("") });
        } else {
          flush();
          out += result.before + result.blocks.join(PAGE_BREAK_HTML);
        }
        break;
      }
      case "tbl":
        flush();
        if (ctx.zone === "body") {
          out += renderTable(node, ctx, renderBlocks);
        } else {
          // The header/footer schema has no table node — but a Word running head is almost always a three-cell
          // table doing left / centre / right, so dropping it would lose the header itself. Each cell becomes its
          // own paragraph, which keeps the text and (where the cells set `w:jc`) most of the layout.
          warnOnce(ctx, `${ctx.zone}:table`);
          for (const row of children(node, "w:tr")) {
            for (const cell of children(row, "w:tc")) out += renderBlocks(cell, ctx);
          }
        }
        break;
      case "sdt":
        flush();
        out += renderBlocks(child(node, "w:sdtContent") ?? node, ctx);
        break;
      case "AlternateContent":
        flush();
        out += renderBlocks(child(node, "mc:Choice") ?? child(node, "mc:Fallback") ?? node, ctx);
        break;
      case "customXml":
      case "ins":
        flush();
        out += renderBlocks(node, ctx);
        break;
      default:
        // `w:sectPr`, bookmarks, revision marks, comment ranges and tracked deletions carry nothing to show.
        break;
    }
  }
  flush();
  return out;
}
