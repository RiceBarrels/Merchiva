"use client";

// The details of an entry, at the foot of the preview sheet (and the whole sheet for a folder or
// a document, which never preview): what it is, how big, whose, where, when, and who can see it.
// A link kept by another app says which app keeps it and that such links are public.

import { Num } from "@/components/ui/num";
import { Eyebrow } from "@/components/ui/eyebrow";
import { entrySizeText } from "@/components/drive/model/entry-size";
import type { DriveEntry, FolderEntry } from "@/components/drive/model/types";
import { useI18n } from "@/lib/i18n/context";
import { intlLocaleTag } from "@/lib/i18n/dates";
import { fmt } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import { cn } from "@/lib/utils";
import { entryKindKey, entryLabel } from "./preview-mode";

export interface EntryDetailsProps {
  entry: DriveEntry;
  /** Folders from the root of the entry's space down to its parent (DriveTree.pathOf). */
  path?: readonly FolderEntry[];
  /** A folder's entries directly inside it (DriveTree.childrenOf); null when unknown. */
  childCount?: number | null;
  className?: string;
}

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </>
  );
}

/** Where the entry lives: its space's root ("My files", "Store", "Ana's files"), then the folders down to it. */
function locationText(entry: DriveEntry, path: readonly FolderEntry[], t: (key: string) => string): string | null {
  if (entry.type === "virtual") {
    const app = fmt(t("drive.apps.storedIn"), { app: t(`drive.apps.sources.${entry.source}`) });
    return entry.group ? `${app} · ${entry.group}` : app;
  }
  const location = entry.location;
  if (!location) return null;
  const root =
    location.space === "store"
      ? t("drive.nav.store")
      : entry.isMine
        ? t("drive.nav.my")
        : fmt(t("drive.nav.memberFiles"), { name: entry.ownerName ?? t("drive.list.formerMember") });
  return [root, ...path.map((folder) => entryLabel(folder, t))].join(" / ");
}

/** Who can open it: links are public; otherwise the space decides, plus the sharer for a document shared with you. */
function audienceText(entry: DriveEntry, t: (key: string) => string): string[] {
  // A form's answers are rows, not public links: management reads every response (the Forms disclosure).
  if (entry.type === "virtual") return [t(entry.href ? "forms.disclosure.managersNote" : "drive.apps.linkNotice")];
  const lines: string[] = [];
  if ((entry.type === "doc" || entry.type === "sheet" || entry.type === "slides") && entry.sharedWithMe) {
    lines.push(fmt(t("drive.preview.sharedBy"), { name: entry.ownerName ?? t("drive.list.formerMember") }));
  }
  if (entry.location?.space === "store") lines.push(t("drive.disclosure.storeFilesHint"));
  else if (entry.location?.space === "my") lines.push(t("drive.disclosure.myFilesHint"));
  return lines;
}

export function EntryDetails({ entry, path = [], childCount = null, className }: EntryDetailsProps) {
  const { t, locale } = useI18n();
  const formatDate = useDateFormat();
  const owner = entry.ownerMemberId
    ? entry.isMine
      ? t("drive.list.me")
      : (entry.ownerName ?? t("drive.list.formerMember"))
    : null;
  const where = locationText(entry, path, t);
  const audience = audienceText(entry, t);
  const size = entrySizeText(entry, locale);
  const date = (ms: number) => <Num size="xs" value={formatDate(ms, DATE_TIME)} />;

  return (
    <div className={cn("space-y-3", className)}>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5">
        <Row label={t("drive.preview.info.type")}>{t(entryKindKey(entry))}</Row>
        {size !== null && (
          <Row label={t("drive.preview.info.size")}>
            <Num size="xs" value={size} />
          </Row>
        )}
        {entry.type === "folder" && childCount !== null && (
          <Row label={t("drive.preview.info.items")}>
            <Num size="xs" value={childCount.toLocaleString(intlLocaleTag(locale))} />
          </Row>
        )}
        {owner && <Row label={t("drive.preview.info.owner")}>{owner}</Row>}
        {where && (
          <Row label={t("drive.preview.info.location")}>
            <span dir="auto">{where}</span>
          </Row>
        )}
        {entry.createdAt > 0 && <Row label={t("drive.preview.info.created")}>{date(entry.createdAt)}</Row>}
        {entry.updatedAt > 0 && entry.updatedAt !== entry.createdAt && (
          <Row label={t("drive.preview.info.modified")}>{date(entry.updatedAt)}</Row>
        )}
        {entry.trashedAt !== null && <Row label={t("drive.list.col.trashed")}>{date(entry.trashedAt)}</Row>}
      </dl>
      {audience.length > 0 && (
        <div className="space-y-1">
          <Eyebrow>{t("drive.disclosure.whoCanSee")}</Eyebrow>
          {audience.map((line) => (
            <p key={line} className="text-xs leading-relaxed text-muted-foreground">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
