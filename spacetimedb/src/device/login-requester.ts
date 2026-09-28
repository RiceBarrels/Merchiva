// device_login_requester (./tables.ts): who asked for each QR log-in request.
// The QR reducers in ../index.ts go through these helpers; a request with no
// row predates the table (or was written before this publish) and is nobody's.
//
// Runtime imports: none, so Bun tests and the server-source harness load it.

import type { DriveCtx, IdentityValue } from '../drive/types';

type RequestId = Parameters<DriveCtx['db']['deviceLoginRequester']['requestId']['find']>[0];

/** Record ctx.sender as the requester of a request it just inserted. */
export function recordDeviceLoginRequester(ctx: DriveCtx, requestId: RequestId, organizationId: string): void {
  ctx.db.deviceLoginRequester.insert({ requestId, requesterIdentity: ctx.sender, organizationId, createdAt: ctx.timestamp });
}

/** The identity that asked for this request; undefined when it has no row (a request from before the table). */
export function deviceLoginRequesterOf(ctx: DriveCtx, requestId: RequestId): IdentityValue | undefined {
  return ctx.db.deviceLoginRequester.requestId.find(requestId)?.requesterIdentity;
}

/** Whether ctx.sender asked for this request. A request with no row is nobody's. */
export function isDeviceLoginRequester(ctx: DriveCtx, requestId: RequestId): boolean {
  return deviceLoginRequesterOf(ctx, requestId)?.isEqual(ctx.sender) ?? false;
}

/** The request is being deleted for good: drop its requester row with it. */
export function dropDeviceLoginRequester(ctx: DriveCtx, requestId: RequestId): void {
  const row = ctx.db.deviceLoginRequester.requestId.find(requestId);
  if (row) ctx.db.deviceLoginRequester.delete(row);
}
