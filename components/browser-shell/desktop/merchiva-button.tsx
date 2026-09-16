"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { MerchivaAppIcon } from "@/components/device/app-icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getRouteAccess, useAccessContext, useTabActions } from "@/lib/browser-shell";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useIsNativeShellSync } from "@/lib/native-shell";
import { TOOLBAR_BUTTON_CLASS } from "./chrome-classes";
import { useChromeEnv } from "./chrome-env";
import { MERCHIVA_CHANNEL_URL, merchivaLaunchMode, merchivaShortcutLabel, type MerchivaLaunch } from "./merchiva-launch";

/*
 * Mr. Merchiva toolbar button (desktop spec §6.1, plan D31).
 *   Web:   dispatches `merchiva:quick-dialog`; the dialog opens at the last pointer position,
 *          so a synthetic pointer position at the button anchors it there even for keyboard use.
 *   Tauri: the in-page dialog ignores the event (the OS-global overlay owns ⌘⇧M), so the
 *          button opens the Channel page in a new foreground tab, when the user may open it
 *          (Channel is gated by `staffing`); otherwise it points to the OS-global shortcut.
 * Gated like the dialog: owners, or members with `merchiva.view`.
 */

export const QUICK_DIALOG_EVENT = "merchiva:quick-dialog";

export function useCanUseMerchiva(): boolean {
  const { isOwner, can } = usePermissions();
  return isOwner || can("merchiva", "view");
}

/** How Mr. Merchiva opens for this user on this platform (see merchiva-launch.ts). */
export function useMerchivaLaunch(): MerchivaLaunch {
  const native = useIsNativeShellSync();
  const ctx = useAccessContext();
  return merchivaLaunchMode(native, getRouteAccess(MERCHIVA_CHANNEL_URL, ctx));
}

/**
 * Opens Mr. Merchiva the way `launch` says. The caller passes the launch mode (from
 * useMerchivaLaunch, or merchivaLaunchMode with an access context it already holds) so no
 * extra access-context subscription is created here.
 */
export function useOpenMerchiva(launch: MerchivaLaunch): (anchor?: HTMLElement | null) => void {
  const t = useT();
  const { isMac } = useChromeEnv();
  const actions = useTabActions();
  return useCallback(
    (anchor?: HTMLElement | null) => {
      if (launch === "channel") {
        actions.openUrl(MERCHIVA_CHANNEL_URL, "new-foreground");
        return;
      }
      if (launch === "shortcut") {
        toast(fmt(t("browserDesktop.toolbar.merchivaNativeHint"), { shortcut: merchivaShortcutLabel(isMac) }));
        return;
      }
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: rect.left + rect.width / 2, clientY: rect.bottom }));
      }
      window.dispatchEvent(new Event(QUICK_DIALOG_EVENT));
    },
    [launch, actions, t, isMac],
  );
}

export function MerchivaButton() {
  const t = useT();
  const allowed = useCanUseMerchiva();
  const launch = useMerchivaLaunch();
  const openMerchiva = useOpenMerchiva(launch);
  const native = useIsNativeShellSync();
  const { isMac } = useChromeEnv();
  if (!allowed) return null;

  const shortcut = merchivaShortcutLabel(isMac);
  const label = t("browserDesktop.toolbar.merchiva");
  const hint = native ? fmt(t("browserDesktop.toolbar.merchivaNativeHint"), { shortcut }) : `${label} (${shortcut})`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={TOOLBAR_BUTTON_CLASS}
            onClick={(event) => openMerchiva(event.currentTarget)}
          />
        }
      >
        <MerchivaAppIcon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  );
}
