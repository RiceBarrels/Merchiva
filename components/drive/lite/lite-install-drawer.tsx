"use client";

// The Drive lite app's gate in front of the editor plugins (Docs, Sheets, Slides): Drive lists every file, but
// opening, creating or "opening as" one takes its editor plugin. When it is missing the panel asks to download it
// (the drawer below) and continues once installed; whoever may not install here is told to ask an owner or a
// manager (usePluginInstall: on /store both the PIN operator and the tablet account must be allowed). Callers gate
// BEFORE any write or import, so a refused prompt never leaves an orphan document.
//
// Until the install state has loaded every editor counts as installed for display, so a reload never flashes a
// prompt; an ask made in that window waits for it, so nothing is written for an editor that turns out to be missing.
// An editor screen whose plugin is missing anyway (removed while open, a stack restored) shows LiteInstallScreen.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, Download } from "lucide-react";
import { LiteButton, LiteRow, LiteScreen } from "@/components/device/apps/lite";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { PluginInstallBody } from "@/components/plugins/plugin-install-prompt";
import { pluginName, usePluginInstall, type PluginInstall, type PluginSurface } from "@/components/plugins/use-plugin-install";
import { editorPluginOf, type EditorKind } from "@/lib/device-apps";
import { useT } from "@/lib/i18n/context";
import { useLiteDriveContext, type LiteInstallRequest } from "./lite-context";

export interface LiteEditorGate {
  /** Whether `kind`'s editor plugin is installed (true while the install state loads). */
  isInstalled(kind: EditorKind): boolean;
  /** Runs `then` now when `kind`'s editor is installed; otherwise opens the download drawer, which runs it once installed. */
  ensureEditor(kind: EditorKind, mode: "open" | "create", then: () => void): void;
}

export function useLiteEditorGate(surface: PluginSurface, openInstall: (request: LiteInstallRequest) => void): LiteEditorGate {
  const { ready, isInstalled: appInstalled } = usePluginInstall({ surface });

  // Plugins installed from this panel's prompt. A continuation runs before the new settings row has re-rendered the
  // panel, and it may pass another gate built from that older render (the router's `open`); this keeps it from
  // asking twice. Cleared once the install state the panel renders with changes.
  const installedHere = useRef(new Set<string>());
  // The install state as of the last commit, which ensureEditor reads: a continuation that awaits (New, Open as)
  // calls the router's `open` captured at tap time, after the new row has re-rendered and cleared installedHere.
  const latest = useRef({ ready, appInstalled });
  useEffect(() => {
    latest.current = { ready, appInstalled };
    installedHere.current.clear();
  }, [ready, appInstalled]);

  const isInstalled = useCallback(
    (kind: EditorKind) => {
      const appId = editorPluginOf(kind);
      return !ready || appInstalled(appId) || installedHere.current.has(appId);
    },
    [ready, appInstalled],
  );

  // An ask made before the install state loaded; the latest one replaces an earlier one.
  const held = useRef<{ kind: EditorKind; mode: "open" | "create"; then: () => void } | null>(null);
  const ensureEditor = useCallback(
    (kind: EditorKind, mode: "open" | "create", then: () => void) => {
      const appId = editorPluginOf(kind);
      const now = latest.current;
      if (!now.ready) {
        held.current = { kind, mode, then };
        return;
      }
      if (now.appInstalled(appId) || installedHere.current.has(appId)) {
        then();
        return;
      }
      openInstall({
        kind,
        mode,
        then: () => {
          installedHere.current.add(appId);
          then();
        },
      });
    },
    [openInstall],
  );
  useEffect(() => {
    const ask = held.current;
    if (!ready || !ask) return;
    held.current = null;
    ensureEditor(ask.kind, ask.mode, ask.then);
  }, [ready, ensureEditor]);

  return useMemo(() => ({ isInstalled, ensureEditor }), [isInstalled, ensureEditor]);
}

/** Download, with its spinner; off while offline. Rendered only for people who may install. */
function DownloadButton({ install, appId, offline, onClick }: { install: PluginInstall; appId: string; offline: boolean; onClick(): void }) {
  const t = useT();
  const busy = install.savingId === appId;
  return (
    <LiteButton
      icon={Download}
      label={t(busy ? "pluginInstall.downloading" : "pluginInstall.download")}
      busy={busy}
      disabled={offline}
      onClick={onClick}
    />
  );
}

/** The drawer a gated open, New or "Open as …" raises; Download installs the plugin and carries on. */
export function LiteInstallDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  const install = usePluginInstall({ surface: drive.surface });
  const open = panels.state.open === "install";
  const request = panels.state.install;
  const appId = editorPluginOf(request?.kind ?? "doc");

  // Closing the drawer drops whatever an unfinished download was going to continue with (the sheet is modal, so
  // closing it is the only way away from it).
  const attemptRef = useRef(0);
  const close = () => {
    attemptRef.current += 1;
    panels.close();
  };

  const download = async () => {
    if (!request || install.savingId) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    // install() reports a failure itself; the drawer stays open for a retry.
    const ok = await install.install(appId);
    if (!ok || attempt !== attemptRef.current) return;
    panels.closeIf("install", request);
    request.then();
  };

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(next) => { if (!next) close(); }}
      title={pluginName(t, appId)}
      cancelLabel={t(install.canInstall ? "pluginInstall.notNow" : "common.close")}
    >
      {request && (
        <div className="flex flex-col gap-4 pb-1" data-lite-install={appId}>
          <PluginInstallBody appId={appId} mode={request.mode} install={install} offline={drive.offline} />
          {install.canInstall && (
            <DownloadButton install={install} appId={appId} offline={drive.offline} onClick={() => void download()} />
          )}
        </div>
      )}
    </DeviceDrawer>
  );
}

/** In place of an editor whose plugin is missing: the same prompt as a screen; once installed the editor shows. */
export function LiteInstallScreen({ kind }: { kind: EditorKind }) {
  const t = useT();
  const { drive, nav } = useLiteDriveContext();
  const install = usePluginInstall({ surface: drive.surface });
  const appId = editorPluginOf(kind);
  // The editor's own header (its only way back) is gone, so the screen brings its own Back.
  return (
    <LiteScreen>
      <LiteRow icon={ChevronLeft} title={t("common.back")} onClick={nav.pop} />
      <div className="flex flex-1 flex-col justify-center gap-4 py-10" data-lite-install={appId}>
        <PluginInstallBody appId={appId} mode="open" install={install} offline={drive.offline} />
        {install.canInstall && (
          <DownloadButton install={install} appId={appId} offline={drive.offline} onClick={() => void install.install(appId)} />
        )}
      </div>
    </LiteScreen>
  );
}
