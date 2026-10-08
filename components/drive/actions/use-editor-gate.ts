"use client";

// Drive's gate in front of the editor plugins (Docs, Sheets, Slides). Drive lists every file, but
// opening, creating or importing one takes its editor plugin: when it is missing, ask to download it
// (PluginInstallDialog) and continue once it is installed; people who may not install are told to
// ask an owner or manager. Callers gate BEFORE any write or byte fetch — the module creates a
// document whether or not its editor is installed, so checking afterwards would leave an orphan.
//
// Until the install state has loaded every editor counts as installed for display, so a reload never
// flashes a prompt or a hint; an ask made in that window (the first round trip after mount, a
// reconnect) waits for it, so nothing is written for an editor that turns out to be missing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import type { PluginInstallDialogProps } from "@/components/plugins/plugin-install-prompt";
import { usePluginInstall, type PluginSurface } from "@/components/plugins/use-plugin-install";
import { editorPluginOf, type EditorKind } from "@/lib/device-apps";
import { parseEditorHref } from "@/lib/drive/hrefs";

export interface EditorGate {
  /** Run `then` now when `kind`'s editor is installed; otherwise prompt, and run it after a successful install. */
  ensureEditor(kind: EditorKind, mode: "open" | "create", then: () => void): void;
  /** Whether `kind`'s editor is installed (true while the install state loads). */
  isInstalled(kind: EditorKind): boolean;
  /** This person may download a missing editor plugin here (usePluginInstall). */
  canInstall: boolean;
  /** Props for the one `<PluginInstallDialog />` the page mounts. */
  dialog: PluginInstallDialogProps;
}

interface Pending {
  kind: EditorKind;
  mode: "open" | "create";
}

export function useEditorGate({ surface }: { surface: PluginSurface }): EditorGate {
  const install = usePluginInstall({ surface });
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  // What the latest prompt continues with once its plugin is installed.
  const thenRef = useRef<(() => void) | null>(null);

  // Plugins installed from this page's prompt. A continuation runs before the new settings row has re-rendered
  // the page, and it may pass another gate built from that older render (drive-home's openUrl); this keeps it
  // from prompting twice. Cleared once the install state the page renders with changes.
  const installedHere = useRef(new Set<string>());
  const { ready, isInstalled: appInstalled, canInstall } = install;
  // The install state as of the last commit. ensureEditor reads it rather than its render's values: a continuation
  // that awaits (New, a template, Open as) calls an openUrl captured at click time, after the new settings row has
  // re-rendered the page and cleared installedHere, so its render's state would still say "not installed".
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
      thenRef.current = () => {
        installedHere.current.add(appId);
        then();
      };
      setPending({ kind, mode });
      setOpen(true);
    },
    [],
  );
  useEffect(() => {
    const ask = held.current;
    if (!ready || !ask) return;
    held.current = null;
    ensureEditor(ask.kind, ask.mode, ask.then);
  }, [ready, ensureEditor]);

  // The dialog has closed itself by the time it calls onInstalled, and it never calls it for a download
  // that outlived its prompt; the next prompt replaces the continuation.
  const onInstalled = useCallback(() => {
    const then = thenRef.current;
    thenRef.current = null;
    then?.();
  }, []);

  const kind = pending?.kind ?? "doc";
  const dialog = useMemo(
    (): PluginInstallDialogProps => ({
      open,
      onOpenChange: setOpen,
      appId: editorPluginOf(kind),
      mode: pending?.mode ?? "open",
      onInstalled,
      surface,
    }),
    [open, kind, pending?.mode, onInstalled, surface],
  );

  return useMemo(() => ({ ensureEditor, isInstalled, canInstall, dialog }), [ensureEditor, isInstalled, canInstall, dialog]);
}

/**
 * `openUrl` with the gate in front of editor URLs: the one choke point every Drive open goes through, so an
 * editor link that reaches it without its own check (an app's "open original", a future caller) still asks.
 */
export function useGatedOpenUrl(openUrl: DocsOpenUrl, ensureEditor: EditorGate["ensureEditor"]): DocsOpenUrl {
  return useCallback(
    (url, disposition) => {
      const editor = parseEditorHref(url);
      if (editor) ensureEditor(editor.kind, "open", () => openUrl(url, disposition));
      else openUrl(url, disposition);
    },
    [openUrl, ensureEditor],
  );
}
