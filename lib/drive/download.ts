// Saving and opening one Drive file (components/drive/download.ts builds
// multi-select zips and sequential runs on top of these).
//
// Buffered (≤ DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES): fetch the bytes through a
// signed `view` URL and save them with saveBlob under the exact Unicode name —
// an anchor download on the web and Tauri, the share sheet in the Capacitor
// apps. Direct (larger files, or when the fetch or the share sheet fails): a
// signed `download` URL in a new window on the web, in the system browser in
// the apps. The app tab itself never navigates away.
//
// On the web a new window must open inside the click's user activation, so
// downloadDriveItem and openDriveItem open it synchronously, before their first
// await: call them straight from the gesture handler. A blocked popup resolves
// "blocked"; the UI then offers a button that calls again with a fresh gesture.
// Files kept by other apps (downloadExternalFile) are read through the same byte
// budget within a time limit, and can only fall back to a window after that read
// failed, so a blocked one is remembered and its retry opens the window at once.
// fetchLimited reads such a file's bytes with a caller's budget.

import { saveBlob, type SaveBlobResult } from "@/lib/docs/download";
import { exportFilename } from "@/lib/docs/export/utils";
import { isCapacitorNative } from "@/lib/capacitor";
import { openExternal } from "@/lib/browser-shell/mobile/share";
import type { DriveUrlPurpose } from "@/lib/drive/api";
import { DriveClientError } from "@/lib/drive/errors";
import { drivePreviewKind, driveUrlPurposeFor } from "@/lib/drive/preview";
import { sharedDriveUrlLoader, type DriveUrlLoader } from "@/lib/drive/url-loader";
import { getNativeShell, isNativeShell } from "@/lib/native-shell";

/** The browser says it has no network (an unknown state counts as online). */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export const DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** How long downloadExternalFile reads a file kept by another app before it hands the address to the browser. */
export const DRIVE_EXTERNAL_FETCH_TIMEOUT_MS = 60_000;
export type DriveDownloadResult = SaveBlobResult | "opened" | "blocked";
export interface DriveDownloadTarget { id: string; name: string; sizeBytes: number; mimeType: string }

type Host = "web" | "capacitor" | "tauri";

/**
 * Set after the browser refused a buffered fetch on the web outright (typically the blob host answering without CORS
 * headers): later downloads in this tab go direct at once, while the gesture can still open a window. An HTTP error
 * does not set it; that is about one URL or one file.
 */
let preferDirect = false;

/** `download_failed`, and why: the HTTP `status` (0 without a response), `refused` when fetch() itself rejected. */
class DriveDownloadFailure extends DriveClientError {
  readonly status: number;
  readonly refused: boolean;
  constructor(status: number, refused: boolean) {
    super("download_failed", status > 0 ? `[drive.download_failed] HTTP ${status}` : undefined);
    this.status = status;
    this.refused = refused;
  }
}

/** An extension worth keeping apart from the stem: short, no spaces, no characters a file system refuses. */
const EXTENSION_RE = /^[^\s.\\/:*?"<>|]{1,16}$/u;

/** C0, DEL, C1 and the Unicode bidi controls, which could make a saved name read differently from what it is. */
function isUnsafeCodePoint(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x061c || cp === 0x200e || cp === 0x200f
    || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
}

function stripUnsafe(value: string): string {
  let out = "";
  for (const ch of value) if (!isUnsafeCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

export function chooseDownloadStrategy(sizeBytes: number): "buffered" | "direct" {
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes <= DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES ? "buffered" : "direct";
}

/**
 * The name a download is saved under: the display name with bidi and control characters removed, `\/:*?"<>|`
 * stripped, Unicode kept (`报告.pdf` stays `报告.pdf`), the stem capped at 120 characters, "file" when nothing is left.
 */
export function driveDownloadName(name: string): string {
  const clean = stripUnsafe(String(name ?? "").normalize("NFC"));
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 ? clean.slice(dot + 1) : "";
  if (ext !== "" && EXTENSION_RE.test(ext)) return exportFilename(clean.slice(0, dot), ext, "file");
  return exportFilename(clean, "", "file");
}

function host(): Host {
  if (isCapacitorNative()) return "capacitor";
  if (isNativeShell()) return "tauri";
  return "web";
}

/** A signed URL for the item, or DriveClientError: `not_found` when the caller may not read it or it is not ready. */
async function signedUrl(item: DriveDownloadTarget, loader: DriveUrlLoader, purpose: DriveUrlPurpose): Promise<string> {
  const signed = await loader.get({ id: item.id, variant: "original", purpose });
  if (!signed) throw new DriveClientError("not_found");
  return signed.url;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * The web: a new blank window with its opener cut, or null when the browser blocks it. It opens "" rather than the
 * URL with `noopener`, whose window.open always returns null, so a blocked popup can be told apart. Call it inside
 * the gesture.
 */
function openBlankWindow(): Window | null {
  let win: Window | null = null;
  try {
    win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  } catch {
    win = null;
  }
  if (!win) return null;
  try {
    win.opener = null;
  } catch {
    // Cross-origin already; nothing links back to this tab.
  }
  return win;
}

/** The web: `url` in a new window at once; `blocked` when the browser refuses the window. */
function openInNewWindow(url: string): "opened" | "blocked" {
  const win = openBlankWindow();
  if (!win) return "blocked";
  win.location.replace(url);
  return "opened";
}

/** Outside the app: the system browser in Capacitor and Tauri; on the web a new window (`blocked` when refused). */
async function openOutside(url: string, where: Host): Promise<"opened" | "blocked"> {
  if (where === "web") return openInNewWindow(url);
  if (where === "tauri") {
    const shell = getNativeShell();
    if (shell) {
      await shell.openExternalAuth(url);
      return "opened";
    }
  }
  await openExternal(url);
  return "opened";
}

/**
 * Opens a signed URL for the item. On the web the window opens synchronously, so this must run inside the gesture;
 * it is pointed at the URL once signed, and closed again if signing fails.
 */
function openSigned(item: DriveDownloadTarget, loader: DriveUrlLoader, purpose: DriveUrlPurpose): Promise<"opened" | "blocked"> {
  const where = host();
  if (where !== "web") return signedUrl(item, loader, purpose).then((url) => openOutside(url, where));
  const opened = openBlankWindow();
  if (!opened) return Promise.resolve("blocked");
  return signedUrl(item, loader, purpose).then(
    (url) => {
      opened.location.replace(url);
      return "opened" as const;
    },
    (err: unknown) => {
      try {
        opened.close();
      } catch {
        // Already closed by the user.
      }
      throw err;
    },
  );
}

type Chunk = Uint8Array<ArrayBuffer>;

/** Reads a response body, failing with `too_large` (and cancelling the body) as soon as it declares or passes `maxBytes`. */
async function readLimited(res: Response, maxBytes: number): Promise<Chunk[]> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new DriveClientError("too_large");
  }
  if (!res.body) {
    const whole = new Uint8Array(await res.arrayBuffer());
    if (whole.byteLength > maxBytes) throw new DriveClientError("too_large");
    return [whole];
  }
  const reader = res.body.getReader();
  const chunks: Chunk[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new DriveClientError("too_large");
    }
    chunks.push(value);
  }
}

function transferError(err: unknown, signal: AbortSignal | undefined, refused: boolean): DriveClientError {
  if (err instanceof DriveClientError) return err;
  if (signal?.aborted || (err as { name?: unknown } | null)?.name === "AbortError") return new DriveClientError("aborted");
  if (isOffline()) return new DriveClientError("network");
  return new DriveDownloadFailure(0, refused);
}

/** A successful response for a URL; `aborted`, `network` (offline) or `download_failed` (refused, or an HTTP error) otherwise. */
async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal, credentials: "omit", cache: "no-store" });
  } catch (err) {
    throw transferError(err, signal, true);
  }
  if (!res.ok) throw new DriveDownloadFailure(res.status, false);
  return res;
}

/** A response's body as chunks, through at most `maxBytes`; `too_large`, `aborted`, `network` or `download_failed` otherwise. */
async function readBody(res: Response, maxBytes: number, signal?: AbortSignal): Promise<Chunk[]> {
  try {
    return await readLimited(res, maxBytes);
  } catch (err) {
    throw transferError(err, signal, false);
  }
}

/** The bytes at a URL as chunks; `aborted`, `too_large`, `network` (offline) or `download_failed` otherwise. */
async function fetchChunks(url: string, maxBytes: number, signal?: AbortSignal): Promise<Chunk[]> {
  return readBody(await fetchOk(url, signal), maxBytes, signal);
}

/** The item's bytes through a signed `view` URL. A URL the host refuses (401/403: stale or rotated) is signed again once. */
async function fetchSignedChunks(item: DriveDownloadTarget, loader: DriveUrlLoader, maxBytes: number, signal?: AbortSignal): Promise<Chunk[]> {
  const url = await signedUrl(item, loader, "view");
  try {
    return await fetchChunks(url, maxBytes, signal);
  } catch (err) {
    if (!(err instanceof DriveDownloadFailure) || (err.status !== 401 && err.status !== 403)) throw err;
    loader.invalidate(item.id);
    return fetchChunks(await signedUrl(item, loader, "view"), maxBytes, signal);
  }
}

/** Concatenates chunks into one array (over a buffer of exactly its length). */
function joinChunks(chunks: readonly Chunk[]): Chunk {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function blobOf(chunks: readonly Chunk[], type: string): Blob {
  return new Blob([...chunks], { type: type || "application/octet-stream" });
}

/**
 * The file's bytes, read through a signed `view` URL. Rejects with `too_large` without fetching when the item is
 * known to be larger than `maxBytes` (default DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES), and stops reading once it passes.
 */
export async function fetchDriveItemBytes(
  item: DriveDownloadTarget,
  loader: DriveUrlLoader = sharedDriveUrlLoader(),
  opts: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<ArrayBuffer> {
  const maxBytes = opts.maxBytes ?? DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES;
  if (item.sizeBytes > maxBytes) throw new DriveClientError("too_large");
  return joinChunks(await fetchSignedChunks(item, loader, maxBytes, opts.signal)).buffer;
}

/**
 * The bytes at a public http(s) URL (a file kept by another app), read through at most `maxBytes`. Rejects with
 * DriveClientError: `invalid` (not http(s), or a limit that is not a number ≥ 0), `too_large` as soon as the response
 * declares or passes more (the body is cancelled; nothing more is read), `aborted`, `network` (offline) or
 * `download_failed` (a refused fetch, or an HTTP error whose status is in the message).
 */
export async function fetchLimited(url: string, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!isHttpUrl(url)) throw new DriveClientError("invalid", "[drive.invalid] Unsupported file address");
  if (!(maxBytes >= 0)) throw new DriveClientError("invalid", "[drive.invalid] Invalid byte limit");
  return joinChunks(await fetchChunks(url, maxBytes, signal));
}

async function downloadBuffered(item: DriveDownloadTarget, loader: DriveUrlLoader): Promise<DriveDownloadResult> {
  const where = host();
  let chunks: Chunk[];
  try {
    chunks = await fetchSignedChunks(item, loader, DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES);
  } catch (err) {
    if (!(err instanceof DriveClientError) || err.code !== "download_failed") throw err;
    // The fetch failed: hand the file to the browser instead. Only a refused fetch (CORS) will fail the same way for
    // every file, so only that sends the rest of this tab's downloads direct (which saves them under the ASCII leaf).
    if (where === "web" && err instanceof DriveDownloadFailure && err.refused) preferDirect = true;
    return openSigned(item, loader, "download");
  }
  const saved = await saveBlob(blobOf(chunks, item.mimeType), driveDownloadName(item.name));
  // "unsupported": the Capacitor share sheet is missing or lost the gesture; the system browser still works.
  return saved === "unsupported" ? openSigned(item, loader, "download") : saved;
}

/**
 * Saves the file (see the file comment). Call it synchronously from the user's gesture. Pass the loader of the
 * acting member on /store (`sharedDriveUrlLoader(actingMemberId)`); the default signs for the caller.
 */
export function downloadDriveItem(item: DriveDownloadTarget, loader: DriveUrlLoader = sharedDriveUrlLoader()): Promise<DriveDownloadResult> {
  if (chooseDownloadStrategy(item.sizeBytes) === "direct" || (preferDirect && host() === "web")) {
    return openSigned(item, loader, "download");
  }
  return downloadBuffered(item, loader);
}

/** Opens the file outside the app (a new window on the web, the system browser in the apps). Call it from the gesture. */
export function openDriveItem(item: DriveDownloadTarget, loader: DriveUrlLoader = sharedDriveUrlLoader()): Promise<"opened" | "blocked"> {
  return openSigned(item, loader, driveUrlPurposeFor(drivePreviewKind(item.mimeType, item.name)));
}

/**
 * External addresses whose fallback window the web blocked, so their retry opens it at once (the newest 50 are kept).
 * `true` when the browser refused the fetch while online (typically no CORS headers): every later fetch of the URL
 * fails the same way, so it stays, like preferDirect. `false` for anything else (an HTTP error, offline, a failed
 * body, a save that could not start): the entry serves that one retry, and later calls fetch again.
 */
const openAtOnce = new Map<string, boolean>();
const OPEN_AT_ONCE_MAX = 50;

/** The URL outside the app after its save failed; on the web a blocked window marks it for the retry. */
async function openExternalFallback(url: string, where: Host, lasting: boolean): Promise<"opened" | "blocked"> {
  const result = await openOutside(url, where);
  if (result === "blocked") {
    openAtOnce.set(url, lasting);
    const oldest = openAtOnce.size > OPEN_AT_ONCE_MAX ? openAtOnce.keys().next().value : undefined;
    if (oldest !== undefined) openAtOnce.delete(oldest);
  }
  return result;
}

/** The web retry of a blocked fallback: the window at once; a one-off entry is used up once the window opened. */
function openExternalAtOnce(url: string, lasting: boolean): "opened" | "blocked" {
  const result = openInNewWindow(url);
  if (result === "opened" && !lasting) openAtOnce.delete(url);
  return result;
}

/**
 * A file kept by another app as one blob of the type its host declares, read through at most
 * DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES; the read is aborted once `timeoutMs` passes. Rejects like fetchLimited.
 */
async function fetchExternalBlob(url: string, timeoutMs: number): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchOk(url, controller.signal);
    const chunks = await readBody(res, DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES, controller.signal);
    return blobOf(chunks, res.headers.get("content-type") ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Saves a file kept by another app (a public http(s) URL) under `name`. The URL is written by other members, so it is
 * read through DRIVE_BUFFERED_DOWNLOAD_MAX_BYTES within `timeoutMs` (default DRIVE_EXTERNAL_FETCH_TIMEOUT_MS). When
 * the fetch fails (no CORS), the file is larger or slower than that, or the share sheet is unavailable, the URL opens
 * outside the app instead. On the web that window can only open after the fetch's await, so the browser may block it:
 * the call resolves `blocked`, and the retry from a new click opens the window at once, before any await, without
 * fetching again. Only an address whose fetch the browser refused while online keeps opening that way; after any
 * other failure the calls that follow the retry fetch again. Call it synchronously from the gesture.
 */
export async function downloadExternalFile(
  url: string,
  name: string,
  opts: { timeoutMs?: number } = {},
): Promise<DriveDownloadResult> {
  if (!isHttpUrl(url)) throw new DriveClientError("invalid", "[drive.invalid] Unsupported file address");
  const where = host();
  const lasting = where === "web" ? openAtOnce.get(url) : undefined;
  if (lasting !== undefined) return openExternalAtOnce(url, lasting);
  let blob: Blob;
  try {
    blob = await fetchExternalBlob(url, opts.timeoutMs ?? DRIVE_EXTERNAL_FETCH_TIMEOUT_MS);
  } catch (err) {
    // A refused fetch is a DriveDownloadFailure only while online (offline it is `network`).
    return openExternalFallback(url, where, err instanceof DriveDownloadFailure && err.refused);
  }
  const saved = await saveBlob(blob, driveDownloadName(name));
  return saved === "unsupported" ? openExternalFallback(url, where, false) : saved;
}
