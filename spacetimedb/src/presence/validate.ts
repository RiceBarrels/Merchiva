// Page presence validation: pure helpers used by the upsertPagePresence /
// removePagePresence reducers in ./reducers.ts.
//
// No SpacetimeDB imports, so the tests (scripts/tests/presence/) import this
// file directly and check the exact rules the module enforces. The client
// normalises what it sends (lib/presence/anchor.ts); the module never trusts it
// and rejects anything outside these bounds rather than repairing it.

/** Rows not refreshed for this long are swept by the next upsert in the org. */
export const PAGE_PRESENCE_TTL_MICROS = 90_000_000n;
/** 'user' = the person's cursor in a tab; 'agent' = Mr. Merchiva working in one chat scope of that tab. */
export const PAGE_PRESENCE_KINDS = ['user', 'agent'] as const;
export type PagePresenceKind = (typeof PAGE_PRESENCE_KINDS)[number];

export const PAGE_PRESENCE_SLOT_MAX = 80;
export const PAGE_PRESENCE_ACTIVITY_MAX = 80;
export const PAGE_PRESENCE_PATH_MAX = 200;
export const PAGE_PRESENCE_ANCHOR_MAX = 512;
export const PAGE_PRESENCE_NAME_MAX = 80;
export const PAGE_PRESENCE_AVATAR_MAX = 2048;
/** One user row plus agent rows; a connection cannot fill the org's table with slots. */
export const PAGE_PRESENCE_MAX_ROWS_PER_CONNECTION = 16;

const TOKEN_RE = /^[A-Za-z0-9_:-]*$/;
const PATH_RE = /^\/manager(\/[A-Za-z0-9._~-]+)*$/;
const DOT_SEGMENT_RE = /\/\.{1,2}(?=\/|$)/;
// C0, DEL, C1 and the Unicode line/paragraph separators.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const CONTROL_RE_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const AVATAR_RE = /^https:\/\/[^\s"'<>\\`]+$/i;

export function isPresenceKind(kind: string): kind is PagePresenceKind {
  return (PAGE_PRESENCE_KINDS as readonly string[]).includes(kind);
}

/** A user row has no slot (one per tab); an agent row is keyed by its chat scope. */
export function isPresenceSlot(kind: PagePresenceKind, slot: string): boolean {
  if (kind === 'user') return slot === '';
  return slot.length > 0 && slot.length <= PAGE_PRESENCE_SLOT_MAX && TOKEN_RE.test(slot);
}

/** A normalized /manager path: no query, no hash, no trailing slash, no dot segments. */
export function isPresencePath(path: string): boolean {
  return path.length <= PAGE_PRESENCE_PATH_MAX && PATH_RE.test(path) && !DOT_SEGMENT_RE.test(path);
}

/** '' = no anchor (the point fallback is used). At most 512 UTF-16 units, printable, well formed. */
export function isPresenceAnchor(anchor: string): boolean {
  return anchor.length <= PAGE_PRESENCE_ANCHOR_MAX && !CONTROL_RE.test(anchor) && !LONE_SURROGATE_RE.test(anchor);
}

/** A tool or action name, or ''. */
export function isPresenceActivity(activity: string): boolean {
  return activity.length <= PAGE_PRESENCE_ACTIVITY_MAX && TOKEN_RE.test(activity);
}

/** Finite numbers clamp into [0, 1]; NaN and ±Infinity are rejected (null). */
export function clampUnit(n: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function isU32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

export interface PagePresenceInput {
  kind: string;
  slot: string;
  pagePath: string;
  anchor: string;
  anchorX: number;
  anchorY: number;
  pointX: number;
  pointY: number;
  clickSeq: number;
  activity: string;
}

export interface PagePresenceFields extends PagePresenceInput {
  kind: PagePresenceKind;
}

export type PagePresenceCheck =
  | { ok: true; value: PagePresenceFields }
  | { ok: false; error: string };

/** Every client-supplied field of an upsert, checked in one place. Coordinates come back clamped. */
export function checkPagePresence(input: PagePresenceInput): PagePresenceCheck {
  const kind = String(input.kind);
  if (!isPresenceKind(kind)) return { ok: false, error: 'Presence kind must be "user" or "agent"' };
  const slot = String(input.slot);
  if (!isPresenceSlot(kind, slot)) {
    return { ok: false, error: kind === 'user' ? 'A user presence has no slot' : 'Invalid presence slot' };
  }
  const pagePath = String(input.pagePath);
  if (!isPresencePath(pagePath)) return { ok: false, error: 'Presence path must be a normalized /manager path' };
  const anchor = String(input.anchor);
  if (!isPresenceAnchor(anchor)) return { ok: false, error: 'Invalid presence anchor' };
  const activity = String(input.activity);
  if (!isPresenceActivity(activity)) return { ok: false, error: 'Invalid presence activity' };
  if (!isU32(input.clickSeq)) return { ok: false, error: 'Presence clickSeq must be a u32' };
  const anchorX = clampUnit(input.anchorX);
  const anchorY = clampUnit(input.anchorY);
  const pointX = clampUnit(input.pointX);
  const pointY = clampUnit(input.pointY);
  if (anchorX === null || anchorY === null || pointX === null || pointY === null) {
    return { ok: false, error: 'Presence coordinates must be finite' };
  }
  return {
    ok: true,
    value: { kind, slot, pagePath, anchor, anchorX, anchorY, pointX, pointY, clickSeq: input.clickSeq, activity },
  };
}

/** Primary key: one row per (connection, kind, slot). The connection hex is server-stamped. */
export function pagePresenceId(connectionHex: string, kind: PagePresenceKind, slot: string): string {
  return `${connectionHex}:${kind}:${slot}`;
}

/** Display name from the caller's own org_member row: displayName → email → 'Anonymous'. */
export function pagePresenceName(displayName: string | undefined | null, email: string | undefined | null): string {
  const clean = (s: string | undefined | null) =>
    String(s ?? '').replace(CONTROL_RE_G, ' ').replace(/\s+/g, ' ').trim().slice(0, PAGE_PRESENCE_NAME_MAX);
  return clean(displayName) || clean(email) || 'Anonymous';
}

/** The caller's own avatar, only as a plain https URL (colleagues render it as an <img>); '' otherwise. */
export function pagePresenceAvatar(url: string | undefined | null): string {
  const s = String(url ?? '').trim();
  return s.length <= PAGE_PRESENCE_AVATAR_MAX && AVATAR_RE.test(s) && !CONTROL_RE.test(s) ? s : '';
}

export function isPagePresenceStale(nowMicros: bigint, updatedAtMicros: bigint): boolean {
  return nowMicros - updatedAtMicros > PAGE_PRESENCE_TTL_MICROS;
}
