// The production DocTransport: SpacetimeYjsProvider → docs reducer wrappers.
// Tests pass a fake transport instead.
//
// With no app-wide connection (dropped socket, signed out) every call rejects
// with a DocOfflineError, so the provider reports "offline" instead of
// retrying as "saving".

import {
  compactDocument,
  pushDocumentUpdate,
  removeDocumentPresence,
  saveDocumentVersion,
  upsertDocumentPresence,
} from "@/lib/spacetimedb/actions";
import { getConnection } from "@/lib/spacetimedb/client";
import { docOfflineError } from "./spacetime-provider";
import type { DocTransport } from "./sync-types";

function whenConnected<T>(call: () => Promise<T>): Promise<T> {
  if (!getConnection()) return Promise.reject(docOfflineError());
  return call();
}

export const spacetimeDocTransport: DocTransport = {
  pushUpdate: (documentId, sessionId, payload) => whenConnected(() => pushDocumentUpdate(documentId, sessionId, payload)),
  compact: (input) => whenConnected(() => compactDocument(input)),
  saveVersion: (input) => whenConnected(() => saveDocumentVersion(input)),
  upsertPresence: (input) => whenConnected(() => upsertDocumentPresence(input)),
  removePresence: (documentId, yClientId) => whenConnected(() => removeDocumentPresence(documentId, yClientId)),
};
