// Stateless, signed thread tokens for supplier email threads.
//
// A supplier reply must route back to the right (org, supplier) thread without
// a DB lookup. We encode both UUIDs as raw bytes plus a truncated HMAC and
// base64url it, so the token fits inside an email local part (<64 chars) and
// can't be forged. The tokenized reply-to address looks like:
//   <token>@<INBOUND_EMAIL_DOMAIN>
// and the inbound webhook decodes the local part back to { orgId, supplierId }.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string | null {
  return process.env.SUPPLIER_THREAD_SECRET || process.env.CRON_SECRET || null;
}

/** True when tokenized inbound threading is configured (secret + domain set). */
export function inboundConfigured(): boolean {
  return !!secret() && !!process.env.INBOUND_EMAIL_DOMAIN;
}

export function inboundDomain(): string | null {
  return process.env.INBOUND_EMAIL_DOMAIN || null;
}

// UUID string (with or without dashes) → 16 raw bytes, or null if not a UUID.
function uuidToBytes(uuid: string): Buffer | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

function bytesToUuid(buf: Buffer): string {
  const h = buf.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function tag(payload: Buffer, key: string): Buffer {
  return createHmac("sha256", key).update(payload).digest().subarray(0, 8);
}

/**
 * Encode (orgId, supplierId) into a signed token suitable for an email local
 * part. Returns null when threading isn't configured or the ids aren't UUIDs
 * (caller should fall back to a human reply-to).
 */
export function encodeThreadToken(orgId: string, supplierId: string): string | null {
  const key = secret();
  if (!key) return null;
  const o = uuidToBytes(orgId);
  const s = uuidToBytes(supplierId);
  if (!o || !s) return null;
  const payload = Buffer.concat([o, s]); // 32 bytes
  const token = Buffer.concat([payload, tag(payload, key)]); // 40 bytes
  return token.toString("base64url"); // ~54 chars
}

/** Decode + verify a token back to { orgId, supplierId }, or null if invalid. */
export function decodeThreadToken(token: string): { orgId: string; supplierId: string } | null {
  const key = secret();
  if (!key) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(token, "base64url");
  } catch {
    return null;
  }
  if (buf.length !== 40) return null;
  const payload = buf.subarray(0, 32);
  const got = buf.subarray(32, 40);
  const want = tag(payload, key);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return {
    orgId: bytesToUuid(payload.subarray(0, 16)),
    supplierId: bytesToUuid(payload.subarray(16, 32)),
  };
}

/**
 * Extract a thread token from an inbound recipient address. Accepts the bare
 * local part, a full "<token>@domain" address, or a list/CSV of recipients.
 */
export function tokenFromRecipient(recipient: string | null | undefined): string | null {
  if (!recipient) return null;
  const candidates = recipient.split(/[,;\s]+/).filter(Boolean);
  for (const raw of candidates) {
    // Strip display name / angle brackets: "Name <a@b>" → "a@b".
    const m = raw.match(/<([^>]+)>/);
    const addr = (m ? m[1] : raw).trim();
    const local = addr.includes("@") ? addr.split("@")[0] : addr;
    if (decodeThreadToken(local)) return local;
  }
  return null;
}
