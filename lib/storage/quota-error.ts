// A store out of storage, as an app upload reports it: `[drive.quota_exceeded]` somewhere in the error or its
// cause chain (UploadThing keeps the server's text on the error and on its cause). Code that tolerates a failed
// upload (an import that leaves an image out) re-raises this one instead, so the person reads why. Pure.

const QUOTA_TAG = "[drive.quota_exceeded]";

/** True when `err`, or one of its first causes, carries the quota refusal. */
export function isQuotaExceededError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current != null; depth++) {
    if (typeof current === "string") return current.includes(QUOTA_TAG);
    if (typeof current !== "object") return false;
    const { message, cause } = current as { message?: unknown; cause?: unknown };
    if (typeof message === "string" && message.includes(QUOTA_TAG)) return true;
    current = cause;
  }
  return false;
}

/**
 * Throws the quota refusal with the tag leading its own message (what driveErrorCode / driveErrorKey read), the
 * original as its cause; returns for any other failure.
 */
export function rethrowIfQuotaExceeded(err: unknown): void {
  if (isQuotaExceededError(err)) throw new Error(`${QUOTA_TAG} This store is out of storage`, { cause: err });
}
