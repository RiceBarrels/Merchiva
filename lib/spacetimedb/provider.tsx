"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./generated";
import {
  SPACETIMEDB_URI,
  SPACETIMEDB_MODULE,
  storeToken,
  setConnection,
  clearConnection,
  getConnection,
} from "./client";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { mutationQueue } from "@/lib/offline";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  children: ReactNode;
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  const { getToken, isSignedIn, signOut } = useAuth();
  const t = useT();

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason);
      if (msg.includes("deserialize")) {
        console.error("[STDB DESER]", msg);
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setTokenMissing(true);
      return;
    }
    setTokenMissing(false);
    let cancelled = false;
    getToken()
      .then((token) => {
        if (cancelled) return;
        if (token) {
          setAuthToken(token);
          localStorage.setItem("stdb_token", token);
        } else {
          setTokenMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setTokenMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  // Surface a "connection timed out" UI if we never get past the loading state.
  // Mirrors the pattern used in (app)/layout.tsx AuthLoader.
  useEffect(() => {
    if (connected) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [connected, retryCount]);

  const builder = useMemo(() => {
    if (!authToken) return null;

    console.log(`ℹ️ INFO Connecting to SpacetimeDB WS...${retryCount > 0 ? ` (retry ${retryCount})` : ""}`);
    let canBrotli = false;
    try {
      if (
        typeof DecompressionStream !== "undefined" &&
        typeof ReadableStream !== "undefined" &&
        Symbol.asyncIterator in ReadableStream.prototype
      ) {
        new DecompressionStream("brotli" as CompressionFormat);
        canBrotli = true;
      }
    } catch {}

    return DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(authToken)
      .withCompression(canBrotli ? "brotli" : "none")
      .onConnect((conn, _identity, newToken) => {
        console.log("ℹ️ INFO Connected to SpacetimeDB WS");
        if (retryCount > 0) setRetryCount(0);
        setConnected(true);
        storeToken(newToken);
        setConnection(conn);
        // Flush offline mutation queue after subscriptions settle
        setTimeout(async () => {
          try {
            const pending = await mutationQueue.getAll();
            if (pending.length > 0) {
              console.log(`[SpacetimeDB] Flushing ${pending.length} offline mutations...`);
              const c = getConnection();
              if (c) await mutationQueue.flush(c);
            }
          } catch (err) {
            console.warn("[SpacetimeDB] Queue flush failed:", err);
          }
        }, 3000);
        conn.subscriptionBuilder().subscribe([
          "SELECT * FROM user",
          "SELECT * FROM organization",
          "SELECT * FROM org_member",
          "SELECT * FROM org_invitation",
          "SELECT * FROM inventory_item",
          "SELECT * FROM inventory_transaction",
          "SELECT * FROM sales_record",
          "SELECT * FROM product",
          "SELECT * FROM staff_member",
          "SELECT * FROM staff_role",
          "SELECT * FROM role_task",
          "SELECT * FROM shift",
          "SELECT * FROM shift_preset",
          "SELECT * FROM shift_trade",
          "SELECT * FROM staff_availability",
          "SELECT * FROM time_off_request",
          "SELECT * FROM payment",
          "SELECT * FROM chat_conversation",
          "SELECT * FROM chat_member",
          "SELECT * FROM chat_message",
          "SELECT * FROM site",
          "SELECT * FROM site_page",
          "SELECT * FROM site_component",
          "SELECT * FROM site_customer",
          "SELECT * FROM site_order",
          "SELECT * FROM site_booking",
          "SELECT * FROM site_membership",
          "SELECT * FROM membership_tier",
          "SELECT * FROM membership_perk",
          "SELECT * FROM perk_claim",
          "SELECT * FROM customer_points",
          "SELECT * FROM todo",
          "SELECT * FROM punch_event",
        ]);
        // NOTE: settings table is NOT subscribed — its option(timestamp) fields
        // cause "Can't deserialize an option type" errors due to client/server schema mismatch.
        // Settings are read via the settings page's own API calls instead.
        // Subscribe to newer tables separately — these may not exist on older server versions
        try {
          conn.subscriptionBuilder().subscribe([
            "SELECT * FROM notification",
            "SELECT * FROM waste_log",
            "SELECT * FROM location",
            "SELECT * FROM supplier",
            "SELECT * FROM purchase_order",
            "SELECT * FROM expense",
          ]);
        } catch {
          console.warn("[SpacetimeDB] Some newer tables not available on server");
        }
        try {
          conn.subscriptionBuilder().subscribe([
            "SELECT * FROM coupon",
            "SELECT * FROM queue_entry",
            "SELECT * FROM ai_chat_history",
            "SELECT * FROM ai_chat_session",
          ]);
        } catch {
          console.warn("[SpacetimeDB] Coupon/queue tables not available on server");
        }
      })
      .onDisconnect(() => {
        setConnected(false);
        clearConnection();
      })
      .onConnectError((_ctx, error) => {
        console.error("[SpacetimeDB] Connection error:", error);
        const MAX_RETRIES = 5;
        const delay = Math.min(2000 * 2 ** retryCount, 30000);
        if (retryCount < MAX_RETRIES) {
          console.log(`ℹ️ INFO Retrying in ${delay / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`);
          setTimeout(() => setRetryCount((c) => c + 1), delay);
        } else {
          import("sonner").then(({ toast }) => {
            toast.error(tRef.current("toast.dbConnectionFailed"), {
              description: String(error),
              duration: 10000,
            });
          });
        }
      });
  }, [authToken, retryCount]);

  if (!builder) {
    const showError = tokenMissing || timedOut;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        <p className="text-xs text-muted-foreground">{t("layout.connecting")}</p>
        {showError && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <p className="text-xs text-red-500">
              {tokenMissing ? t("layout.notConnected") : t("layout.connectionTimedOut")}
            </p>
            <button
              onClick={signOut}
              className="rounded border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("layout.signOutAndRetry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      {children}
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
