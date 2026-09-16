"use client";

import { ExternalLink, Link2, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { NEW_TAB_URL, useBookmarks } from "@/lib/browser-shell";
import { pathOfUrl } from "@/lib/browser-shell/mobile/labels";
import { useMobilePlatform } from "@/lib/browser-shell/mobile/platform";
import { buildShareUrl, copyText, openExternal } from "@/lib/browser-shell/mobile/share";
import { hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { SheetRow, ShellDrawer } from "./shell-drawer";

/** Copies a link and reports the result (spec §15): success haptic + toast, or an error toast carrying the URL. */
export function copyLinkWithFeedback(url: string, t: (key: string) => string): void {
  copyText(url)
    .then(() => {
      void hapticSuccess();
      toast.success(t("browserMobile.linkCopied"));
    })
    .catch(() => {
      toast.error(t("browserMobile.copyFailed"), { description: url });
    });
}

/** Adds or removes a favorite and confirms it (the sheet that triggered it closes). */
export function toggleFavoriteWithFeedback(
  bookmarks: ReturnType<typeof useBookmarks>,
  url: string,
  title: string,
  t: (key: string) => string,
): void {
  const existed = bookmarks.find(url) !== undefined;
  const bookmarked = bookmarks.toggle(url, title);
  if (bookmarked) {
    void hapticSuccess();
    toast.success(t("browserMobile.favoriteAdded"));
  } else if (existed) {
    toast(t("browserMobile.favoriteRemoved"));
  }
}

export interface ShareDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Canonical tab URL of the page being shared. */
  url: string;
  title: string;
}

/**
 * Share fallback when Web Share is unavailable (spec §15, lead decision Q5): copy the public link,
 * add to favorites, and open in the system browser inside the native app.
 */
export function ShareDrawer({ open, onOpenChange, url, title }: ShareDrawerProps) {
  const t = useT();
  const bookmarks = useBookmarks();
  const platform = useMobilePlatform();
  const shareUrl = open ? buildShareUrl(url) : "";
  const isNewTab = pathOfUrl(url) === NEW_TAB_URL;
  const bookmarked = !isNewTab && bookmarks.find(url) !== undefined;
  const close = () => onOpenChange(false);

  return (
    <ShellDrawer open={open} onOpenChange={onOpenChange} title={t("browserMobile.share")}>
      <div className="px-4 pb-3">
        <p className="truncate text-[14px] font-medium text-foreground">{title}</p>
        <p className="truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
          {shareUrl}
        </p>
      </div>
      <div className="border-t border-border">
        <SheetRow
          icon={Link2}
          onClick={() => {
            close();
            copyLinkWithFeedback(shareUrl, t);
          }}
        >
          {t("browserMobile.copyLink")}
        </SheetRow>
        {!isNewTab && (
          <SheetRow
            icon={bookmarked ? StarOff : Star}
            onClick={() => {
              close();
              toggleFavoriteWithFeedback(bookmarks, url, title, t);
            }}
          >
            {t(bookmarked ? "browserMobile.removeFromFavorites" : "browserMobile.addToFavorites")}
          </SheetRow>
        )}
        {platform.native && (
          <SheetRow
            icon={ExternalLink}
            onClick={() => {
              close();
              openExternal(shareUrl).catch(() => toast.error(t("browserMobile.openInBrowserFailed")));
            }}
          >
            {t("browserMobile.openInBrowser")}
          </SheetRow>
        )}
      </div>
    </ShellDrawer>
  );
}
