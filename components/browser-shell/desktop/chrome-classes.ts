/**
 * Class constants for the desktop chrome (desktop spec §3.7), mapped onto existing tokens:
 *   strip        light bg-muted (245)          dark bg-background (10)
 *   active tab,  light bg-background (255)     dark bg-card (23)
 *   toolbar, bookmarks bar
 *   omnibox      light bg-muted                dark bg-background
 * Radius: tabs rounded-t (4px), chips and strip buttons rounded (4px), popups rounded-[0.3rem].
 *
 * The frame carries `group/frame` and `data-density="fine" | "coarse"`; coarse sizes are
 * `group-data-[density=coarse]/frame:` variants (lead decision Q4).
 */

export const FRAME_CLASS =
  "group/frame relative flex h-[calc(100dvh-var(--merchiva-chrome-height,0px))] min-h-0 w-full flex-col overflow-hidden bg-muted text-foreground dark:bg-background";

export const SKIP_LINK_CLASS =
  "sr-only rounded border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground shadow-md focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[200] focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const STRIP_CLASS =
  "relative flex h-[40px] shrink-0 select-none items-end after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border group-data-[density=coarse]/frame:h-[44px]";

export const TABLIST_CLASS =
  "relative flex h-full min-w-0 items-end overflow-x-auto overflow-y-hidden no-scrollbar pt-[8px] data-[fade=left]:[mask-image:linear-gradient(to_right,transparent,#000_16px)] data-[fade=right]:[mask-image:linear-gradient(to_left,transparent,#000_16px)] data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]";

export const TAB_BASE_CLASS =
  "group/tab relative flex h-[32px] shrink-0 cursor-default items-center gap-1.5 rounded-t px-2.5 text-[12px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 group-data-[density=coarse]/frame:h-[36px]";

export const TAB_ACTIVE_CLASS =
  "z-10 -mb-px h-[33px] border-x border-t border-border bg-background text-foreground dark:bg-card group-data-[density=coarse]/frame:h-[37px]";

/** `text-foreground/70` instead of muted-foreground keeps 12px text at AA contrast on bg-muted (spec §8). */
export const TAB_INACTIVE_CLASS =
  "text-foreground/70 hover:bg-background/70 hover:text-foreground dark:text-muted-foreground dark:hover:bg-card/70 dark:hover:text-foreground";

export const TAB_DIVIDER_CLASS =
  "before:absolute before:start-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-border hover:before:opacity-0";

export const TAB_PINNED_CLASS = "justify-center px-0";

export const TAB_TITLE_CLASS =
  "min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%-14px),transparent)] rtl:[mask-image:linear-gradient(to_left,#000_calc(100%-14px),transparent)]";

export const TAB_CLOSE_CLASS =
  "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground group-data-[density=coarse]/frame:size-7";

export const TAB_CLOSE_HOVER_ONLY_CLASS = "opacity-0 group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100";

export const TAB_SHIFT_CLASS =
  "transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none";

export const TAB_DRAGGED_CLASS = "z-20 transition-none";

export const STRIP_BUTTON_CLASS =
  "mb-[3px] flex size-[28px] shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-card group-data-[density=coarse]/frame:mb-[4px] group-data-[density=coarse]/frame:size-9";

export const TOOLBAR_AREA_CLASS = "relative z-20 shrink-0 border-b border-border bg-background dark:bg-card";

export const TOOLBAR_ROW_CLASS =
  "flex h-[40px] items-center gap-0.5 px-1.5 group-data-[density=coarse]/frame:h-[48px] group-data-[density=coarse]/frame:gap-1";

export const TOOLBAR_BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground group-data-[density=coarse]/frame:size-9";

export const OMNIBOX_SHELL_CLASS =
  "relative mx-1.5 flex h-[30px] min-w-0 flex-1 items-center gap-1.5 rounded border border-transparent bg-muted px-1.5 text-[13px] transition-colors hover:bg-muted/70 dark:bg-background has-[input:focus]:border-ring has-[input:focus]:bg-background has-[input:focus]:ring-3 has-[input:focus]:ring-ring/50 dark:has-[input:focus]:bg-card group-data-[density=coarse]/frame:h-9";

export const STORE_CHIP_CLASS =
  "flex h-[22px] max-w-[180px] shrink-0 items-center gap-1.5 rounded px-1.5 text-[12px] font-medium text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-foreground/5 group-data-[density=coarse]/frame:h-7";

export const OMNIBOX_POPUP_CLASS =
  "absolute inset-x-0 top-full z-[100] mt-1 flex max-h-[min(480px,calc(100dvh-140px))] flex-col overflow-hidden rounded-[0.3rem] border border-border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0";

export const RESULT_ROW_CLASS =
  "flex h-8 cursor-default select-none items-center gap-2.5 px-2.5 text-[13px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground group-data-[density=coarse]/frame:h-10";

export const RESULT_SECONDARY_CLASS = "min-w-0 truncate font-mono text-[11px] text-muted-foreground";

export const RESULT_HINT_CLASS = "ms-auto shrink-0 ps-3 text-[11px] text-muted-foreground";

export const BOOKMARKS_BAR_CLASS =
  "flex h-[28px] items-center gap-0.5 overflow-hidden px-2 group-data-[density=coarse]/frame:h-9";

export const BOOKMARK_CHIP_CLASS =
  "flex h-6 min-w-0 max-w-[180px] shrink-0 cursor-default items-center gap-1.5 rounded px-2 text-[12px] font-medium text-foreground/80 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[active]:bg-muted data-[active]:text-foreground data-popup-open:bg-muted dark:hover:bg-background dark:data-[active]:bg-background dark:data-popup-open:bg-background group-data-[density=coarse]/frame:h-8";

export const UNREAD_BADGE_CLASS =
  "pointer-events-none absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9.5px] font-bold tabular-nums text-background";

export const CAPTION_BUTTON_CLASS =
  "flex h-full w-[46px] items-center justify-center text-foreground/80 outline-none transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10";

/** Danger tone on hover, as native Windows close buttons do. */
export const CAPTION_CLOSE_CLASS = "hover:bg-red-600 hover:text-white focus-visible:bg-red-600 focus-visible:text-white";

/** Shared chrome overrides for the base-nova context menu (desktop spec §11). */
export const CHROME_MENU_CLASS = "rounded-[0.3rem] border border-border ring-0";

/* ── Sidebar (desktop only) ─────────────────────────────────────────────────
 * Same surface as the toolbar (light bg-background, dark bg-card) so the chrome reads as one
 * frame around the page; the resize handle draws the only divider. Rows keep the legacy
 * sidebar's sizes: 13px medium labels, 18px glyphs, 4px radius, active = inverted fill.
 */

export const SIDEBAR_CLASS = "flex h-full w-full min-w-0 flex-col overflow-hidden bg-background dark:bg-card";

export const SIDEBAR_HEADER_CLASS =
  "flex h-[40px] shrink-0 items-center gap-2.5 border-b border-border px-3 group-data-[density=coarse]/frame:h-12";

/** Inline padding shared by the workspace switcher, the nav list and the pinned footer. */
export const SIDEBAR_PAD_CLASS = "px-2";

export const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 rounded px-2 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[density=coarse]/frame:py-2";

export const SIDEBAR_ROW_ACTIVE_CLASS = "bg-foreground text-background";

export const SIDEBAR_ROW_IDLE_CLASS = "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-background";

export const SIDEBAR_SUB_ROW_CLASS =
  "block truncate rounded px-2 py-1.5 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50";

export const SIDEBAR_ICON_BUTTON_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-background";

/**
 * Drag handle between the sidebar and the page region (also the drag-to-collapse target).
 *
 * RTL workaround: react-resizable-panels 4.11.1 is direction-blind. It takes the drag delta from
 * raw `clientX` (dist/react-resizable-panels.js:1184) and applies it to the panel that precedes
 * the separator in DOM order (:819-823), with no `dir` or computed-direction read anywhere in the
 * bundle, so under `dir="rtl"` — where DOM order runs right-to-left — the divider moves against
 * the pointer. desktop-browser-chrome.tsx therefore renders the panels in VISUAL order and pins
 * the group itself to `dir="ltr"`, while the sidebar and the page region re-declare the document
 * direction on their own elements. Keyboard resize and double-click reset ride the same DOM order,
 * so they are fixed with it.
 */
export const SIDEBAR_HANDLE_CLASS = "hover:bg-foreground/20 focus-visible:bg-foreground/20";
