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
const USER_KEY = "workos_user";
const ACCOUNTS_KEY = "merchiva_accounts";

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
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
      setAccessToken(token);
      try {
        setUser(JSON.parse(userData));
      } catch {
        clearAuthTokens();
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

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch(apiUrl("/api/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearAuthTokens();
        setAccessToken(null);
        setUser(null);
        return null;
      }

      const data = await res.json();
      addAccountToStorage(data.accessToken, data.refreshToken, data.user);
      setAccessToken(data.accessToken);
      setUser(data.user);
      setAccounts(loadAccounts());
      return data.accessToken;
    } catch {
      clearAuthTokens();
      setAccessToken(null);
      setUser(null);
      return null;
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

  const signIn = useCallback(
    (token: string, refresh: string, userData: AuthUser) => {
      addAccountToStorage(token, refresh, userData);
      setAccessToken(token);
      setUser(userData);
      setAccounts(loadAccounts());
    },
    [],
  );

  const switchAccount = useCallback((userId: string) => {
    const accts = loadAccounts();
    const target = accts.find((a) => a.id === userId);
    if (!target) return;
    storeAuthTokens(target.accessToken, target.refreshToken, {
      id: target.id,
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
    });
    window.location.reload();
  }, []);

  const signOut = useCallback(() => {
    const currentUser = localStorage.getItem(USER_KEY);
    let currentId: string | null = null;
    try {
      if (currentUser) currentId = (JSON.parse(currentUser) as AuthUser).id;
    } catch {}

    const accts = loadAccounts().filter((a) => a.id !== currentId);
    saveAccounts(accts);

    if (accts.length > 0) {
      const next = accts[0];
      storeAuthTokens(next.accessToken, next.refreshToken, {
        id: next.id,
        email: next.email,
        firstName: next.firstName,
        lastName: next.lastName,
      });
      window.location.reload();
      return;
    }

    clearAuthTokens();
    setAccessToken(null);
    setUser(null);
    window.location.href = "/?logout=1";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      isSignedIn: !!accessToken,
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
