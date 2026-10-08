// The editing holder's selection, outlined in their presence colour on viewers' grids (sheets.md §6, §8.1
// highlightPeer). Drawn through the facade's mark-selection layer (FRange.highlight), so it needs the UI
// plugins: without them (headless) show() is a no-op. Facade methods only, no runtime import.

import type { FUniver } from "@univerjs/presets";
import type { ISelectionStyle } from "@univerjs/preset-sheets-core";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetSelection } from "@/lib/sheets/types";

export interface PeerHighlighter {
  /** Replace the outline (null clears it). */
  show(peer: { color: string; selection: SheetSelection } | null): void;
  dispose(): void;
}

const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;
const FILL_ALPHA = 0.12;

/**
 * A peer's range cut to the sheet it names (`rows` × `columns`): awareness only bounds it by the whole grid, so a
 * range can run past a small sheet's last row or column. Null when none of it is on the sheet.
 */
export function clampSelectionToSheet(selection: SheetSelection, rows: number, columns: number): SheetSelection | null {
  if (!(rows > 0) || !(columns > 0) || selection.startRow >= rows || selection.startColumn >= columns) return null;
  return { ...selection, endRow: Math.min(selection.endRow, rows - 1), endColumn: Math.min(selection.endColumn, columns - 1) };
}

/** `#rrggbb` → a translucent fill of the same colour; anything else → a neutral translucent grey. */
export function peerFillColor(color: string): string {
  const match = HEX_COLOR_RE.exec(color);
  if (!match) return `rgba(115, 115, 115, ${FILL_ALPHA})`;
  const n = Number.parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${FILL_ALPHA})`;
}

export function createPeerHighlighter(univerAPI: FUniver | null, unitId: string = SHEET_UNIT_ID): PeerHighlighter {
  let current: { dispose(): void } | null = null;
  const clear = () => {
    try {
      current?.dispose();
    } catch {
      // The workbook it belonged to was already disposed.
    }
    current = null;
  };
  return {
    show(peer) {
      clear();
      if (!peer || !univerAPI) return;
      try {
        const workbook = univerAPI.getWorkbook(unitId);
        const sheet = workbook?.getSheetBySheetId(peer.selection.sheetId);
        if (!workbook || !sheet || workbook.getActiveSheet().getSheetId() !== peer.selection.sheetId) return;
        const selection = clampSelectionToSheet(peer.selection, sheet.getMaxRows(), sheet.getMaxColumns());
        if (!selection) return;
        const range = sheet.getRange(
          selection.startRow,
          selection.startColumn,
          selection.endRow - selection.startRow + 1,
          selection.endColumn - selection.startColumn + 1,
        );
        const style: Partial<ISelectionStyle> = { stroke: HEX_COLOR_RE.test(peer.color) ? peer.color : "#737373", strokeWidth: 2, fill: peerFillColor(peer.color) };
        current = range.highlight(style, null);
      } catch {
        // No render unit yet: nothing to draw.
      }
    },
    dispose: clear,
  };
}
