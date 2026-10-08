"use client";

// The open-source notices list shared by /licenses and every in-app licenses panel: search, one collapsed row per
// entry, license texts on demand, and a download of the full plain-text notices. License texts are original-language
// data, so they stay LTR (also in Arabic) and are never translated.

import { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, Download, FileWarning, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loaders/geometric";
import { saveBlob } from "@/lib/docs/download";
import { fmt } from "@/lib/i18n/fmt";
import { useT } from "@/lib/i18n/context";
import { NOTICES_TXT_PATH, type NoticeEntry, type NoticesFile } from "@/lib/licenses/types";
import { cn } from "@/lib/utils";
import { useThirdPartyNotices } from "./use-third-party-notices";

const entryKey = (e: NoticeEntry) => `${e.name}\u0000${e.version}\u0000${e.source}\u0000${e.via ?? ""}`;

function matches(e: NoticeEntry, q: string): boolean {
  if (q === "") return true;
  const haystack = [e.name, e.version, e.license, e.elected ?? "", e.via ?? "", ...e.copyright].join("\n").toLowerCase();
  return haystack.includes(q);
}

function NoticeRow({ entry, texts, open, onToggle }: { entry: NoticeEntry; texts: NoticesFile["texts"]; open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p dir="ltr" className="truncate text-start font-mono text-[13px] font-medium tabular-nums text-foreground">
            {entry.name}
            {entry.version && <span className="text-muted-foreground">@{entry.version}</span>}
          </p>
          {entry.via && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{fmt(t("licenses.bundledIn"), { package: entry.via })}</p>}
        </div>
        <span dir="ltr" className="shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">{entry.elected ?? entry.license}</span>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        <span className="sr-only">{open ? t("licenses.hideText") : t("licenses.showText")}</span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {entry.elected && <p className="text-xs text-muted-foreground">{fmt(t("licenses.elected"), { license: entry.elected })}</p>}
          {entry.copyright.length > 0 && (
            <div dir="ltr" className="space-y-0.5 text-start text-xs text-foreground">
              {entry.copyright.map((line) => <p key={line}>{line}</p>)}
            </div>
          )}
          {entry.textIds.map((id) => (
            <pre
              key={id}
              dir="ltr"
              className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-2.5 text-start font-mono text-[11px] leading-relaxed text-foreground"
            >
              {texts[id] ?? ""}
            </pre>
          ))}
        </div>
      )}
    </li>
  );
}

/** The notices list. `enabled` false (a closed panel) fetches nothing. */
export function LicensesList({ enabled = true }: { enabled?: boolean }) {
  const t = useT();
  const state = useThirdPartyNotices(enabled);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);

  const file = state.status === "ready" ? state.file : null;
  const visible = useMemo(() => {
    if (!file) return [];
    const q = deferredQuery.trim().toLowerCase();
    return file.packages.filter((e) => matches(e, q));
  }, [file, deferredQuery]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const downloadAll = () => {
    setDownloading(true);
    fetch(NOTICES_TXT_PATH)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "THIRD_PARTY_NOTICES.txt"))
      .then((result) => {
        if (result === "unsupported") toast(t("docs.export.unsupported"));
      })
      .catch(() => toast.error(t("licenses.loadError")))
      .finally(() => setDownloading(false));
  };

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={20} className="text-muted-foreground" aria-label={t("common.loading")} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <EmptyState
        icon={FileWarning}
        description={t("licenses.loadError")}
        action={<Button variant="outline" size="sm" onClick={state.retry}>{t("licenses.retry")}</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("licenses.originalLanguage")}</p>
        <Button variant="outline" size="sm" onClick={downloadAll} disabled={downloading}>
          {downloading ? <Spinner size={14} aria-label={t("common.loading")} /> : <Download />}
          {t("licenses.downloadAll")}
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("licenses.search")}
          aria-label={t("licenses.search")}
          className="ps-8"
        />
      </div>
      <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmt(t("licenses.count"), { count: visible.length })}</p>
      {visible.length === 0 ? (
        <EmptyState compact icon={Search} description={t("licenses.noMatches")} />
      ) : (
        <ul className="rounded-lg border border-border">
          {visible.map((entry) => {
            const key = entryKey(entry);
            return <NoticeRow key={key} entry={entry} texts={state.file.texts} open={expanded.has(key)} onToggle={() => toggle(key)} />;
          })}
        </ul>
      )}
    </div>
  );
}
