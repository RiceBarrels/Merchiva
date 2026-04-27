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
} from "./client";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  children: ReactNode;
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  const { getToken, isSignedIn } = useAuth();
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    getToken().then((token) => {
      if (token) {
        setAuthToken(token);
        localStorage.setItem("stdb_token", token);
      }
    });
  }, [isSignedIn, getToken]);

  const builder = useMemo(() => {
    if (!authToken) return null;

    console.log("ℹ️ INFO Connecting to SpacetimeDB WS...");
    return DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(authToken)
      .onConnect((conn, _identity, newToken) => {
        console.log("ℹ️ INFO Connected to SpacetimeDB WS");
        storeToken(newToken);
        setConnection(conn);
        conn.subscriptionBuilder().subscribe([
          "SELECT * FROM user",
          "SELECT * FROM organization",
          "SELECT * FROM org_member",
          "SELECT * FROM org_invitation",
          "SELECT * FROM settings",
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
      })
      .onDisconnect(() => {
        clearConnection();
      })
      .onConnectError((_ctx, error) => {
        console.error("[SpacetimeDB] Connection error:", error);
        import("sonner").then(({ toast }) => {
          toast.error(tRef.current("toast.dbConnectionFailed"), {
            description: String(error),
            duration: 10000,
          });
        });
      });
  }, [authToken]);

  if (!builder) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
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
