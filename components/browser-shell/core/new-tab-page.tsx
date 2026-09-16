"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Globe, Loader2, Plus, RotateCcw, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { DocsIcon, type AppIcon } from "@/components/device/app-icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { getRouteAccess, searchRoutes, useAccessContext, useNavSections } from "@/lib/browser-shell/access";
import { dispositionFromKeyboard } from "@/lib/browser-shell/dispositions";
import { presentTab, useClosedTabs, useTabActions, useTabsSnapshot } from "@/lib/browser-shell/hooks";
import { matchRoute, titleForUrl } from "@/lib/browser-shell/routes";
import { useShellInfo } from "@/lib/browser-shell/shell-context";
import { getShortcutEnv } from "@/lib/browser-shell/shortcuts";
import {
  NEW_TAB_URL,
  currentEntry,
  type ClosedTabRecord,
  type NavSection,
  type OpenDisposition,
  type TabUrl,
} from "@/lib/browser-shell/types";
import { parseOmniboxInput } from "@/lib/browser-shell/url";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import type { RecentDocumentItem } from "@/lib/docs/types";
import { LOCALE_BCP47 } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { createDocument } from "@/lib/spacetimedb/actions";
import { useDocsBackendStatus, useRecentDocuments, type DocsBackendStatus } from "@/lib/spacetimedb/hooks/useDocs";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

/*
 * The /manager/new-tab page (tab-state spec §15, plan §B2.3): one search field over open tabs,
 * pages, documents and recently closed tabs, then the app launcher, recent documents and
 * recently closed tabs. Works inside the browser shell and, through the §B1.5 fallbacks,
 * under the legacy shell.
 *
 * It is also the manager home page (HOME_URL / APP_MODE_HOME.admin), so it must stand on its
 * own as a landing page: the launcher lists every section the member may open, recent documents
 * are a live list, and nothing here needs a tab strip to be useful.
 */

type Translate = (key: string) => string;

const RECENT_DOCUMENTS = 8;
const RECENTLY_CLOSED = 5;
/** Every viewable document is searchable; the hook sorts by recency. */
const SEARCHABLE_DOCUMENTS = 10_000;
const MAX_TAB_RESULTS = 5;
const MAX_PAGE_RESULTS = 6;
const MAX_DOCUMENT_RESULTS = 5;
const MAX_CLOSED_RESULTS = 3;

type SuggestionGroup = "go" | "tabs" | "pages" | "documents" | "closed";

interface Suggestion {
  readonly id: string;
  readonly group: SuggestionGroup;
  readonly title: string;
  readonly detail?: string;
  readonly icon: AppIcon;
  /** Link suggestions navigate (Mod-click opens a tab through core link interception). */
  readonly href?: TabUrl;
  /** Action suggestions (switch to tab, reopen). */
  readonly run?: () => void;
}

const GROUP_ORDER: readonly SuggestionGroup[] = ["go", "tabs", "pages", "documents", "closed"];
const GROUP_LABEL_KEYS: Readonly<Record<SuggestionGroup, string | null>> = {
  go: null,
  tabs: "browser.newTabPage.openTabs",
  pages: "browser.newTabPage.pages",
  documents: "browser.newTabPage.documents",
  closed: "browser.newTabPage.recentlyClosed",
};

const GenericIcon: AppIcon = Globe;

function matches(query: string, ...texts: readonly string[]): boolean {
  return texts.some((text) => text.toLocaleLowerCase().includes(query));
}

// ─── Relative time (minute resolution) ───────────────────────────────────────

let minuteNow = 0;

function subscribeMinute(onChange: () => void): () => void {
  minuteNow = Date.now();
  const id = window.setInterval(() => {
    minuteNow = Date.now();
    onChange();
  }, 60_000);
  return () => window.clearInterval(id);
}

function getMinuteNow(): number {
  if (minuteNow === 0) minuteNow = Date.now();
  return minuteNow;
}

function getServerMinuteNow(): number {
  return 0;
}

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["minute", 60],
  ["hour", 3_600],
  ["day", 86_400],
  ["week", 604_800],
  ["month", 2_629_800],
  ["year", 31_557_600],
];

function formatRelative(format: Intl.RelativeTimeFormat, then: number, now: number): string {
  const seconds = (then - now) / 1000;
  const abs = Math.abs(seconds);
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let size = 60;
  for (const [candidate, length] of RELATIVE_UNITS) {
    if (abs >= length) {
      unit = candidate;
      size = length;
    }
  }
  return format.format(abs < 60 ? 0 : Math.round(seconds / size), unit);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function NewTabPage() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const queryParam = searchParams?.get("q") ?? "";
  const [query, setQuery] = useState(queryParam);
  const [seenParam, setSeenParam] = useState(queryParam);
  if (seenParam !== queryParam) {
    // `openNewTabPage({ query })` onto an already mounted New Tab page.
    setSeenParam(queryParam);
    setQuery(queryParam);
  }

  const shell = useShellInfo();
  const narrow = useIsMobile(1024);
  const desktop = shell ? shell.layout === "desktop" : !narrow;
  const coarse = shell?.coarse ?? false;
  const access = useAccessContext();
  const docsAllowed = getRouteAccess(DOCS_HOME_HREF, access) === "allowed";
  const snapshot = useTabsSnapshot();
  const closed = useClosedTabs();
  const actions = useTabActions();
  const { items: documents, ready: documentsReady } = useRecentDocuments(SEARCHABLE_DOCUMENTS);
  const backend = useDocsBackendStatus();
  const now = useSyncExternalStore(subscribeMinute, getMinuteNow, getServerMinuteNow);
  const relative = useMemo(() => new Intl.RelativeTimeFormat(LOCALE_BCP47[locale] ?? "en", { numeric: "auto" }), [locale]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const trimmed = query.trim();

  // Under the desktop browser shell the omnibox owns New Tab focus (desktop spec §4.2, as in
  // Chrome), so the page only focuses its own search outside the shell (legacy desktop layout).
  const ownsInitialFocus = !shell && desktop && !coarse;
  useEffect(() => {
    if (ownsInitialFocus) inputRef.current?.focus({ preventScroll: true });
  }, [ownsInitialFocus]);

  // Every reopen entry point reports the tab limit (hooks.ts useTabActions contract).
  const reopenClosed = useCallback(
    (closedId: string) => {
      const result = actions.reopenClosedTab(closedId);
      if (result && !result.ok && result.reason === "limit") toast(t("browser.tabLimit"));
    },
    [actions, t],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trimmed) return [];
    const q = trimmed.toLocaleLowerCase();
    const out: Suggestion[] = [];

    const parsed = parseOmniboxInput(trimmed);
    if (parsed.kind === "url") {
      out.push({
        id: `go:${parsed.url}`,
        group: "go",
        title: fmt(t("browser.newTabPage.goTo"), { url: parsed.url }),
        icon: matchRoute(parsed.url.split("?", 1)[0])?.icon ?? GenericIcon,
        href: parsed.url,
      });
    }

    let tabCount = 0;
    for (const tab of snapshot.tabs) {
      if (tabCount >= MAX_TAB_RESULTS) break;
      if (tab.id === snapshot.activeTabId) continue;
      const presentation = presentTab(tab, snapshot, t);
      if (!matches(q, presentation.title, presentation.url)) continue;
      tabCount++;
      out.push({
        id: `tab:${tab.id}`,
        group: "tabs",
        title: presentation.title,
        detail: t("browser.newTabPage.switchToTab"),
        icon: presentation.icon,
        run: () => actions.activateTab(tab.id),
      });
    }

    for (const route of searchRoutes(trimmed, t, access).slice(0, MAX_PAGE_RESULTS)) {
      out.push({
        id: `page:${route.href}`,
        group: "pages",
        title: t(route.titleKey),
        detail: route.parentTitleKey ? t(route.parentTitleKey) : undefined,
        icon: route.icon,
        href: route.href,
      });
    }

    if (docsAllowed) {
      let docCount = 0;
      for (const doc of documents) {
        if (docCount >= MAX_DOCUMENT_RESULTS) break;
        const title = doc.title.trim() || t("browser.untitled");
        if (!matches(q, title)) continue;
        docCount++;
        out.push({ id: `doc:${doc.id}`, group: "documents", title, icon: DocsIcon, href: doc.href });
      }
    }

    let closedCount = 0;
    for (const record of closed) {
      if (closedCount >= MAX_CLOSED_RESULTS) break;
      const entry = currentEntry(record.tab);
      const title = titleForUrl(entry.url, entry.title, t);
      if (!matches(q, title, entry.url)) continue;
      closedCount++;
      out.push({
        id: `closed:${record.id}`,
        group: "closed",
        title,
        detail: t("browser.newTabPage.reopen"),
        icon: matchRoute(entry.url.split("?", 1)[0])?.icon ?? GenericIcon,
        run: () => reopenClosed(record.id),
      });
    }
    return out;
  }, [trimmed, t, snapshot, actions, access, docsAllowed, documents, closed, reopenClosed]);

  const [cursor, setCursor] = useState<{ query: string; index: number }>({ query: "", index: 0 });
  const activeIndex = suggestions.length === 0 ? -1 : cursor.query === trimmed ? Math.min(cursor.index, suggestions.length - 1) : 0;

  const runSuggestion = useCallback(
    (suggestion: Suggestion, disposition: OpenDisposition) => {
      if (suggestion.href) actions.openUrl(suggestion.href, disposition);
      else suggestion.run?.();
    },
    [actions],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setCursor({ query: trimmed, index: (Math.max(activeIndex, 0) + step + suggestions.length) % suggestions.length });
      return;
    }
    if (event.key === "Enter") {
      if (!trimmed) return;
      event.preventDefault();
      const disposition = dispositionFromKeyboard(event, getShortcutEnv().isMac);
      const selected = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (selected) {
        runSuggestion(selected, disposition);
        return;
      }
      const parsed = parseOmniboxInput(trimmed);
      if (parsed.kind === "url") actions.openUrl(parsed.url, disposition);
      return;
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  const [creating, setCreating] = useState(false);
  const createNewDocument = useCallback(() => {
    setCreating(true);
    import("@/lib/docs/blank-state")
      .then(({ blankDocumentInput }) => createDocument(blankDocumentInput()))
      .then((id) => actions.openUrl(documentHref(id, { isNew: true }), "current"))
      .catch((err: unknown) => {
        const code = docErrorCode(err);
        const key = code ? DOC_ERROR_I18N_KEYS[code] : null;
        const translated = key ? t(key) : null;
        toast.error(translated && translated !== key ? translated : t("browser.newTabPage.createDocumentFailed"));
      })
      .finally(() => setCreating(false));
  }, [actions, t]);

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-2 pb-10 pt-6 sm:px-4 lg:pt-12">
      <h1 className="sr-only">{t("nav.home")}</h1>

      <div className="flex flex-col gap-2">
        <InputGroup className="h-10 bg-background">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("browser.newTabPage.searchPlaceholder")}
            aria-label={t("browser.newTabPage.searchLabel")}
            role="combobox"
            aria-expanded={trimmed.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={trimmed && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="text-[14px]"
          />
        </InputGroup>

        {trimmed && (
          <>
            <div id={listId} role="listbox" aria-label={t("browser.newTabPage.searchLabel")} className="flex flex-col gap-2">
              {GROUP_ORDER.map((group) => {
                const rows = suggestions
                  .map((suggestion, index) => ({ suggestion, index }))
                  .filter((row) => row.suggestion.group === group);
                if (rows.length === 0) return null;
                const labelKey = GROUP_LABEL_KEYS[group];
                const labelId = `${listId}-${group}`;
                return (
                  <div key={group} role="group" aria-labelledby={labelKey ? labelId : undefined} className="flex flex-col">
                    {labelKey && (
                      <Eyebrow as="div" id={labelId} className="px-2 pb-1 pt-1.5">
                        {t(labelKey)}
                      </Eyebrow>
                    )}
                    {rows.map(({ suggestion, index }) => (
                      <SuggestionRow
                        key={suggestion.id}
                        id={optionId(index)}
                        suggestion={suggestion}
                        active={index === activeIndex}
                        onHover={() => setCursor({ query: trimmed, index })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            {suggestions.length === 0 && (
              <EmptyState compact icon={SearchX} title={t("browser.newTabPage.noResults")} role="status" />
            )}
          </>
        )}
      </div>

      {!trimmed && (
        <>
          <AppLauncher desktop={desktop} t={t} />
          {docsAllowed && (
            <RecentDocuments
              t={t}
              items={documents.slice(0, RECENT_DOCUMENTS)}
              ready={documentsReady && backend !== "checking"}
              backend={backend}
              creating={creating}
              onCreate={createNewDocument}
              now={now}
              relative={relative}
            />
          )}
          <RecentlyClosed t={t} records={closed.slice(0, RECENTLY_CLOSED)} onReopen={reopenClosed} />
        </>
      )}
    </div>
  );
}

// ─── Search rows ─────────────────────────────────────────────────────────────

const ROW_CLASS =
  "flex h-9 w-full min-w-0 items-center gap-2.5 rounded px-2 text-start text-[13px] text-foreground outline-none transition-colors";

function SuggestionRow({
  id,
  suggestion,
  active,
  onHover,
}: {
  id: string;
  suggestion: Suggestion;
  active: boolean;
  onHover: () => void;
}) {
  const Icon = suggestion.icon;
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{suggestion.title}</span>
      {suggestion.detail && <span className="shrink-0 text-[11.5px] text-muted-foreground">{suggestion.detail}</span>}
    </>
  );
  const className = cn(ROW_CLASS, active ? "bg-muted" : "hover:bg-muted/60");
  if (suggestion.href) {
    return (
      <Link
        href={suggestion.href}
        id={id}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onMouseMove={onHover}
        className={className}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={suggestion.run}
      className={className}
    >
      {content}
    </button>
  );
}

// ─── Launcher ────────────────────────────────────────────────────────────────

function AppLauncher({ desktop, t }: { desktop: boolean; t: Translate }) {
  const navSections = useNavSections();
  // Home is this very page, so its tile would go nowhere. The sidebar and the omnibox keep their
  // Home row, where it is a real destination.
  const sections = useMemo(() => navSections.filter((section) => section.href !== NEW_TAB_URL), [navSections]);
  const headingId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const expanded: NavSection | null = desktop
    ? sections.find((section) => section.href === hovered && section.children.length > 0) ?? null
    : null;

  if (sections.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <Eyebrow as="div" role="heading" aria-level={2} id={headingId} className="px-1">
        {t("browser.newTabPage.apps")}
      </Eyebrow>
      <ul className="grid grid-cols-4 gap-1 sm:grid-cols-5 lg:grid-cols-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                onMouseEnter={() => setHovered(section.href)}
                onFocus={() => setHovered(section.href)}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-transparent px-1 py-2.5 text-center outline-none transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="h-9 w-9" />
                <span className="w-full truncate text-[12px] font-medium text-foreground">{t(section.titleKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {desktop && (
        <div className="min-h-7">
          {expanded && (
            <nav aria-label={t(expanded.titleKey)} className="flex flex-wrap items-center gap-1.5 px-1">
              {expanded.children.map((child) => {
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ChildIcon className="h-4 w-4" />
                    {t(child.titleKey)}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Recent documents ────────────────────────────────────────────────────────

function RecentDocuments({
  t,
  items,
  ready,
  backend,
  creating,
  onCreate,
  now,
  relative,
}: {
  t: Translate;
  items: readonly RecentDocumentItem[];
  ready: boolean;
  backend: DocsBackendStatus;
  creating: boolean;
  onCreate: () => void;
  now: number;
  relative: Intl.RelativeTimeFormat;
}) {
  const headingId = useId();
  const unavailable = backend === "not_published";

  let body: React.ReactNode;
  if (unavailable) {
    body = <EmptyState compact icon={FileText} description={t("browser.newTabPage.documentsUnavailable")} />;
  } else if (!ready) {
    body = (
      <div role="status" className="flex h-16 items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  } else if (items.length === 0) {
    body = <EmptyState compact icon={FileText} title={t("browser.newTabPage.noRecentDocuments")} />;
  } else {
    body = (
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex h-10 min-w-0 items-center gap-2.5 px-3 text-[13px] outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
            >
              <DocsIcon className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-foreground">{item.title.trim() || t("browser.untitled")}</span>
              {now > 0 && (
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                  {formatRelative(relative, item.updatedAt.getTime(), now)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Eyebrow as="div" role="heading" aria-level={2} id={headingId} className="flex-1">
          {t("browser.newTabPage.recentDocuments")}
        </Eyebrow>
        <Link
          href={DOCS_HOME_HREF}
          className="text-[12px] font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
        >
          {t("browser.newTabPage.allDocuments")}
        </Link>
        <Button variant="outline" size="sm" onClick={onCreate} disabled={creating || unavailable}>
          {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {t("browser.newTabPage.newDocument")}
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background">{body}</div>
    </section>
  );
}

// ─── Recently closed ─────────────────────────────────────────────────────────

function RecentlyClosed({
  t,
  records,
  onReopen,
}: {
  t: Translate;
  records: readonly ClosedTabRecord[];
  onReopen: (closedId: string) => void;
}) {
  const headingId = useId();
  if (records.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <Eyebrow as="div" role="heading" aria-level={2} id={headingId} className="px-1">
        {t("browser.newTabPage.recentlyClosed")}
      </Eyebrow>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {records.map((record) => {
          const entry = currentEntry(record.tab);
          const Icon = matchRoute(entry.url.split("?", 1)[0])?.icon ?? GenericIcon;
          const title = titleForUrl(entry.url, entry.title, t);
          return (
            <li key={record.id}>
              <button
                type="button"
                onClick={() => onReopen(record.id)}
                className="group flex h-10 w-full min-w-0 items-center gap-2.5 px-3 text-start text-[13px] outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground group-hover:text-foreground">
                  <RotateCcw className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
                  {t("browser.newTabPage.reopen")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
