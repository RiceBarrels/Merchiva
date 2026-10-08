"use client";

// Install state of the org's plugins (device apps, lib/device-apps.ts) and an in-place "Download" for the prompts
// that open a file or a page whose plugin is missing (components/plugins/plugin-install-prompt.tsx, the Drive gates).
//
// Who may download: whoever may manage plugins (canManageDeviceApps: owner, manager or settings edit). On /store
// usePermissions() is the PIN operator (EmbeddedPage wraps the lite apps in the operator's PermissionsProvider), but
// the setDeviceApps reducer authorizes the identity that sends it, which is the tablet account. So there the tablet
// account must be an owner, a manager or hold settings edit as well: a staff operator never installs through a
// manager's tablet, and a manager operator on a staff tablet is told to ask rather than sent into a reducer that refuses.
//
// Install state is org-wide and cached on the settings row. setInstalled sends the whole list (useDeviceApps keeps
// rapid writes from undoing each other), and the SDK applies the committed row before the reducer call resolves,
// so a caller continues as soon as install() resolves true.

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/lib/context/permissions";
import { canManageDeviceApps } from "@/lib/device-apps";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import type { Permissions } from "@/lib/types";

/** Where the person is: the back office, the shared store tablet or their own phone. */
export type PluginSurface = "manager" | "store" | "personal";

export interface PluginInstall {
  /** Install state has loaded (settings row seen). Before that, treat everything as installed — never prompt. */
  ready: boolean;
  isInstalled(appId: string): boolean;
  /** This person may download plugins here (see pluginCanInstall). */
  canInstall: boolean;
  /** What to tell someone who may not download here: ask an owner or a manager, or, when only the tablet's account
   *  stands in the way (a manager operating a staff tablet), download from another device. */
  askKey: "pluginInstall.askManager" | "pluginInstall.askOtherDevice";
  /** Plugin being installed, or null. */
  savingId: string | null;
  /** Installs `appId` org-wide; resolves true on success (toast pluginInstall.installed), false on failure (toast pluginInstall.failed). */
  install(appId: string): Promise<boolean>;
}

export interface PluginCanInstallInput {
  surface: PluginSurface;
  /** Role of the person using the screen (on /store, the PIN operator). */
  role: string | null | undefined;
  permissions: Permissions | null | undefined;
  /** On /store: role of the account the tablet is signed in with (null while unknown). Ignored elsewhere. */
  tabletRole?: string | null;
  /** On /store: the tablet account's own stored `settings.edit`. Ignored elsewhere. */
  tabletSettingsEdit?: boolean;
}

/** Whether this person may download a plugin here (the file comment has the /store rule). */
export function pluginCanInstall({ surface, role, permissions, tabletRole, tabletSettingsEdit }: PluginCanInstallInput): boolean {
  if (!canManageDeviceApps(role, permissions)) return false;
  if (surface !== "store") return true;
  if (!tabletRole) return false;
  return canManageDeviceApps(tabletRole, tabletSettingsEdit ? { settings: { view: true, edit: true } } as Permissions : null);
}

/** The localized name of a plugin (`device.catalog.<id>`). */
export function pluginName(t: (key: string) => string, appId: string): string {
  return t(`device.catalog.${appId}`);
}

export function usePluginInstall(opts: { surface?: PluginSurface } = {}): PluginInstall {
  const surface = opts.surface ?? "manager";
  const t = useT();
  const { role, permissions } = usePermissions();
  const { isInstalled, setInstalled, savingId, isReady } = useDeviceApps();
  const tablet = useSignedInMember();
  const canInstall = pluginCanInstall({ surface, role, permissions, tabletRole: tablet.role, tabletSettingsEdit: tablet.settingsEdit });
  const askKey = canManageDeviceApps(role, permissions) ? "pluginInstall.askOtherDevice" : "pluginInstall.askManager";

  const install = useCallback(
    async (appId: string) => {
      const app = pluginName(t, appId);
      if (!canInstall) {
        toast.error(fmt(t(askKey), { app }));
        return false;
      }
      try {
        await setInstalled(appId, true);
      } catch (err) {
        console.warn("[plugins] install failed:", err);
        toast.error(fmt(t("pluginInstall.failed"), { app }));
        return false;
      }
      toast.success(fmt(t("pluginInstall.installed"), { app }));
      return true;
    },
    [askKey, canInstall, setInstalled, t],
  );

  return useMemo(
    () => ({ ready: isReady, isInstalled, canInstall, askKey, savingId, install }),
    [isReady, isInstalled, canInstall, askKey, savingId, install],
  );
}
