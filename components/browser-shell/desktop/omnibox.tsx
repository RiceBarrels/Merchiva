"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
} from "react";
import { FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceActions } from "@/components/browser-shell/shared/workspace-menu";
import { StoreLogo } from "@/components/store-picker";
import { EmptyState } from "@/components/ui/empty-state";
import {
  dispositionFromKeyboard,
  dispositionFromPointer,
  getRouteAccess,
  isEditableElement,
  useAccessContext,
  useActiveTab,
  useBookmarks,
  useShellCommand,
  useTabActions,
  useTabPresentation,
  useTabsSnapshot,
  type OpenDisposition,
} from "@/lib/browser-shell";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import type { RecentDocumentItem } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { useIsNativeShellSync } from "@/lib/native-shell";
import { createDocument } from "@/lib/spacetimedb/actions";
import { useRecentDocuments } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";
import { BookmarkStar } from "./bookmark-star";
import { useBookmarksBarVisible } from "./bookmarks-bar-state";
import { OMNIBOX_POPUP_CLASS, OMNIBOX_SHELL_CLASS } from "./chrome-classes";
import { useDesktopChrome, useOverlayBackHandler } from "./chrome-context";
import { useChromeEnv } from "./chrome-env";
import { isImeComposing } from "./ime";
import { useCanUseMerchiva, useOpenMerchiva } from "./merchiva-button";
import { MERCHIVA_CHANNEL_URL, merchivaLaunchMode } from "./merchiva-launch";
import { useOmniboxResults, type OmniboxItem, type OmniboxResultOptions } from "./omnibox-results";
import { ResultGroupLabel, ResultRow, optionDomId } from "./result-list";
import { useAnnounce } from "./shell-live-region";
import { StoreChip } from "./store-chip";
import { ADDRESS_HOST, displayAddress, reportOpenResult } from "./tab-describe";

/*
 * Omnibox (desktop spec §4): address display + command palette over pages, tabs, recent
 * documents, stores and actions. WAI-ARIA 1.2 combobox: focus stays in the input,
 * `aria-activedescendant` names the highlighted option.
 *
 *   IDLE     input shows "merchiva/inventory/waste" (transparent text over a two-tone overlay)
 *     ─ click / focusOmnibox shortcut / new tab ─▶ EDITING (select all)
 *   EDITING  typing filters; ↑/↓ highlight; Enter / click / Mod|Alt+Enter / middle-click ─▶ run
 *     ─ Esc with edited text ─▶ restore address, select all
 *     ─ Esc with the address ─▶ IDLE, focus #desktop-content
 *     ─ blur ─▶ IDLE (typed text discarded)
 *     ─ route change ─▶ typed text kept
 * Arbitrary text never navigates: only validated "/manager/…" paths produce a "Go to" row.
 */

export function useOmniboxFocus(): { focus(selectAll?: boolean): void } {
  const chrome = useDesktopChrome();
  return useMemo(() => ({ focus: (selectAll = true) => chrome.focusOmnibox({ selectAll }) }), [chrome]);
}

interface OmniboxPopupHandle {
  move(delta: 1 | -1): void;
  /** Runs the highlighted item; false when nothing is highlighted. */
  commit(disposition: OpenDisposition): boolean;
}

const NO_DOCS: readonly RecentDocumentItem[] = Object.freeze([]);
const RECENT_DOCS_LIMIT = 20;
const NEW_TAB_FOCUS_WINDOW_MS = 3000;

export function Omnibox() {
  const t = useT();
  const chrome = useDesktopChrome();
  const env = useChromeEnv();
  const actions = useTabActions();
  const announce = useAnnounce();
  const snapshot = useTabsSnapshot();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const ctx = useAccessContext();
  const bookmarks = useBookmarks();
  const workspace = useWorkspaceActions();
  const [barVisible, setBarVisible] = useBookmarksBarVisible();
  const native = useIsNativeShellSync();
  const canUseMerchiva = useCanUseMerchiva();
  // Reuses this component's access context (no second device-apps subscription).
  const merchivaLaunch = merchivaLaunchMode(native, getRouteAccess(MERCHIVA_CHANNEL_URL, ctx));
  const openMerchiva = useOpenMerchiva(merchivaLaunch);
  // "Ask Mr. Merchiva" only where running it opens something (not the shortcut-only hint in Tauri).
  const merchivaAllowed = canUseMerchiva && merchivaLaunch !== "shortcut";

  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<OmniboxPopupHandle>(null);
  const selectOnMouseUpRef = useRef(false);
  const mountedAtRef = useRef(0);
  const focusedNewTabsRef = useRef<Set<string>>(new Set());
  const listId = useId();

  const [editing, setEditing] = useState<{ openedAt: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const address = presentation.isNewTab ? "" : displayAddress(presentation.url);
  const addressPath = address.startsWith(ADDRESS_HOST) ? address.slice(ADDRESS_HOST.length) : address;
  const query = editing && draft !== null ? draft : "";
  const value = editing && draft !== null ? draft : address;
  const docsAllowed = getRouteAccess(DOCS_HOME_HREF, ctx) === "allowed";
  const idleWithAddress = !editing && address !== "";

  useImperativeHandle(
    chrome.omniboxRef,
    () => ({
      focus(opts) {
        const input = inputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        if (opts?.selectAll !== false) window.requestAnimationFrame(() => input.select());
      },
    }),
    [],
  );

  useShellCommand("focusOmnibox", () => chrome.focusOmnibox());
  useOverlayBackHandler(editing !== null, () => {
    inputRef.current?.blur();
    chrome.focusContent();
  });

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  // A New Tab the user just created (button, menu, shortcut) starts in the omnibox, as in
  // Chrome. Tabs restored on load were created before the chrome mounted and are skipped.
  // Waits until the New Tab page has rendered in that tab (activeTabId commits after Next's
  // history write) and never steals focus the page already gave to its own search field.
  const activeTabId = activeTab?.id ?? null;
  const activeTabCreatedAt = activeTab?.createdAt ?? 0;
  const renderedNewTab = activeTabId !== null && snapshot.activeTabId === activeTabId && presentation.isNewTab;
  useEffect(() => {
    if (!renderedNewTab || !activeTabId) return;
    if (focusedNewTabsRef.current.has(activeTabId)) return;
    focusedNewTabsRef.current.add(activeTabId);
    if (activeTabCreatedAt < mountedAtRef.current || Date.now() - activeTabCreatedAt > NEW_TAB_FOCUS_WINDOW_MS) return;
    const frame = window.requestAnimationFrame(() => {
      const current = document.activeElement;
      if (current && current !== document.body && isEditableElement(current)) return;
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renderedNewTab, activeTabId, activeTabCreatedAt]);

  const selectAllSoon = () => {
    window.requestAnimationFrame(() => inputRef.current?.select());
  };

  const exitToContent = () => {
    inputRef.current?.blur();
    chrome.focusContent();
  };

  const report = (result: Parameters<typeof reportOpenResult>[0]) => reportOpenResult(result, t, (message) => toast(message));

  /** Runs an action; returns false when focus must not move to the page (a popover or the omnibox takes it). */
  const runAction = (id: Extract<OmniboxItem, { kind: "action" }>["id"], disposition: OpenDisposition): boolean => {
    switch (id) {
      case "new-tab":
        report(actions.openNewTabPage());
        return false;
      case "new-document":
        // Seeded with one empty paragraph so concurrent first edits share it (lib/docs/blank-state.ts).
        import("@/lib/docs/blank-state")
          .then(({ blankDocumentInput }) => createDocument(blankDocumentInput()))
          .then((documentId) => {
            actions.openUrl(documentHref(documentId, { isNew: true }), disposition === "current" ? "current" : "new-foreground");
          })
          .catch((error: unknown) => {
            console.error("[omnibox] createDocument failed", error);
            toast.error(t("browserDesktop.errors.createDocument"));
          });
        return true;
      case "settings":
        actions.openUrl("/manager/settings", disposition);
        return true;
      case "switch-store":
        window.requestAnimationFrame(() => chrome.setStoreChipOpen(true));
        return false;
      case "reopen-closed":
        if (report(actions.reopenClosedTab())) announce(t("browserDesktop.tabs.reopened"));
        return true;
      case "toggle-bookmarks-bar":
        setBarVisible(!barVisible);
        return true;
      case "bookmark-page": {
        const existing = bookmarks.find(presentation.url);
        const bookmark = existing ?? bookmarks.add(presentation.url, presentation.title);
        window.requestAnimationFrame(() => chrome.openBookmarkStar(existing === undefined, bookmark.id));
        return false;
      }
      case "ask-merchiva":
        openMerchiva(shellRef.current);
        return false;
    }
  };

  const run = (item: OmniboxItem, disposition: OpenDisposition) => {
    let focusContent = true;
    switch (item.kind) {
      case "tab":
        actions.activateTab(item.tabId);
        break;
      case "page":
      case "path":
      case "doc":
        actions.openUrl(item.url, disposition);
        break;
      case "closed":
        if (report(actions.reopenClosedTab(item.closedId))) announce(t("browserDesktop.tabs.reopened"));
        break;
      case "store":
        workspace.switchOrg(item.orgId).catch((error: unknown) => console.error("[omnibox] switchOrg failed", error));
        break;
      case "action":
        focusContent = runAction(item.id, disposition);
        break;
    }
    inputRef.current?.blur();
    if (focusContent) chrome.focusContent();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(event.nativeEvent)) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        popupRef.current?.move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        popupRef.current?.move(-1);
        break;
      case "Enter": {
        event.preventDefault();
        const ran = popupRef.current?.commit(dispositionFromKeyboard(event, env.isMac)) ?? false;
        // Enter on the unchanged address just leaves the omnibox.
        if (!ran && query === "") exitToContent();
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (draft !== null && draft !== address) {
          setDraft(null);
          selectAllSoon();
        } else {
          exitToContent();
        }
        break;
      default:
        break;
    }
  };

  const onShellMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== shellRef.current) return;
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    selectAllSoon();
  };

  const popupOptions: OmniboxResultOptions & { onRun: typeof run } = {
    docsAllowed,
    merchivaAllowed,
    bookmarksBarVisible: barVisible,
    isNewTabPage: presentation.isNewTab,
    openedAt: editing?.openedAt ?? 0,
    onRun: run,
  };

  return (
    <div ref={shellRef} className={OMNIBOX_SHELL_CLASS} onMouseDown={onShellMouseDown}>
      <StoreChip />
      <div className="relative h-full min-w-0 flex-1">
        {idleWithAddress ? (
          <div
            aria-hidden
            dir="ltr"
            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1 text-[13px] whitespace-nowrap"
          >
            <span className="shrink-0 text-foreground">{ADDRESS_HOST}</span>
            <span className="min-w-0 truncate text-muted-foreground">{addressPath}</span>
          </div>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t("browserDesktop.omnibox.label")}
          aria-expanded={editing !== null}
          aria-controls={editing ? listId : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          dir={editing ? "auto" : address ? "ltr" : undefined}
          value={value}
          placeholder={t("browserDesktop.omnibox.placeholder")}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            "absolute inset-0 h-full w-full bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground md:text-[13px]",
            idleWithAddress && "text-transparent caret-transparent selection:bg-transparent",
          )}
          onFocus={() => {
            if (editing) return;
            setDraft(null);
            setEditing({ openedAt: Date.now() });
          }}
          onBlur={() => {
            selectOnMouseUpRef.current = false;
            setEditing(null);
            setDraft(null);
          }}
          onMouseDown={() => {
            if (document.activeElement !== inputRef.current) selectOnMouseUpRef.current = true;
          }}
          onMouseUp={(event) => {
            if (!selectOnMouseUpRef.current) return;
            selectOnMouseUpRef.current = false;
            event.preventDefault();
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <BookmarkStar />
      {editing ? (
        docsAllowed ? (
          <OmniboxPopupWithDocs ref={popupRef} query={query} listId={listId} inputRef={inputRef} {...popupOptions} />
        ) : (
          <OmniboxPopup ref={popupRef} query={query} listId={listId} inputRef={inputRef} docs={NO_DOCS} {...popupOptions} />
        )
      ) : null}
    </div>
  );
}

interface OmniboxPopupProps extends OmniboxResultOptions {
  ref: Ref<OmniboxPopupHandle>;
  query: string;
  listId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  docs: readonly RecentDocumentItem[];
  onRun(item: OmniboxItem, disposition: OpenDisposition): void;
}

/** Mounted only while the omnibox is open and Docs is allowed: the only place the chrome subscribes to docs. */
function OmniboxPopupWithDocs(props: Omit<OmniboxPopupProps, "docs">) {
  const { items } = useRecentDocuments(RECENT_DOCS_LIMIT);
  return <OmniboxPopup {...props} docs={items} />;
}

function OmniboxPopup({ ref, query, listId, inputRef, docs, onRun, ...options }: OmniboxPopupProps) {
  const t = useT();
  const env = useChromeEnv();
  const groups = useOmniboxResults(query, docs, options);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const starts = useMemo(() => {
    const out: number[] = [];
    let next = 0;
    for (const group of groups) {
      out.push(next);
      next += group.items.length;
    }
    return out;
  }, [groups]);
  const [highlight, setHighlight] = useState<{ query: string; index: number }>({ query, index: -1 });

  const count = flat.length;
  // A typed query highlights the first row; the unchanged address highlights nothing until ↓.
  const rawIndex = highlight.query === query ? highlight.index : query ? 0 : -1;
  const index = count === 0 || rawIndex < 0 ? -1 : Math.min(rawIndex, count - 1);
  const activeOptionId = index >= 0 ? optionDomId(listId, index) : null;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (activeOptionId) input.setAttribute("aria-activedescendant", activeOptionId);
    else input.removeAttribute("aria-activedescendant");
    return () => input.removeAttribute("aria-activedescendant");
  }, [activeOptionId, inputRef]);

  useImperativeHandle(
    ref,
    () => ({
      move(delta) {
        if (count === 0) return;
        const next = index < 0 ? (delta > 0 ? 0 : count - 1) : (index + delta + count) % count;
        setHighlight({ query, index: next });
        window.requestAnimationFrame(() => {
          document.getElementById(optionDomId(listId, next))?.scrollIntoView({ block: "nearest" });
        });
      },
      commit(disposition) {
        const item = index >= 0 ? flat[index] : undefined;
        if (!item) return false;
        onRun(item, item.kind === "tab" ? "current" : disposition);
        return true;
      },
    }),
    [count, index, flat, query, listId, onRun],
  );

  const modEnter = env.isMac ? "⌘↵" : "Alt+↵";

  return (
    <div className={OMNIBOX_POPUP_CLASS} onMouseDown={(event) => event.preventDefault()}>
      {count === 0 ? (
        query ? <EmptyState compact title={t("browserDesktop.omnibox.noResults")} className="py-5" /> : null
      ) : (
        <div id={listId} role="listbox" aria-label={t("browserDesktop.omnibox.label")} className="min-h-0 flex-1 overflow-y-auto py-1">
          {groups.map((group, groupIndex) => {
            const labelId = `${listId}-${group.value}`;
            return (
              <div key={group.value} role="group" aria-labelledby={labelId}>
                <ResultGroupLabel id={labelId}>{group.label}</ResultGroupLabel>
                {group.items.map((item, itemIndex) => {
                  const rowIndex = starts[groupIndex] + itemIndex;
                  const opensUrl = item.kind === "page" || item.kind === "path" || item.kind === "doc";
                  return (
                    <ResultRow
                      key={item.id}
                      id={optionDomId(listId, rowIndex)}
                      highlighted={rowIndex === index}
                      icon={<OmniboxItemIcon item={item} />}
                      title={item.title}
                      secondary={omniboxSecondary(item, t)}
                      hint={omniboxHint(item, t)}
                      onHover={() => setHighlight({ query, index: rowIndex })}
                      onSelect={(event) =>
                        onRun(item, item.kind === "tab" ? "current" : dispositionFromPointer(event, env.isMac, env.isTauri))
                      }
                      onAuxSelect={opensUrl ? () => onRun(item, "new-background") : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <div
        aria-hidden
        className="flex shrink-0 items-center gap-1.5 border-t border-border px-2.5 py-1.5 text-[10.5px] text-muted-foreground"
      >
        <span dir="ltr" className="font-mono">↵</span>
        <span>{t("browserDesktop.omnibox.hintOpen")}</span>
        <span aria-hidden>·</span>
        <span dir="ltr" className="font-mono">{modEnter}</span>
        <span>{t("browserDesktop.omnibox.hintNewTab")}</span>
        <span aria-hidden>·</span>
        <span dir="ltr" className="font-mono">esc</span>
        <span>{t("browserDesktop.omnibox.hintClose")}</span>
      </div>
    </div>
  );
}

function OmniboxItemIcon({ item }: { item: OmniboxItem }) {
  switch (item.kind) {
    case "tab":
    case "page":
    case "closed": {
      const Icon = item.icon;
      return <Icon className="h-4 w-4" />;
    }
    case "doc":
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case "store":
      return <StoreLogo name={item.title} logoUrl={item.logoUrl} className="h-4 w-4 rounded-sm [&_span]:text-[8px]" />;
    case "action": {
      const Icon = item.icon;
      return <Icon className="h-4 w-4 text-muted-foreground" />;
    }
    case "path":
      return <Globe className="h-4 w-4 text-muted-foreground" />;
  }
}

function omniboxSecondary(item: OmniboxItem, t: (key: string) => string): string | undefined {
  switch (item.kind) {
    case "tab":
    case "closed":
      return displayAddress(item.url) || undefined;
    case "page":
      return item.parentTitle ?? (displayAddress(item.url) || undefined);
    case "doc":
      return t("nav.docs");
    case "store":
      return item.isSub ? t("multiStore.subBadge") : undefined;
    default:
      return undefined;
  }
}

function omniboxHint(item: OmniboxItem, t: (key: string) => string): string | undefined {
  if (item.kind === "tab") return t("browserDesktop.omnibox.switchToTab");
  if (item.kind === "action") return item.shortcut;
  return undefined;
}
