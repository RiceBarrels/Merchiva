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

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface AuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  accessToken: null,
  getToken: async () => null,
  signOut: () => {},
});

const TOKEN_KEY = "workos_access_token";
const REFRESH_KEY = "workos_refresh_token";
const USER_KEY = "workos_user";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
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
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const doRefresh = useCallback(async (): Promise<string | null> => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch("/api/auth/refresh", {
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
      storeAuthTokens(data.accessToken, data.refreshToken, data.user);
      setAccessToken(data.accessToken);
      setUser(data.user);
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

  const signOut = useCallback(() => {
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
      getToken,
      signOut,
    }),
    [isLoaded, accessToken, user, getToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
