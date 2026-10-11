"use client";

import type { Ref } from "react";
import { Menu } from "lucide-react";
import { SIDEBAR_ELEMENT_ID } from "@/components/browser-shell/desktop/sidebar";
import { CORNER_BUTTON_CLASS, CORNER_OFFSET_PX } from "@/components/ui/corner-button";
import { NotificationDot } from "@/components/ui/notification-dot";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { DOT_FILTERS } from "@/lib/notifications/dots";
import { useAnyDot } from "@/lib/notifications/dots-context";
import { cn } from "@/lib/utils";

/**
 * The round menu button in the page's top start corner (components/ui/corner-button.ts). It sits
 * inside `#mobile-content`, so a DynamicUIElement page pushes it aside with the page and covers
 * it, and the frame's body padding already clears the notch. The drawer's rows are off screen
 * behind it, so it carries one notification dot for all of them (only rows with a nav row: Mr.
 * Merchiva has none on the phone).
 */
export function MenuButton({
  ref,
  expanded,
  onOpen,
}: {
  ref?: Ref<HTMLButtonElement>;
  expanded: boolean;
  onOpen(): void;
}) {
  const t = useT();
  const dot = useAnyDot(DOT_FILTERS.navRows);
  const label = t("components.mobile.openMenu");
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={dot ? fmt(t("notify.dot.withName"), { name: label }) : label}
      aria-expanded={expanded}
      aria-controls={SIDEBAR_ELEMENT_ID}
      className={cn(CORNER_BUTTON_CLASS, "absolute z-30")}
      style={{ top: CORNER_OFFSET_PX, insetInlineStart: CORNER_OFFSET_PX }}
    >
      <Menu aria-hidden className="h-5 w-5" />
      {/* On the circle's rim at its top end, not the square's corner. */}
      <NotificationDot show={dot} className="top-0.5 end-0.5" />
    </button>
  );
}
