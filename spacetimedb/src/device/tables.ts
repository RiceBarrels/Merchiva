// Store-device side tables.
//
// Definitions only: registered in schema({...}) in ../index.ts, which also
// holds device_login_request, the QR log-in reducers and the RLS rule that
// joins this table. ./login-requester.ts reads and writes it.
//
// Why a side table: the SpacetimeDB TS SDK decodes a subscription's rows one
// after another with the CLIENT's compiled row type, so a column appended to
// device_login_request would misalign every row after the first on a store
// tablet still running an older bundle (a web tab, or an installed Capacitor
// app) and it would throw "RangeError: Out of bounds access". Pre-existing
// tables never change their columns (scripts/tests/drive/client-compat-schema.test.ts).
//
// Every filtered or joined column is a plain, non-option type (see "DIALECT
// LIMITS" in ../index.ts). Published: new columns go at the END.

import { t, table } from 'spacetimedb/server';

/**
 * Which identity asked for each QR log-in request: the store tablet (its
 * account) that called createDeviceLoginRequest. One row per request, written
 * with it and deleted with it. Join target of the device_login_request rule
 * (only the requester reads its request, whose nonce is the QR's whole
 * secret), so it carries NO rule of its own — see the KNOWN GAP note on
 * RLS_UNFILTERED in ../index.ts.
 */
export const deviceLoginRequesterTable = table(
  {
    name: 'device_login_requester',
    public: true,
    indexes: [
      { accessor: 'byRequesterIdentity', algorithm: 'btree', columns: ['requesterIdentity'] },
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
    ],
  },
  {
    requestId: t.uuid().primaryKey(),   // device_login_request.id — the same type, so the rule joins uuid = uuid
    requesterIdentity: t.identity(),    // ctx.sender of createDeviceLoginRequest
    organizationId: t.string(),
    createdAt: t.timestamp(),
  }
);
