"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  useActiveNavState,
  useActiveTab,
  useBookmarks,
  useMountedBrowserShell,
  usePageActions,
  useShortcutLabel,
  useTabActions,
  useTabPresentation,
} from "@/lib/browser-shell";
import { installContextMenuInterceptor, type ShellContextHit } from "@/lib/browser-shell/context-menu";
import { copyFromField, cutFromField, pasteIntoField, selectAllIn, type EditResult } from "@/lib/browser-shell/context-menu-edit";
import { buildContextMenu, type ContextMenuHandlers } from "@/lib/browser-shell/context-menu-items";
import type { ShellContextMenuItem } from "@/lib/browser-shell/context-menu";
import { buildShareUrl, copyText, openExternal } from "@/lib/browser-shell/mobile/share";
import { useT } from "@/lib/i18n/context";

/*
 * Merchiva's own right-click menu, mounted once for everything under /manager (app/manager/layout.tsx).
 * lib/browser-shell/context-menu.ts decides what a click landed on and when to leave the native menu
 * alone; context-menu-items.ts builds the rows; this component renders them and owns the side effects.
 *
 * The popup is a plain Menu anchored to a zero-size rect at the pointer, not a ContextMenu.Trigger:
 * a trigger would have to wrap the page, and it would then swallow right-clicks that the tab strip,
 * the bookmarks bar and the chat transcript already handle with menus of their own.
 *
 * `finalFocus={false}` keeps Base UI from pulling focus back on close — there is no trigger to
 * return it to, and Cut / Paste / Select all need the caret to stay in the field they act on. The
 * same items run on a macrotask so the popup has finished unmounting before the field is refocused.
 */

/** Runs after the popup has closed, so refocusing a field is not undone by the menu teardown. */
function defer(run: () => void): void {
  window.setTimeout(run, 0);
}

export function ShellContextMenu() {
  const t = useT();
  const actions = useTabActions();
  const bookmarks = useBookmarks();
  const nav = useActiveNavState();
  const tab = useActiveTab();
  const presentation = useTabPresentation(tab);
  const shellLayout = useMountedBrowserShell();
  const pageActions = usePageActions();
  const [hit, setHit] = useState<ShellContextHit | null>(null);
  const [open, setOpen] = useState(false);

  const backShortcut = useShortcutLabel("back");
  const forwardShortcut = useShortcutLabel("forward");
  const reloadShortcut = useShortcutLabel("reload");
  const newTabShortcut = useShortcutLabel("newTab");

  useEffect(
    () =>
      installContextMenuInterceptor((next) => {
        setHit(next);
        setOpen(true);
      }),
    [],
  );

  const report = useCallback(
    (result: EditResult, deniedKey: string) => {
      if (result === "denied") toast.error(t(deniedKey));
    },
    [t],
  );

  const copy = useCallback(
    (text: string) => {
      copyText(text).then(
        () => toast(t("browser.contextMenu.copied")),
        () => toast.error(t("browser.contextMenu.copyFailed")),
      );
    },
    [t],
  );

  const pageUrl = presentation.url;
  const pageBookmark = bookmarks.find(pageUrl);

  // A page's own actions (docs: Share, Comments, Outline, History) reach the desktop only here —
  // the page menu sheet that carries them on mobile has no desktop counterpart.
  const pageActionItems = useMemo<readonly ShellContextMenuItem[]>(
    () => pageActions.map((action) => ({ id: `page-action-${action.id}`, label: action.label, icon: action.icon, onSelect: action.onSelect })),
    [pageActions],
  );

  const handlers = useMemo<ContextMenuHandlers>(() => {
    const field = hit?.editable ?? null;
    return {
      openInNewTab: (url, activate) => actions.openUrl(url, activate ? "new-foreground" : "new-background"),
      openExternal: (url) => {
        openExternal(url).catch(() => toast.error(t("browser.contextMenu.openFailed")));
      },
      copy,
      copyUrl: (url, inApp) => copy(inApp ? buildShareUrl(url) : url),
      bookmark: (url, title) => {
        bookmarks.add(url, title);
        toast(t("browserDesktop.bookmarks.added"));
      },
      unbookmarkPage: () => {
        const existing = bookmarks.find(pageUrl);
        if (!existing) return;
        bookmarks.remove(existing.id);
        toast(t("browser.contextMenu.bookmarkRemoved"));
      },
      search: (query) => actions.openNewTabPage({ query }),
      cut: () => {
        if (field) defer(() => void cutFromField(field).then((r) => report(r, "browser.contextMenu.copyFailed")));
      },
      copySelectionInField: () => {
        if (field) defer(() => void copyFromField(field).then((r) => report(r, "browser.contextMenu.copyFailed")));
      },
      paste: () => {
        if (field) defer(() => void pasteIntoField(field).then((r) => report(r, "browser.contextMenu.pasteDenied")));
      },
      selectAll: () => {
        if (field) defer(() => report(selectAllIn(field), "browser.contextMenu.copyFailed"));
      },
      back: () => actions.goBack(),
      forward: () => actions.goForward(),
      reload: () => actions.reload(),
      newTab: () => actions.openNewTabPage(),
    };
  }, [actions, bookmarks, copy, hit, pageUrl, report, t]);

  const groups = useMemo(
    () =>
      hit
        ? buildContextMenu(hit, {
            t,
            inShell: shellLayout !== null,
            canGoBack: nav.canGoBack,
            canGoForward: nav.canGoForward,
            pageUrl,
            pageTitle: presentation.title,
            pageBookmarked: !!pageBookmark,
            pageActions: pageActionItems,
            shortcuts: { back: backShortcut, forward: forwardShortcut, reload: reloadShortcut, newTab: newTabShortcut },
            on: handlers,
          })
        : [],
    [
      hit, t, shellLayout, nav.canGoBack, nav.canGoForward, pageUrl, presentation.title, pageBookmark,
      pageActionItems, backShortcut, forwardShortcut, reloadShortcut, newTabShortcut, handlers,
    ],
  );

  // A zero-size rect at the pointer: Base UI positions and flips the popup around it exactly as
  // it would around a trigger element.
  const anchor = useMemo(
    () => (hit ? { getBoundingClientRect: () => new DOMRect(hit.x, hit.y, 0, 0) } : undefined),
    [hit],
  );

  if (!hit) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={2}
        finalFocus={false}
        className="min-w-56 max-w-72"
        aria-label={t("browser.contextMenu.label")}
        // A right-click on the menu itself must not reopen it on top of itself.
        data-shell-context-menu="off"
      >
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  disabled={item.disabled}
                  variant={item.destructive ? "destructive" : "default"}
                  onClick={item.onSelect}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
                </DropdownMenuItem>
              );
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
