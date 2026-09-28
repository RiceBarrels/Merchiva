// Page presence: who is on which /manager page right now, and where Mr.
// Merchiva is working for them. One row per live tab (kind 'user') plus one per
// assistant chat scope in that tab while it runs tools (kind 'agent').
//
// Definition only: registered in schema({...}) and given its RLS rule
// (RLS_ORG_SCOPED) in ../index.ts, written by upsertPagePresence /
// removePagePresence in ./reducers.ts; validation lives in ./validate.ts.
// Ephemeral: onDisconnect deletes a connection's rows and every upsert sweeps
// its org's rows older than PAGE_PRESENCE_TTL_MICROS. `updatedAt` is a
// timestamp, which SQL cannot compare, so clients also skip stale rows themselves.
//
// Every filtered column is a plain, non-option type (see "DIALECT LIMITS" in
// ../index.ts). Published: new columns go at the END.

import { t, table } from 'spacetimedb/server';

export const pagePresenceTable = table(
  {
    name: 'page_presence',
    public: true,
    indexes: [
      // RLS join column (RLS_ORG_SCOPED) and the upsert's TTL sweep.
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      // onDisconnect, and the per-connection row cap.
      { accessor: 'byConnectionId', algorithm: 'btree', columns: ['connectionId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${connectionId}:${kind}:${slot}`
    organizationId: t.string(),
    connectionId: t.string(),           // server-stamped ctx.connectionId hex (one per tab)
    identity: t.identity(),             // ctx.sender — same identity, other connectionId = my other tab
    memberId: t.string(),               // the caller's org_member id
    kind: t.string(),                   // 'user' | 'agent'
    slot: t.string(),                   // agent: the chat scope (tab id or '__window__'); user: ''
    name: t.string(),                   // server-derived: org_member displayName → email → 'Anonymous'
    avatarUrl: t.string(),              // server-derived from the caller's own user row; '' if none
    pagePath: t.string(),               // normalized /manager path, no query or hash
    anchor: t.string(),                 // element key the cursor sits on ('' = use pointX/pointY)
    anchorX: t.f64(),                   // 0..1 inside the anchor element
    anchorY: t.f64(),
    pointX: t.f64(),                    // 0..1 of the page region (fallback when the anchor is missing)
    pointY: t.f64(),
    clickSeq: t.u32(),                  // bumped per click; a change plays the remote click animation
    activity: t.string(),               // agent: the tool / action name; user: ''
    updatedAt: t.timestamp(),
  }
);
