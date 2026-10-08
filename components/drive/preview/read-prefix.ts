// The first bytes of a file, for the text and CSV previews (and the bytes of a PDF kept by
// another app, up to the inline cap). The body is read as a stream and cancelled once enough has
// arrived, so a large log file never downloads whole.
//
// No Range header: a Range request is not a CORS-safelisted request, so it would need a
// preflight that the blob host and the upload hosts of other apps may not answer. A plain GET
// read partway costs at most one extra chunk. Pure (no React).

/** A failed read: `status` is the HTTP status, or 0 when there was no response (network, CORS). */
export class ReadPrefixError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? (status > 0 ? `HTTP ${status}` : "The file could not be read"));
    this.name = "ReadPrefixError";
    this.status = status;
  }
}

export interface ReadPrefixResult {
  /** At most `maxBytes` bytes (on a plain ArrayBuffer, so they can go into a Blob as they are). */
  bytes: Uint8Array<ArrayBuffer>;
  /** The file holds more than `bytes`. */
  truncated: boolean;
}

export interface ReadPrefixOptions {
  /**
   * Only the whole file is of use (a linked PDF): a response whose Content-Length (a CORS-safelisted response
   * header) is above `maxBytes` resolves as truncated with no bytes, before its body is read. A compressed body
   * declares its encoded length, which for a file near the cap can differ slightly either way.
   */
  wholeOnly?: boolean;
}

/** The response's declared length in bytes, or null when it declares none (or nothing usable). */
function declaredLength(res: Response): number | null {
  const raw = res.headers.get("content-length");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function joinChunks(chunks: readonly Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Reads at most `maxBytes` of `url` without credentials. Resolves with what was read and whether the file goes on;
 * rejects with ReadPrefixError (HTTP status, or 0 for a network or CORS failure), or with the abort reason once
 * `signal` aborts. With `wholeOnly`, a file that declares itself larger than `maxBytes` is not read at all.
 */
export async function readPrefix(url: string, maxBytes: number, signal?: AbortSignal, opts: ReadPrefixOptions = {}): Promise<ReadPrefixResult> {
  const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
  signal?.throwIfAborted();
  const controller = new AbortController();
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal, credentials: "omit", cache: "no-store" });
    } catch (err) {
      signal?.throwIfAborted();
      throw new ReadPrefixError(0, err instanceof Error ? err.message : undefined);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new ReadPrefixError(res.status);
    }
    const declared = opts.wholeOnly ? declaredLength(res) : null;
    if (declared !== null && declared > limit) {
      await res.body?.cancel().catch(() => undefined);
      controller.abort();
      return { bytes: new Uint8Array(0), truncated: true };
    }
    if (!res.body) {
      const whole = new Uint8Array(await res.arrayBuffer());
      return whole.byteLength > limit ? { bytes: whole.slice(0, limit), truncated: true } : { bytes: whole, truncated: false };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return { bytes: joinChunks(chunks, total), truncated: false };
        // Reaching exactly `limit` keeps reading: only a further byte says the file goes on.
        if (total + value.byteLength > limit) {
          chunks.push(value.subarray(0, limit - total));
          await reader.cancel().catch(() => undefined);
          controller.abort();
          return { bytes: joinChunks(chunks, limit), truncated: true };
        }
        chunks.push(value);
        total += value.byteLength;
      }
    } catch (err) {
      signal?.throwIfAborted();
      await reader.cancel().catch(() => undefined);
      throw err instanceof ReadPrefixError ? err : new ReadPrefixError(0, err instanceof Error ? err.message : undefined);
    }
  } finally {
    signal?.removeEventListener("abort", forward);
  }
}
