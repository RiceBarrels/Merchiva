"use client";

// Publishes the app's live connection for parked spreadsheet sessions (sheets.md §5.7, lib/sheets/sync/
// app-connection.ts). An open editor's store follows the connection itself; a session parked with edits not yet on
// the server (typed offline, or within the push debounce) outlives its editor, and must still follow a reconnect, or
// its lease detaches and those edits are thrown away when the sheet is opened again. Mount SheetSessionKeeper once,
// inside the SpacetimeDB provider of the signed-in app (the /manager layout, which /store and /personal reuse). It
// loads the connection adapter only, none of the session code.

import { useEffect, useMemo } from "react";
import { currentSheetAppConnection, publishSheetAppConnection } from "@/lib/sheets/sync/app-connection";
import { createSheetConnection } from "@/lib/sheets/sync/connection";
import { useLiveSpacetimeConnection } from "@/lib/spacetimedb/hooks/useDocs";

/**
 * The live connection, or null while offline. No backend probe (an open editor waits for one): only a session that
 * already ran on this module is parked, so the sheet tables are there, and the app does not probe for every user.
 */
export function useSheetSessionKeeper(): void {
  const raw = useLiveSpacetimeConnection();
  const live = useMemo(() => (raw ? createSheetConnection(raw) : null), [raw]);
  useEffect(() => {
    publishSheetAppConnection(live);
    return () => {
      // Unmounted with the app (sign-out): parked sessions leave the connection that is closing with it.
      if (currentSheetAppConnection() === live) publishSheetAppConnection(null);
    };
  }, [live]);
}

/** Renders nothing: useSheetSessionKeeper for a layout. */
export function SheetSessionKeeper(): null {
  useSheetSessionKeeper();
  return null;
}
