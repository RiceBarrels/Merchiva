"use client";

import type { Ref } from "react";
import { Menu } from "lucide-react";
import { SIDEBAR_ELEMENT_ID } from "@/components/browser-shell/desktop/sidebar";
import { UNREAD_BADGE_CLASS } from "@/components/browser-shell/desktop/chrome-classes";
import { CORNER_BUTTON_CLASS, CORNER_OFFSET_PX } from "@/components/ui/corner-button";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/**
 * The round menu button in the page's top start corner (components/ui/corner-button.ts). It sits
 * inside `#mobile-content`, so a DynamicUIElement page pushes it aside with the page and covers
 * it, and the frame's body padding already clears the notch. The unread count rides on it, as it
 * rode on the old address bar's store logo.
 */
export function MenuButton({
  ref,
  expanded,
  unread,
  onOpen,
}: {
  ref?: Ref<HTMLButtonElement>;
  expanded: boolean;
  unread: number;
  onOpen(): void;
}) {
  const t = useT();
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={t("components.mobile.openMenu")}
      aria-expanded={expanded}
      aria-controls={SIDEBAR_ELEMENT_ID}
      className={cn(CORNER_BUTTON_CLASS, "absolute z-30")}
      style={{ top: CORNER_OFFSET_PX, insetInlineStart: CORNER_OFFSET_PX }}
    >
      <Menu aria-hidden className="h-5 w-5" />
      {unread > 0 ? (
        <span aria-hidden className={UNREAD_BADGE_CLASS}>
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
