import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  RotateCw,
  Scissors,
  Search,
  Star,
  StarOff,
  TextCursorInput,
} from "lucide-react";
import type { ShellContextHit, ShellContextMenuItem } from "./context-menu";

/*
 * Turns a resolved right-click into the menu the shell renders. Pure: every side effect arrives
 * as a callback on `deps`, so the layout can be asserted in tests without a DOM or a tab store.
 *
 * Group order runs specific → general, the way Chrome's own menu does:
 *   1. items the page registered for the element (a row's own actions)
 *   2. the link, then the image, under the pointer
 *   3. the selected text
 *   4. the text field the click landed in
 *   5. the rendered page's own actions (useRegisterPageActions) — on the desktop this menu is
 *      the only place they surface, since only the mobile chrome has a page menu sheet
 *   6. the page: back / forward / reload / new tab / bookmark / copy link
 * Empty groups are dropped, so a click on blank space is just the page group. The single-tab
 * phone layout (single-tab.ts) has no tabs to open, so its menu has no new-tab items.
 */

export interface ShellContextMenuGroup {
  readonly id: string;
  readonly items: readonly ShellContextMenuItem[];
}

/** Everything the menu needs from the shell, gathered by the component that renders it. */
export interface ContextMenuDeps {
  readonly t: (key: string) => string;
  /** False in the legacy sidebar shell: tab and bookmark items are dropped. */
  readonly inShell: boolean;
  /** True on the single-tab phone layout: the new-tab and bookmark items are dropped (the phone shows neither tabs nor bookmarks). */
  readonly singleTab?: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  /** Current in-app URL and its tab title, for the bookmark and copy-link items. */
  readonly pageUrl: string;
  readonly pageTitle: string;
  readonly pageBookmarked: boolean;
  /** Actions the rendered page registered with `useRegisterPageActions`, already localized. */
  readonly pageActions: readonly ShellContextMenuItem[];
  readonly shortcuts: Readonly<Partial<Record<"back" | "forward" | "reload" | "newTab", string | null>>>;
  readonly on: ContextMenuHandlers;
}

export interface ContextMenuHandlers {
  openInNewTab(url: string, activate: boolean): void;
  openExternal(url: string): void;
  copy(text: string): void;
  /** `inApp` URLs are copied as a shareable absolute link; anything else verbatim. */
  copyUrl(url: string, inApp: boolean): void;
  bookmark(url: string, title: string): void;
  unbookmarkPage(): void;
  search(query: string): void;
  cut(): void;
  copySelectionInField(): void;
  paste(): void;
  selectAll(): void;
  back(): void;
  forward(): void;
  reload(): void;
  newTab(): void;
}

/** Longest search / preview snippet shown inside a menu label. */
const SNIPPET_MAX = 24;

/** Collapses whitespace and ellipsizes, so a paragraph-long selection stays one readable row. */
export function snippet(text: string, max: number = SNIPPET_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function group(id: string, items: readonly (ShellContextMenuItem | null)[]): ShellContextMenuGroup | null {
  const present = items.filter((item): item is ShellContextMenuItem => item !== null);
  return present.length > 0 ? { id, items: present } : null;
}

function linkGroup(hit: ShellContextHit, deps: ContextMenuDeps): ShellContextMenuGroup | null {
  const { link } = hit;
  if (!link) return null;
  const { t, on } = deps;
  const inApp = link.inApp;
  const tabs = deps.inShell && !deps.singleTab;
  return group("link", [
    inApp && tabs
      ? { id: "link-new-tab", label: t("browser.contextMenu.openInNewTab"), icon: ExternalLink, onSelect: () => on.openInNewTab(inApp, true) }
      : null,
    inApp && tabs
      ? { id: "link-background-tab", label: t("browser.contextMenu.openInBackgroundTab"), icon: ExternalLink, onSelect: () => on.openInNewTab(inApp, false) }
      : null,
    // An external href (docs site, POS console, mailto:) leaves the app entirely.
    !inApp
      ? { id: "link-external", label: t("browser.contextMenu.openInBrowser"), icon: ExternalLink, onSelect: () => on.openExternal(link.href) }
      : null,
    { id: "link-copy", label: t("browser.contextMenu.copyLink"), icon: LinkIcon, onSelect: () => on.copyUrl(inApp ?? link.href, inApp !== null) },
    inApp && deps.inShell && !deps.singleTab
      ? { id: "link-bookmark", label: t("browser.contextMenu.bookmarkLink"), icon: Star, onSelect: () => on.bookmark(inApp, link.text || inApp) }
      : null,
  ]);
}

function imageGroup(hit: ShellContextHit, deps: ContextMenuDeps): ShellContextMenuGroup | null {
  const { image } = hit;
  if (!image) return null;
  const { t, on } = deps;
  return group("image", [
    { id: "image-open", label: t("browser.contextMenu.openImage"), icon: ImageIcon, onSelect: () => on.openExternal(image.src) },
    { id: "image-copy", label: t("browser.contextMenu.copyImageLink"), icon: Copy, onSelect: () => on.copyUrl(image.src, false) },
  ]);
}

function selectionGroup(hit: ShellContextHit, deps: ContextMenuDeps): ShellContextMenuGroup | null {
  const text = hit.selection;
  if (!text) return null;
  const { t, on } = deps;
  return group("selection", [
    { id: "selection-copy", label: t("browser.contextMenu.copy"), icon: Copy, onSelect: () => on.copy(text) },
    deps.inShell
      ? {
          id: "selection-search",
          label: t("browser.contextMenu.searchFor").replace("{text}", snippet(text)),
          icon: Search,
          onSelect: () => on.search(text),
        }
      : null,
  ]);
}

function editableGroup(hit: ShellContextHit, deps: ContextMenuDeps): ShellContextMenuGroup | null {
  const field = hit.editable;
  if (!field) return null;
  const { t, on } = deps;
  // A password field never offers its contents to the clipboard.
  const canRead = field.hasSelection && !field.masked;
  return group("editable", [
    { id: "field-cut", label: t("browser.contextMenu.cut"), icon: Scissors, disabled: !canRead || !field.writable, onSelect: on.cut },
    { id: "field-copy", label: t("browser.contextMenu.copy"), icon: Copy, disabled: !canRead, onSelect: on.copySelectionInField },
    { id: "field-paste", label: t("browser.contextMenu.paste"), icon: ClipboardPaste, disabled: !field.writable, onSelect: on.paste },
    { id: "field-select-all", label: t("browser.contextMenu.selectAll"), icon: TextCursorInput, disabled: !field.hasContent, onSelect: on.selectAll },
  ]);
}

function pageActionsGroup(deps: ContextMenuDeps): ShellContextMenuGroup | null {
  return group("page-actions", deps.pageActions);
}

function pageGroup(deps: ContextMenuDeps): ShellContextMenuGroup | null {
  const { t, on, shortcuts } = deps;
  const bookmarked = deps.pageBookmarked;
  return group("page", [
    { id: "page-back", label: t("browser.actions.back"), icon: ArrowLeft, disabled: !deps.canGoBack, shortcut: shortcuts.back ?? undefined, onSelect: on.back },
    { id: "page-forward", label: t("browser.actions.forward"), icon: ArrowRight, disabled: !deps.canGoForward, shortcut: shortcuts.forward ?? undefined, onSelect: on.forward },
    { id: "page-reload", label: t("browser.actions.reload"), icon: RotateCw, shortcut: shortcuts.reload ?? undefined, onSelect: on.reload },
    deps.inShell && !deps.singleTab
      ? { id: "page-new-tab", label: t("browser.actions.newTab"), icon: Plus, shortcut: shortcuts.newTab ?? undefined, onSelect: on.newTab }
      : null,
    deps.inShell && !deps.singleTab
      ? bookmarked
        ? { id: "page-unbookmark", label: t("browser.contextMenu.removeBookmark"), icon: StarOff, onSelect: on.unbookmarkPage }
        : { id: "page-bookmark", label: t("browser.contextMenu.bookmarkPage"), icon: Star, onSelect: () => on.bookmark(deps.pageUrl, deps.pageTitle) }
      : null,
    { id: "page-copy-link", label: t("browser.contextMenu.copyPageLink"), icon: LinkIcon, onSelect: () => on.copyUrl(deps.pageUrl, true) },
  ]);
}

/** The whole menu for one right-click, as groups separated by a rule. Never empty. */
export function buildContextMenu(hit: ShellContextHit, deps: ContextMenuDeps): readonly ShellContextMenuGroup[] {
  return [
    group("custom", hit.custom),
    linkGroup(hit, deps),
    imageGroup(hit, deps),
    selectionGroup(hit, deps),
    editableGroup(hit, deps),
    pageActionsGroup(deps),
    pageGroup(deps),
  ].filter((entry): entry is ShellContextMenuGroup => entry !== null);
}
