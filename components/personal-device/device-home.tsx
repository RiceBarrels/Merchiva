"use client";

// A device surface's home once someone is on it: the channel (the channel workspace around the
// walkie, ./personal-channel.tsx) and the apps — swipeable Channel | Apps pages on a phone, side by
// side with a draggable divider on a tablet (./tablet-split.tsx). The employee's own phone
// (/personal) and a store tablet after a PIN / QR log-in (/store) are the same home: on the tablet
// the chat is the operator's, written for them (OPERATOR_CHAT_WRITES), and the screen around it
// supplies what differs (who is on it, the app contents, the Leave / Log out action).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hapticLight } from "@/lib/haptics";
import type { ChatWrites } from "@/lib/spacetimedb/actions/chat";
import { AppsGrid, MiniAppShell, MiniAppSurface, PagesTrack, TalkBar, type DeviceApp } from "@/components/device";
import { PTT_HOLD_DELAY_MS } from "@/components/device/talk-bar";
import { walkieOnScreen } from "@/components/device/device-dots";
import { sendWalkieVoice } from "@/components/device/walkie-send";
import {
  useDevicePagerDots, useDeviceTileDots, useOpenAppDotClearing, useWalkieChatRead,
} from "@/components/device/use-device-dots";
import { DialogHostContext, type DialogHost } from "@/components/ui/dialog-host";
import { useChannelController, type WorkspaceIdentity } from "@/components/channel/workspace";
import { PersonalChannel } from "./personal-channel";
import { COMPOSER_BAR_PX, COMPOSER_BELOW_BAR_PX } from "./chat-composer";
import { TabletSplit } from "./tablet-split";

/** Which app is open, from where, and on which of its routes. Owned by the screen (a prompt may open an app). */
export interface DeviceAppsState {
  openApp: DeviceApp["id"] | null;
  openRoute: string | null;
  openOrigin: HTMLElement | null;
  open(id: DeviceApp["id"], origin?: HTMLElement | null): void;
  close(): void;
  /** In-app navigation (EmbeddedPage onNavigate): another app, on a route. */
  navigate(id: DeviceApp["id"], route: string | null): void;
}

export function useDeviceAppsState(): DeviceAppsState {
  const [openApp, setOpenApp] = useState<DeviceApp["id"] | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  // The tapped tile's icon: the app grows out of it (MiniAppShell).
  const [openOrigin, setOpenOrigin] = useState<HTMLElement | null>(null);
  return {
    openApp, openRoute, openOrigin,
    open: (id, origin) => { setOpenApp(id); setOpenRoute(null); setOpenOrigin(origin ?? null); },
    close: () => { setOpenApp(null); setOpenRoute(null); },
    navigate: (id, route) => { setOpenApp(id); setOpenRoute(route); },
  };
}

export function DeviceHome({
  organizationId, chatIdentity, chatWrites, apps, appsState, appTitle, renderApp, leaveLabel, onLeave,
  locked = false, idle = false, onRecordingChange, onChannelName, listOpen, onListOpenChange,
}: {
  organizationId: string;
  /** Whose chat this is: the phone's own identity, or the store tablet's operator (operatorRole set). */
  chatIdentity: WorkspaceIdentity;
  /** How the chat writes: the account's own (default), or OPERATOR_CHAT_WRITES on a store tablet. */
  chatWrites?: ChatWrites;
  apps: DeviceApp[];
  appsState: DeviceAppsState;
  appTitle: string;
  /** The open app's contents. */
  renderApp: (id: DeviceApp["id"], route: string | null) => ReactNode;
  /** The walkie bar's left action: Leave (the phone) or Log out (a store tablet). */
  leaveLabel: string;
  onLeave: () => void;
  /** The lock screen is up (the phone): an open app closes without animating, and nothing is read. */
  locked?: boolean;
  /** The idle dimmer is running down. */
  idle?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  /** The open conversation's name, for the lock screen. */
  onChannelName?: (name: string) => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const phone = useIsMobile();
  const [page, setPage] = useState(0);
  const [recording, setRecording] = useState(false);
  const { openApp, openRoute, openOrigin } = appsState;

  // On a tablet an open app leaves the channel in view, so only the phone counts it as covered.
  const onScreen = walkieOnScreen({ phone, page, appOpen: phone && openApp !== null, locked, idle });
  const ctl = useChannelController({
    me: chatIdentity,
    isMobile: true,
    openLatest: true,
    readable: onScreen,
    writes: chatWrites,
    // Picking a conversation closes the list and returns to the messages page, like the prototype.
    onOpened: () => { onListOpenChange(false); setPage(0); },
  });
  const active = ctl.active;
  const activeName = active?.name ?? "";
  useEffect(() => { onChannelName?.(activeName); }, [activeName, onChannelName]);
  const stepChannel = (step: number) => {
    const list = ctl.model.channels;
    if (list.length === 0) return;
    const at = list.findIndex((c) => c.id === active?.id);
    ctl.openChannel(list[(((at + step) % list.length) + list.length) % list.length].id);
  };

  // Notification dots: tiles and pager pages; the open tile's rows and the walkie's conversation clear.
  // (On a store tablet whose operator is not its account none show or clear: lib/notifications/viewer.ts.)
  const tileDots = useDeviceTileDots();
  const pagerDots = useDevicePagerDots();
  useOpenAppDotClearing(openApp);
  useWalkieChatRead(active?.id ?? null, onScreen);

  // Pages opened from the home itself (a new DM, a topic) push it aside and carry a visible Back:
  // there is no browser chrome here to go back with. An app's own pages use the app's host.
  const homeRef = useRef<HTMLDivElement>(null);
  const dialogHost = useMemo<DialogHost>(() => ({ pushTarget: () => homeRef.current }), []);

  const recordingChanged = (next: boolean) => { setRecording(next); onRecordingChange?.(next); };
  const openEntry = openApp ? apps.find((a) => a.id === openApp) ?? null : null;

  const appPanel = (
    <MiniAppShell
      open={openApp !== null}
      title={appTitle}
      app={openEntry}
      origin={openOrigin}
      // A lock closes the app under the lock screen: no close animation.
      instantClose={locked}
      swipeToClose
      onClose={appsState.close}
    >
      {openApp && renderApp(openApp, openRoute)}
    </MiniAppShell>
  );

  const talkBar = (
    <TalkBar
      leftAction={{ icon: LogOut, label: leaveLabel, onClick: () => { hapticLight(); onLeave(); } }}
      channelLabel={t("personalDevice.channelBtn")}
      onPrevChannel={() => stepChannel(-1)}
      onNextChannel={() => stepChannel(1)}
      onSend={async (r) => {
        const target = active && { conversationId: active.id, name: active.name };
        const status = await sendWalkieVoice(r, target, { organizationId, locale, t, send: ctl.value.writes.send });
        setPage(0);
        return status;
      }}
      onRecordingChange={recordingChanged}
      disabled={!active}
      overlayBottom={COMPOSER_BAR_PX + COMPOSER_BELOW_BAR_PX}
      // The bar swipes: a press of the mic that slides sideways at once is a swipe, not a hold.
      holdDelayMs={PTT_HOLD_DELAY_MS}
    />
  );
  const channel = (wrapList: (list: ReactNode) => ReactNode, className?: string) => (
    <PersonalChannel
      ctl={ctl}
      listOpen={listOpen}
      onListOpenChange={onListOpenChange}
      wrapList={wrapList}
      talkBar={talkBar}
      recording={recording}
      // On the phone, typing from the apps page brings the conversation back into view.
      onComposerFocus={phone ? () => setPage(0) : undefined}
      className={className}
    />
  );

  return (
    <DialogHostContext.Provider value={dialogHost}>
      <div ref={homeRef} className="relative flex min-h-0 flex-1 flex-col bg-background">
        {phone ? (
          <>
            {channel((list) => (
              <div className="relative min-h-0 flex-1">
                <PagesTrack
                  page={page}
                  onPageChange={(p) => { hapticLight(); setPage(p); }}
                  dots={pagerDots}
                  className="h-full"
                  pages={[
                    list,
                    <AppsGrid key="apps" apps={apps} onOpen={appsState.open} columns={4} size="md" dots={tileDots} className="h-full" />,
                  ]}
                />
              </div>
            ))}
            {appPanel}
          </>
        ) : (
          <TabletSplit
            channel={channel((list) => <div className="relative min-h-0 flex-1">{list}</div>, "relative flex h-full min-h-0 flex-col")}
            apps={(columns) => (
              // Its own surface: an app grows out of its tile and covers this side only.
              <MiniAppSurface pane className="h-full">
                {/* The surface is black (what shows round the grid as it recedes): the grid brings its own background. */}
                <AppsGrid apps={apps} onOpen={appsState.open} columns={columns} size="lg" dots={tileDots} className="h-full bg-background" />
                {appPanel}
              </MiniAppSurface>
            )}
          />
        )}
      </div>
    </DialogHostContext.Provider>
  );
}
