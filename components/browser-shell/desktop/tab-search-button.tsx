"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShellCommand, useShortcutLabel, useTabActions, useTabsSnapshot } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { STRIP_BUTTON_CLASS } from "./chrome-classes";
import { focusDesktopContent, useDesktopChrome, useOverlayBackHandler } from "./chrome-context";
import { isImeComposing } from "./ime";
import { scoreMatch } from "./omnibox-results";
import { ResultGroupLabel, ResultRow, optionDomId } from "./result-list";
import { useAnnounce } from "./shell-live-region";
import { describeTab, displayAddress, reportOpenResult } from "./tab-describe";

/*
 * Tab search (desktop spec §5.4): a popover with a filter input over "Open tabs" (every
 * tab, hover X to close) and "Recently closed" (up to 8). Enter or click activates or
 * reopens, then focus returns to #desktop-content. Opened by the strip button or the
 * `showTabOverview` shortcut (Alt+Shift+A web, Mod+Shift+A Tauri).
 */

const MAX_CLOSED_ROWS = 8;

export function TabSearchButton() {
  const t = useT();
  const { tabSearchOpen: open, setTabSearchOpen: setOpen } = useDesktopChrome();
  const shortcut = useShortcutLabel("showTabOverview");
  const inputRef = useRef<HTMLInputElement>(null);

  useShellCommand("showTabOverview", () => setOpen(true));
  useOverlayBackHandler(open, () => setOpen(false));

  const label = shortcut ? `${t("browserDesktop.tabs.search")} (${shortcut})` : t("browserDesktop.tabs.search");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          delay={600}
          render={<PopoverTrigger render={<button type="button" aria-label={label} className={STRIP_BUTTON_CLASS} />} />}
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={6}
        initialFocus={inputRef}
        aria-label={t("browserDesktop.tabs.search")}
        className="flex w-[340px] flex-col p-0"
      >
        <TabSearchPanel inputRef={inputRef} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

type Row =
  | { kind: "tab"; id: string; tabId: string; title: string; address: string; icon: ReturnType<typeof describeTab>["icon"]; active: boolean }
  | { kind: "closed"; id: string; closedId: string; title: string; address: string; icon: ReturnType<typeof describeTab>["icon"] };

function TabSearchPanel({ inputRef, onDone }: { inputRef: React.RefObject<HTMLInputElement | null>; onDone(): void }) {
  const t = useT();
  const snapshot = useTabsSnapshot();
  const actions = useTabActions();
  const announce = useAnnounce();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<{ query: string; index: number }>({ query: "", index: 0 });

  const highlightedTabId = snapshot.requestedTabId ?? snapshot.activeTabId;

  const { openRows, closedRows } = useMemo(() => {
    const q = query.trim();
    const matches = (title: string, address: string) => !q || scoreMatch(q, { primary: title, secondary: [address] }) > 0;
    const open: Row[] = [];
    for (const tab of snapshot.tabs) {
      const summary = describeTab(tab, snapshot.gate, t);
      const address = displayAddress(summary.url);
      if (!matches(summary.title, address)) continue;
      open.push({
        kind: "tab",
        id: `tab:${tab.id}`,
        tabId: tab.id,
        title: summary.title,
        address,
        icon: summary.icon,
        active: tab.id === highlightedTabId,
      });
    }
    const closed: Row[] = [];
    for (const record of snapshot.closed) {
      if (closed.length >= MAX_CLOSED_ROWS) break;
      const summary = describeTab(record.tab, null, t);
      const address = displayAddress(summary.url);
      if (!matches(summary.title, address)) continue;
      closed.push({ kind: "closed", id: `closed:${record.id}`, closedId: record.id, title: summary.title, address, icon: summary.icon });
    }
    return { openRows: open, closedRows: closed };
  }, [query, snapshot.tabs, snapshot.closed, snapshot.gate, highlightedTabId, t]);

  const rows = useMemo(() => [...openRows, ...closedRows], [openRows, closedRows]);
  const count = rows.length;
  const index = count === 0 ? -1 : highlight.query === query ? Math.min(Math.max(highlight.index, 0), count - 1) : 0;
  const activeRow = index >= 0 ? rows[index] : null;

  const run = (row: Row) => {
    if (row.kind === "tab") {
      actions.activateTab(row.tabId);
    } else if (reportOpenResult(actions.reopenClosedTab(row.closedId), t, (message) => toast(message))) {
      announce(t("browserDesktop.tabs.reopened"));
    }
    onDone();
    window.requestAnimationFrame(focusDesktopContent);
  };

  const move = (delta: 1 | -1) => {
    if (count === 0) return;
    const next = (index + delta + count) % count;
    setHighlight({ query, index: next });
    window.requestAnimationFrame(() => {
      document.getElementById(optionDomId(listId, next))?.scrollIntoView({ block: "nearest" });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(event.nativeEvent)) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow) run(activeRow);
    }
  };

  const renderRow = (row: Row, rowIndex: number) => {
    const Icon = row.icon;
    return (
      <ResultRow
        key={row.id}
        id={optionDomId(listId, rowIndex)}
        highlighted={rowIndex === index}
        icon={<Icon className="h-4 w-4" />}
        title={
          <span className={cn(row.kind === "tab" && row.active && "font-medium")}>{row.title}</span>
        }
        secondary={row.address || undefined}
        onHover={() => setHighlight({ query, index: rowIndex })}
        onSelect={() => run(row)}
        trailing={
          row.kind === "tab" ? (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              title={fmt(t("browserDesktop.tabs.closeNamed"), { title: row.title })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                actions.closeTab(row.tabId, { source: "pointer" });
                announce(t("browserDesktop.tabs.closed"));
              }}
              className="ms-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground group-hover/result:opacity-100 group-data-[highlighted]/result:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : undefined
        }
      />
    );
  };

  return (
    <>
      <div className="flex h-10 items-center gap-2 border-b border-border px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={index >= 0 ? optionDomId(listId, index) : undefined}
          aria-label={t("browserDesktop.tabs.search")}
          placeholder={t("browserDesktop.tabs.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground md:text-[13px]"
        />
      </div>
      {count === 0 ? (
        <EmptyState compact title={t("browserDesktop.omnibox.noResults")} />
      ) : (
        <div id={listId} role="listbox" aria-label={t("browserDesktop.tabs.search")} className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
          {openRows.length > 0 ? (
            <div role="group" aria-labelledby={`${listId}-open`}>
              <ResultGroupLabel id={`${listId}-open`}>{t("browserDesktop.tabs.openTabs")}</ResultGroupLabel>
              {openRows.map((row, i) => renderRow(row, i))}
            </div>
          ) : null}
          {closedRows.length > 0 ? (
            <div role="group" aria-labelledby={`${listId}-closed`}>
              <ResultGroupLabel id={`${listId}-closed`}>{t("browserDesktop.tabs.recentlyClosed")}</ResultGroupLabel>
              {closedRows.map((row, i) => renderRow(row, openRows.length + i))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
