"use client";

// Loads public/legal/third-party-notices.json once per page load. The root-relative path works on the web, in the
// Capacitor static export (capacitor://localhost) and in Tauri. A module-level cache makes a second open instant.

import { useEffect, useState } from "react";
import { NOTICES_JSON_PATH, type NoticesFile } from "@/lib/licenses/types";

export type NoticesState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; file: NoticesFile };

let cachedFile: NoticesFile | null = null;
let inflight: Promise<NoticesFile> | null = null;

function isNoticesFile(v: unknown): v is NoticesFile {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Partial<NoticesFile>;
  return f.schemaVersion === 1 && Array.isArray(f.packages) && typeof f.texts === "object" && f.texts !== null;
}

/** One shared fetch; it is never aborted, so a remount (React Strict Mode) reuses it instead of failing. */
function loadNotices(): Promise<NoticesFile> {
  if (!inflight) {
    inflight = fetch(NOTICES_JSON_PATH)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (!isNoticesFile(json)) throw new Error("unexpected notices format");
        cachedFile = json;
        return json;
      });
  }
  return inflight;
}

type Outcome = { attempt: number; file: NoticesFile } | { attempt: number; failed: true };

/** The notices list, fetched when `enabled` first becomes true (a closed panel fetches nothing). */
export function useThirdPartyNotices(enabled = true): NoticesState {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!enabled || cachedFile) return;
    const controller = new AbortController();
    loadNotices()
      .then((file) => {
        if (!controller.signal.aborted) setOutcome({ attempt, file });
      })
      .catch(() => {
        if (!controller.signal.aborted) setOutcome({ attempt, failed: true });
      })
      .finally(() => {
        // A failed load clears the shared promise so "Try again" fetches anew.
        if (!cachedFile) inflight = null;
      });
    return () => controller.abort();
  }, [enabled, attempt]);

  const file = cachedFile ?? (outcome && "file" in outcome ? outcome.file : null);
  if (file) return { status: "ready", file };
  if (outcome && "failed" in outcome && outcome.attempt === attempt) {
    return { status: "error", retry: () => setAttempt((a) => a + 1) };
  }
  return { status: "loading" };
}
