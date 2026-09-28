// Drive rules shared by every drive reducer: limits, the blob-key grammar, name
// and MIME cleaning, the Drive admin power, item roles, tree walks and the
// cross-space move rule. PURE and import-free: Bun tests import it directly and
// the docs test harness follows index.ts's import of it.
//
// Client mirrors (same names; bigint bytes / µs here, number bytes / ms there):
// lib/drive/rules.ts (limits, keys, names, MIME) and lib/drive/access.ts (admin
// power, item roles, spaceMoveAllowed). Parity tests pair them: change both.

const GIB = 1_073_741_824n;
const HOUR_MICROS = 3_600_000_000n;

export const DRIVE_SPACES = ['my', 'store'] as const;
export const DRIVE_KINDS = ['folder', 'file'] as const;
export const DRIVE_SURFACES = ['manager', 'store', 'personal'] as const;
export type DriveSpace = (typeof DRIVE_SPACES)[number];

export const DRIVE_NAME_MAX = 255;
export const DRIVE_MIME_MAX = 127;
export const DRIVE_ETAG_MAX = 256;

/** Largest single upload. */
export const DRIVE_MAX_FILE_BYTES = GIB;
export const DRIVE_THUMB_MAX_BYTES = 262_144n;
export const DRIVE_THUMB_TYPES = ['image/webp', 'image/jpeg'] as const;
export const DRIVE_THUMB_LEAF = '_thumb';
/** Per-org quota unless support set drive_usage.quotaBytesOverride (serviceSetDriveQuota). */
export const DRIVE_DEFAULT_QUOTA_BYTES = 10n * GIB;

/** A pending upload expires this long after its latest authorize (≥ the longest presigned PUT). */
export const DRIVE_UPLOAD_TTL_MICROS = 3n * HOUR_MICROS;
/** Extra time a cancelled / expired upload's key keeps being deleted, in case a PUT still lands. */
export const DRIVE_GC_HOLD_SLACK_MICROS = HOUR_MICROS;
export const DRIVE_UPLOAD_MAX_ATTEMPTS = 8;
/** Pending uploads per uploader identity. */
export const DRIVE_MAX_PENDING_PER_UPLOADER = 20;
/** Declared bytes one uploader identity may hold in pending uploads (`too_many_pending` beyond it). */
export const DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES = 2n * DRIVE_MAX_FILE_BYTES;

/** Memory bound: the whole database is resident. */
export const DRIVE_MAX_ITEMS_PER_ORG = 100_000;
/** Ids per move / trash / restore / delete call. */
export const DRIVE_MAX_BATCH = 200;
/** Rows one cascade may touch. */
export const DRIVE_MAX_SUBTREE = 5_000;
export const DRIVE_MAX_DEPTH = 32;
/** Uploaded files in the trash are deleted after this. Docs, sheets and decks never auto-delete. */
export const DRIVE_TRASH_RETENTION_MICROS = 30n * 24n * HOUR_MICROS;
/** A blob in the store with no row is only an orphan once it is older than this. */
export const DRIVE_ORPHAN_GRACE_MICROS = 24n * HOUR_MICROS;
/** More unknown keys than this in one reconcile page means a misconfigured store: refuse to delete. */
export const DRIVE_ORPHAN_BRAKE_MAX_KEYS = 100;
export const DRIVE_SWEEP_MAX = 500;
export const DRIVE_GC_MAX_ATTEMPTS = 10;
/** drive_usage.scope / drive_blob_gc.scope / drive_service_reader.scope — the service rules' join key. */
export const DRIVE_SERVICE_SCOPE = 'service';
/** How long a store tablet's PIN/QR operator session may act (device_operator_session.resolvedAt). */
export const DRIVE_OPERATOR_SESSION_TTL_MICROS = 12n * HOUR_MICROS;
export const DRIVE_NOTICE_ID = 'drive_management_v1';
/** Notices acknowledgeDriveNotice accepts. */
export const DRIVE_NOTICE_IDS = [DRIVE_NOTICE_ID] as const;

/** Executables and installers. Refused on upload and on rename; this is not a malware scanner. */
export const DRIVE_BLOCKED_EXTENSIONS: readonly string[] = [
  'exe', 'msi', 'msix', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'ps1', 'psm1', 'vbs', 'vbe', 'jse', 'wsf', 'wsh',
  'hta', 'reg', 'lnk', 'jar', 'apk', 'aab', 'xapk', 'ipa', 'dmg', 'pkg', 'mpkg', 'app', 'command', 'sh', 'deb', 'rpm',
  'appimage', 'xpi', 'crx', 'gadget', 'msc', 'dll', 'sys', 'drv', 'ocx', 'inf', 'iso', 'img',
];
export const DRIVE_BLOCKED_MIME_TYPES: readonly string[] = [
  'application/x-msdownload', 'application/x-msdos-program', 'application/x-ms-installer',
  'application/x-msi', 'application/vnd.microsoft.portable-executable', 'application/x-sh',
  'application/x-shellscript', 'application/java-archive', 'application/vnd.android.package-archive',
  'application/x-apple-diskimage', 'application/x-executable', 'application/x-mach-binary',
  'application/x-iso9660-image',
];
/** Types a browser would execute or render as a document: stored as is, only ever signed as downloads (plus any `+xml`). */
export const DRIVE_ACTIVE_MIME_TYPES: readonly string[] = [
  'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml',
  'text/javascript', 'application/javascript', 'application/x-javascript', 'text/ecmascript',
  'application/ecmascript', 'application/x-shockwave-flash',
];

const UUID_ANY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_V4_RE = new RegExp(`^${UUID_V4}$`);
/** `org/<orgId>/<itemId>/<blobId>/<asciiLeaf | _thumb>`: lowercase ids, v4 item and blob ids, ASCII leaf. */
export const DRIVE_BLOB_KEY_RE = new RegExp(
  `^org/(${UUID_ANY})/(${UUID_V4})/(${UUID_V4})/([A-Za-z0-9][A-Za-z0-9._-]{0,99}|${DRIVE_THUMB_LEAF})$`,
);

/** `[drive.<code>]` reducer error codes (= lib/drive/errors.ts DriveServerErrorCode). */
export type DriveErrorCode =
  | 'not_found' | 'forbidden' | 'invalid' | 'invalid_name' | 'cycle' | 'too_deep' | 'trashed'
  | 'too_large' | 'quota_exceeded' | 'too_many_pending' | 'too_many_items' | 'batch_too_large'
  | 'expired' | 'conflict' | 'too_many_attempts' | 'blocked_type' | 'space_mismatch'
  | 'subtree_forbidden' | 'operator' | 'device_scope' | 'orphan_brake';

// ─── Names, MIME types, blob keys ────────────────────────────────────────────

/** C0 and C1 controls (incl. DEL) and the Unicode bidi controls that can disguise an extension. */
function isStrippedCodePoint(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x061c || cp === 0x200e || cp === 0x200f
    || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

/**
 * NFC → strip C0/C1 and bidi controls → NFC again → trim. null when '', '.',
 * '..', containing '/' or '\\', or over DRIVE_NAME_MAX UTF-16 units; never
 * truncates. The second NFC makes cleaning idempotent (same leaf both sides).
 */
export function cleanDriveName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let out = '';
  for (const ch of raw.normalize('NFC')) {
    if (!isStrippedCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  }
  const name = out.normalize('NFC').trim();
  if (name === '' || name === '.' || name === '..') return null;
  if (name.includes('/') || name.includes('\\')) return null;
  if (name.length > DRIVE_NAME_MAX) return null;
  return name;
}

const MIME_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;

/** Lowercased `type/subtype` without parameters, at most DRIVE_MIME_MAX long; '' when missing or malformed. */
export function normalizeDriveMime(raw: string): string {
  if (typeof raw !== 'string') return '';
  const base = raw.split(';', 1)[0].trim();
  if (base.length === 0 || base.length > DRIVE_MIME_MAX || !MIME_RE.test(base)) return '';
  return base.toLowerCase();
}

/** Lowercased text after the last '.', '' when none. Trailing dots and spaces are ignored first, as Windows drops them. */
export function driveExtension(name: string): string {
  if (typeof name !== 'string') return '';
  const base = name.replace(/[.\s]+$/u, '');
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** A blocked MIME type, or a blocked extension on the (cleaned) name or on its blob-key leaf. */
export function isBlockedDriveFile(name: string, mimeType: string): boolean {
  if (typeof name === 'string') {
    for (const ext of [driveExtension(name), driveExtension(asciiFileName(name))]) {
      if (ext !== '' && DRIVE_BLOCKED_EXTENSIONS.includes(ext)) return true;
    }
  }
  return DRIVE_BLOCKED_MIME_TYPES.includes(normalizeDriveMime(mimeType));
}

/** True when the type must only ever be served as a download: the list, or any `+xml`. */
export function isActiveDriveMime(mimeType: string): boolean {
  const mime = normalizeDriveMime(mimeType);
  return DRIVE_ACTIVE_MIME_TYPES.includes(mime) || mime.endsWith('+xml');
}

export function isDriveSpace(v: string): v is DriveSpace {
  return v === 'my' || v === 'store';
}

const LEAF_EXTENSION_RE = /^[A-Za-z0-9]{1,10}$/;
const LEAF_STEM_MAX = 80;

/**
 * The ASCII leaf of a blob key from a cleaned name (ASCII operations only, so both
 * sides agree): `Q3 report.xlsx` → `Q3-report.xlsx`, `报告.pdf` → `file.pdf`,
 * `.env` → `env`. Starts with [A-Za-z0-9], ≤ 91 chars, so never `_thumb`.
 */
export function asciiFileName(cleanName: string): string {
  let stem = cleanName;
  let ext = '';
  const dot = cleanName.lastIndexOf('.');
  if (dot > 0) {
    const rest = cleanName.slice(dot + 1);
    if (LEAF_EXTENSION_RE.test(rest)) {
      ext = rest.toLowerCase();
      stem = cleanName.slice(0, dot);
    }
  }
  let leaf = stem
    .replace(/[^A-Za-z0-9._-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');
  leaf = leaf.slice(0, LEAF_STEM_MAX).replace(/[._-]+$/, '');
  if (leaf === '') leaf = 'file';
  return ext ? `${leaf}.${ext}` : leaf;
}

export interface DriveBlobKeyParts { organizationId: string; itemId: string; blobId: string; leaf: string; isThumb: boolean }

/** `org/<organizationId>/<itemId>/<blobId>/<asciiFileName(cleanName)>`. beginDriveUpload recomputes and compares it. */
export function driveBlobKey(organizationId: string, itemId: string, blobId: string, cleanName: string): string {
  return `org/${organizationId}/${itemId}/${blobId}/${asciiFileName(cleanName)}`;
}

/** The parts of a key matching DRIVE_BLOB_KEY_RE, else null. */
export function parseDriveBlobKey(key: string): DriveBlobKeyParts | null {
  if (typeof key !== 'string') return null;
  const m = DRIVE_BLOB_KEY_RE.exec(key);
  if (!m) return null;
  return { organizationId: m[1], itemId: m[2], blobId: m[3], leaf: m[4], isThumb: m[4] === DRIVE_THUMB_LEAF };
}

/** Same prefix with the `_thumb` leaf; '' when `blobKey` is not a valid key. */
export function driveThumbKeyFor(blobKey: string): string {
  const parts = parseDriveBlobKey(blobKey);
  if (!parts) return '';
  return `org/${parts.organizationId}/${parts.itemId}/${parts.blobId}/${DRIVE_THUMB_LEAF}`;
}

/**
 * A reducer's JSON `string[]` id list: lowercased, de-duplicated, every entry a
 * UUID v4; '' is the empty list. null when unparsable, not all uuids, or over `max` entries.
 */
export function parseIdList(raw: string, max: number): string[] | null {
  if (typeof raw !== 'string') return null;
  if (raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > max) return null;
  const out: string[] = [];
  for (const value of parsed) {
    if (typeof value !== 'string') return null;
    const id = value.toLowerCase();
    if (!UUID_V4_RE.test(id)) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// ─── Access ──────────────────────────────────────────────────────────────────

export interface DriveAdminAccess { view: boolean; edit: boolean }

/** Owners and managers ("org admins"): `manager` on every item and document of their org, like docRoleFor. */
export function isOrgAdminRole(role: string): boolean {
  return role === 'owner' || role === 'manager';
}

/**
 * The Drive "everyone's files" power: owners and managers always; others through
 * the raw stored permissions.drive (view, or edit which implies view; missing or
 * unreadable = none). Callers AND it with docMemberGate. = lib/drive/access.ts driveAdminAccess.
 */
export function driveAccessOf(member: { role: string; permissions: string }): DriveAdminAccess {
  if (isOrgAdminRole(member.role)) return { view: true, edit: true };
  let stored: unknown;
  try {
    stored = JSON.parse(member.permissions || '{}');
  } catch {
    return { view: false, edit: false };
  }
  const drive = stored !== null && typeof stored === 'object' ? (stored as { drive?: unknown }).drive : undefined;
  if (drive === null || typeof drive !== 'object') return { view: false, edit: false };
  const edit = (drive as { edit?: unknown }).edit === true;
  return { view: edit || (drive as { view?: unknown }).view === true, edit };
}

/**
 * `permissions` with `drive` forced off: a manager's invitation cannot mint Drive
 * admins. Blank, unreadable or non-object JSON is returned unchanged (it grants no drive power).
 */
export function withoutDrivePower(permissions: string): string {
  if (typeof permissions !== 'string' || permissions.trim() === '') return permissions;
  let stored: unknown;
  try {
    stored = JSON.parse(permissions);
  } catch {
    return permissions;
  }
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return permissions;
  return JSON.stringify({ ...(stored as Record<string, unknown>), drive: { view: false, edit: false } });
}

/** = DOC_ROLE_RANK in index.ts (parity-tested); a separate name because the docs harness merges both files. */
export const DRIVE_DOC_ROLE_RANK = { none: 0, viewer: 1, commenter: 2, editor: 3, manager: 4 } as const;
export type DriveDocRole = keyof typeof DRIVE_DOC_ROLE_RANK;

export const DRIVE_ROLE_RANK = { none: 0, viewer: 1, contributor: 2, editor: 3, manager: 4 } as const;
/** viewer: view, download, star · contributor: + add children · editor: + rename, same-space moves · manager: + trash, restore, delete forever, cross-space moves. */
export type DriveItemRole = keyof typeof DRIVE_ROLE_RANK;

/** The rights of ONE member in ONE organization. */
export interface DriveActorLike {
  organizationId: string;
  memberId: string;
  gate: boolean;             // docMemberGate (service: true)
  orgAdmin: boolean;         // role owner | manager (service: true)
  admin: DriveAdminAccess;   // gate && driveAccessOf
}
export interface DriveItemLike { organizationId: string; ownerMemberId: string; space: string }

/** Role of `actor` on `item`. MUST match lib/drive/access.ts driveItemRole. Another organization's item → none. */
export function driveItemRole(item: DriveItemLike, actor: DriveActorLike): DriveItemRole {
  if (!actor.gate || item.organizationId !== actor.organizationId) return 'none';
  if (actor.orgAdmin || (actor.memberId !== '' && item.ownerMemberId === actor.memberId)) return 'manager';
  if (actor.admin.edit) return 'editor';
  if (item.space === 'store') return 'contributor';
  if (actor.admin.view) return 'viewer';
  return 'none';
}

export function minDriveRole(a: DriveItemRole, b: DriveItemRole): DriveItemRole {
  return DRIVE_ROLE_RANK[a] <= DRIVE_ROLE_RANK[b] ? a : b;
}

export function minDocRole(a: DriveDocRole, b: DriveDocRole): DriveDocRole {
  return DRIVE_DOC_ROLE_RANK[a] <= DRIVE_DOC_ROLE_RANK[b] ? a : b;
}

/** Pseudo-item for a space root: the store root has no owner; `my` is owned by its member. */
export function rootItem(organizationId: string, space: DriveSpace, ownerMemberId: string): DriveItemLike {
  return { organizationId, ownerMemberId: space === 'my' ? ownerMemberId : '', space };
}

// ─── Tree walks (callers pass index lookups already filtered to the actor's org) ──

/** `rootIds` and every descendant, roots first, each once; already-trashed descendants (other trash roots) and their subtrees are left out. null over `max`. */
export function collectSubtree(
  rootIds: readonly string[],
  childrenOf: (id: string) => readonly { id: string; kind: string; trashed: boolean }[],
  max: number,
): string[] | null {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of rootIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length > max) return null;
  for (let i = 0; i < out.length; i++) {
    for (const child of childrenOf(out[i])) {
      if (child.trashed || seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.id);
      if (out.length > max) return null;
    }
  }
  return out;
}

/** Whether `candidateAncestorId` is `folderId` or an ancestor (a cycle). A chain over `maxDepth`, or a loop, counts as true. */
export function isAncestorOrSelf(
  candidateAncestorId: string,
  folderId: string,
  parentOf: (id: string) => string | undefined,
  maxDepth: number,
): boolean {
  let current: string | undefined = folderId;
  for (let steps = 0; current !== undefined && current !== ''; steps++) {
    if (current === candidateAncestorId) return true;
    if (steps > maxDepth) return true;
    current = parentOf(current);
  }
  return false;
}

/** Depth of a folder: '' (a space root) is 0, a folder at the root is 1. A chain that loops is Infinity. */
export function depthOf(folderId: string, parentOf: (id: string) => string | undefined): number {
  const seen = new Set<string>();
  let depth = 0;
  let current: string | undefined = folderId;
  while (current !== undefined && current !== '') {
    if (seen.has(current)) return Number.POSITIVE_INFINITY;
    seen.add(current);
    depth++;
    current = parentOf(current);
  }
  return depth;
}

/**
 * Whether content may move between containers (Q3); role checks still apply.
 * Same space (and, in `my`, same owner): always. Into `my` of O: every moved row
 * is already O's, and the actor is O or an org admin. `my` of O → `store`
 * publishes O's private files: only O, or an org admin rescuing a departed O's.
 * `actorOrgAdmin` = the caller AND the acting operator are owners/managers.
 */
export function spaceMoveAllowed(input: {
  fromSpace: string; fromOwner: string; toSpace: string; toOwner: string; subtreeOwners: readonly string[];
  actorMemberId: string; actorOrgAdmin: boolean; fromOwnerActive: boolean;
}): boolean {
  const { fromSpace, fromOwner, toSpace, toOwner, subtreeOwners, actorMemberId, actorOrgAdmin, fromOwnerActive } = input;
  if (!isDriveSpace(fromSpace) || !isDriveSpace(toSpace)) return false;
  if (fromSpace === toSpace && (toSpace === 'store' || fromOwner === toOwner)) return true;
  if (toSpace === 'my') {
    if (toOwner === '') return false;
    return subtreeOwners.every((owner) => owner === toOwner) && (actorMemberId === toOwner || actorOrgAdmin);
  }
  return (fromOwner !== '' && actorMemberId === fromOwner) || (actorOrgAdmin && !fromOwnerActive);
}
