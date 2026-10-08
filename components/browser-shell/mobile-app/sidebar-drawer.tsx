"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { BrowserSidebar } from "@/components/browser-shell/desktop/sidebar";
import {
  SIDEBAR_DRAWER_ROW_CLASS,
  SIDEBAR_ROW_CLASS,
  SIDEBAR_ROW_IDLE_CLASS,
} from "@/components/browser-shell/desktop/chrome-classes";
import { ShellDrawer } from "@/components/browser-shell/mobile/shell-drawer";
import { NotificationCenter, useUnreadCount } from "@/components/notification-center";
import { useShellBackHandler, useTabActions } from "@/lib/browser-shell";
import { notificationTarget } from "@/lib/browser-shell/mobile-app/notification-link";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

/** Unread count beside a row label (the old phone page menu's badge). */
function UnreadCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-[9.5px] font-bold tabular-nums text-background"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * What the phone drawer shows: the desktop sidebar at touch size (store and account switcher,
 * nav, Settings) plus Notifications, which on a phone has no toolbar bell to live in. The
 * notification center opens as a bottom sheet over everything; a notification that links into the
 * app closes the drawer and opens there.
 */
export function SidebarDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useT();
  const actions = useTabActions();
  const unread = useUnreadCount();
  const [notifications, setNotifications] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setNotifications(false);
  }

  // The sheet carries data-shell-sheet, so Android back reaches it through the shell stack.
  useShellBackHandler(() => {
    setNotifications(false);
    return true;
  }, open && notifications);

  const openTarget = (href: string) => {
    const target = notificationTarget(href, window.location.href);
    if (!target) return;
    if (target.kind === "window") {
      window.location.assign(target.href);
      return;
    }
    setNotifications(false);
    onClose();
    actions.navigateActive(target.url);
  };

  const title = t("notifications.title");
  const notificationsRow = (
    <button
      type="button"
      onClick={() => setNotifications(true)}
      aria-label={unread > 0 ? `${title} · ${fmt(t("notifications.unreadCount"), { n: unread })}` : title}
      className={cn("relative w-full text-start", SIDEBAR_ROW_CLASS, SIDEBAR_ROW_IDLE_CLASS, SIDEBAR_DRAWER_ROW_CLASS)}
    >
      <Bell aria-hidden className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <UnreadCount count={unread} />
    </button>
  );

  return (
    <>
      <BrowserSidebar collapsed={false} variant="drawer" extraRows={notificationsRow} />
      <ShellDrawer
        open={open && notifications}
        onOpenChange={(next) => {
          if (!next) setNotifications(false);
        }}
        title={title}
      >
        <NotificationCenter onNavigate={openTarget} />
      </ShellDrawer>
    </>
  );
}
