"use client";

import { useEffect, useState } from "react";
import type { DocSyncStatus } from "@/lib/docs/sync-types";

/**
 * Header save indicator (docs-editor-ui spec §4.2):
 * connecting → saved → (edits) saving → saved; offline / error from the provider; view-only members see
 * "readOnly" once connected. "Saving…" only shows after 300 ms of pending pushes so it doesn't flicker.
 */
export type DocSaveState = "connecting" | "saving" | "saved" | "offline" | "error" | "readOnly";

const SAVING_DELAY_MS = 300;
const LABEL_FADE_MS = 3000;

export function useDocSaveState(status: DocSyncStatus, canEdit: boolean): { state: DocSaveState; showLabel: boolean } {
  const [savingVisible, setSavingVisible] = useState(false);
  const [labelFaded, setLabelFaded] = useState(false);

  useEffect(() => {
    if (status !== "saving") return;
    const timer = window.setTimeout(() => setSavingVisible(true), SAVING_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setSavingVisible(false);
    };
  }, [status]);

  let state: DocSaveState;
  if (status === "connecting" || status === "syncing") state = "connecting";
  else if (status === "offline") state = "offline";
  else if (status === "error") state = "error";
  else if (!canEdit) state = "readOnly";
  else if (status === "saving") state = savingVisible ? "saving" : "saved";
  else state = "saved";

  useEffect(() => {
    if (state !== "saved") return;
    const timer = window.setTimeout(() => setLabelFaded(true), LABEL_FADE_MS);
    return () => {
      window.clearTimeout(timer);
      setLabelFaded(false);
    };
  }, [state]);

  return { state, showLabel: state !== "saved" || !labelFaded };
}
