"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Search, SearchX, SquarePlus } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { DocsIcon } from "@/components/device/app-icons";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import {
  NEW_TAB_URL,
  anyDocumentEditorAllowed,
  currentEntry,
  openableDocuments,
  parseOmniboxInput,
  searchRoutes,
  useAccessContext,
  useActiveTab,
  useBookmarks,
  useBrowsingHistory,
  useNavSections,
  useTabActions,
  useTabPresentation,
  useTabsSnapshot,
  useVirtualKeyboard,
  type BrowserTab,
  type TabId,
  type TabUrl,
} from "@/lib/browser-shell";
import { INSTANT, SHEET_TRANSITION } from "@/lib/browser-shell/mobile/geometry";
import { labelForUrl } from "@/lib/browser-shell/mobile/labels";
import { rankSuggestions, suggestionScore, type Suggestion } from "@/lib/browser-shell/mobile/suggestions";
import { canonicalizeUrl } from "@/lib/browser-shell/url";
import type { RecentDocumentItem } from "@/lib/docs/types";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useRecentDocuments } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";

export interface SearchSheetHandle {
  /**
   * Opens the sheet and focuses the field. Must run synchronously inside the tap handler: iOS
   * only raises the keyboard for a focus() call made during the user gesture (spec F8).
   */
  openSync(initialQuery: string): void;
  close(): void;
}

export interface SearchSheetProps {
  ref?: Ref<SearchSheetHandle>;
  open: boolean;
  onOpenChange(open: boolean): void;
  bottomInset: number;
  reducedMotion: boolean;
}

const EMPTY_DOCS: readonly RecentDocumentItem[] = Object.freeze([]);
const START_PAGE_LIMIT = 5;
const DOC_SUGGESTION_POOL = 50;

type TopSuggestionRef = RefObject<Suggestion | null>;

interface ResultHandlers {
  onNavigate(url: TabUrl): void;
  onOpenInNewTab(url: TabUrl): void;
  onSwitchTab(tabId: TabId): void;
}

/**
 * Search / start sheet (mobile-safari spec §12). Always mounted but inert while closed so the tap
 * on the address pill can focus the field synchronously. Results mount only while open, so docs
 * subscriptions never run in the background.
 */
export function SearchSheet({ ref, open, onOpenChange, bottomInset, reducedMotion }: SearchSheetProps) {
  const { t } = useI18n();
  const actions = useTabActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const topSuggestion = useRef<Suggestion | null>(null);
  const [query, setQuery] = useState("");
  const keyboard = useVirtualKeyboard({ ignoreWithin: "" });

  const close = useCallback(() => {
    inputRef.current?.blur();
    onOpenChange(false);
  }, [onOpenChange]);

  useImperativeHandle(
    ref,
    () => ({
      openSync(initialQuery: string) {
        const root = rootRef.current;
        const input = inputRef.current;
        if (root) root.inert = false;
        if (input) {
          input.value = initialQuery;
          input.focus({ preventScroll: true });
          input.select();
        }
        setQuery(initialQuery);
        onOpenChange(true);
      },
      close,
    }),
    [close, onOpenChange],
  );

  const navigate = (url: TabUrl) => {
    close();
    actions.navigateActive(url);
  };
  const openInNewTab = (url: TabUrl) => {
    close();
    actions.openUrl(url, "new-foreground");
  };
  const switchToTab = (tabId: TabId) => {
    close();
    actions.activateTab(tabId);
  };

  const handleGo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    const parsed = parseOmniboxInput(q);
    if (parsed.kind === "url") {
      navigate(parsed.url);
      return;
    }
    if (q.startsWith("/")) {
      toast.error(t("browserMobile.invalidAddress"));
      return;
    }
    const top = topSuggestion.current;
    if (top) {
      if (top.kind === "tab" && top.tabId) switchToTab(top.tabId);
      else navigate(top.href);
      return;
    }
    navigate(`${NEW_TAB_URL}?q=${encodeURIComponent(q)}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  };

  return (
    <motion.div
      ref={rootRef}
      data-shell-sheet=""
      role="dialog"
      aria-modal="true"
      aria-label={t("browserMobile.searchLabel")}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      onKeyDown={handleKeyDown}
      initial={false}
      animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={reducedMotion ? INSTANT : SHEET_TRANSITION}
      className={cn("fixed inset-0 z-[80] flex flex-col bg-background", !open && "pointer-events-none")}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)", paddingBottom: 72 + keyboard.inset }}
      >
        {open && (
          <SearchResults
            query={query}
            topRef={topSuggestion}
            onNavigate={navigate}
            onOpenInNewTab={openInNewTab}
            onSwitchTab={switchToTab}
          />
        )}
      </div>
      <form
        role="search"
        onSubmit={handleGo}
        className="absolute inset-x-0 bottom-0 border-t border-border bg-background/95 px-3 pt-2 backdrop-blur-md"
        style={{
          transform: keyboard.inset > 0 ? `translateY(-${keyboard.inset}px)` : undefined,
          paddingBottom: keyboard.open ? 8 : `max(env(safe-area-inset-bottom, 0px), ${Math.max(bottomInset, 8)}px)`,
        }}
      >
        <div className="mx-auto flex h-[42px] max-w-[640px] items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t("browserMobile.address")}
              placeholder={t("browserMobile.searchPlaceholder")}
              enterKeyHint="go"
              inputMode="search"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="h-[42px] w-full rounded-lg border border-border bg-muted ps-9 pe-3 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-lg px-2 text-[15px] font-medium text-foreground !min-w-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

function SearchResults({ query, topRef, ...handlers }: ResultHandlers & { query: string; topRef: TopSuggestionRef }) {
  const access = useAccessContext();
  // Documents apply while any editor plugin is open to this person; each is listed only if its own editor is.
  const docsAllowed = anyDocumentEditorAllowed(access);
  const q = query.trim();
  if (!q) return <StartPage docsAllowed={docsAllowed} topRef={topRef} {...handlers} />;
  if (docsAllowed) return <SuggestionsWithDocs query={q} topRef={topRef} {...handlers} />;
  return <SuggestionList query={q} docs={EMPTY_DOCS} topRef={topRef} {...handlers} />;
}

function urlKey(url: string): string {
  return canonicalizeUrl(url, "http://local/")?.key ?? url;
}

function StartPage({ docsAllowed, topRef, onNavigate, onOpenInNewTab, onSwitchTab }: ResultHandlers & { docsAllowed: boolean; topRef: TopSuggestionRef }) {
  const { t } = useI18n();
  const bookmarks = useBookmarks();
  const sections = useNavSections();
  const snapshot = useTabsSnapshot();
  const activeTab = useActiveTab();
  const history = useBrowsingHistory();

  useEffect(() => {
    topRef.current = null;
  }, [topRef]);

  const otherTabs = useMemo(
    () =>
      snapshot.tabs
        .filter((tab) => tab.id !== activeTab?.id)
        .slice()
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, START_PAGE_LIMIT),
    [snapshot.tabs, activeTab],
  );

  const recentHistory = useMemo(() => {
    const open = new Set(snapshot.tabs.map((tab) => urlKey(currentEntry(tab).url)));
    const seen = new Set<string>();
    const out: { url: TabUrl; title: string; at: number }[] = [];
    for (const item of history.entries) {
      const key = urlKey(item.url);
      if (open.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length === START_PAGE_LIMIT) break;
    }
    return out;
  }, [history.entries, snapshot.tabs]);

  return (
    <div className="pb-2">
      <section aria-label={t("browserMobile.favorites")}>
        <Eyebrow as="h3" className="px-4 pt-1 pb-2">
          {t("browserMobile.favorites")}
        </Eyebrow>
        <div className="grid grid-cols-4 gap-1.5 px-3 min-[600px]:grid-cols-6">
          {bookmarks.items.map((bookmark) => (
            <FavoriteTile
              key={bookmark.id}
              icon={labelForUrl(bookmark.url, bookmark.title, t).icon}
              label={bookmark.title}
              onClick={() => onNavigate(bookmark.url)}
            />
          ))}
          {sections.map((section) => (
            <FavoriteTile key={section.href} icon={section.icon} label={t(section.titleKey)} onClick={() => onNavigate(section.href)} />
          ))}
        </div>
      </section>

      {otherTabs.length > 0 && (
        <ResultSection label={t("browserMobile.openTabs")}>
          {otherTabs.map((tab) => (
            <OpenTabRow key={tab.id} tab={tab} onSwitchTab={onSwitchTab} />
          ))}
        </ResultSection>
      )}

      {docsAllowed && <RecentDocumentsSection onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} />}

      {recentHistory.length > 0 && (
        <ResultSection label={t("browserMobile.history")}>
          {recentHistory.map((item) => {
            const label = labelForUrl(item.url, item.title, t);
            return (
              <ResultRow
                key={`${item.at}:${item.url}`}
                icon={label.icon}
                title={label.title}
                subtitle={item.url}
                subtitleIsPath
                onSelect={() => onNavigate(item.url)}
                onOpenInNewTab={() => onOpenInNewTab(item.url)}
              />
            );
          })}
        </ResultSection>
      )}
    </div>
  );
}

function OpenTabRow({ tab, onSwitchTab }: { tab: BrowserTab; onSwitchTab(tabId: TabId): void }) {
  const { t } = useI18n();
  const presentation = useTabPresentation(tab);
  return (
    <ResultRow
      icon={presentation.icon}
      title={presentation.title}
      subtitle={presentation.url}
      subtitleIsPath
      badge={t("browserMobile.switchToTab")}
      onSelect={() => onSwitchTab(tab.id)}
    />
  );
}

function RecentDocumentsSection({ onNavigate, onOpenInNewTab }: Pick<ResultHandlers, "onNavigate" | "onOpenInNewTab">) {
  const { t, locale } = useI18n();
  const access = useAccessContext();
  const recent = useRecentDocuments(START_PAGE_LIMIT);
  const items = useMemo(() => openableDocuments(recent.items, access), [recent.items, access]);
  const ready = recent.ready;
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_BCP47[locale], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    [locale],
  );
  if (!ready || items.length === 0) return null;
  return (
    <ResultSection label={t("browserMobile.recentDocuments")}>
      {items.map((doc) => {
        const title = doc.title || t("docs.untitled");
        return (
          <ResultRow
            key={doc.id}
            icon={DocsIcon}
            title={title}
            subtitle={dateFormat.format(new Date(Math.max(doc.updatedAt.getTime(), doc.lastOpenedAt ?? 0)))}
            onSelect={() => onNavigate(doc.href)}
            onOpenInNewTab={() => onOpenInNewTab(doc.href)}
          />
        );
      })}
    </ResultSection>
  );
}

function SuggestionsWithDocs(props: ResultHandlers & { query: string; topRef: TopSuggestionRef }) {
  const access = useAccessContext();
  const { items } = useRecentDocuments(DOC_SUGGESTION_POOL);
  const docs = useMemo(() => openableDocuments(items, access), [items, access]);
  return <SuggestionList {...props} docs={docs} />;
}

function SuggestionList({
  query,
  docs,
  topRef,
  onNavigate,
  onOpenInNewTab,
  onSwitchTab,
}: ResultHandlers & { query: string; docs: readonly RecentDocumentItem[]; topRef: TopSuggestionRef }) {
  const { t } = useI18n();
  const access = useAccessContext();
  const snapshot = useTabsSnapshot();
  const bookmarks = useBookmarks();
  const history = useBrowsingHistory();

  const suggestions = useMemo(() => {
    const candidates: Suggestion[] = [];
    for (const route of searchRoutes(query, t, access)) {
      candidates.push({
        key: `page:${route.href}`,
        kind: "page",
        href: route.href,
        title: t(route.titleKey),
        subtitle: route.href,
        icon: route.icon,
        tabId: null,
        score: route.score,
      });
    }
    for (const tab of snapshot.tabs) {
      const entry = currentEntry(tab);
      const label = labelForUrl(entry.url, entry.title, t);
      candidates.push({
        key: `tab:${tab.id}`,
        kind: "tab",
        href: entry.url,
        title: label.title,
        subtitle: entry.url,
        icon: label.icon,
        tabId: tab.id,
        score: suggestionScore(query, label.title, [entry.url]),
      });
    }
    for (const doc of docs) {
      const title = doc.title || t("docs.untitled");
      candidates.push({
        key: `doc:${doc.id}`,
        kind: "document",
        href: doc.href,
        title,
        subtitle: doc.href,
        icon: DocsIcon,
        tabId: null,
        score: suggestionScore(query, title),
      });
    }
    for (const bookmark of bookmarks.items) {
      const label = labelForUrl(bookmark.url, bookmark.title, t);
      candidates.push({
        key: `bookmark:${bookmark.id}`,
        kind: "bookmark",
        href: bookmark.url,
        title: bookmark.title,
        subtitle: bookmark.url,
        icon: label.icon,
        tabId: null,
        score: suggestionScore(query, bookmark.title, [bookmark.url]),
      });
    }
    history.entries.forEach((item, index) => {
      const label = labelForUrl(item.url, item.title, t);
      candidates.push({
        key: `history:${index}:${item.url}`,
        kind: "history",
        href: item.url,
        title: label.title,
        subtitle: item.url,
        icon: label.icon,
        tabId: null,
        score: suggestionScore(query, label.title, [item.url]),
      });
    });
    return rankSuggestions(candidates);
  }, [query, t, access, snapshot.tabs, docs, bookmarks.items, history.entries]);

  useEffect(() => {
    topRef.current = suggestions[0] ?? null;
  }, [suggestions, topRef]);

  if (suggestions.length === 0) {
    return <EmptyState compact icon={SearchX} title={t("browserMobile.noResults")} className="py-10" />;
  }

  return (
    <ResultSection label={t("browserMobile.suggestions")}>
      {suggestions.map((suggestion, index) => (
        <ResultRow
          key={suggestion.key}
          highlighted={index === 0}
          icon={suggestion.icon}
          title={suggestion.title}
          subtitle={suggestion.subtitle}
          subtitleIsPath
          badge={suggestion.kind === "tab" ? t("browserMobile.switchToTab") : undefined}
          onSelect={() => {
            if (suggestion.kind === "tab" && suggestion.tabId) onSwitchTab(suggestion.tabId);
            else onNavigate(suggestion.href);
          }}
          onOpenInNewTab={suggestion.kind === "tab" ? undefined : () => onOpenInNewTab(suggestion.href)}
        />
      ))}
    </ResultSection>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function ResultSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="pt-3">
      <Eyebrow as="h3" className="px-4 pb-1">
        {label}
      </Eyebrow>
      <ul>{children}</ul>
    </section>
  );
}

function FavoriteTile({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[0.4rem] px-1 py-2 text-foreground outline-none transition-colors focus-visible:bg-muted active:bg-muted"
    >
      <Icon className="h-6 w-6" />
      <span className="line-clamp-2 w-full break-words text-center text-[10.5px] font-medium leading-tight tracking-tight">{label}</span>
    </button>
  );
}

function ResultRow({
  icon: Icon,
  title,
  subtitle,
  subtitleIsPath = false,
  badge,
  highlighted = false,
  onSelect,
  onOpenInNewTab,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  subtitleIsPath?: boolean;
  badge?: string;
  highlighted?: boolean;
  onSelect(): void;
  onOpenInNewTab?: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className={cn("flex h-[48px] items-center", highlighted && "bg-muted")}>
      <button
        type="button"
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-3 ps-4 pe-2 text-start outline-none transition-colors focus-visible:bg-muted active:bg-muted"
      >
        <IconTile size="sm">
          <Icon className="h-3.5 w-3.5" />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-foreground">{title}</span>
          <span className="block truncate font-mono text-[11.5px] text-muted-foreground" dir={subtitleIsPath ? "ltr" : undefined}>
            {subtitle}
          </span>
        </span>
        {badge && (
          <span className="shrink-0 rounded border border-border px-1 text-[10.5px] text-muted-foreground">{badge}</span>
        )}
      </button>
      {onOpenInNewTab && (
        <button
          type="button"
          onClick={onOpenInNewTab}
          aria-label={fmt(t("browserMobile.openInNewTabNamed"), { title })}
          className="me-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground !min-h-0 !min-w-0 outline-none focus-visible:bg-muted active:bg-muted"
        >
          <SquarePlus className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
