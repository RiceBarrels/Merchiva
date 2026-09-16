"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronsRight } from "lucide-react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { PERSONAL_MODE_HREFS } from "@/lib/app-mode";
import {
  dispositionFromPointer,
  getRouteAccess,
  matchRoute,
  useAccessContext,
  useBookmarks,
  useTabActions,
  type OpenDisposition,
  type ShellBookmark,
  type TabUrl,
} from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { BookmarkEditForm } from "./bookmark-star";
import { useBookmarksBarVisible } from "./bookmarks-bar-state";
import { BOOKMARKS_BAR_CLASS, BOOKMARK_CHIP_CLASS, CHROME_MENU_CLASS } from "./chrome-classes";
import { useOverlayBackHandler } from "./chrome-context";
import { useChromeEnv } from "./chrome-env";
import { describeUrl, pathnameOf } from "./tab-describe";

export { useBookmarksBarVisible } from "./bookmarks-bar-state";

/*
 * Bookmarks bar (desktop spec §3.4): the user's own bookmarks, plus an overflow menu for
 * whatever doesn't fit. Section navigation lives in the sidebar, so the bar holds nothing but
 * bookmarks and does not render at all until the user stars a page.
 *   A bookmark whose route is no longer permitted is hidden, never deleted.
 *   Click → current tab · Mod-click / middle-click → background tab · Mod+Shift-click → foreground tab.
 */

interface ContextTarget {
  readonly kind: "bookmark" | "bar";
  readonly id: string | null;
  readonly anchor: Element | null;
}

function personalModeAllows(url: TabUrl): boolean {
  const route = matchRoute(pathnameOf(url));
  if (!route) return false;
  return PERSONAL_MODE_HREFS.has(route.sectionHref ?? route.prefix) || PERSONAL_MODE_HREFS.has(route.prefix);
}

export function BookmarksBar() {
  const ctx = useAccessContext();
  const bookmarks = useBookmarks();

  const visibleBookmarks = useMemo(
    () =>
      bookmarks.items.filter(
        (bookmark) => getRouteAccess(bookmark.url, ctx) === "allowed" && (!ctx.personalMode || personalModeAllows(bookmark.url)),
      ),
    [bookmarks.items, ctx],
  );

  // An empty bar would be a stray 28px strip under the toolbar: render nothing instead. The
  // visibility setting still decides whether the bar may show at all (desktop-browser-chrome).
  if (visibleBookmarks.length === 0) return null;
  return <BookmarksBarRow items={visibleBookmarks} />;
}

function BookmarksBarRow({ items }: { items: readonly ShellBookmark[] }) {
  const t = useT();
  const env = useChromeEnv();
  const actions = useTabActions();
  const bookmarks = useBookmarks();
  const [, setBarVisible] = useBookmarksBarVisible();

  const barRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState<number>(Number.MAX_SAFE_INTEGER);
  const [menuOpen, setMenuOpen] = useState(false);
  const [target, setTarget] = useState<ContextTarget>({ kind: "bar", id: null, anchor: null });
  const [renaming, setRenaming] = useState<{ bookmark: ShellBookmark; anchor: Element } | null>(null);

  useOverlayBackHandler(menuOpen, () => setMenuOpen(false));
  useOverlayBackHandler(renaming !== null, () => setRenaming(null));

  // Fit as many chips as the bar allows; the rest go to the overflow menu. Chip widths come
  // from an invisible measuring row rendered with identical classes (so breakpoints match).
  useEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    let frame = 0;
    const compute = () => {
      frame = 0;
      const barStyle = window.getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(barStyle.paddingLeft) - parseFloat(barStyle.paddingRight);
      const gap = parseFloat(window.getComputedStyle(measure).columnGap) || 0;
      const chips = Array.from(measure.querySelectorAll<HTMLElement>("[data-measure-entry]"));
      const overflowWidth = measure.querySelector<HTMLElement>("[data-measure-overflow]")?.getBoundingClientRect().width ?? 28;

      const widthUpTo = (count: number) => {
        let total = 0;
        for (let i = 0; i < count; i++) {
          if (i > 0) total += gap;
          total += chips[i]?.getBoundingClientRect().width ?? 0;
        }
        return total;
      };

      if (widthUpTo(chips.length) <= inner) {
        setFitCount(chips.length);
        return;
      }
      const budget = inner - overflowWidth - gap;
      let fit = 0;
      while (fit < chips.length && widthUpTo(fit + 1) <= budget) fit++;
      setFitCount(fit);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(compute);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    observer.observe(measure);
    schedule();
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  const shown = Math.min(fitCount, items.length);
  const visibleEntries = items.slice(0, shown);
  const overflowEntries = items.slice(shown);

  const open = (url: TabUrl, disposition: OpenDisposition) => actions.openUrl(url, disposition);

  const menuItemOpen = (url: TabUrl) => (event: MouseEvent<HTMLElement>) => {
    open(url, dispositionFromPointer(event, env.isMac, env.isTauri));
  };

  const onContextMenuCapture = (event: MouseEvent<HTMLElement>) => {
    const el = event.target instanceof Element ? event.target : null;
    const bookmarkEl = el?.closest<HTMLElement>("[data-bookmark-id]");
    if (bookmarkEl?.dataset.bookmarkId) {
      setTarget({ kind: "bookmark", id: bookmarkEl.dataset.bookmarkId, anchor: bookmarkEl });
      return;
    }
    setTarget({ kind: "bar", id: null, anchor: null });
  };

  const targetBookmark = target.kind === "bookmark" ? items.find((bookmark) => bookmark.id === target.id) ?? null : null;

  // Chips are real in-app links: a plain click navigates the current tab through Next's <Link>,
  // and core's link interceptor turns Mod-click / middle-click / Mod+Shift-click into tabs
  // (the same dispositions as openUrl). Only Windows middle-button autoscroll is suppressed here.
  const renderChip = (bookmark: ShellBookmark, measuring: boolean) => {
    const { icon: Icon } = describeUrl(bookmark.url, bookmark.title, t);
    return (
      <Link
        key={bookmark.id}
        href={bookmark.url}
        prefetch={false}
        tabIndex={measuring ? -1 : undefined}
        data-bookmark-id={measuring ? undefined : bookmark.id}
        data-measure-entry={measuring ? "" : undefined}
        title={measuring ? undefined : bookmark.title}
        className={cn(BOOKMARK_CHIP_CLASS, "max-w-[120px] xl:max-w-[180px]")}
        onMouseDown={
          measuring
            ? undefined
            : (event: MouseEvent<HTMLAnchorElement>) => {
                if (event.button === 1) event.preventDefault();
              }
        }
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{bookmark.title}</span>
      </Link>
    );
  };

  return (
    <>
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger className="contents">
          <nav
            ref={barRef}
            aria-label={t("browserDesktop.bookmarks.bar")}
            data-slot="browser-bookmarks-bar"
            className={cn(BOOKMARKS_BAR_CLASS, "relative")}
            onContextMenuCapture={onContextMenuCapture}
          >
            {visibleEntries.map((bookmark) => renderChip(bookmark, false))}
            {overflowEntries.length > 0 ? (
              <OverflowMenu entries={overflowEntries} onMenuItem={menuItemOpen} label={t("browserDesktop.bookmarks.more")} />
            ) : null}
            <div
              ref={measureRef}
              aria-hidden
              inert
              className={cn(BOOKMARKS_BAR_CLASS, "pointer-events-none invisible absolute start-0 top-0 w-max px-0")}
            >
              {items.map((bookmark) => renderChip(bookmark, true))}
              <span data-measure-overflow="" className={cn(BOOKMARK_CHIP_CLASS, "px-1.5")}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </nav>
        </ContextMenuTrigger>
        <ContextMenuContent className={cn(CHROME_MENU_CLASS, "min-w-52")}>
          {target.kind === "bookmark" && targetBookmark ? (
            <>
              <ContextMenuItem className="text-[13px]" onClick={() => open(targetBookmark.url, "new-background")}>
                {t("browserDesktop.bookmarks.openNewTab")}
              </ContextMenuItem>
              <ContextMenuItem
                className="text-[13px]"
                onClick={() => {
                  const anchor = target.anchor;
                  if (!anchor) return;
                  window.requestAnimationFrame(() => setRenaming({ bookmark: targetBookmark, anchor }));
                }}
              >
                {t("browserDesktop.bookmarks.rename")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-[13px]" variant="destructive" onClick={() => bookmarks.remove(targetBookmark.id)}>
                {t("browserDesktop.bookmarks.remove")}
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuCheckboxItem className="pe-8 text-[13px]" checked onCheckedChange={(checked) => setBarVisible(checked)}>
              {t("browserDesktop.bookmarks.showBar")}
            </ContextMenuCheckboxItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <Popover open={renaming !== null} onOpenChange={(next) => !next && setRenaming(null)}>
        <PopoverContent anchor={renaming?.anchor ?? null} align="start" sideOffset={6} className="w-[280px]">
          {renaming ? (
            <BookmarkEditForm
              key={renaming.bookmark.id}
              heading={t("browserDesktop.bookmarks.edit")}
              initialName={renaming.bookmark.title}
              onSave={(name) => bookmarks.update(renaming.bookmark.id, { title: name })}
              onRemove={() => bookmarks.remove(renaming.bookmark.id)}
              onDone={() => setRenaming(null)}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  );
}

function OverflowMenu({
  entries,
  onMenuItem,
  label,
}: {
  entries: readonly ShellBookmark[];
  onMenuItem(url: TabUrl): (event: MouseEvent<HTMLElement>) => void;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" aria-label={label} title={label} className={cn(BOOKMARK_CHIP_CLASS, "ms-auto px-1.5")} />}
      >
        <ChevronsRight aria-hidden className="h-3.5 w-3.5 rtl:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[320px] min-w-52">
        {entries.map((bookmark) => (
          <OverflowBookmarkItem key={bookmark.id} bookmark={bookmark} onMenuItem={onMenuItem} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OverflowBookmarkItem({
  bookmark,
  onMenuItem,
}: {
  bookmark: ShellBookmark;
  onMenuItem(url: TabUrl): (event: MouseEvent<HTMLElement>) => void;
}) {
  const t = useT();
  const { icon: Icon } = describeUrl(bookmark.url, bookmark.title, t);
  return (
    <DropdownMenuItem onClick={onMenuItem(bookmark.url)}>
      <Icon className="h-4 w-4" />
      <span className="min-w-0 truncate">{bookmark.title}</span>
    </DropdownMenuItem>
  );
}
