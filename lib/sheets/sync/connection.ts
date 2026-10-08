// Adapts a live SpacetimeDB DbConnection to what a spreadsheet session reads (sheets.md §7.3): the Docs connection
// (snapshot, update log and presence tables, mapped; the subscription builder) plus the sheet's edit lease table.
// The session subscribes to sheetLiveQueries(documentId) (lib/docs/queries.ts), which covers all four tables as one
// query set, so the lease and the content always change together.

import { createDocConnection, wrapDocTable } from "@/lib/docs/connection";
import type { DocConnection, DocTableHandle } from "@/lib/docs/sync-types";
import type { SheetLeaseRow } from "@/lib/sheets/lease";
import { mapLeaseRow } from "@/lib/sheets/mappers";

/** Who this device acts for: its own `device_operator_session` row (the PIN operator on /store). */
export interface SheetDeviceOperator { organizationId: string; memberId: string }

export interface SheetConnection extends DocConnection {
  /** `document_edit_lease`, mapped (lib/sheets/mappers.ts mapLeaseRow). */
  leases: DocTableHandle<SheetLeaseRow>;
  /**
   * This device's operator as the cache holds it now; null when none is signed in (or the bindings lack the table).
   * RLS scopes the table to the caller's identity, so it holds this device's row only.
   */
  deviceOperator?(): SheetDeviceOperator | null;
}

/** The first cached row of a raw `device_operator_session` handle, or null. */
function readDeviceOperator(table: unknown): SheetDeviceOperator | null {
  const iter = (table as { iter?: unknown } | null | undefined)?.iter;
  if (typeof iter !== "function") return null;
  try {
    for (const row of iter.call(table) as Iterable<{ organizationId?: unknown; memberId?: unknown }>) {
      return { organizationId: String(row.organizationId ?? ""), memberId: String(row.memberId ?? "") };
    }
  } catch {
    // Not an SDK table handle: nobody known.
  }
  return null;
}

// One adapter per raw connection, so `session.attach(conn)` can compare identity.
const adapters = new WeakMap<object, SheetConnection>();

/**
 * SheetConnection for a raw `DbConnectionImpl`, or null when there is none or its bindings lack the Docs tables or
 * `document_edit_lease` (before `spacetime generate`).
 */
export function createSheetConnection(raw: unknown): SheetConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const cached = adapters.get(raw);
  if (cached) return cached;
  const doc = createDocConnection(raw);
  if (!doc) return null;
  let leaseTable: unknown;
  let operatorTable: unknown;
  try {
    const db = (raw as { db?: Record<string, unknown> }).db;
    leaseTable = db?.documentEditLease;
    operatorTable = db?.deviceOperatorSession;
  } catch {
    return null;
  }
  if (!leaseTable || typeof leaseTable !== "object") return null;

  const adapter: SheetConnection = {
    // Read live, like the Docs adapter: the id is assigned once the connection handshake completes.
    get connectionIdHex(): string {
      return doc.connectionIdHex;
    },
    db: doc.db,
    subscriptionBuilder: () => doc.subscriptionBuilder(),
    leases: wrapDocTable(leaseTable, mapLeaseRow),
    deviceOperator: () => readDeviceOperator(operatorTable),
  };
  adapters.set(raw, adapter);
  return adapter;
}
