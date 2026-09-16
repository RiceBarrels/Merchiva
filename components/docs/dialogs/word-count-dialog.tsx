"use client";

/**
 * Tools ▸ Word count (Mod+Shift+C) and the mobile Word count page (docs-editor-ui spec §4.6, §7.3).
 *
 * Props:
 * - `editor` — live or preview editor. Counts come from `docTextStats` (`lib/docs/text.ts`): Words, Characters,
 *   Characters excluding spaces. With a non-empty selection each value reads `fmt(t("docs.wordCount.ofTotal"), { selected, total })`.
 *   Counts are computed only while open, and follow the document while it changes.
 * - `showWhileTyping` / `onShowWhileTypingChange` — the "Display word count while typing" switch, bound to the
 *   editor core's `ui.showWordCount` (the `WordCountChip`).
 *
 * The Sheet title is the stable `t("docs.wordCount.title")` (DynamicUIElement writes titles into `?dialogs=`).
 */
import { useId, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { intlLocale } from "@/lib/docs/format";
import { docTextStats } from "@/lib/docs/text";
import type { DocTextStats } from "@/lib/docs/types";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

export interface WordCountDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  editor: Editor | null;
  showWhileTyping: boolean;
  onShowWhileTypingChange(show: boolean): void;
}

interface WordCountSnapshot {
  total: DocTextStats;
  selected: DocTextStats | null;
}

function sameStats(a: DocTextStats | null, b: DocTextStats | null): boolean {
  if (a === null || b === null) return a === b;
  return a.words === b.words && a.characters === b.characters && a.charactersNoSpaces === b.charactersNoSpaces;
}

function readSnapshot(editor: Editor | null): WordCountSnapshot | null {
  if (!editor || editor.isDestroyed) return null;
  const total = docTextStats(editor.getText({ blockSeparator: "\n\n" }));
  const { from, to, empty } = editor.state.selection;
  const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, "\n\n", " ");
  return { total, selected: selectedText.trim() ? docTextStats(selectedText) : null };
}

export function WordCountDialog({
  open,
  onOpenChange,
  editor,
  showWhileTyping,
  onShowWhileTypingChange,
}: WordCountDialogProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const switchId = useId();
  const number = useMemo(() => new Intl.NumberFormat(intlLocale(locale)), [locale]);

  const snapshot = useEditorState({
    editor: open ? editor : null,
    selector: ({ editor: current }) => readSnapshot(current),
    equalityFn: (a, b) => (a && b ? sameStats(a.total, b.total) && sameStats(a.selected, b.selected) : a === b),
  });

  const value = (key: keyof DocTextStats) => {
    if (!snapshot) return "—";
    const total = number.format(snapshot.total[key]);
    return snapshot.selected ? fmt(t("docs.wordCount.ofTotal"), { selected: number.format(snapshot.selected[key]), total }) : total;
  };

  const rows: Array<{ key: keyof DocTextStats; label: string }> = [
    { key: "words", label: t("docs.wordCount.words") },
    { key: "characters", label: t("docs.wordCount.characters") },
    { key: "charactersNoSpaces", label: t("docs.wordCount.charactersNoSpaces") },
  ];

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.wordCount.title")}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4">
          <dl className="divide-y divide-border rounded-lg border border-border text-sm">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-mono tabular-nums text-foreground">{value(row.key)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor={switchId} className="text-foreground">
              {t("docs.wordCount.showWhileTyping")}
            </label>
            <Switch id={switchId} checked={showWhileTyping} onCheckedChange={(checked) => onShowWhileTypingChange(checked)} />
          </div>
          <DialogActions onConfirm={() => onOpenChange(false)} confirmLabel={t("common.close")} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
