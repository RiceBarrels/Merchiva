// Awareness bytes of a spreadsheet's `document_presence` row (sheets.md §6).
//
// The Docs presence reducer (upsertDocumentPresence → sanitizeDocAwareness, spacetimedb/src/index.ts) accepts only a
// y-protocols awareness update for the caller's own client, so this file hand-encodes that framing instead of pulling
// y-protocols (and yjs) into the sync engine:
//
//   varUint(1) · varUint(clientId) · varUint(clock) · varUint(byteLength) · UTF-8 JSON of the state, or `null`
//
// The server replaces `state.user` with the caller's own name, colour and member id, and the row carries the same
// values as columns, so `user` is display data only. `sheet` is the selection: `s` = the sheet id, `r` =
// [startRow, startColumn, endRow, endColumn], 0-based and inclusive, inside the 1,048,576 × 16,384 grid (Univer's
// MAX_ROW_COUNT / MAX_COLUMN_COUNT, the xlsx limits). Rows come from other clients and the server checks only the
// framing and `user`: decoding keeps only well-formed fields and drops everything else.

import type { SheetSelection } from "@/lib/sheets/types";
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS } from "@/lib/sheets/xlsx/a1";

export interface SheetAwarenessState {
  user?: { name: string; color: string; memberId: string };
  sheet?: { s: string; r: [number, number, number, number] };
}

export interface DecodedSheetAwareness {
  clientId: number;
  clock: number;
  /** null: the client withdrew its state. */
  state: SheetAwarenessState | null;
}

/** Longest sheet id kept from a peer's selection (Univer's ids are far shorter). */
export const SHEET_AWARENESS_ID_MAX = 256;
const U32_MAX = 0xffff_ffff;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function writeVarUint(out: number[], value: number): void {
  let n = value;
  while (n > 0x7f) {
    out.push(0x80 | (n % 128));
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanUser(value: unknown): SheetAwarenessState["user"] | undefined {
  if (!isRecord(value)) return undefined;
  const { name, color, memberId } = value;
  if (typeof name !== "string" || typeof color !== "string" || typeof memberId !== "string") return undefined;
  return { name, color, memberId };
}

function isCell(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function cleanSheet(value: unknown): SheetAwarenessState["sheet"] | undefined {
  if (!isRecord(value)) return undefined;
  const { s, r } = value;
  if (typeof s !== "string" || s === "" || s.length > SHEET_AWARENESS_ID_MAX) return undefined;
  if (!Array.isArray(r) || r.length !== 4 || !r.every(isCell)) return undefined;
  const [startRow, startColumn, endRow, endColumn] = r as [number, number, number, number];
  if (startRow > endRow || startColumn > endColumn) return undefined;
  if (endRow >= EXCEL_MAX_ROWS || endColumn >= EXCEL_MAX_COLUMNS) return undefined; // outside any sheet
  return { s, r: [startRow, startColumn, endRow, endColumn] };
}

/** Only the known, well-formed fields of `value`. */
function cleanState(value: unknown): SheetAwarenessState {
  const record = isRecord(value) ? value : {};
  const state: SheetAwarenessState = {};
  const user = cleanUser(record.user);
  if (user) state.user = user;
  const sheet = cleanSheet(record.sheet);
  if (sheet) state.sheet = sheet;
  return state;
}

/** The single-client awareness update the Docs presence reducer accepts for `clientId` (a u32). */
export function encodeSheetAwareness(clientId: number, clock: number, state: SheetAwarenessState | null): Uint8Array {
  if (!Number.isInteger(clientId) || clientId < 0 || clientId > U32_MAX) throw new RangeError("clientId must be a u32");
  if (!Number.isSafeInteger(clock) || clock < 0) throw new RangeError("clock must be a non-negative safe integer");
  const json = encoder.encode(JSON.stringify(state === null ? null : cleanState(state)));
  const head: number[] = [];
  for (const value of [1, clientId, clock, json.length]) writeVarUint(head, value);
  const out = new Uint8Array(head.length + json.length);
  out.set(head, 0);
  out.set(json, head.length);
  return out;
}

/** The one entry of an awareness update, or null when the bytes are not exactly that. */
export function decodeSheetAwareness(bytes: Uint8Array): DecodedSheetAwareness | null {
  let pos = 0;
  const readVarUint = (): number | null => {
    let value = 0;
    let multiplier = 1;
    while (pos < bytes.length) {
      const byte = bytes[pos++];
      value += (byte & 0x7f) * multiplier;
      if (byte < 0x80) return Number.isSafeInteger(value) ? value : null;
      multiplier *= 128;
    }
    return null;
  };
  if (readVarUint() !== 1) return null;
  const clientId = readVarUint();
  const clock = readVarUint();
  const length = readVarUint();
  if (clientId === null || clientId > U32_MAX || clock === null || length === null || length !== bytes.length - pos) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes.subarray(pos)));
  } catch {
    return null;
  }
  if (parsed !== null && !isRecord(parsed)) return null;
  return { clientId, clock, state: parsed === null ? null : cleanState(parsed) };
}

/** A selection as the awareness `sheet` field; null when it is not a valid range. */
export function selectionToAwareness(selection: SheetSelection): SheetAwarenessState["sheet"] | null {
  const { sheetId, startRow, startColumn, endRow, endColumn } = selection;
  return cleanSheet({ s: sheetId, r: [startRow, startColumn, endRow, endColumn] }) ?? null;
}

export function selectionFromAwareness(sheet: NonNullable<SheetAwarenessState["sheet"]>): SheetSelection {
  const [startRow, startColumn, endRow, endColumn] = sheet.r;
  return { sheetId: sheet.s, startRow, startColumn, endRow, endColumn };
}

/** Same sheet and range (null only equals null). */
export function sameSheetSelection(a: SheetSelection | null, b: SheetSelection | null): boolean {
  if (a === null || b === null) return a === b;
  return a.sheetId === b.sheetId && a.startRow === b.startRow && a.startColumn === b.startColumn
    && a.endRow === b.endRow && a.endColumn === b.endColumn;
}
