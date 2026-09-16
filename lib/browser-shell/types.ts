import type { AppIcon } from "@/components/device/app-icons";
import type { Permissions } from "@/lib/types";
import type { AppMode } from "@/lib/app-mode";

export type TabId = string;     // `t_${10 base36 chars}`
export type EntryKey = string;  // `e_${10 base36 chars}`
/** "/manager…" pathname (no trailing slash), optional "?search" in original order, no hash, no `dialogs`. */
export type TabUrl = string;
/** pathname + search with params sorted — equality key. */
export type UrlKey = string;

export const NEW_TAB_URL = "/manager/new-tab";
/** The New Tab page is the home page: toolbar Home, APP_MODE_HOME.admin and the "/manager" alias. */
export const HOME_URL: TabUrl = NEW_TAB_URL;
/** The "/manager" alias: it redirects to HOME_URL and never becomes a tab URL itself. */
export const MANAGER_ALIAS_PATH = "/manager";
/**
 * App-launch paths (tab-state §9.2): a cold load on one of these means "open the app", so the
 * shell restores the last session instead of treating the URL as a deep link. The "/manager"
 * alias and the home page both qualify — /choose, "Switch to manager mode" and every post-login
 * redirect land on HOME_URL (APP_MODE_HOME.admin), and taking those as deep links would append
 * one more home tab every time (`findByUrlKey` never matches the New Tab page).
 */
export const LAUNCH_PATHS: ReadonlySet<string> = new Set([MANAGER_ALIAS_PATH, HOME_URL]);
export const MAX_TABS = 40;
export const MAX_ENTRIES_PER_TAB = 50;
export const MAX_CLOSED = 25;
export const INTENT_TTL_MS = 10_000;
export const SHELL_MOBILE_BREAKPOINT = 1024;

export interface HistoryEntry {
  readonly key: EntryKey;
  readonly url: TabUrl;
  readonly title?: string;      // set by useSetTabTitle
  readonly scrollY?: number;
  readonly at: number;
}
export interface BrowserTab {
  readonly id: TabId;
  readonly pinned: boolean;
  readonly openerTabId: TabId | null;
  readonly createdAt: number;
  readonly lastActiveAt: number;
  readonly history: { readonly entries: readonly HistoryEntry[]; readonly index: number };
}
export interface ClosedTabRecord { readonly id: string; readonly tab: BrowserTab; readonly index: number; readonly closedAt: number }
export interface TabsSnapshot {
  readonly status: "idle" | "ready";
  readonly scope: { readonly userId: string; readonly organizationId: string } | null;
  readonly tabs: readonly BrowserTab[];            // pinned first
  readonly activeTabId: TabId | null;              // tab whose page is rendered (null only while DETACHED)
  readonly requestedTabId: TabId | null;           // tab the chrome highlights
  readonly pendingTabIds: readonly TabId[];
  readonly closed: readonly ClosedTabRecord[];     // newest first
  readonly gate: { readonly tabId: TabId; readonly url: TabUrl } | null;  // paywall overlay (tab-state §16.4)
  readonly mountNonce: number;
}

/** The entry the tab currently shows. `history.index` is clamped so a malformed tab never yields undefined. */
export function currentEntry(tab: BrowserTab): HistoryEntry {
  const { entries, index } = tab.history;
  const i = Math.min(Math.max(index, 0), entries.length - 1);
  return entries[i];
}

export type PreviewKind = "dashboard" | "list" | "grid" | "doc" | "chat" | "calendar" | "form" | "blank";
export interface RouteDef {
  readonly prefix: string;                         // "/manager/inventory"
  readonly exact?: boolean;
  readonly titleKey: string;
  readonly icon: AppIcon;
  readonly kind?: "page" | "gate";
  readonly permissionKey?: keyof Permissions;
  readonly extraPermissionKey?: keyof Permissions; // personnel/team also needs team.view (sidebar.tsx:966)
  readonly listed?: boolean;                       // default false; true = nav section or child
  readonly section?: boolean;                      // top-level launcher/bookmarks-bar item
  readonly sectionHref?: TabUrl;                   // where the section tile navigates (default prefix)
  readonly parent?: string;                        // prefix of owning section
  readonly persist?: boolean;                      // default true
  readonly volatileParams?: readonly string[];
  readonly keywords?: readonly string[];           // English search aliases
  readonly mobileChrome?: "overlay" | "docked";    // default "overlay"
  readonly previewKind?: PreviewKind;              // default "list"
}
export type RouteAccess = "allowed" | "forbidden" | "featureOff" | "unknownRoute" | "notTabbable";
export interface AccessContext {
  readonly isOwner: boolean;
  can(section: keyof Permissions, action: "view"): boolean;
  readonly installedApps: ReadonlySet<string>;
  readonly appsReady: boolean;
  readonly appMode: AppMode | null;
  readonly personalMode: boolean;   // appMode === "personal"
  readonly isCapacitor: boolean;
}
export interface NavSection {
  readonly href: TabUrl; readonly titleKey: string; readonly icon: AppIcon;
  readonly permissionKey?: keyof Permissions;
  readonly children: readonly { readonly href: TabUrl; readonly titleKey: string; readonly icon: AppIcon }[];
}
export interface TabPresentation {
  readonly title: string; readonly icon: AppIcon; readonly url: TabUrl;
  readonly isNewTab: boolean; readonly route: RouteDef | null; readonly pending: boolean;
}
export interface OpenTabOptions {
  activate?: boolean;                                           // default true
  position?: "end" | "afterActive" | "afterOpenerGroup" | number; // default: activate ? "end" : "afterOpenerGroup"
  openerTabId?: TabId | null;
  dedupe?: "none" | "activateExisting";                         // default "none"
  pinned?: boolean;
}
export type OpenTabResult =
  | { ok: true; tabId: TabId; reused: boolean }
  | { ok: false; reason: "notTabbable" | "limit" | "noShell" };
export type OpenDisposition = "current" | "new-foreground" | "new-background";
export interface TabActions {
  openTab(url: string, opts?: OpenTabOptions): OpenTabResult;
  openNewTabPage(opts?: { query?: string }): OpenTabResult;
  openUrl(url: string, disposition: OpenDisposition): void;     // toasts browser.tabLimit itself
  activateTab(id: TabId): void;
  activateRelative(delta: 1 | -1): void;
  activateIndex(index: number | "last"): void;                  // 0-based
  closeTab(id: TabId, opts?: { source?: "pointer" | "keyboard" | "shortcut" | "menu" }): void;
  closeOtherTabs(id: TabId): void;                              // keeps pinned
  closeTabsToRight(id: TabId): void;                            // keeps pinned
  closeAllTabs(): void;                                         // all incl. pinned → one New Tab
  reorderTab(id: TabId, toIndex: number): void;                 // clamped inside pinned/unpinned partition
  setPinned(id: TabId, pinned: boolean): void;
  duplicateTab(id: TabId): OpenTabResult;
  reopenClosedTab(closedId?: string): OpenTabResult | null;
  navigateActive(url: string, opts?: { mode?: "push" | "replace" }): void;
  goBack(opts?: { closeToOpener?: boolean }): void;
  goForward(): void;
  goToEntry(tabId: TabId, index: number): void;
  reload(opts?: { hard?: boolean }): void;
  goHome(): void;
  prepareOrgSwitch(targetOrgId: string): void;
}
export type ShellLayout = "desktop" | "mobile";
export interface ShellInfo { readonly layout: ShellLayout; readonly coarse: boolean }
export interface ShellChromeRequest { immersive?: boolean; mobileChrome?: "overlay" | "docked" }
export type ShellCommand =
  | "newTab" | "closeTab" | "reopenClosedTab" | "nextTab" | "prevTab"
  | "selectTab1" | "selectTab2" | "selectTab3" | "selectTab4" | "selectTab5" | "selectTab6" | "selectTab7" | "selectTab8" | "selectLastTab"
  | "back" | "forward" | "reload" | "hardReload" | "home" | "duplicateTab"
  | "focusOmnibox" | "showTabOverview" | "toggleBookmarksBar" | "toggleSidebar";
export interface PageAction { readonly id: string; readonly label: string; readonly icon: AppIcon; onSelect(): void }
export interface ShellBookmark { readonly id: string; readonly url: TabUrl; readonly title: string; readonly createdAt: number }
export interface BrowsingHistoryItem { readonly url: TabUrl; readonly title: string; readonly at: number }
export interface ActiveNavState {
  readonly canGoBack: boolean;    // dialogOpen || tab.canGoBack || backClosesTab
  readonly canGoForward: boolean;
  readonly dialogOpen: boolean;   // useOpenDynamicUIElementCount() > 0 (dynamic-ui-element.tsx:107)
  readonly dialogTitle: string;   // useDynamicUIElementTitle() (:143)
  readonly dialogSwipe: number;   // useDynamicUIElementSwipeProgress() (:122)
  readonly backClosesTab: boolean;
}
export interface VirtualKeyboardState { readonly open: boolean; readonly inset: number; readonly editableFocused: boolean }
export interface ShortcutBinding {
  readonly command: ShellCommand; readonly code: string;
  readonly mod?: boolean; readonly ctrl?: boolean; readonly alt?: boolean; readonly shift?: boolean;
  readonly inEditable: boolean;
}
