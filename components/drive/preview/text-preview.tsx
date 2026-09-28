"use client";

// Text and CSV files shown from their first DRIVE_TEXT_PREVIEW_MAX_BYTES (readPrefix): text as
// source in a <pre>, never as HTML; CSV as a plain table of its first rows. A failed read (a
// host without CORS headers, no network, an expired URL) shows the caller's fallback instead,
// which offers "Open".

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { countKey } from "@/components/drive/model/plural";
import { DRIVE_TEXT_PREVIEW_MAX_BYTES } from "@/lib/drive/preview";
import { formatDriveBytes } from "@/lib/drive/format";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { CSV_PREVIEW_MAX_COLUMNS, csvDelimiterOf, parseCsvPrefix } from "./csv-rows";
import { PreviewLoading } from "./preview-loading";
import { readPrefix, type ReadPrefixResult } from "./read-prefix";

interface PrefixState {
  url: string;
  result: ReadPrefixResult | null;
}

/**
 * The file's first bytes; `result` null after a failed read. Read once from the first URL: a signed URL refreshed
 * in the background points at the same bytes (a new file is a new entry, and a new preview).
 */
function usePrefix(latestUrl: string): { loading: boolean; result: ReadPrefixResult | null } {
  const [url] = useState(latestUrl);
  const [state, setState] = useState<PrefixState | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let result: ReadPrefixResult | null = null;
    readPrefix(url, DRIVE_TEXT_PREVIEW_MAX_BYTES, controller.signal)
      .then((read) => {
        result = read;
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn("[drive] preview read failed", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setState({ url, result });
      });
    return () => controller.abort();
  }, [url]);
  const current = state?.url === url ? state : null;
  return { loading: current === null, result: current?.result ?? null };
}

/** UTF-8 with replacement characters for bad bytes; a character cut off at the end of a prefix is held back. */
function decodeText(read: ReadPrefixResult): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(read.bytes, { stream: read.truncated });
}

/**
 * The scroll area: focusable, so the keyboard can scroll it (and a click in it keeps focus there), and marked
 * data-own-arrows: while it can scroll sideways (a wide CSV table; wrapped text never does) the preview sheet leaves
 * the Left / Right arrows to it instead of stepping to the previous / next file.
 */
const SCROLLER = "min-h-0 flex-1 overflow-auto bg-background outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50";

export interface TextPreviewProps {
  /** Read once, on mount: give each file its own element (a `key`), as PreviewBody does. */
  url: string;
  /** Rendered instead when the file can't be read. */
  fallback: ReactNode;
  /** The scroll area's accessible name: the file's name. */
  label: string;
  className?: string;
}

export function TextPreview({ url, fallback, label, className }: TextPreviewProps) {
  const { t, locale } = useI18n();
  const { loading, result } = usePrefix(url);
  const text = useMemo(() => (result ? decodeText(result) : ""), [result]);
  if (loading) return <PreviewLoading className="h-full w-full" />;
  if (!result) return <>{fallback}</>;
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      <div role="region" tabIndex={0} aria-label={label} data-own-arrows="" className={SCROLLER}>
        <pre dir="auto" className="whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere]">
          {text}
        </pre>
      </div>
      {result.truncated && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {fmt(t("drive.preview.truncated"), { size: formatDriveBytes(DRIVE_TEXT_PREVIEW_MAX_BYTES, locale) })}
        </p>
      )}
    </div>
  );
}

export interface CsvPreviewProps {
  /** Read once, on mount (see TextPreviewProps.url). */
  url: string;
  /** For the delimiter: a .tsv name or a tab-separated type means tabs. */
  file: { mimeType: string; name: string };
  fallback: ReactNode;
  /** The table's scroll area's accessible name: the file's name. */
  label: string;
  /** Shown at the end of the notes row ("Open as Sheet"). */
  toolbar?: ReactNode;
  className?: string;
}

/** A cell's tooltip: the whole value, within reason. */
const TITLE_MAX = 1000;
const CELL = "max-w-[24rem] truncate border border-border px-2 py-1 text-start";
const ROW_NUMBER = "w-10 border border-border px-2 py-1 text-end font-mono font-normal tabular-nums text-muted-foreground";

/** One cell as text; the first row's cells are column headers. */
function Cell({ value, header = false }: { value: string; header?: boolean }) {
  const title = value.length > 0 ? value.slice(0, TITLE_MAX) : undefined;
  return header ? (
    <th scope="col" dir="auto" title={title} className={cn(CELL, "font-medium")}>{value}</th>
  ) : (
    <td dir="auto" title={title} className={CELL}>{value}</td>
  );
}

export function CsvPreview({ url, file, fallback, label, toolbar, className }: CsvPreviewProps) {
  const { t } = useI18n();
  const { loading, result } = usePrefix(url);
  const { mimeType, name } = file;
  const parsed = useMemo(() => {
    if (!result) return null;
    const text = decodeText(result);
    return parseCsvPrefix(text, { delimiter: csvDelimiterOf(text, { mimeType, name }), complete: !result.truncated });
  }, [result, mimeType, name]);
  if (loading) return <PreviewLoading className="h-full w-full" />;
  if (!parsed || parsed.rows.length === 0) return <>{fallback}</>;

  const [head, ...body] = parsed.rows;
  const notes = [
    parsed.moreRows ? fmt(t(countKey("drive.preview.rowsShown", parsed.rows.length)), { count: parsed.rows.length }) : null,
    parsed.moreColumns ? fmt(t("drive.preview.columnsShown"), { count: CSV_PREVIEW_MAX_COLUMNS }) : null,
  ].filter((note): note is string => note !== null);

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {(notes.length > 0 || toolbar) && (
        <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <p className="text-xs text-muted-foreground">{notes.join(" · ")}</p>
          {toolbar}
        </div>
      )}
      <div role="region" tabIndex={0} aria-label={label} data-own-arrows="" className={SCROLLER}>
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="row" className={ROW_NUMBER}>1</th>
              {head.map((value, column) => <Cell key={column} value={value} header />)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, index) => (
              <tr key={index} className="hover:bg-muted/50">
                <th scope="row" className={ROW_NUMBER}>{index + 2}</th>
                {row.map((value, column) => <Cell key={column} value={value} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
