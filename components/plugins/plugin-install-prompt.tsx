"use client";

// The prompt shown when a file, a "New" item or a page belongs to a plugin the store hasn't downloaded
// (usePluginInstall). People who may manage plugins download it in place and carry on; everyone else is told to ask
// an owner or a manager. Three shapes:
// - PluginInstallBody: tile, title and copy only, for a host that draws its own buttons (the lite Drive app).
// - PluginInstallPage: a whole page, PermissionGuard's answer to a manager route whose plugin is off.
// - PluginInstallDialog: a confirm dialog in front of an open or a create, which runs `onInstalled` once installed.

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogActions } from "@/components/ui/dialog-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { PluginTile } from "@/components/plugins/plugin-tile";
import { pluginName, usePluginInstall, type PluginInstall, type PluginSurface } from "@/components/plugins/use-plugin-install";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useOfflineMode } from "@/lib/offline-mode";

/** What the person was doing when the missing plugin stopped them. */
export type PluginInstallMode = "open" | "create" | "page";

const BODY_KEY: Record<PluginInstallMode, string> = {
  open: "pluginInstall.openBody",
  create: "pluginInstall.createBody",
  page: "pluginInstall.pageBody",
};

/** The line under the body: who to ask, or why Download is off right now; null when nothing needs saying. */
function noteText(t: (key: string) => string, app: string, install: PluginInstall, offline: boolean): string | null {
  if (!install.canInstall) return fmt(t(install.askKey), { app });
  return offline ? t("pluginInstall.offline") : null;
}

export function PluginInstallBody({
  appId,
  mode,
  install,
  offline = false,
}: {
  appId: string;
  mode: PluginInstallMode;
  install: PluginInstall;
  offline?: boolean;
}) {
  const t = useT();
  const app = pluginName(t, appId);
  const note = noteText(t, app, install, offline);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <PluginTile appId={appId} name={app} size="lg" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{fmt(t("pluginInstall.missingTitle"), { app })}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{fmt(t(BODY_KEY[mode]), { app })}</p>
        {note && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

/** The whole-page prompt for a manager route whose plugin is off (PermissionGuard). */
export function PluginInstallPage({ appId }: { appId: string }) {
  const t = useT();
  const install = usePluginInstall();
  const { isOffline } = useOfflineMode();
  const busy = install.savingId === appId;
  return (
    <EmptyState
      className="h-full"
      action={
        install.canInstall ? (
          <div className="flex flex-col items-center gap-3">
            <Button disabled={busy || isOffline} onClick={() => void install.install(appId)}>
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
              {busy ? t("pluginInstall.downloading") : t("pluginInstall.download")}
            </Button>
            <Link href="/manager/apps" className="text-sm font-medium underline underline-offset-4">
              {t("pluginInstall.openPlugins")}
            </Link>
          </div>
        ) : undefined
      }
    >
      <PluginInstallBody appId={appId} mode="page" install={install} offline={isOffline} />
    </EmptyState>
  );
}

export interface PluginInstallDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The missing plugin (device app id). */
  appId: string;
  mode: "open" | "create";
  /** Runs once the plugin is installed from this dialog (the dialog has closed by then). */
  onInstalled(): void;
  /** Where the dialog is shown (the /store rule of usePluginInstall). Default "manager". */
  surface?: PluginSurface;
}

export function PluginInstallDialog({ open, onOpenChange, appId, mode, onInstalled, surface }: PluginInstallDialogProps) {
  const t = useT();
  const install = usePluginInstall({ surface });
  const { isOffline } = useOfflineMode();
  const [downloading, setDownloading] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Closing the dialog drops whatever an unfinished download was going to continue with.
  const attemptRef = useRef(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDownloading(false);
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptRef.current += 1;
    onOpenChange(next);
  };

  const download = async () => {
    if (downloading) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    setDownloading(true);
    // install() reports a failure itself; the dialog stays open for a retry.
    const ok = await install.install(appId);
    if (attempt !== attemptRef.current) return;
    setDownloading(false);
    if (!ok) return;
    onOpenChange(false);
    onInstalled();
  };

  const app = pluginName(t, appId);
  const note = noteText(t, app, install, isOffline);
  return (
    <AlertDialog open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-transparent">
            <PluginTile appId={appId} name={app} size="sm" />
          </AlertDialogMedia>
          <AlertDialogTitle>{fmt(t("pluginInstall.missingTitle"), { app })}</AlertDialogTitle>
          <AlertDialogDescription>
            {fmt(t(BODY_KEY[mode]), { app })}
            {note && (
              <>
                {" "}
                {note}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {install.canInstall ? (
          <DialogActions
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => {
              void download();
            }}
            saving={downloading}
            disabled={isOffline}
            cancelLabel={t("pluginInstall.notNow")}
            confirmLabel={downloading ? t("pluginInstall.downloading") : t("pluginInstall.download")}
          />
        ) : (
          <DialogActions onConfirm={() => handleOpenChange(false)} confirmLabel={t("common.close")} />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
