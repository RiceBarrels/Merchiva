"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { isOnline, onConnectivityChange, mutationQueue } from "@/lib/offline";

type BannerState = "hidden" | "offline" | "reconnected";

export function OfflineIndicator() {
  const [state, setState] = useState<BannerState>("hidden");
  const [pendingCount, setPendingCount] = useState(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPendingCount = useCallback(async () => {
    try {
      const all = await mutationQueue.getAll();
      setPendingCount(all.length);
    } catch {
      // IndexedDB unavailable — ignore
    }
  }, []);

  useEffect(() => {
    // Set initial state
    if (!isOnline()) {
      setState("offline");
      refreshPendingCount();
    }

    const unsubscribe = onConnectivityChange((online) => {
      if (online) {
        setState("reconnected");
        // Auto-dismiss after 3 seconds
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => setState("hidden"), 3000);
      } else {
        setState("offline");
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
        refreshPendingCount();
      }
    });

    // Poll pending count while offline (every 5s)
    pollTimer.current = setInterval(() => {
      if (!isOnline()) {
        refreshPendingCount();
      }
    }, 5000);

    return () => {
      unsubscribe();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refreshPendingCount]);

  if (state === "hidden") return null;

  const isOffline = state === "offline";

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium border-b transition-colors duration-200 ${
        isOffline
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>
            You&apos;re offline — changes will sync when connected
            {pendingCount > 0 && (
              <span className="ml-1 font-semibold">
                ({pendingCount} pending {pendingCount === 1 ? "change" : "changes"})
              </span>
            )}
          </span>
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5" />
          <span>Back online — syncing...</span>
        </>
      )}
    </div>
  );
}
