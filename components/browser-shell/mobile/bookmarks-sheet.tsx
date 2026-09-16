"use client";

import { Fragment, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, History, LayoutGrid, SquarePlus, Star, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  useBookmarks,
  useBrowsingHistory,
  useNavSections,
  type BrowsingHistoryItem,
  type NavSection,
  type TabUrl,
} from "@/lib/browser-shell";
import { dayKey, labelForUrl, pathOfUrl } from "@/lib/browser-shell/mobile/labels";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { ShellDrawer } from "./shell-drawer";

type Segment = "favorites" | "history" | "apps";

export interface BookmarksSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Loads a URL in the active tab. */
  onNavigate(url: TabUrl): void;
  /** Opens a URL in a new foreground tab. */
  onOpenInNewTab(url: TabUrl): void;
}

const ROW = "flex min-h-[48px] items-center";
const ROW_MAIN =
  "flex min-h-[48px] min-w-0 flex-1 items-center gap-3 ps-4 pe-2 text-start outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted active:bg-muted";
const ROW_ICON_BUTTON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground !min-h-0 !min-w-0 outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted active:bg-muted";

/**
 * Bookmarks sheet (mobile-safari spec §14): favorites, browsing history and the permitted app
 * sections. The Apps list is the guaranteed path to every section and sub-page, replacing the
 * legacy sidebar and bottom bar with the same filters (core `useNavSections`).
 */
export function BookmarksSheet({ open, onOpenChange, onNavigate, onOpenInNewTab }: BookmarksSheetProps) {
  const { t } = useI18n();
  const [segment, setSegment] = useState<Segment>("favorites");

  const go = (url: TabUrl) => {
    onOpenChange(false);
    onNavigate(url);
  };
  const goNewTab = (url: TabUrl) => {
    onOpenChange(false);
    onOpenInNewTab(url);
  };

  return (
    <ShellDrawer open={open} onOpenChange={onOpenChange} title={t("browserMobile.bookmarks")}>
      <div className="px-4 pb-2">
        <SegmentedControl<Segment>
          size="sm"
          fullWidth
          aria-label={t("browserMobile.bookmarks")}
          value={segment}
          onChange={setSegment}
          options={[
            { value: "favorites", label: t("browserMobile.favorites"), icon: Star },
            { value: "history", label: t("browserMobile.history"), icon: History },
            { value: "apps", label: t("browserMobile.apps"), icon: LayoutGrid },
          ]}
        />
      </div>
      {open && segment === "favorites" && <FavoritesList onNavigate={go} />}
      {open && segment === "history" && <HistoryList onNavigate={go} />}
      {open && segment === "apps" && <AppsList onNavigate={go} onOpenInNewTab={goNewTab} />}
    </ShellDrawer>
  );
}

// ─── Favorites ───────────────────────────────────────────────────────────────

function FavoritesList({ onNavigate }: { onNavigate(url: TabUrl): void }) {
  const { t } = useI18n();
  const bookmarks = useBookmarks();

  if (bookmarks.items.length === 0) {
    return (
      <EmptyState
        compact
        icon={Star}
        title={t("browserMobile.noFavorites")}
        description={t("browserMobile.noFavoritesDescription")}
        className="py-8"
      />
    );
  }

  return (
    <ul className="pb-2">
      {bookmarks.items.map((bookmark) => {
        const label = labelForUrl(bookmark.url, bookmark.title, t);
        const Icon = label.icon;
        return (
          <li key={bookmark.id} className={ROW}>
            <button type="button" className={ROW_MAIN} onClick={() => onNavigate(bookmark.url)}>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-foreground">{bookmark.title}</span>
                <span className="block truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
                  {bookmark.url}
                </span>
              </span>
            </button>
            <button
              type="button"
              className={cn(ROW_ICON_BUTTON, "me-2")}
              aria-label={fmt(t("browserMobile.removeFavoriteNamed"), { title: bookmark.title })}
              onClick={() => bookmarks.remove(bookmark.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function subscribeDayChange(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

function readDayKeys(): string {
  const now = Date.now();
  return `${dayKey(now)}|${dayKey(now - DAY_MS)}`;
}

/** Today's and yesterday's calendar keys, refreshed across midnight. */
function useDayKeys(): { today: string; yesterday: string } {
  const value = useSyncExternalStore(subscribeDayChange, readDayKeys, () => "|");
  return useMemo(() => {
    const [today = "", yesterday = ""] = value.split("|");
    return { today, yesterday };
  }, [value]);
}

interface HistoryGroup {
  readonly key: string;
  readonly at: number;
  readonly items: BrowsingHistoryItem[];
}

function HistoryList({ onNavigate }: { onNavigate(url: TabUrl): void }) {
  const { t, locale } = useI18n();
  const history = useBrowsingHistory();
  const { today, yesterday } = useDayKeys();

  const groups = useMemo<HistoryGroup[]>(() => {
    const out: HistoryGroup[] = [];
    for (const item of history.entries) {
      const key = dayKey(item.at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else out.push({ key, at: item.at, items: [item] });
    }
    return out;
  }, [history.entries]);

  const formats = useMemo(() => {
    const tag = LOCALE_BCP47[locale];
    return {
      time: new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }),
      day: new Intl.DateTimeFormat(tag, { weekday: "short", month: "short", day: "numeric" }),
    };
  }, [locale]);

  if (groups.length === 0) {
    return <EmptyState compact icon={History} title={t("browserMobile.noHistory")} className="py-8" />;
  }

  return (
    <div className="pb-2">
      {groups.map((group) => (
        <Fragment key={group.key}>
          <Eyebrow as="h3" className="px-4 pt-3 pb-1">
            {group.key === today
              ? t("browserMobile.today")
              : group.key === yesterday
                ? t("browserMobile.yesterday")
                : formats.day.format(group.at)}
          </Eyebrow>
          <ul>
            {group.items.map((item) => {
              const label = labelForUrl(item.url, item.title, t);
              const Icon = label.icon;
              return (
                <li key={`${item.at}:${item.url}`}>
                  <button type="button" className={cn(ROW_MAIN, "w-full pe-4")} onClick={() => onNavigate(item.url)}>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-foreground">{label.title}</span>
                      <span className="block truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
                        {item.url}
                      </span>
                    </span>
                    <time
                      dateTime={new Date(item.at).toISOString()}
                      className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
                    >
                      {formats.time.format(item.at)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
      <div className="flex justify-center border-t border-border px-4 pt-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={history.clear}>
          {t("browserMobile.clearHistory")}
        </Button>
      </div>
    </div>
  );
}

// ─── Apps ────────────────────────────────────────────────────────────────────

function sectionContains(section: NavSection, pathname: string): boolean {
  const path = pathOfUrl(pathname);
  return section.children.some((child) => path === child.href || path.startsWith(`${child.href}/`));
}

function AppsList({ onNavigate, onOpenInNewTab }: { onNavigate(url: TabUrl): void; onOpenInNewTab(url: TabUrl): void }) {
  const { t, dir } = useI18n();
  // The chevron is mirrored in RTL (points left), so it turns the other way to point down.
  const expandedRotation = dir === "rtl" ? -90 : 90;
  const sections = useNavSections();
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(sections.filter((section) => sectionContains(section, pathname)).map((section) => section.href)),
  );

  const toggle = (href: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });

  if (sections.length === 0) {
    return <EmptyState compact icon={LayoutGrid} title={t("browserMobile.noApps")} className="py-8" />;
  }

  return (
    <ul className="pb-2">
      {sections.map((section) => {
        const Icon = section.icon;
        const title = t(section.titleKey);
        const isOpen = expanded.has(section.href);
        const childListId = `shell-apps-${section.href.replace(/[^a-z0-9]+/gi, "-")}`;
        return (
          <li key={section.href}>
            <div className={ROW}>
              <button type="button" className={ROW_MAIN} onClick={() => onNavigate(section.href)}>
                <Icon className="h-5 w-5 shrink-0 text-foreground" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{title}</span>
              </button>
              {section.children.length > 0 && (
                <button
                  type="button"
                  className={ROW_ICON_BUTTON}
                  aria-expanded={isOpen}
                  aria-controls={childListId}
                  aria-label={fmt(t("browserMobile.showSectionPages"), { title })}
                  onClick={() => toggle(section.href)}
                >
                  <motion.span
                    className="flex"
                    animate={{ rotate: isOpen ? expandedRotation : 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                  </motion.span>
                </button>
              )}
              <button
                type="button"
                className={cn(ROW_ICON_BUTTON, "me-2")}
                aria-label={fmt(t("browserMobile.openInNewTabNamed"), { title })}
                onClick={() => onOpenInNewTab(section.href)}
              >
                <SquarePlus className="h-4 w-4" />
              </button>
            </div>
            {isOpen && section.children.length > 0 && (
              <ul id={childListId}>
                {section.children.map((child) => {
                  const ChildIcon = child.icon;
                  const childTitle = t(child.titleKey);
                  return (
                    <li key={child.href} className={ROW}>
                      <button type="button" className={cn(ROW_MAIN, "ps-11")} onClick={() => onNavigate(child.href)}>
                        <ChildIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{childTitle}</span>
                      </button>
                      <button
                        type="button"
                        className={cn(ROW_ICON_BUTTON, "me-2")}
                        aria-label={fmt(t("browserMobile.openInNewTabNamed"), { title: childTitle })}
                        onClick={() => onOpenInNewTab(child.href)}
                      >
                        <SquarePlus className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
