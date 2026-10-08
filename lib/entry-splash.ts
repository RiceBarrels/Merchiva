/*
 * The connecting splash (SplashLoader in app/manager/layout.tsx) plays on the first entry of a session only.
 *   sessionStorage merchiva_entry_splash_seen = "1"   set on the session's first entry, splash or warm cache
 * sessionStorage survives reloads and same-tab navigations (org and account switches reload; /choose → /store,
 * /personal or /manager remounts the layout) and starts fresh in every new tab and app launch. Sign-out clears
 * sessionStorage (lib/auth/context.tsx), so the next sign-in plays the splash again. Every storage access is
 * wrapped: Safari private mode and blocked site data throw, and a module flag then covers this page load.
 */

export const ENTRY_SPLASH_SEEN_KEY = "merchiva_entry_splash_seen";

// Fallback for when sessionStorage is unavailable or refuses the write; lives as long as this page load.
let seenThisLoad = false;

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** True once this session has been entered (or, without storage, this page load): the splash is not played again. */
export function entrySplashSeen(): boolean {
  if (seenThisLoad) return true;
  const store = sessionStore();
  if (!store) return false;
  try {
    return store.getItem(ENTRY_SPLASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Records the session's entry, so later entries in this session skip the splash. */
export function markEntrySplashSeen(): void {
  seenThisLoad = true;
  const store = sessionStore();
  if (!store) return;
  try {
    store.setItem(ENTRY_SPLASH_SEEN_KEY, "1");
  } catch {
    // Storage blocked or full: the module flag still covers this page load.
  }
}

/** Forgets the module flag (tests). */
export function __resetEntrySplashForTests(): void {
  seenThisLoad = false;
}
