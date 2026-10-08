// Words the Drive lite screens put next to entries (drive-ui §14.3): the one short line under a name — what it
// is or whose it is, and when it last changed ("2 MB · Sep 12", "Priya · 10:42", "Sheet · Sep 3"; a file on its
// way up says so instead) — and the name of the place something moves to. Plain functions; the dates are the
// shared docs stamps (components/docs/home/format.ts).

import { formatDocStamp } from "@/components/docs/home/format";
import { entrySizeText } from "@/components/drive/model/entry-size";
import type { ListingQuery } from "@/components/drive/model/listing";
import type { DriveEntry, DriveMoveTarget, FolderEntry } from "@/components/drive/model/types";
import { entryKindKey } from "@/components/drive/preview/preview-mode";
import { fmt } from "@/lib/i18n/fmt";

export interface EntrySubOptions {
  t: (key: string) => string;
  locale: string;
  /** Epoch ms of the minute clock (useMinuteClock): today's changes show a time. */
  now: number;
  /** The Trash list: the date is when it went to the trash. */
  trash?: boolean;
}

export function liteEntrySub(entry: DriveEntry, { t, locale, now, trash = false }: EntrySubOptions): string {
  if (entry.type === "file" && entry.uploading !== null) {
    return t(entry.uploading === "local" ? "drive.list.uploading" : "drive.list.uploadingElsewhere");
  }
  const at = trash && entry.trashedAt !== null ? entry.trashedAt : entry.updatedAt;
  const date = at > 0 ? formatDocStamp(new Date(at), locale, now) : "";
  const size = entrySizeText(entry, locale) ?? "";
  let lead: string;
  if (entry.type === "file") lead = size;
  else if (entry.type === "virtual") lead = [entry.group, entry.note ?? ""].filter((part) => part !== "").join(" · ");
  else if (!entry.isMine && entry.ownerMemberId !== "") lead = entry.ownerName ?? t("drive.list.formerMember");
  else lead = t(entryKindKey(entry));
  return [lead, entry.type === "file" ? "" : size, date].filter((part) => part !== "").join(" · ");
}

export interface TargetLabelContext {
  folders: ReadonlyMap<string, FolderEntry>;
  /** Whose My files are "Mine". */
  actorMemberId: string | null;
  memberNames: ReadonlyMap<string, string>;
  t: (key: string) => string;
}

/** Where something moves to, as the person reads it: a folder's name, "Store", "Mine" or "{name}'s files". */
export function liteTargetLabel(target: DriveMoveTarget, { folders, actorMemberId, memberNames, t }: TargetLabelContext): string {
  if (target.parentId !== "") return folders.get(target.parentId)?.name.trim() || t("drive.list.untitled.folder");
  if (target.space === "store") return t("device.lite.drive.store");
  if (target.ownerMemberId === actorMemberId) return t("device.lite.drive.mine");
  const owner = memberNames.get(target.ownerMemberId);
  return owner ? fmt(t("device.lite.drive.memberFiles"), { name: owner }) : t("drive.list.formerMember");
}

/** What a search matches for nameless entries (ListingQuery.untitled). */
export function untitledLabels(t: (key: string) => string): ListingQuery["untitled"] {
  return {
    folder: t("drive.list.untitled.folder"),
    doc: t("drive.list.untitled.doc"),
    sheet: t("drive.list.untitled.sheet"),
    slides: t("drive.list.untitled.slides"),
    file: t("drive.list.untitled.file"),
  };
}
