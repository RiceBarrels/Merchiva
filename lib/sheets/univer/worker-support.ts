// Starting the formula worker (sheets.md §9.3). Formulas fall back to the main thread when there is no module
// worker to start: no Worker global, the worker disabled for this tab after a failed start, the feature switched
// off, or the iOS app: the S0 spike ran the worker in Chromium (Turbopack dev, `next build`, static export) but
// could not run a `capacitor://` WebView. The literal `new Worker(new URL(…, import.meta.url), { type: "module" })`
// is what Turbopack bundles, so it must stay written out in full.

import { FORMULA_WORKER_ENABLED } from "@/lib/sheets/constants";

/** sessionStorage flag: a worker failed to start in this tab, so the editor runs formulas in-thread. */
export const FORMULA_WORKER_DISABLED_KEY = "merchiva.sheets.noWorker";
/** How long the host listens for a start-up `error` event. */
export const FORMULA_WORKER_STARTUP_MS = 5000;

function readDisabledFlag(): boolean {
  try {
    return window.sessionStorage.getItem(FORMULA_WORKER_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** The iOS app (Capacitor serves it from `capacitor://`; Android uses https://localhost). */
function isIosAppShell(): boolean {
  const capacitor = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  try {
    if (capacitor?.getPlatform?.() === "ios") return true;
  } catch {
    // Not the native shell.
  }
  return window.location.protocol === "capacitor:";
}

export function formulaWorkerDisabled(): boolean {
  if (!FORMULA_WORKER_ENABLED || typeof window === "undefined" || typeof Worker === "undefined") return true;
  return readDisabledFlag() || isIosAppShell();
}

/** Remembers for this tab that the worker failed, so the next mount computes formulas in-thread. */
export function disableFormulaWorker(): void {
  try {
    window.sessionStorage.setItem(FORMULA_WORKER_DISABLED_KEY, "1");
  } catch {
    // Storage blocked: the next mount tries the worker again and falls back again.
  }
}

/** A new formula worker, or null when formulas run on the main thread. The caller terminates it. */
export function createFormulaWorker(): Worker | null {
  if (formulaWorkerDisabled()) return null;
  try {
    return new Worker(new URL("./formula.worker.ts", import.meta.url), { type: "module" });
  } catch {
    disableFormulaWorker();
    return null;
  }
}

/**
 * Watches a new worker for `FORMULA_WORKER_STARTUP_MS`: an `error` event (the script failed to load or threw
 * while starting) disables the worker for this tab and calls `onFailure`, where the host remounts without one.
 * Returns the unsubscribe.
 */
export function watchFormulaWorkerStartup(worker: Worker, onFailure: () => void, ms: number = FORMULA_WORKER_STARTUP_MS): () => void {
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    worker.removeEventListener("error", fail);
  };
  const fail = () => {
    if (done) return;
    stop();
    disableFormulaWorker();
    onFailure();
  };
  const timer = window.setTimeout(stop, ms);
  worker.addEventListener("error", fail);
  return stop;
}
