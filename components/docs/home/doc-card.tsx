"use client";

import { useId } from "react";
import Link from "next/link";
import { FileText, Lock, Star, Users } from "lucide-react";
import { documentHref } from "@/lib/docs/hrefs";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { DocItemContextMenu, DocItemMenu } from "./doc-item-menu";
import {
  docItemTime,
  docItemTimeKind,
  type DocItemAction,
  type DocListItem,
  type DocScope,
  type DocSort,
} from "./doc-list-model";
import { formatDocDateTime, formatDocStamp } from "./format";

export interface DocCardProps {
  item: DocListItem;
  scope: DocScope;
  sort: DocSort;
  now: number;
  onAction(item: DocListItem, action: DocItemAction): void;
}

const EMPTY_EXCERPT_LINES = [88, 96, 72, 90, 64, 82];

/** Excerpt on an always-light "paper" sheet, drawn at 12px and scaled to half so browser minimum font sizes don't break it. */
function DocPaperPreview({ excerpt }: { excerpt: string }) {
  const text = excerpt.trim();
  if (!text) {
    return (
      <span className="flex flex-col gap-1.5 pt-1">
        {EMPTY_EXCERPT_LINES.map((width, index) => (
          <span key={index} className="block h-1 rounded-[1px] bg-neutral-200" style={{ width: `${width}%` }} />
        ))}
      </span>
    );
  }
  return (
    <span
      dir="auto"
      className="block w-[200%] origin-top-left scale-50 text-[12px] leading-[1.45] text-neutral-600 [overflow-wrap:anywhere] rtl:origin-top-right"
    >
      {text}
    </span>
  );
}

/**
 * Grid card. The title is a real link stretched over the card (plain click opens the
 * document in the current tab; the browser shell turns Mod/middle-click into a
 * background tab). The "⋮" button sits above the stretched link.
 */
export function DocCard({ item, scope, sort, now, onAction }: DocCardProps) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const { doc } = item;
  const title = doc.title.trim() || t("docs.untitled");
  const date = new Date(docItemTime(item, sort, scope));
  const stamp = fmt(t(`docs.home.meta.${docItemTimeKind(sort, scope)}`), { time: formatDocStamp(date, locale, now) });
  const handleAction = (action: DocItemAction) => onAction(item, action);

  return (
    <DocItemContextMenu
      item={item}
      onAction={handleAction}
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/40 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
    >
      <div aria-hidden className="aspect-[8.5/11] max-h-44 w-full border-b border-border bg-muted/50 p-3">
        <div className="h-full overflow-hidden border border-neutral-200 bg-white px-2 py-1.5">
          <DocPaperPreview excerpt={doc.excerpt} />
        </div>
      </div>
      <div className="flex items-start gap-2 p-2.5">
        <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <Link
            id={titleId}
            href={documentHref(doc.id)}
            prefetch={false}
            dir="auto"
            className="block truncate text-[13px] leading-5 font-medium text-foreground outline-none after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
            {item.isShared ? (
              <Users aria-hidden className="h-3 w-3 shrink-0" />
            ) : (
              <Lock aria-hidden className="h-3 w-3 shrink-0" />
            )}
            <span className="sr-only">{item.isShared ? t("docs.home.shared") : t("docs.home.restricted")}</span>
            {item.starred && (
              <>
                <Star aria-hidden className="h-3 w-3 shrink-0 fill-current" />
                <span className="sr-only">{t("docs.home.starred")}</span>
              </>
            )}
            <time dateTime={date.toISOString()} title={formatDocDateTime(date, locale)} className="truncate">
              {stamp}
            </time>
          </p>
        </div>
        <DocItemMenu
          item={item}
          onAction={handleAction}
          describedBy={titleId}
          className="relative z-10 -me-1.5 -mt-0.5 shrink-0"
        />
      </div>
    </DocItemContextMenu>
  );
}
