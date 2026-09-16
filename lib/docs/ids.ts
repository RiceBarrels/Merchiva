// Document ids are generated on the client (reducers can't return values) as
// lowercase UUID v4 strings. The server lowercases the id and validates it with
// the same regex before inserting (spacetimedb/src/index.ts DOC_UUID_RE).

export const DOC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** True when the server would accept `s` as a document (or comment thread) id. */
export function isDocumentId(s: string): boolean {
  return typeof s === "string" && DOC_UUID_RE.test(s.toLowerCase());
}

/** Formats 16 random bytes as a lowercase RFC 4122 v4 UUID (sets the version/variant bits). */
export function formatUuidV4(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error("formatUuidV4 needs exactly 16 bytes");
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * New lowercase UUID v4. `crypto.randomUUID` needs a secure context and is
 * missing from older Capacitor WebViews, so fall back to `getRandomValues`.
 */
export function newDocumentId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID().toLowerCase();
    } catch {
      // Insecure context — fall through to getRandomValues.
    }
  }
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Secure random numbers are not available in this environment");
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return formatUuidV4(bytes);
}
