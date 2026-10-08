// Page presence reducers: upsertPagePresence and removePagePresence.
// index.ts wires them: `export const { … } = definePagePresenceReducers(spacetimedb, { t, SenderError })`.
//
// Live cursors on /manager pages — people and Mr. Merchiva. Best effort and
// ephemeral: the client heartbeats well inside the 90 s TTL and swallows every
// error these throw. Only an active member's own live connection writes a row,
// and its name and avatar come from the caller's own rows, never from the
// client. onDisconnect in index.ts deletes a connection's rows.
//
// Runtime imports: only the pure ./validate, so Bun tests load this file
// directly (scripts/tests/presence/reducers.test.ts); the SDK values arrive
// through PresenceDeps.

import type { InferSchema, ReducerCtx, SenderError as SenderErrorCtor, t as TypeBuilders } from 'spacetimedb/server';
import type Schema from '../index';
import {
  PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION, checkPagePresence, isPagePresenceStale, isPresenceKind,
  pagePresenceAvatar, pagePresenceId, pagePresenceName,
} from './validate';

export type PresenceSchema = typeof Schema;
export type PresenceCtx = ReducerCtx<InferSchema<PresenceSchema>>;
type PresenceMemberRow = NonNullable<ReturnType<PresenceCtx['db']['orgMember']['id']['find']>>;

/** What the factory needs from index.ts. Injected, so this file never imports index.ts at runtime. */
export interface PresenceDeps {
  t: typeof TypeBuilders;
  SenderError: typeof SenderErrorCtor;
}

/**
 * Whether ctx.sender is a registered service identity. Not index.ts's
 * isServiceCaller: SDK 2.10's primary-key `find` returns null for a missing
 * row and that helper compares with undefined, so it is true for every caller.
 */
function isPresenceServiceCaller(ctx: PresenceCtx): boolean {
  return ctx.db.serviceIdentity.identity.find(ctx.sender) != null;
}

/**
 * ctx.sender's own active org_member row in this organization. Not
 * findActiveMember, which answers the service identity's virtual owner (for
 * every caller while isServiceCaller is broken): a row always belongs to a real
 * member, and its name comes from that member's displayName / email.
 */
function presenceCallerMember(ctx: PresenceCtx, organizationId: string): PresenceMemberRow | undefined {
  for (const m of ctx.db.orgMember.byUserId.filter(ctx.sender)) {
    if (m.organizationId === organizationId && m.status === 'active') return m;
  }
  return undefined;
}

export function definePagePresenceReducers(spacetimedb: PresenceSchema, deps: PresenceDeps) {
  const { t, SenderError } = deps;

  /** Upserts the calling connection's row for (kind, slot), then sweeps the org's stale rows. */
  const upsertPagePresence = spacetimedb.reducer(
    {
      organizationId: t.string(),
      kind: t.string(),
      slot: t.string(),
      pagePath: t.string(),
      anchor: t.string(),
      anchorX: t.f64(),
      anchorY: t.f64(),
      pointX: t.f64(),
      pointY: t.f64(),
      clickSeq: t.u32(),
      activity: t.string(),
    },
    (ctx, args) => {
      // The service identity is a virtual owner of every org, not someone on a page.
      if (isPresenceServiceCaller(ctx)) throw new SenderError('The service identity has no page presence');
      if (!ctx.connectionId) throw new SenderError('Presence requires a live connection');
      const check = checkPagePresence(args);
      if (!check.ok) throw new SenderError(check.error);
      const p = check.value;
      const member = presenceCallerMember(ctx, args.organizationId);
      if (!member) throw new SenderError('Not an active member of this organization');

      const connectionId = ctx.connectionId.toHexString();
      const id = pagePresenceId(connectionId, p.kind, p.slot);
      const existing = ctx.db.pagePresence.id.find(id);
      if (!existing) {
        const rows = [...ctx.db.pagePresence.byConnectionId.filter(connectionId)].length;
        if (rows >= PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION) throw new SenderError('Too many presence rows for this connection');
      }
      const row = {
        id,
        organizationId: args.organizationId,
        connectionId,
        identity: ctx.sender,
        memberId: member.id.toString(),
        kind: p.kind,
        slot: p.slot,
        name: pagePresenceName(member.displayName, member.email),
        avatarUrl: pagePresenceAvatar(ctx.db.user.identity.find(ctx.sender)?.avatarUrl),
        pagePath: p.pagePath,
        anchor: p.anchor,
        anchorX: p.anchorX,
        anchorY: p.anchorY,
        pointX: p.pointX,
        pointY: p.pointY,
        clickSeq: p.clickSeq,
        activity: p.activity,
        updatedAt: ctx.timestamp,
      };
      if (existing) ctx.db.pagePresence.id.update(row);
      else ctx.db.pagePresence.insert(row);

      // Backstop for disconnects that were never delivered — this org's rows only.
      const now = ctx.timestamp.microsSinceUnixEpoch;
      for (const r of [...ctx.db.pagePresence.byOrganizationId.filter(args.organizationId)]) {
        if (r.id !== id && isPagePresenceStale(now, r.updatedAt.microsSinceUnixEpoch)) ctx.db.pagePresence.delete(r);
      }
    }
  );

  /** Needs no membership: deletes only the calling connection's own row. */
  const removePagePresence = spacetimedb.reducer(
    { kind: t.string(), slot: t.string() },
    (ctx, args) => {
      if (!ctx.connectionId || !isPresenceKind(args.kind)) return;
      const row = ctx.db.pagePresence.id.find(pagePresenceId(ctx.connectionId.toHexString(), args.kind, args.slot));
      if (row && row.identity.isEqual(ctx.sender)) ctx.db.pagePresence.delete(row);
    }
  );

  return { upsertPagePresence, removePagePresence };
}
