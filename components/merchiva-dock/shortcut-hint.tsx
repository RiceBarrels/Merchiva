"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MerchivaLogo } from "@/components/logo";
import { useT } from "@/lib/i18n/context";
import { isMacPlatform, merchivaShortcutLabel } from "./shortcut";

/** Kept from the old quick dialog, so people who learned ⌘⇧M there are not hinted again. */
const HINT_STORAGE_KEY = "merchiva:qd-hint-seen";
const HINT_VISIBLE_MS = 7000;

function subscribeNever(): () => void {
  return () => {};
}

function readEligible(): boolean {
  if (!window.matchMedia?.("(pointer: fine)")?.matches) return false;
  try {
    return !window.localStorage.getItem(HINT_STORAGE_KEY);
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    // Shown again on the next load; harmless.
  }
}

/**
 * First-run hint for ⌘⇧M. The shortcut is the way into Mr. Merchiva everywhere (besides it only
 * the desktop rail and the phone layout's swipe toward the inline start open him), and nothing
 * else teaches it. Pointer devices only; shown for a few seconds on each load until the user opens
 * the dock or clicks the hint.
 */
export function ShortcutHint({ open }: { open: boolean }) {
  const t = useT();
  const eligible = useSyncExternalStore(subscribeNever, readEligible, () => false);
  const [expired, setExpired] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => setExpired(true), HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  useEffect(() => {
    if (open) markSeen();
  }, [open]);

  if (!eligible || expired || dismissed || open) return null;

  return (
    <button
      type="button"
      onClick={() => {
        markSeen();
        setDismissed(true);
      }}
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-foreground px-4 py-2 text-[13px] text-background shadow-lg"
    >
      <MerchivaLogo size={14} />
      {t("merchiva.dock.hintPrefix")}
      <kbd className="rounded bg-background/15 px-1.5 py-0.5 font-mono text-[12px]">{merchivaShortcutLabel(isMacPlatform())}</kbd>
      {t("merchiva.dock.hintSuffix")}
    </button>
  );
}
