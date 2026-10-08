// Which store, and which app_file source, an UploadThing file belongs to: found
// by scanning every column that holds UploadThing URLs. serviceBackfillAppFiles
// runs it once per call for the keys it has not recorded yet; a key no column
// references belongs to no store and is skipped.
//
// The first reference wins, in this order: task evidence, inventory evidence,
// training media (objective media, then images in a day's description), product
// images, bug screenshots, store logos, profile photos (the person's earliest
// active membership), images inside documents (Docs and Slides: html, Yjs state
// and log; spreadsheets: html only, their content is gzip, so a sheet's images
// stay unmatched), and last chat attachments (the earliest message): a URL
// pasted into a chat must not move another store's file onto this one.

import type { DriveCtx } from './types';
import { docFileTypeOf } from './document-file';
import { uploadThingKeysIn } from './storage';

export interface AppFileOwner { organizationId: string; source: string }

/** The app_file source of an image inside a document of this type. */
function documentImageSource(fileType: string): string {
  if (fileType === 'sheet') return 'sheet_image';
  if (fileType === 'slides') return 'slides_image';
  return 'doc_image';
}

/** The org an avatar counts toward: the person's earliest active membership, '' when none. */
function avatarOrgOf(ctx: DriveCtx, identity: DriveCtx['sender']): string {
  let best: { organizationId: string; at: bigint } | null = null;
  for (const m of ctx.db.orgMember.byUserId.filter(identity)) {
    if (m.status !== 'active') continue;
    const at = m.joinedAt.microsSinceUnixEpoch;
    if (!best || at < best.at) best = { organizationId: m.organizationId, at };
  }
  return best?.organizationId ?? '';
}

/**
 * Owner of each key in `wanted` that some column references. Stops scanning
 * once every wanted key is placed.
 */
export function appFileOwners(ctx: DriveCtx, wanted: ReadonlySet<string>): Map<string, AppFileOwner> {
  const owners = new Map<string, AppFileOwner>();
  const done = (): boolean => owners.size >= wanted.size;
  const claim = (text: string | undefined | null, organizationId: string, source: string): void => {
    if (!text || organizationId === '') return;
    for (const key of uploadThingKeysIn(text)) {
      if (wanted.has(key) && !owners.has(key)) owners.set(key, { organizationId, source });
    }
  };
  const claimKeys = (keys: readonly string[], organizationId: string, source: string): void => {
    if (organizationId === '') return;
    for (const key of keys) if (!owners.has(key)) owners.set(key, { organizationId, source });
  };
  if (wanted.size === 0) return owners;

  for (const a of ctx.db.roleTaskAssignment.iter()) {
    claim(a.evidenceUrls, a.organizationId, 'tasks');
    claim(a.evidenceUrl, a.organizationId, 'tasks');
  }
  for (const tx of ctx.db.inventoryTransaction.iter()) claim(tx.evidenceUrls, tx.organizationId, 'inventory');
  if (done()) return owners;

  for (const o of ctx.db.trainingObjective.iter()) claim(o.mediaUrl, o.organizationId, 'training');
  for (const d of ctx.db.trainingDay.iter()) claim(d.description, d.organizationId, 'training');
  for (const item of ctx.db.inventoryItem.iter()) claim(item.retailImageUrl, item.organizationId, 'products');
  for (const bug of ctx.db.bugReport.iter()) claim(bug.screenshotUrl, bug.organizationId, 'bugs');
  if (done()) return owners;

  for (const org of ctx.db.organization.iter()) claim(org.logoUrl, org.orgIdText || org.id.toString(), 'logo');
  for (const user of ctx.db.user.iter()) {
    if (user.avatarUrl && uploadThingKeysIn(user.avatarUrl).some((key) => wanted.has(key) && !owners.has(key))) {
      claim(user.avatarUrl, avatarOrgOf(ctx, user.identity), 'avatar');
    }
  }
  if (done()) return owners;

  // Documents: the snapshot html, and for Docs / Slides the Yjs state and the
  // uncompacted log too (a deck's html is text only, and an image inserted since
  // the last compaction is in the log alone). A spreadsheet's state and log are
  // gzip, so a sheet's images cannot be found here and stay unmatched.
  for (const snap of ctx.db.documentSnapshot.iter()) {
    const fileType = docFileTypeOf(ctx, snap.documentId);
    const source = documentImageSource(fileType);
    if (snap.html.includes('https://')) claim(snap.html, snap.organizationId, source);
    if (fileType === 'sheet') continue;
    claimKeys(wantedKeysInBytes(snap.state, wanted), snap.organizationId, source);
    for (const row of ctx.db.documentUpdate.byDocumentId.filter(snap.documentId)) {
      claimKeys(wantedKeysInBytes(row.payload, wanted), snap.organizationId, source);
    }
    if (done()) return owners;
  }

  // Chat last, and the earliest message wins: any member can put any public URL
  // in a message (another store's logo, a file forwarded from elsewhere), so a
  // chat reference never takes a key some store's own column holds, and among
  // messages the first one to carry the URL is the upload.
  const conversationOrg = new Map<string, string>();
  for (const c of ctx.db.chatConversation.iter()) conversationOrg.set(c.id.toString(), c.organizationId);
  const earliest = new Map<string, { organizationId: string; at: bigint }>();
  for (const msg of ctx.db.chatMessage.iter()) {
    if (!msg.attachmentUrl) continue;
    const organizationId = conversationOrg.get(msg.conversationId) ?? '';
    if (organizationId === '') continue;
    const at = msg.createdAt.microsSinceUnixEpoch;
    for (const key of uploadThingKeysIn(msg.attachmentUrl)) {
      if (!wanted.has(key) || owners.has(key)) continue;
      const seen = earliest.get(key);
      if (!seen || at < seen.at) earliest.set(key, { organizationId, at });
    }
  }
  for (const [key, first] of earliest) owners.set(key, { organizationId: first.organizationId, source: 'chat' });
  return owners;
}

const HTTPS_BYTES = [0x68, 0x74, 0x74, 0x70, 0x73, 0x3a, 0x2f, 0x2f]; // "https://"
/** Longest URL candidate read from binary content. */
const URL_BYTES_MAX = 2048;
/** An UploadThing file URL up to its key (the key itself is matched against the wanted set). */
const UPLOADTHING_PREFIX_RE = /^https:\/\/(?:utfs\.io|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ufs\.sh)(?::443)?\/(?:f\/|a\/[^/?#\s]+\/)/i;

/** A byte that can continue a URL candidate: printable ASCII except what ends one in free text (" ' < > ( ) \\). */
function urlByte(b: number): boolean {
  return b > 0x20 && b < 0x7f && b !== 0x22 && b !== 0x27 && b !== 0x3c && b !== 0x3e && b !== 0x28 && b !== 0x29 && b !== 0x5c;
}

/**
 * Wanted UploadThing keys referenced inside binary content (a Yjs state or
 * update keeps every string as raw UTF-8). The bytes after a URL may happen to
 * be printable (the next item's header), so a candidate key counts when its
 * longest prefix is a wanted key.
 */
export function wantedKeysInBytes(bytes: Uint8Array, wanted: ReadonlySet<string>): string[] {
  const found: string[] = [];
  const last = bytes.length - HTTPS_BYTES.length;
  scan: for (let i = 0; i <= last; i++) {
    if (bytes[i] !== 0x68) continue;
    for (let j = 1; j < HTTPS_BYTES.length; j++) if (bytes[i + j] !== HTTPS_BYTES[j]) continue scan;
    let end = i + HTTPS_BYTES.length;
    while (end < bytes.length && end - i < URL_BYTES_MAX && urlByte(bytes[end])) end++;
    let candidate = '';
    for (let k = i; k < end; k++) candidate += String.fromCharCode(bytes[k]);
    i += HTTPS_BYTES.length - 1; // not `end`: a URL right after this one (no separator) is its own candidate
    const prefix = UPLOADTHING_PREFIX_RE.exec(candidate);
    if (!prefix) continue;
    const rest = candidate.slice(prefix[0].length);
    const cut = rest.search(/[/?#]/);
    const key = cut < 0 ? rest : rest.slice(0, cut);
    for (let n = key.length; n > 0; n--) {
      if (wanted.has(key.slice(0, n))) {
        found.push(key.slice(0, n));
        break;
      }
    }
  }
  return found;
}
