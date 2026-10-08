// Parsing a .pptx off the main thread (slides.md §10.1 step 2, R4).
//
// Start handshake: the worker posts "ready" once its module graph has loaded. The parse falls back to the main
// thread only when the worker FAILS TO START: the constructor throws, an error / messageerror event arrives before
// "ready" (how a module worker usually fails under the Capacitor static build or a CSP), or "ready" does not arrive
// within 5 s. After "ready" the worker is never replaced by a main-thread retry: a crash (an out-of-memory in the
// worker's heap included) or the 60 s timeout fails the import, because re-parsing a file that just killed a worker
// in the page's own heap would take the tab down. The buffer is transferred only after "ready", so the fallback
// still has it. The AbortSignal terminates the worker. The fallback runs under the same 60 s timeout and abort, which
// fail the import at its next await (synchronous work on this thread cannot be interrupted).
import type { ExtractedAsset } from "./dedupe-assets";
import { abortError, isAbortError, SlidesImportError, throwIfAborted } from "./errors";
import type { SlideScan } from "./slide-scan";
import { readWorkerMessage, type LeanParseResult, type PptxPipelineResult } from "./worker-protocol";

export type { LeanParseResult, PptxParseResult } from "./worker-protocol";

export const PPTX_WORKER_READY_TIMEOUT_MS = 5_000;
export const PPTX_PARSE_TIMEOUT_MS = 60_000;

export interface ParsedPptx { lean: LeanParseResult; assets: ExtractedAsset[]; scan: SlideScan }

function fromPipeline(result: PptxPipelineResult): ParsedPptx {
  if (result.type === "rejected") throw new SlidesImportError("unsafeFile", result.code, result.code);
  return { lean: result.lean, assets: result.assets, scan: result.scan };
}

const timedOut = () => new SlidesImportError("failed", "the parse timed out");

/**
 * The same pipeline on this thread (loaded on demand, so pptxtojson stays out of the page bundle otherwise), under the
 * worker's timeout and abort. Neither can interrupt synchronous work: the import fails at the next await, and the
 * pipeline stops at its next stage boundary (runParsePipeline's checkpoint).
 */
async function parseInProcess(buf: ArrayBuffer, signal?: AbortSignal): Promise<ParsedPptx> {
  const { runParsePipeline } = await import("./pipeline");
  throwIfAborted(signal);
  const deadline = Date.now() + PPTX_PARSE_TIMEOUT_MS;
  const checkpoint = () => {
    throwIfAborted(signal);
    if (Date.now() >= deadline) throw timedOut();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timedOut()), PPTX_PARSE_TIMEOUT_MS);
    onAbort = () => reject(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  let result: PptxPipelineResult;
  try {
    result = await Promise.race([runParsePipeline(buf, checkpoint), stopped]);
  } catch (err) {
    if (err instanceof SlidesImportError || isAbortError(err)) throw err;
    throw new SlidesImportError("failed", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
  throwIfAborted(signal);
  return fromPipeline(result);
}

function startWorker(): Worker | null {
  if (typeof Worker !== "function") return null;
  try {
    return new Worker(new URL("./pptx.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/** Resolves true on "ready", false when the worker fails to start (error before ready, or no ready in time). */
function waitForReady(worker: Worker, signal?: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const done = (ready: boolean | Error) => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onFail);
      worker.removeEventListener("messageerror", onFail);
      signal?.removeEventListener("abort", onAbort);
      if (ready instanceof Error) reject(ready);
      else resolve(ready);
    };
    const onMessage = (event: MessageEvent) => {
      if (readWorkerMessage(event.data)?.type === "ready") done(true);
    };
    const onFail = (event: Event) => {
      event.preventDefault?.();
      done(false);
    };
    const onAbort = () => done(abortError());
    const timer = setTimeout(() => done(false), PPTX_WORKER_READY_TIMEOUT_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onFail);
    worker.addEventListener("messageerror", onFail);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Posts the buffer (transferred) and waits for the one answer; every way out terminates the worker. */
function parseInWorker(worker: Worker, buf: ArrayBuffer, signal?: AbortSignal): Promise<ParsedPptx> {
  return new Promise<ParsedPptx>((resolve, reject) => {
    const finish = (outcome: ParsedPptx | Error) => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onCrash);
      worker.removeEventListener("messageerror", onCrash);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const onMessage = (event: MessageEvent) => {
      const msg = readWorkerMessage(event.data);
      if (!msg || msg.type === "ready") return;
      if (msg.type === "error") finish(new SlidesImportError("failed", msg.message));
      else {
        try {
          finish(fromPipeline(msg));
        } catch (err) {
          finish(err instanceof Error ? err : new SlidesImportError("failed"));
        }
      }
    };
    const onCrash = (event: Event) => {
      event.preventDefault?.();
      finish(new SlidesImportError("failed", "the parse worker stopped"));
    };
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => finish(timedOut()), PPTX_PARSE_TIMEOUT_MS);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onCrash);
    worker.addEventListener("messageerror", onCrash);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ type: "parse", buf }, [buf]);
  });
}

/**
 * Parses the file bytes into the lean pptxtojson result, its deduped images and the slide scan. Rejects with
 * `[slides.import_rejected]` (SlidesImportError "unsafeFile") when the zip guard refuses the file, with
 * `[slides.import_failed]` ("failed") when the parse crashes or times out, or with an AbortError.
 */
export async function parsePptx(buf: ArrayBuffer, signal?: AbortSignal): Promise<ParsedPptx> {
  throwIfAborted(signal);
  const worker = startWorker();
  if (!worker) return parseInProcess(buf, signal);
  let ready: boolean;
  try {
    ready = await waitForReady(worker, signal);
  } catch (err) {
    worker.terminate();
    throw err;
  }
  if (!ready) {
    worker.terminate();
    return parseInProcess(buf, signal);
  }
  return parseInWorker(worker, buf, signal);
}
