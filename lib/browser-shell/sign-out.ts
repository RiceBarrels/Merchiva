import { SHELL_SIGN_OUT_EVENT } from "./shell-dom";
import { tabsStore } from "./store";

/*
 * Sign-out purge (plan R14). lib/auth signOut wipes localStorage and sessionStorage, but a bound
 * tab store writes its snapshot back after that wipe: its deferred teardown (once the provider
 * unmounts) and its pagehide / visibilitychange listeners all flush. The previous user's tab URLs,
 * document ids and page titles would survive on a shared device. So this removes every
 * browser-shell key now, again after each of the store's own unload flushes (listeners added later
 * run later), and a last time once the store has torn down and nothing can write any more.
 */

/** Key prefixes of every persisted browser-shell value: live tabs, last-session seed, history mirror + boot intent, browsing history, bookmarks. */
export const SHELL_STORAGE_PREFIXES: readonly string[] = Object.freeze([
  "merchiva_tabs:",
  "merchiva_tabs_last:",
  "merchiva_shell_",
  "merchiva_history:",
  "merchiva_bookmarks:",
]);

function isShellKey(key: string): boolean {
  return SHELL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function purgeStorage(read: () => Storage): void {
  try {
    const storage = read();
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && isShellKey(key)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage unavailable (private mode, blocked site data): nothing was persisted there.
  }
}

/** Removes every browser-shell key from sessionStorage and localStorage; other keys are left alone. */
export function purgeShellStorage(): void {
  if (typeof window === "undefined") return;
  purgeStorage(() => window.sessionStorage);
  purgeStorage(() => window.localStorage);
}

let armed = false;

/**
 * Call on sign-out, before or after storage is wiped. Purges browser-shell storage now; while a
 * tab store is bound it keeps purging after each of the store's flushes until the store has torn
 * down, then removes its listeners.
 */
export function discardShellStateForSignOut(): void {
  if (typeof window === "undefined") return;
  // Stops the tab store's own writes at the source (debounced save, teardown / pagehide flushes, browsing history)
  // until the next fresh bind; the listeners below stay as a second safety net.
  tabsStore.purgeForSignOut();
  purgeShellStorage();
  if (armed || !tabsStore.isReady()) return;
  armed = true;

  const onPageHide = () => purgeShellStorage();
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") purgeShellStorage();
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Teardown flushes, resets the snapshot and then notifies, so the first notification that finds
  // the store unbound comes after its last write.
  const unsubscribe = tabsStore.subscribe(() => {
    if (tabsStore.isReady()) return;
    armed = false;
    unsubscribe();
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    purgeShellStorage();
  });
}

/** Runs discardShellStateForSignOut on every SHELL_SIGN_OUT_EVENT; returns uninstall. */
export function installSignOutPurge(): () => void {
  if (typeof window === "undefined") return () => {};
  const onSignOut = () => discardShellStateForSignOut();
  window.addEventListener(SHELL_SIGN_OUT_EVENT, onSignOut);
  return () => window.removeEventListener(SHELL_SIGN_OUT_EVENT, onSignOut);
}
