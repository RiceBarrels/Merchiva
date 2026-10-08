// Type-only plumbing for the drive/*.ts module files. Every import here is
// `import type`, so this file never loads at runtime: the drive files can type
// the reducer context without importing index.ts (which imports them).

import type { InferSchema, ReducerCtx, SenderError as SenderErrorCtor, t as TypeBuilders } from 'spacetimedb/server';
import type Schema from '../index';
import type { DriveDocRole } from './logic';

export type DriveSchema = typeof Schema;
export type DriveCtx = ReducerCtx<InferSchema<DriveSchema>>;
type Db = DriveCtx['db'];

export type MemberRow = NonNullable<ReturnType<Db['orgMember']['id']['find']>>;
export type DocumentRow = NonNullable<ReturnType<Db['document']['id']['find']>>;
export type DriveItemRow = NonNullable<ReturnType<Db['driveItem']['id']['find']>>;
/** A SpacetimeDB identity as stored in identity columns (ctx.sender's type). */
export type IdentityValue = DriveCtx['sender'];

export type DocRole = DriveDocRole;

/**
 * What findActiveMember returns: a real org_member row, or the service
 * identity's virtual owner. `userId` is optional because the non-service branch
 * is cast without it.
 */
export interface MemberLike {
  id: { toString(): string };
  organizationId: string;
  role: string;
  permissions: string;
  status: string;
  userId?: unknown;
}

export interface IdentityLike {
  toHexString(): string;
  isEqual(other: unknown): boolean;
}

export type { TypeBuilders, SenderErrorCtor };
