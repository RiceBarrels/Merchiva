"use client";

import { useEffect } from "react";
import { MerchivaOverlayPanel, useCanUseMerchiva } from "./dock-panel";
import { toggleMerchivaDock, useHasDockSlot, useMerchivaDockOpen } from "./dock-state";
import { isMerchivaShortcut } from "./shortcut";
import { ShortcutHint } from "./shortcut-hint";

export { MerchivaDockLayout } from "./dock-layout";

/*
 * Mr. Merchiva in /manager: a chat docked on the right that stays until the user closes it.
 *
 *   ways in   ⌘⇧M (Ctrl+Shift+M) anywhere in /manager, and on desktop the rail on the right
 *             edge. Nothing else opens him — no button, menu entry, omnibox action or chat channel.
 *   per tab   every browser tab has its own Merchiva and conversation (dock-panel.tsx TabChats,
 *             tab-sessions.ts); whether the dock is open is shared by the window.
 *
 *   MerchivaDock        mounted once by app/manager/layout.tsx: owns the shortcut and the first-run
 *                       hint, and overlays the dock on the page when no shell gives it a column (the
 *                       mobile browser chrome, the legacy shell).
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
      {open && !slotted ? <MerchivaOverlayPanel /> : null}
    </>
  );
}
