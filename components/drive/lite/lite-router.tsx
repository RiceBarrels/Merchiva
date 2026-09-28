"use client";

// The Drive lite app's screens (drive-ui §14.2): a stack inside the device panel — home (a tab, a folder, a
// member's files), a file's preview, "From other apps", Trash, and the Docs / Sheets / Slides editors in their
// phone layout — with the bottom sheets over them. The top screen renders; Back pops it.
//
// A panel has no URL of its own, so navigation is caught in two places, as in DocsLite:
//   · DocsOpenProvider replaces `openUrl` for everything the editors and Drive's own code open: an editor link
//     opens that editor on top, any other /manager link (Drive home, Docs home, an editor's Back) returns to the
//     last home screen (lite-state.ts openUrlInStack);
//   · the click capture below catches plain /manager anchors (the Docs editor's back link) the same way.
// Nothing leaves the panel. A text document while the Docs app is not installed stays closed, and says so.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { LiteLoading } from "@/components/device/apps/lite";
import { DocsOpenProvider, type DocsOpenUrl } from "@/components/docs/docs-open-context";
import { DriveEditorScreen } from "@/components/drive/editor-host";
import type { DriveSection } from "@/components/drive/model/types";
import { isManagerRouteEnabled } from "@/lib/device-apps";
import { useDriveTokenBridge } from "@/lib/drive/use-drive-token";
import { useT } from "@/lib/i18n/context";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";
import { LiteActionsDrawer, LiteConfirmDrawer, LiteDetailsDrawer, LiteSpaceChangeDrawer } from "./lite-actions-drawer";
import { LiteApps } from "./lite-apps";
import { LiteDriveProvider, NO_PANEL, type LiteDriveContextValue, type LiteNav, type LitePanels, type LitePanelState } from "./lite-context";
import { LiteFolderPicker } from "./lite-folder-picker";
import { LiteDriveHome } from "./lite-home";
import { LiteNameDrawer } from "./lite-name-drawer";
import { LiteNoticeDrawer } from "./lite-notice";
import { LitePreview } from "./lite-preview";
import {
  blockedByDocs, homeScreen, LITE_TAB_SECTION, openUrlInStack, popScreen, popScreenIfTop, pushScreen, replaceTop, screenBelow, screenKey,
  type LiteDriveScreen, type LiteTab,
} from "./lite-state";
import { LiteTrash } from "./lite-trash";
import { useLiteDrive } from "./use-lite-drive";
import { useLiteRunner } from "./use-lite-runner";

export type { LiteDriveScreen } from "./lite-state";

export interface DriveLiteRouterProps {
  organizationId: string;
  /** The screens to start with, first to top; default: the Mine tab. */
  initialScreens?: readonly LiteDriveScreen[];
}

function sectionOf(screen: LiteDriveScreen): DriveSection {
  if (screen.kind === "home") return LITE_TAB_SECTION[screen.tab];
  return screen.kind === "trash" ? "trash" : screen.kind === "apps" ? "apps" : "my";
}

function Screen({ screen }: { screen: LiteDriveScreen }) {
  switch (screen.kind) {
    case "home":
      return <LiteDriveHome screen={screen} />;
    case "preview":
      return <LitePreview previewKey={screen.key} />;
    case "editor":
      return (
        <Suspense fallback={<LiteLoading />}>
          <DriveEditorScreen kind={screen.docKind} documentId={screen.id} isNew={screen.isNew} mobile />
        </Suspense>
      );
    case "apps":
      return <LiteApps screen={screen} />;
    case "trash":
      return <LiteTrash />;
  }
}

export function DriveLiteRouter({ organizationId, initialScreens }: DriveLiteRouterProps) {
  const t = useT();
  useDriveTokenBridge();
  const [stack, setStack] = useState<LiteDriveScreen[]>(() =>
    initialScreens && initialScreens.length > 0 ? [...initialScreens] : [homeScreen("mine")],
  );
  const [panelState, setPanelState] = useState<LitePanelState>(NO_PANEL);
  const top = stack[stack.length - 1];
  const below = screenBelow(stack);
  const rootRef = useRef<HTMLDivElement>(null);

  const docsInstalled = isManagerRouteEnabled("/manager/docs", useDeviceApps().installed);
  const open = useCallback<DocsOpenUrl>(
    (url) => {
      if (blockedByDocs(url, docsInstalled)) {
        toast(t("device.lite.drive.docsOff"));
        return;
      }
      setStack((prev) => openUrlInStack(prev, url));
    },
    [docsInstalled, t],
  );
  const setTab = useCallback((tab: LiteTab) => setStack([homeScreen(tab)]), []);
  const showMyFiles = useCallback(() => setTab("mine"), [setTab]);

  const drive = useLiteDrive({ organizationId, docsInstalled, openInPanel: open, section: sectionOf(top), showMyFiles });

  const nav = useMemo(
    (): LiteNav => ({
      top,
      below,
      push: (screen) => setStack((prev) => pushScreen(prev, screen)),
      pop: () => setStack(popScreen),
      popIfTop: (screen) => setStack((prev) => popScreenIfTop(prev, screen)),
      replaceTop: (screen) => setStack((prev) => replaceTop(prev, screen)),
      setTab,
      openUrl: open,
    }),
    [top, below, setTab, open],
  );

  const panels = useMemo((): LitePanels => {
    const show = (patch: Partial<LitePanelState> & Pick<LitePanelState, "open">) => setPanelState((prev) => ({ ...prev, ...patch }));
    return {
      state: panelState,
      openActions: (entry) => show({ open: "actions", actions: entry }),
      openDetails: (entry) => show({ open: "details", details: entry }),
      openName: (name) => show({ open: "name", name }),
      openMove: (entries) => show({ open: "move", move: entries }),
      openConfirm: (confirm) => show({ open: "confirm", confirm }),
      openSpaceChange: (plan) => show({ open: "space", space: plan }),
      openNotice: () => show({ open: "notice" }),
      close: () => setPanelState((prev) => ({ ...prev, open: null })),
      closeIf: (kind, value) => setPanelState((prev) => (prev.open === kind && prev[kind] === value ? { ...prev, open: null } : prev)),
    };
  }, [panelState]);

  const runner = useLiteRunner(drive, nav, panels);
  const value = useMemo(
    (): LiteDriveContextValue => ({ drive, nav, panels, act: runner.act, openEntry: runner.openEntry }),
    [drive, nav, panels, runner],
  );

  // A new screen starts at its top (the panel's scrollers, not this element; the page behind stays as it is).
  const key = screenKey(top);
  useEffect(() => {
    for (let el = rootRef.current?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  }, [key]);

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    const href = anchor?.getAttribute("href") ?? "";
    if (!href.startsWith("/manager")) return;
    event.preventDefault();
    event.stopPropagation();
    open(href, "current");
  };

  return (
    <LiteDriveProvider value={value}>
      <DocsOpenProvider open={open}>
        <div ref={rootRef} onClickCapture={onClickCapture} data-lite-screen={top.kind} className="flex h-full min-h-0 flex-col">
          <Screen key={key} screen={top} />
        </div>
        <LiteActionsDrawer />
        <LiteDetailsDrawer />
        <LiteConfirmDrawer />
        <LiteSpaceChangeDrawer />
        <LiteNameDrawer />
        <LiteFolderPicker />
        <LiteNoticeDrawer />
      </DocsOpenProvider>
    </LiteDriveProvider>
  );
}
