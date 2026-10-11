"use client";

import { BrowserSidebar } from "@/components/browser-shell/desktop/sidebar";

/**
 * What the phone drawer shows: the desktop sidebar at touch size (store and account switcher,
 * nav, Settings). Its rows carry the same notification dots as on desktop; the menu button that
 * opens it carries one for all of them (menu-button.tsx).
 */
export function SidebarDrawer() {
  return <BrowserSidebar collapsed={false} variant="drawer" />;
}
