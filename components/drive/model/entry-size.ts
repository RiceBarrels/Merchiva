// Drive UI model: the stored size of an entry, for size columns, meta lines, the size sort and the members
// summary. A file has its upload's size; a document its content plus kept versions (`document_size`); an app
// file its recorded size (`app_file`). Folders, links Merchiva does not store and sizes not recorded yet are
// unknown (null) — shown as nothing, never as "0 B". Pure (no React).

import { formatDriveBytes } from "@/lib/drive/format";
import type { DriveEntry } from "./types";

export function entrySizeBytes(entry: DriveEntry): number | null {
  if (entry.type === "folder") return null;
  const bytes: unknown = entry.sizeBytes;
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

/** The entry's size for a person, or null when it is unknown. */
export function entrySizeText(entry: DriveEntry, locale: string): string | null {
  const bytes = entrySizeBytes(entry);
  return bytes === null ? null : formatDriveBytes(bytes, locale);
}
