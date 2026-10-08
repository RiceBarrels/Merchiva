"use client";

import { useEffect } from "react";
import { useCanUseMerchiva } from "./dock-panel";
import { toggleMerchivaDock, useHasDockSlot, useMerchivaDockOpen } from "./dock-state";
import { MerchivaOverlayPanel } from "./overlay-panel";
import { isMerchivaShortcut } from "./shortcut";
import { ShortcutHint } from "./shortcut-hint";

export { MerchivaDockLayout } from "./dock-layout";
export { useMerchivaBackHandler } from "./overlay-panel";

/*
 * Mr. Merchiva in /manager: a chat docked on the right that stays until the user closes it.
 *
 *   ways in   ⌘⇧M (Ctrl+Shift+M) anywhere in /manager, on desktop the rail on the right edge, and
 *             on the phone layout a swipe toward the inline start (right-to-left in LTR) that pulls
 *             him in from the end edge (dock-reveal.ts). Nothing else opens him — no button, menu
 *             entry, omnibox action or chat channel.
 *   per tab   on desktop every browser tab has its own Merchiva and conversation; the single-tab
 *             phone layout has one per window, like the legacy shell (dock-panel.tsx TabChats,
 *             tab-sessions.ts). Whether the dock is open is shared by the window.
 *
 *   MerchivaDock        mounted once by app/manager/layout.tsx: owns the shortcut and the first-run
 *                       hint, and overlays the dock on the page when no shell gives it a column (the
 *                       phone layout, the legacy shell; overlay-panel.tsx).
 *   MerchivaDockLayout  the desktop browser chrome's page region plus the dock as a resizable panel
 *                       that collapses to the rail (dock-layout.tsx).
 *
 * Both are gated like the chat itself: owners, or members with `merchiva.view`.
 */

export function MerchivaDock() {
  const allowed = useCanUseMerchiva();
  if (!allowed) return null;
  return <MerchivaDockRoot />;
}

function MerchivaDockRoot() {
  const open = useMerchivaDockOpen();
  const slotted = useHasDockSlot();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isMerchivaShortcut(event)) return;
      event.preventDefault();
      toggleMerchivaDock();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <>
      <ShortcutHint open={open} />
      {slotted ? null : <MerchivaOverlayPanel open={open} />}
    </>
  );
}
