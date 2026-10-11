"use client";

// A store tablet is one identity shared by everyone who logs in with a PIN, so
// nobody's notifications may reach it by push. Whenever /store comes up on a
// live connection, this browser's push subscription is dropped: the browser
// unsubscribes and the signed-in account's row for it is deleted
// (releaseBrowserPush). Cheap when the browser holds no subscription, which is
// every mount after the first. Alerts, the push prompt and the identity sync
// never run on /store at all (lib/notifications/viewer.ts).

import { useEffect } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { releaseBrowserPush } from "@/lib/notifications/push-cleanup";

export function useReleaseStorePush(organizationId: string | null | undefined): void {
  // Deleting the row is a reducer call: wait for the connection.
  const { isActive } = useSpacetimeDB();
  useEffect(() => {
    if (!isActive || !organizationId) return;
    void releaseBrowserPush();
  }, [isActive, organizationId]);
}
