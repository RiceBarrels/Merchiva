"use client";

/**
 * Find and replace (docs-editor-ui spec §2.6 commands, §4.4 placement, §4.8 shortcuts).
 *
 * Driven by the SearchAndReplace extension from the editor core (`lib/docs/extensions/search-replace.ts`):
 * - commands `setSearchTerm`, `setReplaceTerm`, `setSearchCaseSensitive`, `nextSearchResult`, `previousSearchResult`,
 *   `replaceCurrent`, `replaceAll`
 * - storage `{ results, index, lastReplaced }`, highlighted with `doc-search-match` / `doc-search-current` decorations
 *
 * Props:
 * - `editor` — live editor (or the preview editor); null while loading.
 * - `open` — renders nothing when false. On close it clears the term (`setSearchTerm("")`) so decorations disappear;
 *   reopening restores the previous term.
 * - `withReplace` / `onWithReplaceChange` — replace row toggle (Mod+Shift+H opens with it on).
 * - `canEdit` — replace controls are disabled when false; find still works read-only.
 * - `onClose` — Esc inside the bar, or the X button; focus then returns to an editable editor.
 * - `focusRequest` — the editor core increments it on every Mod+F. Each change focuses and selects the find input,
 *   including while already open.
 * - `variant` — `"floating"` (desktop: `absolute top-2 end-4 z-30`, bordered card) or `"docked"`
 *   (mobile: full-width rows pinned under the header).
 *
 * The find input carries `data-doc-find-input` (`DOC_FIND_INPUT_ATTR`). `DocShortcuts` checks it so a second Mod+F
 * while the input is focused falls through to the browser's native find.
 *
 * Keys: Enter = next match, Shift+Enter = previous; in the replace input Enter = replace, Mod+Enter = replace all.
 * The count `fmt(t("docs.find.count"), { current, total })` sits in an `aria-live="polite"` region.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

export const DOC_FIND_INPUT_ATTR = "data-doc-find-input";

export interface FindReplaceBarProps {
  editor: Editor | null;
  open: boolean;
  withReplace: boolean;
  onWithReplaceChange(withReplace: boolean): void;
  canEdit: boolean;
  onClose(): void;
  focusRequest?: number;
  variant?: "floating" | "docked";
}

interface SearchCounts {
  total: number;
  index: number;
}

const NO_COUNTS: SearchCounts = { total: 0, index: 0 };

function usable(editor: Editor | null): Editor | null {
  return editor && !editor.isDestroyed ? editor : null;
}

function readCounts(editor: Editor | null): SearchCounts {
  const live = usable(editor);
  const storage = live?.storage.searchAndReplace;
  return storage ? { total: storage.results.length, index: storage.index } : NO_COUNTS;
}

/**
 * When the selection is exactly one of the results, makes it the current match. The selection is the match the user
 * navigated to; the stored index can lag behind it (a collaborator's edit re-runs the search and resets the index).
 */
function syncIndexToSelection(editor: Editor): void {
  const storage = editor.storage.searchAndReplace;
  if (!storage) return;
  const { from, to } = editor.state.selection;
  const selected = storage.results.findIndex((result) => result.from === from && result.to === to);
  if (selected >= 0) storage.index = selected;
}

/** Makes `target` the current match in one transaction: selects it, scrolls to it and repaints the highlight. */
function goToResult(editor: Editor, target: number): void {
  const storage = editor.storage.searchAndReplace;
  const total = storage?.results.length ?? 0;
  if (!storage || total === 0) return;
  storage.index = (((target - 1) % total) + total) % total;
  editor.commands.nextSearchResult();
}

export function FindReplaceBar({
  editor,
  open,
  withReplace,
  onWithReplaceChange,
  canEdit,
  onClose,
  focusRequest = 0,
  variant = "floating",
}: FindReplaceBarProps): React.JSX.Element | null {
  const t = useT();
  const replaceRowId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const counts =
    useEditorState({
      editor,
      selector: ({ editor: current }) => readCounts(current),
      equalityFn: (a, b) => a?.total === b?.total && a?.index === b?.index,
    }) ?? NO_COUNTS;

  // Push the query into the extension while open; clear decorations on close or editor switch.
  useEffect(() => {
    const live = usable(editor);
    if (!open || !live) return;
    live.commands.setSearchCaseSensitive(caseSensitive);
  }, [editor, open, caseSensitive]);

  useEffect(() => {
    const live = usable(editor);
    if (!open || !live) return;
    live.commands.setSearchTerm(term);
  }, [editor, open, term]);

  useEffect(() => {
    const live = usable(editor);
    if (!open || !live) return;
    live.commands.setReplaceTerm(replacement);
  }, [editor, open, replacement]);

  useEffect(() => {
    const live = usable(editor);
    if (!open || !live) return;
    return () => {
      if (!live.isDestroyed) live.commands.setSearchTerm("");
    };
  }, [editor, open]);

  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [open, focusRequest]);

  if (!open) return null;

  const live = usable(editor);
  const hasResults = counts.total > 0;
  const replaceEnabled = canEdit && withReplace;

  const close = () => {
    if (live?.isEditable) live.commands.focus();
    onClose();
  };

  const next = () => {
    if (!live) return;
    syncIndexToSelection(live);
    live.commands.nextSearchResult();
  };
  const previous = () => {
    if (!live) return;
    syncIndexToSelection(live);
    live.commands.previousSearchResult();
  };

  const replaceOne = () => {
    if (!live || !canEdit || !hasResults) return;
    const storage = live.storage.searchAndReplace;
    if (!storage) return;
    syncIndexToSelection(live);
    const current = storage.results[storage.index];
    if (!current) return;
    const insertedEnd = current.from + storage.replaceTerm.length;
    if (!live.commands.replaceCurrent()) return;
    // The search re-ran in the same transaction and the extension made the first match after the inserted text current
    // (a case change or a replacement containing the term is never replaced twice). Select and scroll to it, wrapping.
    const after = storage.results.findIndex((result) => result.from >= insertedEnd);
    goToResult(live, after === -1 ? 0 : after);
  };

  const replaceEvery = () => {
    if (!live || !canEdit || !hasResults) return;
    if (live.commands.replaceAll()) {
      const n = live.storage.searchAndReplace?.lastReplaced ?? 0;
      toast(fmt(t("docs.find.replaced"), { n }));
    }
  };

  const status = !term ? "" : hasResults ? fmt(t("docs.find.count"), { current: counts.index + 1, total: counts.total }) : t("docs.find.noResults");
  const floating = variant === "floating";

  return (
    <div
      role="search"
      data-variant={variant}
      className={cn(
        "flex flex-col gap-1.5 bg-background",
        floating
          ? "absolute end-4 top-2 z-30 w-[min(28rem,calc(100%-2rem))] rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
          : "w-full border-b border-border px-2 py-1.5",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Search className="ms-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          {...{ [DOC_FIND_INPUT_ATTR]: "" }}
          type="search"
          value={term}
          aria-label={t("docs.find.placeholder")}
          placeholder={t("docs.find.placeholder")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-7 min-w-0 flex-1"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.shiftKey) previous();
            else next();
          }}
        />
        <span aria-live="polite" className="min-w-[4.5rem] shrink-0 text-end font-mono text-[11px] tabular-nums text-muted-foreground">
          {status}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("docs.find.matchCase")}
          title={t("docs.find.matchCase")}
          aria-pressed={caseSensitive}
          className={cn(caseSensitive && "bg-muted text-foreground")}
          onClick={() => setCaseSensitive((value) => !value)}
        >
          <CaseSensitive className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("docs.find.previous")} title={t("docs.find.previous")} disabled={!hasResults} onClick={previous}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("docs.find.next")} title={t("docs.find.next")} disabled={!hasResults} onClick={next}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("docs.find.toggleReplace")}
          title={t("docs.find.toggleReplace")}
          aria-expanded={withReplace}
          aria-controls={replaceRowId}
          disabled={!canEdit}
          className={cn(withReplace && canEdit && "bg-muted text-foreground")}
          onClick={() => onWithReplaceChange(!withReplace)}
        >
          <Replace className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.close")} title={t("common.close")} onClick={close}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {replaceEnabled && (
        <div id={replaceRowId} className="flex min-w-0 flex-wrap items-center gap-1 ps-5">
          <Input
            type="text"
            value={replacement}
            aria-label={t("docs.find.replacePlaceholder")}
            placeholder={t("docs.find.replacePlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="h-7 min-w-[8rem] flex-1"
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (event.metaKey || event.ctrlKey) replaceEvery();
              else replaceOne();
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={!hasResults} onClick={replaceOne}>
            {t("docs.find.replace")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasResults} onClick={replaceEvery}>
            {t("docs.find.replaceAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
