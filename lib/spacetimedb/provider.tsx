"use client";

import { useEffect, useMemo, useState } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./generated";
import {
  SPACETIMEDB_URI,
  SPACETIMEDB_MODULE,
  storeToken,
  setConnection,
  clearConnection,
} from "./client";
import { useAuth } from "@clerk/react";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  children: ReactNode;
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  const { getToken, isSignedIn } = useAuth();
  const [clerkToken, setClerkToken] = useState<string | null>(null);

  // Fetch fresh Clerk JWT and make it available to the connection builder.
  useEffect(() => {
    if (!isSignedIn) return;
    getToken().then((token) => {
      if (token) {
        setClerkToken(token);
        localStorage.setItem("stdb_token", token);
      }
    });
  }, [isSignedIn, getToken]);

  // Build once per token — recreated only when the Clerk JWT changes.
  const builder = useMemo(() => {
    if (!clerkToken) return null;

    return DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(clerkToken)
      .onConnect((conn, _identity, newToken) => {
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
        ]);
      })
      .onDisconnect(() => {
        clearConnection();
      })
      .onConnectError((_ctx, error) => {
        console.error("[SpacetimeDB] Connection error:", error);
        localStorage.removeItem("stdb_token");
        window.location.href = "/";
      });
  }, [clerkToken]);

  if (!builder) {
    // Token not yet fetched — render children so layout can show its own loading state.
    return <>{children}</>;
  }

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      {children}
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
