/**
 * Save a generated file (docs-editor-ui spec §6.6, plan Q5 default).
 *
 * `saveBlob(blob, filename)` tries these strategies in order:
 * 1. Capacitor native (`isCapacitorNative()`): WKWebView and Android WebView ignore `<a download>`, so the file
 *    goes to the Web Share sheet when `navigator.canShare({ files })` allows it. Resolves `"shared"`, or
 *    `"cancelled"` when the user dismisses the sheet (AbortError). Without file sharing it resolves `"unsupported"`.
 * 2. Tauri on macOS: WKWebView has no download handler in this app, so the share sheet is tried first; when the
 *    webview can't share files it falls through to the anchor download.
 * 3. Web, Tauri Windows/Linux: an anchor download from an object URL, revoked after 1 s (Safari cancels the
 *    download when the URL is revoked immediately). Resolves `"downloaded"`.
 *
 * It never shows a toast. The caller (`exportDocument`) maps `"unsupported"` to `docs.export.unsupported`.
 * It rejects only on unexpected errors.
 */
import { isCapacitorNative } from "@/lib/capacitor";
import { getNativeShellPlatform, isNativeShell } from "@/lib/native-shell";

export type SaveBlobResult = "downloaded" | "shared" | "cancelled" | "unsupported";

/** Delay before revoking the object URL; Safari aborts downloads whose URL disappears too early. */
const REVOKE_DELAY_MS = 1000;

function errorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
}

async function shareFile(blob: Blob, filename: string): Promise<SaveBlobResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return "unsupported";
  }
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  let canShareFile = false;
  try {
    canShareFile = navigator.canShare({ files: [file] });
  } catch {
    canShareFile = false;
  }
  if (!canShareFile) return "unsupported";
  try {
    await navigator.share({ files: [file], title: filename });
    return "shared";
  } catch (err) {
    const name = errorName(err);
    if (name === "AbortError") return "cancelled";
    // NotAllowedError: the share needs a fresh user activation (e.g. after a slow export) or is blocked by policy.
    if (name === "NotAllowedError" || name === "DataError" || name === "TypeError") return "unsupported";
    throw err;
  }
}

function anchorDownload(blob: Blob, filename: string): SaveBlobResult {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
  return "downloaded";
}

function isTauriMac(): boolean {
  try {
    return isNativeShell() && getNativeShellPlatform() === "macos";
  } catch {
    return false;
  }
}

export async function saveBlob(blob: Blob, filename: string): Promise<SaveBlobResult> {
  if (typeof window === "undefined" || typeof document === "undefined") return "unsupported";
  if (isCapacitorNative()) return shareFile(blob, filename);
  if (isTauriMac()) {
    const shared = await shareFile(blob, filename);
    if (shared !== "unsupported") return shared;
  }
  return anchorDownload(blob, filename);
}
