"use client";

import { useMemo } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./generated";
import {
  SPACETIMEDB_URI,
  SPACETIMEDB_MODULE,
  getStoredToken,
  storeToken,
  setConnection,
  clearConnection,
} from "./client";
import type { ReactNode } from "react";

interface SpacetimeProviderProps {
  children: ReactNode;
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  // Build once — useMemo prevents re-creating the builder on every render.
  // SpacetimeDBProvider calls .build() internally on first mount.
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(SPACETIMEDB_URI)
        .withDatabaseName(SPACETIMEDB_MODULE)
        .withToken(getStoredToken())
        .onConnect((conn, _identity, token) => {
          storeToken(token);
          setConnection(conn);
          // Subscribe to all 33 public tables — the SDK merges subscriptions
          // into its local cache, making them available to all useTable() hooks.
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
        .onConnectError((_ctx, _error) => {
          localStorage.removeItem("stdb_token");
          window.location.href = "/?logout=1";
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      {children}
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
