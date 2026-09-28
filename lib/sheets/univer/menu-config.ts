// Univer menu entries the editor hides (sheets.md §9.7). Range and sheet protection is Univer's collaborator
// permission model (its management is Pro-only), while ours is the edit lease: the protection entry points are
// hidden, their mutations are neither captured nor accepted (mutation-filter.ts), and protection resources are
// stripped when a workbook loads (lib/sheets/sanitize.ts). The ids are Univer 1.0.2 menu item ids
// (sheets-ui); the S0 spike confirmed at runtime that each resolves to a hidden item.

import type { MenuConfig } from "@univerjs/preset-sheets-core";

export const SHEET_HIDDEN_MENU_IDS: readonly string[] = [
  // right-click ▸ Protect range (and its submenu)
  "sheet.contextMenu.permission",
  "sheet.command.add-range-protection-from-context-menu",
  "sheet.command.set-range-protection-from-context-menu",
  "sheet.command.delete-range-protection-from-context-menu",
  "sheet.command.view-sheet-permission-from-context-menu",
  // ribbon ▸ Protect
  "sheet.command.add-range-protection-from-toolbar",
  // sheet tab menu
  "sheet.command.add-range-protection-from-sheet-bar",
  "sheet.command.change-sheet-protection-from-sheet-bar",
  "sheet.command.delete-worksheet-protection-from-sheet-bar",
  "sheet.command.view-sheet-permission-from-sheet-bar",
];

export const SHEET_MENU_CONFIG: MenuConfig = Object.fromEntries(SHEET_HIDDEN_MENU_IDS.map((id) => [id, { hidden: true }]));
