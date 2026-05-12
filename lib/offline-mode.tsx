"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { offlineCache, mutationQueue, isOnline, onConnectivityChange } from "@/lib/offline";
import type { OrgSnapshot } from "@/lib/offline";
import { getConnection } from "@/lib/spacetimedb/client";
import { toast } from "sonner";

interface OfflineState {
  isOffline: boolean;
  pendingCount: number;
  cachedSnapshot: OrgSnapshot | null;
  snapshotLoaded: boolean;
}

const OfflineContext = createContext<OfflineState>({
  isOffline: false,
  pendingCount: 0,
  cachedSnapshot: null,
  snapshotLoaded: false,
});

export function useOfflineMode() {
  return useContext(OfflineContext);
}

export function OfflineModeProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [pendingCount, setPendingCount] = useState(0);
  const [cachedSnapshot, setCachedSnapshot] = useState<OrgSnapshot | null>(null);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const flushing = useRef(false);

  useEffect(() => {
    const orgId = (() => {
      try { return localStorage.getItem("active_org_id"); } catch { return null; }
    })();
    if (orgId) {
      offlineCache.getOrgData(orgId).then((snap) => {
        if (snap) setCachedSnapshot(snap);
        setSnapshotLoaded(true);
      }).catch(() => setSnapshotLoaded(true));
    } else {
      setSnapshotLoaded(true);
    }
  }, []);

  useEffect(() => {
    mutationQueue.getAll().then((all) => setPendingCount(all.length)).catch(() => {});
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const conn = getConnection();
      if (!conn) return;
      const pending = await mutationQueue.getAll();
      if (pending.length === 0) return;
      const result = await mutationQueue.flush(conn);
      if (result.success > 0) {
        toast.success(`Synced ${result.success} offline change${result.success > 1 ? "s" : ""}`);
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} change${result.failed > 1 ? "s" : ""} failed to sync`);
      }
      setPendingCount((await mutationQueue.getAll()).length);
    } catch (err) {
      console.warn("[OfflineMode] flush failed:", err);
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      setOffline(!online);
      if (online) {
        setTimeout(flushQueue, 2000);
      }
    });
    return unsub;
  }, [flushQueue]);

  useEffect(() => {
    if (offline) {
      const interval = setInterval(() => {
        mutationQueue.getAll().then((all) => setPendingCount(all.length)).catch(() => {});
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [offline]);

  return (
    <OfflineContext.Provider value={{ isOffline: offline, pendingCount, cachedSnapshot, snapshotLoaded }}>
      {children}
    </OfflineContext.Provider>
  );
}
