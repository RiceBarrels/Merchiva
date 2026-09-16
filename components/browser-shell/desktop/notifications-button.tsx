"use client";

import { useCallback, useState } from "react";
import { Bell } from "lucide-react";
import { NotificationCenter, useUnreadCount } from "@/components/notification-center";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canonicalizeUrl, useTabActions } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { TOOLBAR_BUTTON_CLASS, UNREAD_BADGE_CLASS } from "./chrome-classes";
import { useOverlayBackHandler } from "./chrome-context";

/*
 * Bell with the unread counter (desktop spec §6.2). The popover hosts NotificationCenter;
 * a notification link inside /manager opens in the current tab, any other http(s) link
 * navigates the window. Non-http schemes (javascript:, data:) are ignored.
 */
export function NotificationsButton() {
  const t = useT();
  const actions = useTabActions();
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);

  useOverlayBackHandler(open, () => setOpen(false));

  const openInShell = useCallback(
    (href: string) => {
      setOpen(false);
      const canonical = canonicalizeUrl(href);
      if (canonical?.tabbable) {
        actions.openUrl(canonical.url, "current");
        return;
      }
      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (canonical || target.protocol === "http:" || target.protocol === "https:") window.location.assign(target.href);
    },
    [actions],
  );

  const title = t("notifications.title");
  const label = unread > 0 ? `${title} · ${fmt(t("notifications.unreadCount"), { n: unread })}` : title;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={label} className={`relative ${TOOLBAR_BUTTON_CLASS}`} />}
            />
          }
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span aria-hidden className={UNREAD_BADGE_CLASS}>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} aria-label={title} className="w-[380px] p-0">
        <div className="flex h-10 items-center border-b border-border px-3 text-[13px] font-medium">{title}</div>
        <div className="max-h-[min(520px,70vh)] overflow-y-auto">
          <NotificationCenter onNavigate={openInShell} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
