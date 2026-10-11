"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { apiUrl } from "@/lib/api-client";
import { SHELL_SIGN_OUT_EVENT } from "@/lib/browser-shell/shell-dom";
import { registerAuthTokenGetter } from "@/lib/auth/token-bridge";
import { forgetBrowserPushEndpoint } from "@/lib/notifications/push-cleanup";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface StoredAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  accounts: StoredAccount[];
  getToken: () => Promise<string | null>;
  signIn: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  switchAccount: (userId: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  accessToken: null,
  accounts: [],
  getToken: async () => null,
  signIn: () => {},
  switchAccount: () => {},
  signOut: () => {},
});

const TOKEN_KEY = "workos_access_token";
const REFRESH_KEY = "workos_refresh_token";
// Keep in sync with AUTH_USER_STORAGE_KEY in lib/browser-shell/persistence.ts (the tab store stops persisting once it is gone).
const USER_KEY = "workos_user";
const ACCOUNTS_KEY = "merchiva_accounts";

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    let base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    base64 += "=".repeat((4 - base64.length % 4) % 4);
    const decoded = JSON.parse(atob(base64));
    return decoded.exp ?? null;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, bufferSeconds = 60): boolean {
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  return Date.now() / 1000 > exp - bufferSeconds;
}

function loadAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: StoredAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function upsertAccount(accounts: StoredAccount[], account: StoredAccount): StoredAccount[] {
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    const updated = [...accounts];
    updated[idx] = account;
    return updated;
  }
  return [...accounts, account];
}

export function storeAuthTokens(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem("stdb_token", accessToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("stdb_token");
}

export function addAccountToStorage(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
): void {
  storeAuthTokens(accessToken, refreshToken, user);
  const accounts = loadAccounts();
  const updated = upsertAccount(accounts, {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    accessToken,
    refreshToken,
  });
  saveAccounts(updated);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const refreshingRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userData = localStorage.getItem(USER_KEY);
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
        setAccessToken(token);
      } catch {
        clearAuthTokens();
        setUser(null);
        setAccessToken(null);
      }
    }

    // Migrate: if accounts list is empty but tokens exist, seed it
    let accts = loadAccounts();
    if (accts.length === 0 && token && userData) {
      try {
        const u = JSON.parse(userData) as AuthUser;
        const refresh = localStorage.getItem(REFRESH_KEY) ?? "";
        accts = [{ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, accessToken: token, refreshToken: refresh }];
        saveAccounts(accts);
      } catch {}
    }
    setAccounts(accts);

    setIsLoaded(true);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === TOKEN_KEY) {
        setAccessToken(e.newValue);
        if (!e.newValue) {
          setUser(null);
        } else {
          const userData = localStorage.getItem(USER_KEY);
          if (userData) {
            try { setUser(JSON.parse(userData)); } catch {}
          }
        }
      }
      if (e.key === ACCOUNTS_KEY) {
        setAccounts(loadAccounts());
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Refresh the WorkOS session. Careful: refresh tokens are SINGLE-USE
  // (rotating), and access tokens only live ~5 minutes, so two tabs racing a
  // refresh used to log the whole session out — the loser's 401 wiped the
  // tokens the winner had just rotated. Rules here:
  //   1. Serialize refreshes across tabs via the Web Locks API when available.
  //   2. Re-read storage before refreshing — another tab may already have done it.
  //   3. Only a definitive rejection (401 = invalid refresh token) ends the
  //      session. Network failures and server hiccups keep the tokens and let
  //      the next getToken() retry.
  const doRefresh = useCallback(async (): Promise<string | null> => {
    const run = async (): Promise<string | null> => {
      // Another tab may have refreshed while we waited on the lock.
      const current = localStorage.getItem(TOKEN_KEY);
      if (current && !isTokenExpiringSoon(current)) {
        setAccessToken(current);
        return current;
      }
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return null;

      let res: Response;
      try {
        res = await fetch(apiUrl("/api/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Network hiccup — keep the session; the current token may still be
        // accepted and the next getToken() will retry the refresh.
        return current;
      }

      if (!res.ok) {
        // A concurrent tab/device may have rotated the refresh token while our
        // request was in flight — if storage moved on, trust it instead of
        // logging out.
        const latestRefresh = localStorage.getItem(REFRESH_KEY);
        const latestToken = localStorage.getItem(TOKEN_KEY);
        if (latestRefresh && latestRefresh !== refreshToken && latestToken) {
          setAccessToken(latestToken);
          return latestToken;
        }
        if (res.status === 401) {
          // Definitive: the refresh token itself was rejected.
          clearAuthTokens();
          setAccessToken(null);
          setUser(null);
          return null;
        }
        // Transient server error (5xx/429/…) — keep the session.
        return current;
      }

      const data = await res.json();
      addAccountToStorage(data.accessToken, data.refreshToken, data.user);
      setAccessToken(data.accessToken);
      setUser(data.user);
      setAccounts(loadAccounts());
      return data.accessToken;
    };

    // Fall through to an unlocked refresh ONLY when the lock is unavailable —
    // never when `run` itself threw. navigator.locks.request rejects with
    // whatever the callback rejects with, so the old bare catch re-ran the
    // whole refresh with a refresh token the server had already rotated and
    // invalidated. The second attempt got a 401 and signed the user out
    // mid-session: exactly the double-refresh the lock exists to prevent.
    const hasLocks = typeof navigator !== "undefined" && !!navigator.locks?.request;
    if (!hasLocks) return run();

    let started = false;
    try {
      return await navigator.locks.request("merchiva-token-refresh", () => {
        started = true;
        return run();
      });
    } catch (err) {
      if (started) throw err;   // the refresh ran and failed — do not retry it
      console.warn("[auth] token-refresh lock unavailable, refreshing unlocked:", err);
      return run();
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const current = localStorage.getItem(TOKEN_KEY);
    if (!current) return null;

    if (!isTokenExpiringSoon(current)) return current;

    if (!refreshingRef.current) {
      refreshingRef.current = doRefresh().finally(() => {
        refreshingRef.current = null;
      });
    }
    return refreshingRef.current;
  }, [doRefresh]);

  // Non-React callers (lib/auth/token-bridge.ts) get tokens through the same refreshing getter.
  useEffect(() => registerAuthTokenGetter(getToken), [getToken]);

  // Keep the WorkOS session alive for as long as the app is installed/open.
  // Access tokens live ~5 min, so any getToken() after that rotates the
  // refresh token; doing it when the tab comes back into view and on a timer
  // means a device that's left open (kiosk, back-office PC) never trips the
  // dashboard's inactivity timeout. Session length itself is capped only by
  // the "Maximum session length" set in the WorkOS Dashboard.
  useEffect(() => {
    if (!isLoaded || !accessToken) return;
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      void getToken();
    };
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    const timer = window.setInterval(ping, 30 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
      window.clearInterval(timer);
    };
  }, [isLoaded, accessToken, getToken]);

  const signIn = useCallback(
    (token: string, refresh: string, userData: AuthUser) => {
      addAccountToStorage(token, refresh, userData);
      setAccessToken(token);
      setUser(userData);
      setAccounts(loadAccounts());
    },
    [],
  );

  // Leaving an account (switch or sign-out) first drops its push row for this
  // browser, while the connection still runs as that account: the next person on
  // this browser must not get its alerts (lib/notifications/push-cleanup.ts).
  const switchAccount = useCallback((userId: string) => {
    const accts = loadAccounts();
    const target = accts.find((a) => a.id === userId);
    if (!target) return;
    void forgetBrowserPushEndpoint().finally(() => {
      storeAuthTokens(target.accessToken, target.refreshToken, {
        id: target.id,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
      });
      window.location.reload();
    });
  }, []);

  // Sign-out wipes ALL browser storage for this origin — tokens, the
  // multi-account list, app/store-device mode, cached org id, theme, offline
  // caches. Nothing from the previous session may survive on a shared device.
  const signOut = useCallback(() => {
    // Every sign-out path: the browser shell stops persisting and purges its tab state (lib/browser-shell/sign-out.ts).
    // shell-dom has no store import, so there is no cycle back into lib/auth.
    try {
      window.dispatchEvent(new Event(SHELL_SIGN_OUT_EVENT));
    } catch {}
    void forgetBrowserPushEndpoint().finally(() => {
      try {
        localStorage.clear();
      } catch {}
      try {
        sessionStorage.clear();
      } catch {}
      setAccessToken(null);
      setUser(null);
      setAccounts([]);
      window.location.href = "/login?logout=1&next=%2Fchoose";
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: !!accessToken && !!user,
      user,
      accessToken,
      accounts,
      getToken,
      signIn,
      switchAccount,
      signOut,
    }),
    [isLoaded, accessToken, user, accounts, getToken, signIn, switchAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
