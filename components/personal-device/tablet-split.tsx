"use client";

// The /personal tablet layout (≥768px): the channel column beside the apps, with a divider the
// finger can drag. An app opens over the apps side only, so the channel stays in view. The
// channel's width is remembered on this device (localStorage; a blocked store keeps it for the
// session only).

import { useCallback, useState, type ReactNode } from "react";
import type { PanelSize } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useI18n } from "@/lib/i18n/context";

export const CHANNEL_WIDTH_KEY = "merchiva_personal_channel_width";
export const CHANNEL_DEFAULT_PX = 400;
export const CHANNEL_MIN_PX = 300;
/** What the apps side keeps however wide the channel gets. */
export const APPS_MIN_PX = 320;

/** A stored channel width, or the default when there is none (or it is not a number). */
export function storedChannelWidth(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n >= CHANNEL_MIN_PX ? Math.round(n) : CHANNEL_DEFAULT_PX;
}

function readWidth(): number {
  try {
    return storedChannelWidth(window.localStorage.getItem(CHANNEL_WIDTH_KEY));
  } catch {
    return CHANNEL_DEFAULT_PX;
  }
}

/** Apps grid columns for an apps side this wide (AppsGrid lays out 4 or 6). */
export function appColumns(widthPx: number): 4 | 6 {
  return widthPx >= 520 ? 6 : 4;
}

export function TabletSplit({ channel, apps }: {
  channel: ReactNode;
  /** Given the apps side's grid columns for its current width. */
  apps: (columns: 4 | 6) => ReactNode;
}) {
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const [initialWidth] = useState(readWidth);
  const [appsWidth, setAppsWidth] = useState(0);

  const onChannelResize = useCallback((size: PanelSize, _id: string | number | undefined, previous: PanelSize | undefined) => {
    // The mount call reports the initial layout; only a drag changes what is stored.
    if (previous === undefined) return;
    try {
      window.localStorage.setItem(CHANNEL_WIDTH_KEY, String(Math.round(size.inPixels)));
    } catch {
      // Kept for this session only.
    }
  }, []);

  const channelSlot = (
    <ResizablePanel
      key="channel"
      id="personal-channel"
      defaultSize={initialWidth}
      minSize={CHANNEL_MIN_PX}
      groupResizeBehavior="preserve-pixel-size"
      onResize={onChannelResize}
      className="h-full"
    >
      <div dir={dir} className="relative flex h-full min-h-0 flex-col overflow-hidden">{channel}</div>
    </ResizablePanel>
  );
  const handleSlot = (
    <ResizableHandle
      key="handle"
      withHandle
      aria-label={t("personalDevice.chat.resize")}
      // A finger-sized grab area around the 1px line.
      className="after:w-6"
    />
  );
  const appsSlot = (
    <ResizablePanel
      key="apps"
      id="personal-apps"
      minSize={APPS_MIN_PX}
      onResize={(size) => setAppsWidth(size.inPixels)}
      className="h-full"
    >
      <div dir={dir} className="relative h-full min-h-0 overflow-hidden">{apps(appColumns(appsWidth || 600))}</div>
    </ResizablePanel>
  );

  // react-resizable-panels resizes by DOM order: in RTL the group stays LTR with the panels in
  // visual order (the channel on the right), as the browser shell's sidebar does.
  return (
    <ResizablePanelGroup orientation="horizontal" dir={rtl ? "ltr" : undefined} className="min-h-0 flex-1">
      {rtl ? [appsSlot, handleSlot, channelSlot] : [channelSlot, handleSlot, appsSlot]}
    </ResizablePanelGroup>
  );
}
