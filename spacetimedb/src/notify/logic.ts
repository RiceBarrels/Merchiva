// Pure notification rules shared by ./deliver.ts, ./claim.ts and ./reducers.ts
// (scripts/tests/notify/*.test.ts load this file directly). No SDK imports.
//
// Every top-level name carries a notify prefix: index.ts follows this file
// into one namespace with every other module file (scripts/tests/docs/server-source.ts),
// so a second `HOUR_MICROS` or `NOTIFY_BODY_MAX` would be ambiguous there.

const NOTIFY_SECOND_MICROS = 1_000_000n;
const NOTIFY_MINUTE_MICROS = 60n * NOTIFY_SECOND_MICROS;
const NOTIFY_DAY_MICROS = 24n * 60n * NOTIFY_MINUTE_MICROS;

// ─── Templates ───────────────────────────────────────────────────────────────

/**
 * What a notification is, for the copy in the recipient's language
 * (`notify.event.<template>.title|body` in messages/*.json, filled with the
 * row's params by lib/i18n fmt). `custom` shows the row's own title / body.
 */
export const NOTIFY_TEMPLATES = [
  'chat.message', 'chat.mention', 'chat.follow', 'chat.pin', 'chat.merchiva',
  'timeOff.requested', 'timeOff.approved', 'timeOff.denied', 'timeOff.updated',
  'shift.requested', 'shift.open', 'team.joined',
  'inventory.low', 'inventory.waste', 'supplier.order', 'supplier.issue',
  'security.pinLocked', 'security.manyWrongPins', 'security.pinUnlocked',
  'doc.shared', 'doc.comment', 'doc.reply', 'form.response',
  'alert.emergency', 'custom',
] as const;
export type NotifyTemplate = (typeof NOTIFY_TEMPLATES)[number];

/**
 * The params each template's copy uses, besides `store` (the organization's
 * name), which every row carries. Values are plain strings: names and titles
 * as written, previews ≤ NOTIFY_PREVIEW_MAX chars, dates as ISO 'YYYY-MM-DD',
 * `conversation` = the channel name ('' for a direct message).
 */
export const NOTIFY_TEMPLATE_PARAMS: Readonly<Record<NotifyTemplate, readonly string[]>> = {
  'chat.message': ['actor', 'preview', 'conversation'],
  'chat.mention': ['actor', 'preview', 'conversation'],
  'chat.follow': ['actor', 'preview', 'conversation'],
  'chat.pin': ['actor', 'preview', 'conversation'],
  'chat.merchiva': ['preview', 'conversation'],
  'timeOff.requested': ['actor', 'start', 'end'],
  'timeOff.approved': ['start', 'end'],
  'timeOff.denied': ['start', 'end'],
  'timeOff.updated': ['start', 'end'],
  'shift.requested': ['actor'],
  'shift.open': ['actor'],
  'team.joined': ['actor'],
  'inventory.low': ['item', 'quantity', 'unit', 'min'],
  'inventory.waste': ['item', 'quantity', 'unit'],
  'supplier.order': ['supplier'],
  'supplier.issue': ['supplier', 'preview'],
  'security.pinLocked': ['actor', 'count'],
  'security.manyWrongPins': ['count'],
  'security.pinUnlocked': ['actor'],
  'doc.shared': ['actor', 'doc'],
  'doc.comment': ['actor', 'doc', 'preview'],
  'doc.reply': ['actor', 'doc', 'preview'],
  'form.response': ['actor', 'form'],
  'alert.emergency': ['device'],
  custom: [],
};

/** The store SOS: pushes and emails at once, past the email switch, gap and daily cap. */
export const NOTIFY_EMERGENCY_TEMPLATE = 'alert.emergency';

/** Templates whose in-app text needs no localization: their delivery row goes as soon as nothing is owed. */
const NOTIFY_UNLOCALIZED_TEMPLATES: ReadonlySet<string> = new Set(['chat.message', 'chat.merchiva', 'custom']);

export function notifyIsTemplate(value: unknown): value is NotifyTemplate {
  return typeof value === 'string' && (NOTIFY_TEMPLATES as readonly string[]).includes(value);
}

export function notifyIsLocalized(template: string): boolean {
  return !NOTIFY_UNLOCALIZED_TEMPLATES.has(template);
}

/** Sent to owners and managers only: a recipient who is neither any more gets nothing. */
export function notifyIsManagerTemplate(template: string): boolean {
  return template.startsWith('security.') || template.startsWith('supplier.')
    || template === 'timeOff.requested' || template === NOTIFY_EMERGENCY_TEMPLATE;
}

/** Low stock and waste reach everyone in the app, but email only owners and managers. */
export function notifyEmailNeedsManager(template: string, sourceKind: string): boolean {
  return template.startsWith('inventory.') || sourceKind === 'inventory';
}

/** What produced a row, for send-time revalidation (./claim.ts). */
export const NOTIFY_SOURCE_KINDS = ['', 'chat_message', 'chat_pin', 'doc_comment', 'doc', 'form', 'inventory', 'device'] as const;
export type NotifySourceKind = (typeof NOTIFY_SOURCE_KINDS)[number];

export function notifyIsSourceKind(value: unknown): value is NotifySourceKind {
  return typeof value === 'string' && (NOTIFY_SOURCE_KINDS as readonly string[]).includes(value);
}

// ─── Text ────────────────────────────────────────────────────────────────────

export const NOTIFY_TITLE_MAX = 140;
/** Not NOTIFY_BODY_MAX: forms/responses.ts already declares that name. */
export const NOTIFY_BODY_LIMIT = 500;
export const NOTIFY_PREVIEW_MAX = 140;
const NOTIFY_PARAM_VALUE_MAX = 500;
const NOTIFY_PARAMS_MAX_KEYS = 16;
const NOTIFY_ID_MAX = 128;
/** A `{name}` placeholder of lib/i18n fmt; a leading letter keeps `__proto__` out. */
const NOTIFY_PARAM_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function notifyClamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** An id column value: a string, at most NOTIFY_ID_MAX chars. */
export function notifyIdText(value: unknown): string {
  return typeof value === 'string' ? notifyClamp(value, NOTIFY_ID_MAX) : '';
}

/** A chat message as a notification preview: ≤ 140 chars, '[attachment]' for a file without text. */
export function notifyPreview(content: string, hasAttachment: boolean): string {
  if (!content && hasAttachment) return '[attachment]';
  return content.length > NOTIFY_PREVIEW_MAX ? content.slice(0, NOTIFY_PREVIEW_MAX - 3) + '...' : content;
}

/** The params column: plain-string values under fmt-safe keys, clamped, with `store` always set to the org's name. */
export function notifyParamsJson(params: Readonly<Record<string, unknown>> | undefined, store: string): string {
  const out: Record<string, string> = {};
  let keys = 0;
  for (const [key, value] of Object.entries(params ?? {})) {
    if (keys >= NOTIFY_PARAMS_MAX_KEYS) break;
    if (key === 'store' || !NOTIFY_PARAM_KEY_RE.test(key) || typeof value !== 'string') continue;
    out[key] = notifyClamp(value, NOTIFY_PARAM_VALUE_MAX);
    keys++;
  }
  out.store = notifyClamp(store, NOTIFY_PARAM_VALUE_MAX);
  return JSON.stringify(out);
}

/** The params column read back; anything unreadable is dropped, never thrown. */
export function notifyParseParams(json: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed)) {
    if (NOTIFY_PARAM_KEY_RE.test(key) && typeof value === 'string') out[key] = value;
  }
  return out;
}

// ─── Links ───────────────────────────────────────────────────────────────────

export const NOTIFY_LINK_MAX = 2000;
const NOTIFY_CONTROL_RE = /[\u0000-\u001f\u007f]/;
/** Characters a WHATWG URL parser percent-encodes in a path / a special-scheme query. */
const NOTIFY_PATH_ENCODE = new Set([' ', '"', '<', '>', '^', '`', '{', '}']);
const NOTIFY_QUERY_ENCODE = new Set([' ', '"', '<', '>', "'"]);

function notifyPercentEncode(part: string, encode: ReadonlySet<string>): string {
  let out = '';
  for (const ch of part) {
    const code = ch.charCodeAt(0);
    if (code > 0x7e) out += encodeURIComponent(ch);
    else out += encode.has(ch) ? `%${code.toString(16).toUpperCase().padStart(2, '0')}` : ch;
  }
  return out;
}

/**
 * A notification link that is safe to put in an email button or a push: an
 * in-app `/manager` path, as pathname + search (no hash), else null. Mirrors
 * lib/notifications/safe-link.ts safeAppPath, without `URL` (the module
 * runtime may not have one): `//`, `\`, control characters and dot segments
 * (which a URL parser would resolve out of /manager) are refused, and the
 * characters a URL parser percent-encodes are encoded the same way.
 */
export function notifySafeAppPath(link: unknown): string | null {
  if (typeof link !== 'string' || link.length > NOTIFY_LINK_MAX) return null;
  // A URL parser drops trailing spaces before anything else.
  const trimmed = link.replace(/ +$/, '');
  if (!/^\/manager(?:[/?]|$)/.test(trimmed)) return null;
  if (trimmed.includes('//') || trimmed.includes('\\') || NOTIFY_CONTROL_RE.test(trimmed)) return null;
  const hash = trimmed.indexOf('#');
  const noHash = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
  const q = noHash.indexOf('?');
  const path = q >= 0 ? noHash.slice(0, q) : noHash;
  const search = q >= 0 ? noHash.slice(q) : '';
  if (path.split('/').some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))) return null;
  try {
    return notifyPercentEncode(path, NOTIFY_PATH_ENCODE) + (search === '?' ? '' : notifyPercentEncode(search, NOTIFY_QUERY_ENCODE));
  } catch {
    return null; // a lone surrogate (encodeURIComponent throws URIError)
  }
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export const NOTIFY_LOCALES = ['ar', 'en', 'es', 'fr', 'hi', 'zh-cn', 'zh-hk', 'zh-tw'] as const;

/** One of NOTIFY_LOCALES (case and `_` forgiven), else '' (= English). */
export function notifyNormalizeLocale(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 16) return '';
  const value = raw.trim().toLowerCase().replace(/_/g, '-');
  return (NOTIFY_LOCALES as readonly string[]).includes(value) ? value : '';
}

const NOTIFY_SUBJECT_RE = /^user_[0-9A-Za-z]+$/;
const NOTIFY_SUBJECT_MAX = 64;
const NOTIFY_ISSUER_MAX = 200;
const NOTIFY_ISSUER_RE = /^[\x21-\x7e]+$/;

/**
 * The WorkOS user id and issuer of the caller's access token, read from
 * `ctx.senderAuth` (passed as a thunk: every getter on the way may throw).
 * Null unless both look right. The issuer is checked against the expected
 * one by the server (the module cannot read the environment).
 */
export function notifyIdentityClaims(readAuth: () => unknown): { subject: string; issuer: string } | null {
  try {
    const auth = readAuth() as { hasJWT?: unknown; jwt?: { subject?: unknown; issuer?: unknown } | null } | null | undefined;
    if (!auth || auth.hasJWT !== true || !auth.jwt) return null;
    const { subject, issuer } = auth.jwt;
    if (typeof subject !== 'string' || subject.length > NOTIFY_SUBJECT_MAX || !NOTIFY_SUBJECT_RE.test(subject)) return null;
    if (typeof issuer !== 'string' || issuer.length > NOTIFY_ISSUER_MAX || !NOTIFY_ISSUER_RE.test(issuer)) return null;
    return { subject, issuer };
  } catch {
    return null;
  }
}

/** `${organizationId}:${followerHex}:${targetHex}` — one chat_follow row per pair. */
export function notifyFollowId(organizationId: string, followerHex: string, targetHex: string): string {
  return `${organizationId}:${followerHex}:${targetHex}`;
}

export const NOTIFY_IDENTITY_HEX_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;

// ─── Push ────────────────────────────────────────────────────────────────────

export const NOTIFY_ENDPOINT_MAX = 1000;
export const NOTIFY_PUSH_KEY_MAX = 256;
export const NOTIFY_PUSH_TARGETS_MAX = 10;

/** A Web Push endpoint the cron may call: https, ≤ 1000 chars, no whitespace or controls. */
export function notifyPushEndpointOk(endpoint: unknown): endpoint is string {
  return typeof endpoint === 'string' && endpoint.length > 'https://'.length && endpoint.length <= NOTIFY_ENDPOINT_MAX
    && endpoint.startsWith('https://') && !/\s/.test(endpoint) && !NOTIFY_CONTROL_RE.test(endpoint);
}

export interface NotifyPushKeys { endpoint: string; p256dh: string; auth: string }

/** The pushTargets column: up to NOTIFY_PUSH_TARGETS_MAX distinct https subscriptions, '' when there is none. */
export function notifyPushTargetsJson(subs: Iterable<NotifyPushKeys>): string {
  const seen = new Set<string>();
  const out: NotifyPushKeys[] = [];
  for (const s of subs) {
    if (out.length >= NOTIFY_PUSH_TARGETS_MAX) break;
    if (!notifyPushEndpointOk(s.endpoint) || seen.has(s.endpoint)) continue;
    seen.add(s.endpoint);
    out.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
  }
  return out.length > 0 ? JSON.stringify(out) : '';
}

// ─── Delivery schedule ───────────────────────────────────────────────────────

/** Push waits this long, so an open app can present the alert itself and acknowledge it. */
export const NOTIFY_PUSH_DELAY_MICROS = 20n * NOTIFY_SECOND_MICROS;
/** Email waits this long, so reading the alert in the app (or a quick follow-up) means no email. */
export const NOTIFY_EMAIL_DELAY_MICROS = 60n * NOTIFY_SECOND_MICROS;
/** A row that owes nothing but still localizes its in-app text is kept this long after creation. */
export const NOTIFY_KEEP_MICROS = 7n * NOTIFY_DAY_MICROS;
/** How long a claim holds a row before another run may take it. */
export const NOTIFY_LEASE_MICROS = 5n * NOTIFY_MINUTE_MICROS;
/** An email the cron could not attempt (provider down, budget out) comes back after this. */
export const NOTIFY_RETRY_MICROS = 2n * NOTIFY_MINUTE_MICROS;
/** A row over the per-recipient claim cap, or owed on a channel this run cannot serve, is looked at again after this. */
export const NOTIFY_DEFER_MICROS = 60n * NOTIFY_SECOND_MICROS;
/** At most one email per recipient per this gap (rows arriving meanwhile join the next digest)… */
export const NOTIFY_EMAIL_GAP_MICROS = 10n * NOTIFY_MINUTE_MICROS;
/** …and at most this many per UTC day. The emergency template ignores both. */
export const NOTIFY_EMAIL_DAILY_CAP = 30;
export const NOTIFY_EMAIL_MAX_ATTEMPTS = 3;
const NOTIFY_EMAIL_BACKOFF_MINUTES = [2n, 10n, 30n] as const;
/** A push this late is no use any more (also bounds a row owed on a channel the cron never serves). */
export const NOTIFY_PUSH_MAX_AGE_MICROS = 60n * NOTIFY_MINUTE_MICROS;
/** An email this late is dropped (also bounds a row owed on a channel the cron never serves). */
export const NOTIFY_EMAIL_MAX_AGE_MICROS = 3n * NOTIFY_DAY_MICROS;

/** Rows claimed per run, ids per list argument, rows claimed per recipient per run. */
export const NOTIFY_CLAIM_MAX = 500;
export const NOTIFY_LIST_MAX = 500;
export const NOTIFY_CLAIM_PER_RECIPIENT = 20;
/** Done rows past their keep time one claim deletes; they take no claim slot. */
export const NOTIFY_CLAIM_SWEEP_MAX = 1000;
/** Longest list arguments read at all, checked before JSON.parse. */
export const NOTIFY_IDS_JSON_MAX_CHARS = NOTIFY_LIST_MAX * 48;
export const NOTIFY_FINISH_JSON_MAX_CHARS = 1_000_000;
/** A store's SOS can be sent again after this. */
export const NOTIFY_SOS_COOLDOWN_MICROS = 2n * NOTIFY_MINUTE_MICROS;

export const NOTIFY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The store SOS (sendStoreSos, or an older tablet's push-only one): claimed first, never held back by a quota. */
export function notifyIsUrgent(template: string, type: string, sourceKind: string): boolean {
  return template === NOTIFY_EMERGENCY_TEMPLATE || (type === 'emergency' && sourceKind === 'device');
}

// ─── Queue quotas ────────────────────────────────────────────────────────────
// One claim run a minute serves every store, so what one store, or one
// recipient, may put in the delivery queue is bounded (notification_quota).
// Past a quota the notification is still in the app; it is just not queued.

/**
 * org: delivery rows one organization may queue per minute (past it: no
 * delivery row, the in-app row keeps its English copy). push: pushes one
 * recipient may be owed per minute, what one run claims for them. email:
 * emails one recipient may be owed per hour, half of what the paced digests
 * carry (6 × NOTIFY_CLAIM_PER_RECIPIENT), so a backlog always drains.
 */
export const NOTIFY_QUOTAS = {
  org: { windowMicros: NOTIFY_MINUTE_MICROS, max: 120 },
  push: { windowMicros: NOTIFY_MINUTE_MICROS, max: NOTIFY_CLAIM_PER_RECIPIENT },
  email: { windowMicros: 60n * NOTIFY_MINUTE_MICROS, max: 60 },
} as const;
export type NotifyQuotaKind = keyof typeof NOTIFY_QUOTAS;

/** One quota counter: its window (now / window length) and the uses in it. */
export interface NotifyQuota { windowKey: bigint; count: number }

/** The counter after one more use at `now`, or null when the current window's uses are spent. */
export function notifyQuotaAfter(kind: NotifyQuotaKind, previous: NotifyQuota | null, now: bigint): NotifyQuota | null {
  const { windowMicros, max } = NOTIFY_QUOTAS[kind];
  const windowKey = now / windowMicros;
  const used = previous != null && previous.windowKey === windowKey ? previous.count : 0;
  return used >= max ? null : { windowKey, count: used + 1 };
}

/** Email pacing of one recipient (notification_email_state). */
export interface NotifyPacing { lastEmailAtMicros: bigint; dayKey: string; dayCount: number }

/** UTC 'YYYY-MM-DD' — the daily email cap counts UTC days on purpose (not a store's calendar day). */
export function notifyUtcDayKey(micros: bigint): string {
  const d = new Date(Number(micros / 1000n));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The pacing row after one more email at `now`. */
export function notifyPacingAfterEmail(previous: NotifyPacing | null, now: bigint): NotifyPacing {
  const dayKey = notifyUtcDayKey(now);
  const dayCount = previous && previous.dayKey === dayKey ? previous.dayCount + 1 : 1;
  return { lastEmailAtMicros: now, dayKey, dayCount };
}

/** When the email of a failed attempt may be tried again: 2, 10, then 30 minutes. */
export function notifyEmailBackoffMicros(attempts: number): bigint {
  const i = Math.min(Math.max(Math.floor(attempts), 1), NOTIFY_EMAIL_BACKOFF_MINUTES.length) - 1;
  return NOTIFY_EMAIL_BACKOFF_MINUTES[i] * NOTIFY_MINUTE_MICROS;
}

/** Earliest push time of a row. The emergency pushes at once (it is never acknowledged by an open app). */
export function notifyPushAt(template: string, createdAtMicros: bigint): bigint {
  return template === NOTIFY_EMERGENCY_TEMPLATE ? createdAtMicros : createdAtMicros + NOTIFY_PUSH_DELAY_MICROS;
}

/** Earliest email time of a row: the delay, then the recipient's gap and daily cap (the emergency skips all three). */
export function notifyEmailAt(template: string, createdAtMicros: bigint, pacing: NotifyPacing | null, now: bigint): bigint {
  if (template === NOTIFY_EMERGENCY_TEMPLATE) return createdAtMicros;
  let at = createdAtMicros + NOTIFY_EMAIL_DELAY_MICROS;
  if (pacing) {
    const gapEnd = pacing.lastEmailAtMicros + NOTIFY_EMAIL_GAP_MICROS;
    if (gapEnd > at) at = gapEnd;
    if (pacing.dayKey === notifyUtcDayKey(now) && pacing.dayCount >= NOTIFY_EMAIL_DAILY_CAP) {
      const nextDay = (now / NOTIFY_DAY_MICROS + 1n) * NOTIFY_DAY_MICROS;
      if (nextDay > at) at = nextDay;
    }
  }
  return at;
}

/** The first dueAt of a new row: its push time when it owes a push, else its email time. */
export function notifyFirstDueAt(template: string, createdAtMicros: bigint, push: boolean): bigint {
  if (template === NOTIFY_EMERGENCY_TEMPLATE) return createdAtMicros;
  return createdAtMicros + (push ? NOTIFY_PUSH_DELAY_MICROS : NOTIFY_EMAIL_DELAY_MICROS);
}

export interface NotifyOwed { template: string; createdAtMicros: bigint; push: boolean; email: boolean }

/**
 * When the claim reducer should look at an unclaimed row again: the earliest
 * time a channel it still owes becomes due. A channel the last run could not
 * serve is looked at again after NOTIFY_DEFER_MICROS. Always after `now`.
 */
export function notifyNextDueAt(
  row: NotifyOwed, pacing: NotifyPacing | null, now: bigint, served: { push: boolean; email: boolean },
): bigint {
  const later = now + NOTIFY_DEFER_MICROS;
  let next: bigint | null = null;
  const consider = (at: bigint) => { if (next === null || at < next) next = at; };
  if (row.push) consider(served.push ? notifyPushAt(row.template, row.createdAtMicros) : later);
  if (row.email) consider(served.email ? notifyEmailAt(row.template, row.createdAtMicros, pacing, now) : later);
  const at: bigint = next ?? later;
  return at > now ? at : now + 1n;
}

/**
 * The done rule, for a row that owes nothing: null = delete it (its template
 * needs no localization, or its keep time is over), else the dueAt it is kept
 * until so the client can still localize its in-app text.
 */
export function notifyDoneKeepUntil(template: string, createdAtMicros: bigint, now: bigint): bigint | null {
  if (!notifyIsLocalized(template)) return null;
  const keepUntil = createdAtMicros + NOTIFY_KEEP_MICROS;
  return keepUntil > now ? keepUntil : null;
}

// ─── Arguments ───────────────────────────────────────────────────────────────

/** 'p' (push), 'e' (email), both or neither, as the cron can serve them this run; null when malformed. */
export function notifyParseChannels(raw: unknown): { push: boolean; email: boolean } | null {
  if (typeof raw !== 'string' || !/^(?:p|e|pe|ep)?$/.test(raw)) return null;
  return { push: raw.includes('p'), email: raw.includes('e') };
}

/** A JSON string[] of ids, de-duplicated; null when unreadable, too long or over NOTIFY_LIST_MAX. Non-string entries are skipped. */
export function notifyParseIdList(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || raw.length > NOTIFY_IDS_JSON_MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > NOTIFY_LIST_MAX) return null;
  const ids = new Set<string>();
  for (const value of parsed) {
    if (typeof value === 'string' && value.length > 0 && value.length <= NOTIFY_ID_MAX) ids.add(value);
  }
  return [...ids];
}

/** What one finish call reports, per notification id. */
export interface NotifyFinishResult {
  pushed: string[];
  emailed: string[];
  emailRetry: string[];
  emailFailed: string[];
  emailDropped: string[];
  /** [notificationId, endpoint]: the push service said the subscription is gone. */
  expired: Array<[string, string]>;
}

const NOTIFY_FINISH_LISTS = ['pushed', 'emailed', 'emailRetry', 'emailFailed', 'emailDropped'] as const;

/** The finish reducer's resultJson; null when unreadable, too long, or a list is malformed or over NOTIFY_LIST_MAX. */
export function notifyParseFinish(raw: unknown): NotifyFinishResult | null {
  if (typeof raw !== 'string' || raw.length > NOTIFY_FINISH_JSON_MAX_CHARS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const out: NotifyFinishResult = { pushed: [], emailed: [], emailRetry: [], emailFailed: [], emailDropped: [], expired: [] };
  for (const key of NOTIFY_FINISH_LISTS) {
    const list = obj[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > NOTIFY_LIST_MAX) return null;
    out[key] = [...new Set(list.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= NOTIFY_ID_MAX))];
  }
  const expired = obj.expired;
  if (expired !== undefined) {
    if (!Array.isArray(expired) || expired.length > NOTIFY_LIST_MAX) return null;
    for (const pair of expired) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [id, endpoint] = pair;
      if (typeof id === 'string' && id.length <= NOTIFY_ID_MAX && typeof endpoint === 'string' && endpoint.length <= NOTIFY_ENDPOINT_MAX) {
        out.expired.push([id, endpoint]);
      }
    }
  }
  return out;
}

/** `claimed` without one channel ('pe' → 'e'). */
export function notifyClaimedWithout(claimed: string, channel: 'p' | 'e'): string {
  return claimed.split('').filter((c) => c !== channel).join('');
}
