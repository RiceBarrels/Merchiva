"use client";

// A signed URL for one Drive file (or its thumbnail) that stays usable: loaded
// through the tab's batched loader and fetched again shortly before it expires.
//
// Inside a device panel the Drive actor override names the PIN operator on
// /store; every URL is then signed only if that operator may read the file.

import { useEffect, useState } from "react";
import type { DriveUrlPurpose, DriveUrlVariant } from "@/lib/drive/api";
import { useDriveActorOverride } from "@/lib/drive/actor-context";
import { driveErrorCode, type DriveClientErrorCode } from "@/lib/drive/errors";
import { DRIVE_URL_REFRESH_MARGIN_MS, sharedDriveUrlLoader } from "@/lib/drive/url-loader";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";

export type DriveUrlError = DriveClientErrorCode | "generic";
export interface DriveUrlState { url: string | null; loading: boolean; error: DriveUrlError | null }

interface Loaded { key: string; url: string | null; error: DriveUrlError | null }

/** Never refresh sooner than this, even when the server hands out a URL that is about to expire. */
const MIN_REFRESH_DELAY_MS = 30_000;

/**
 * `url` is null while loading, on failure (`error` set), and when the file has no URL for the caller: still
 * uploading, no thumbnail, or not visible to them (`error` null).
 */
export function useDriveUrl(itemId: string | null, variant: DriveUrlVariant, purpose: DriveUrlPurpose): DriveUrlState {
  useDriveTokenBridge();
  const acting = useDriveActorOverride()?.actingMemberId ?? "";
  const loader = sharedDriveUrlLoader(acting);
  const key = itemId ? `${acting}|${itemId}|${variant}|${purpose}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Bumped by the refresh timer; the effect then asks the loader again (its cached URL is no longer fresh).
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let expiresAt: number | null = null;
    loader
      .get({ id: itemId, variant, purpose })
      .then((signed) => {
        if (cancelled) return;
        expiresAt = signed?.expiresAt ?? null;
        setLoaded({ key, url: signed?.url ?? null, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ key, url: null, error: driveErrorCode(err) ?? "generic" });
      })
      .finally(() => {
        if (cancelled || expiresAt === null) return;
        const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresAt - DRIVE_URL_REFRESH_MARGIN_MS - Date.now());
        timer = setTimeout(() => setRefreshTick((tick) => tick + 1), delay);
      });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [loader, itemId, variant, purpose, key, refreshTick]);

  if (!itemId) return { url: null, loading: false, error: null };
  if (loaded?.key === key) return { url: loaded.url, loading: false, error: loaded.error };
  // A URL already cached shows at once, without a loading frame (the effect still confirms it).
  const cached = loader.peek({ id: itemId, variant, purpose });
  return cached ? { url: cached.url, loading: false, error: null } : { url: null, loading: true, error: null };
}
