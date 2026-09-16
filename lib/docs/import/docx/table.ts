/**
 * `w:tbl` → `<table>`.
 *
 * Word describes a table as rows of cells plus a separate column grid, and it expresses a vertical merge by marking
 * the *continuation* cells rather than giving the first one a row span. So the rows are planned before anything is
 * written: column positions are accumulated from `w:gridSpan`, and a `w:vMerge w:val="restart"` keeps growing its
 * own row span while the cells below it (which produce no `<td>` at all) continue the merge.
 *
 * Column widths go into a `<colgroup>`, which is what Tiptap's table extension reads when a cell carries no
 * `colwidth` of its own — and `<col width>` is one of the few width carriers DOMPurify lets through.
 *
 * `renderBlocks` arrives as an argument rather than an import: a cell holds blocks, and a block can be a table.
 */
import { warn, type RenderContext } from "./context";
import { attributes, styleAttribute } from "./emit";
import { hexColor, shadingFill } from "./props";
import { eighthPointsToPx, twipsToPx } from "./units";
import { attr, child, children, intAttr, intAttrAny, localName, toggle, type XmlElement } from "./xml";

export type BlockRenderer = (parent: XmlElement, ctx: RenderContext) => string;

interface CellPlan {
  readonly el: XmlElement;
  readonly colspan: number;
  rowspan: number;
}

interface RowPlan {
  readonly header: boolean;
  readonly cells: CellPlan[];
}

/** `w:tr` children, looking through the content controls Word wraps repeating rows in. */
function rowElements(tbl: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const node of children(tbl)) {
    const name = localName(node.tagName);
    if (name === "tr") out.push(node);
    else if (name === "sdt" || name === "customXml") out.push(...rowElements(child(node, "w:sdtContent") ?? node));
  }
  return out;
}

/** `w:tc` children, likewise. */
function cellElements(tr: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const node of children(tr)) {
    const name = localName(node.tagName);
    if (name === "tc") out.push(node);
    else if (name === "sdt" || name === "customXml") out.push(...cellElements(child(node, "w:sdtContent") ?? node));
  }
  return out;
}

/**
 * Rows with their spans resolved. Continuation cells of a vertical merge are left out entirely and counted on the
 * cell that started it.
 */
export function planRows(tbl: XmlElement): RowPlan[] {
  const plans: RowPlan[] = [];
  /** Column index → the `restart` cell still absorbing rows there. */
  const openMerges = new Map<number, CellPlan>();

  for (const tr of rowElements(tbl)) {
    const trPr = child(tr, "w:trPr");
    const row: RowPlan = { header: toggle(trPr, "w:tblHeader") === true, cells: [] };
    let column = 0;
    /** Columns this row either continued or restarted; any other open merge ends here. */
    const touched = new Set<number>();

    for (const tc of cellElements(tr)) {
      const tcPr = child(tc, "w:tcPr");
      const colspan = Math.max(1, intAttr(child(tcPr, "w:gridSpan"), "w:val") ?? 1);
      const vMerge = child(tcPr, "w:vMerge");
      const vMergeVal = vMerge ? (attr(vMerge, "w:val") ?? "continue").trim().toLowerCase() : null;

      if (vMergeVal === "continue") {
        const open = openMerges.get(column);
        if (open) {
          open.rowspan += 1;
          touched.add(column);
        }
        // No `<td>`: the cell above owns this space now.
        column += colspan;
        continue;
      }

      const plan: CellPlan = { el: tc, colspan, rowspan: 1 };
      row.cells.push(plan);
      if (vMergeVal === "restart") {
        openMerges.set(column, plan);
        touched.add(column);
      } else {
        openMerges.delete(column);
      }
      column += colspan;
    }

    // A merge the row neither continued nor restarted is over; the next `continue` starts a fresh one.
    for (const key of [...openMerges.keys()]) {
      if (!touched.has(key)) openMerges.delete(key);
    }
    plans.push(row);
  }
  return plans;
}

const BORDER_STYLES: Readonly<Record<string, string>> = {
  single: "solid",
  thick: "solid",
  double: "double",
  dotted: "dotted",
  dashed: "dashed",
  dotdash: "dashed",
  dashsmallgap: "dashed",
  wave: "solid",
  inset: "inset",
  outset: "outset",
};

const BORDER_SIDES: readonly { readonly css: string; readonly names: readonly string[] }[] = [
  { css: "border-top", names: ["w:top"] },
  { css: "border-right", names: ["w:right", "w:end"] },
  { css: "border-bottom", names: ["w:bottom"] },
  { css: "border-left", names: ["w:left", "w:start"] },
];

/** `w:tcBorders` → per-side declarations; `nil` / `none` becomes an explicit `none` so it beats the table default. */
function borderDeclarations(tcPr: XmlElement | null): string[] {
  const borders = child(tcPr, "w:tcBorders");
  if (!borders) return [];
  const out: string[] = [];
  for (const side of BORDER_SIDES) {
    const el = side.names.reduce<XmlElement | null>((found, name) => found ?? child(borders, name), null);
    if (!el) continue;
    const value = (attr(el, "w:val") ?? "").trim().toLowerCase();
    if (value === "nil" || value === "none" || value === "") {
      out.push(`${side.css}:none`);
      continue;
    }
    const width = eighthPointsToPx(intAttr(el, "w:sz") ?? 4);
    const color = hexColor(attr(el, "w:color")) ?? "#d4d4d4";
    out.push(`${side.css}:${width}px ${BORDER_STYLES[value] ?? "solid"} ${color}`);
  }
  return out;
}

const VERTICAL_ALIGN: Readonly<Record<string, string>> = { top: "top", center: "middle", both: "middle", bottom: "bottom" };

function cellStyle(tcPr: XmlElement | null): string[] {
  const out: string[] = [];
  const fill = shadingFill(child(tcPr, "w:shd"));
  if (fill) out.push(`background-color:${fill}`);
  const vAlign = (attr(child(tcPr, "w:vAlign"), "w:val") ?? "").trim().toLowerCase();
  if (VERTICAL_ALIGN[vAlign]) out.push(`vertical-align:${VERTICAL_ALIGN[vAlign]}`);
  out.push(...borderDeclarations(tcPr));
  return out;
}

/** `w:tblGrid/w:gridCol` widths in px, or an empty list when the grid is missing or unusable. */
export function columnWidths(tbl: XmlElement): number[] {
  const grid = child(tbl, "w:tblGrid");
  if (!grid) return [];
  const widths: number[] = [];
  for (const col of children(grid, "w:gridCol")) {
    const twips = intAttrAny(col, "w:w", "w");
    widths.push(twips !== null && twips > 0 ? twipsToPx(twips) : 0);
  }
  return widths.some((w) => w > 0) ? widths : [];
}

function colgroup(widths: readonly number[]): string {
  if (widths.length === 0) return "";
  const cols = widths
    .map((width) => (width > 0 ? `<col${attributes({ width: String(width) })}${styleAttribute([`width:${width}px`])}>` : "<col>"))
    .join("");
  return `<colgroup>${cols}</colgroup>`;
}

export function renderTable(tbl: XmlElement, ctx: RenderContext, renderBlocks: BlockRenderer): string {
  const rows = planRows(tbl);
  if (rows.length === 0) {
    warn(ctx);
    return "";
  }
  const widths = columnWidths(tbl);

  const renderRow = (row: RowPlan): string => {
    const tag = row.header ? "th" : "td";
    const cells = row.cells
      .map((cell) => {
        const tcPr = child(cell.el, "w:tcPr");
        const open = `<${tag}${attributes({
          colspan: cell.colspan > 1 ? String(cell.colspan) : null,
          rowspan: cell.rowspan > 1 ? String(cell.rowspan) : null,
        })}${styleAttribute(cellStyle(tcPr))}>`;
        // A cell is `block+` in the schema, so an empty one still needs a paragraph.
        const content = renderBlocks(cell.el, ctx) || "<p></p>";
        return `${open}${content}</${tag}>`;
      })
      .join("");
    return `<tr>${cells}</tr>`;
  };

  // Leading rows marked `w:tblHeader` repeat on every page in Word; they are the table's `<thead>`.
  let headerCount = 0;
  while (headerCount < rows.length && rows[headerCount].header) headerCount += 1;
  const head = headerCount > 0 ? `<thead>${rows.slice(0, headerCount).map(renderRow).join("")}</thead>` : "";
  const bodyRows = rows.slice(headerCount);
  const body = bodyRows.length > 0 ? `<tbody>${bodyRows.map(renderRow).join("")}</tbody>` : "";
  return `<table>${colgroup(widths)}${head}${body}</table>`;
}
