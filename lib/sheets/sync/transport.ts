// Every server call a spreadsheet session makes (sheets.md §7.1). The production transport forwards to the sheet
// reducer wrappers (lib/spacetimedb/actions/sheets.ts) and to the Docs presence wrappers (lib/spacetimedb/actions.ts),
// which sheets share with text documents. Tests pass a fake transport instead.
//
// Failures reject with the module's `[sheet.*]` / `[doc.*]` / `[drive.*]` message, or with SheetOfflineError
// (`[sheet.offline]`) when there is no live connection or it closes before the server answers — the presence calls
// included, so the session sees one offline error whatever it called.

import { removeDocumentPresence, upsertDocumentPresence } from "@/lib/spacetimedb/actions";
import {
  acquireSheetLease,
  cancelSheetLeaseRequest,
  compactSheet,
  declineSheetLeaseRequest,
  heartbeatSheetLease,
  pushSheetOps,
  releaseSheetLease,
  resetSheetContent,
  saveSheetVersion,
  whileSheetConnectionLive,
  type SheetActing,
  type SheetCompactInput,
  type SheetLeaseEpochInput,
  type SheetPushInput,
  type SheetResetInput,
  type SheetSaveVersionInput,
  type SheetSessionRef,
} from "@/lib/spacetimedb/actions/sheets";

/** One presence upsert: `awareness` = encodeSheetAwareness(yClientId, …) (./awareness.ts). */
export interface SheetPresenceUpsert {
  documentId: string;
  yClientId: number;
  name: string;
  color: string;
  awareness: Uint8Array;
}

export interface SheetTransport {
  acquireLease(input: SheetSessionRef & SheetActing): Promise<void>;
  heartbeatLease(input: SheetLeaseEpochInput): Promise<void>;
  releaseLease(input: SheetSessionRef): Promise<void>;
  declineLeaseRequest(input: SheetLeaseEpochInput): Promise<void>;
  cancelLeaseRequest(input: SheetSessionRef): Promise<void>;
  pushOps(input: SheetPushInput): Promise<void>;
  compact(input: SheetCompactInput): Promise<void>;
  resetContent(input: SheetResetInput): Promise<void>;
  saveVersion(input: SheetSaveVersionInput): Promise<void>;
  upsertPresence(input: SheetPresenceUpsert): Promise<void>;
  removePresence(documentId: string, yClientId: number): Promise<void>;
}

export const spacetimeSheetTransport: SheetTransport = {
  acquireLease: acquireSheetLease,
  heartbeatLease: heartbeatSheetLease,
  releaseLease: releaseSheetLease,
  declineLeaseRequest: declineSheetLeaseRequest,
  cancelLeaseRequest: cancelSheetLeaseRequest,
  pushOps: pushSheetOps,
  compact: compactSheet,
  resetContent: resetSheetContent,
  saveVersion: saveSheetVersion,
  upsertPresence: (input) => whileSheetConnectionLive(() => upsertDocumentPresence(input)),
  removePresence: (documentId, yClientId) => whileSheetConnectionLive(() => removeDocumentPresence(documentId, yClientId)),
};
