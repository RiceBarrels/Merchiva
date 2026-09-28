// Where a Drive entry leads on the manager page (drive-ui §7.5): a folder opens in the section that
// holds it (My files, Store, or a member's files for admins), a file or an app-stored link opens its
// preview over the current view, and a Doc, Sheet or Slides file opens its editor. Pure.

import type { DriveUrlParams } from "@/components/drive/model/url-state";
import type { DocEntry, DriveEntry, FolderEntry } from "@/components/drive/model/types";
import { documentFileHref, driveHref } from "@/lib/drive/hrefs";

export const isDocEntry = (entry: DriveEntry): entry is DocEntry => entry.type === "doc" || entry.type === "sheet" || entry.type === "slides";

/** The view that shows a folder's content, seen by `actorMemberId`. */
export function folderParams(folder: FolderEntry, actorMemberId: string | null): Partial<DriveUrlParams> {
  const location = folder.location;
  if (location?.space === "store") return { space: "store", folder: folder.id };
  if (location && location.ownerMemberId !== actorMemberId) return { space: "members", member: location.ownerMemberId, folder: folder.id };
  return { space: "my", folder: folder.id };
}

/** An entry's link from the view `view` (the preview keeps the view's section, folder, member and source). */
export function entryHref(
  entry: DriveEntry,
  view: Pick<DriveUrlParams, "space" | "folder" | "member" | "source">,
  actorMemberId: string | null,
): string {
  if (entry.type === "folder") return driveHref(folderParams(entry, actorMemberId));
  if (isDocEntry(entry)) return documentFileHref(entry.doc);
  return driveHref({ space: view.space, folder: view.folder, member: view.member, source: view.source, preview: entry.key });
}
