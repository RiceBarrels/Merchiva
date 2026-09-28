// The kind icon of a Drive entry: folders, Docs / Sheets / Slides, and uploaded or app-stored
// files by their kind (lib/drive/file-kinds.ts). Neutral like every list icon in the app; the
// kind label next to it (drive.kind.*) says the rest. Also used by the upload tray, which only
// knows a name, through fileKindIcon.

import {
  File,
  FileArchive,
  FileAudio,
  FileChartPie,
  FileImage,
  FilePen,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  FolderOpen,
  Presentation,
  Sheet,
  type LucideIcon,
} from "lucide-react";
import type { DriveFileKind } from "@/lib/drive/file-kinds";
import { cn } from "@/lib/utils";
import type { DriveDocKind } from "@/components/drive/model/types";

/** Anything with an entry's shape: every DriveEntry qualifies. */
export type EntryIconSubject =
  | { type: "folder" }
  | { type: DriveDocKind }
  | { type: "file" | "virtual"; fileKind: DriveFileKind };

const FILE_KIND_ICONS: Readonly<Record<DriveFileKind, LucideIcon>> = {
  image: FileImage,
  pdf: FileType2,
  video: FileVideo,
  audio: FileAudio,
  text: FileText,
  csv: FileSpreadsheet,
  document: FilePen,
  spreadsheet: FileSpreadsheet,
  presentation: FileChartPie,
  archive: FileArchive,
  other: File,
};

const DOC_ICONS: Readonly<Record<DriveDocKind, LucideIcon>> = {
  doc: FileText,
  sheet: Sheet,
  slides: Presentation,
};

/** The icon of an uploaded file's kind. */
export function fileKindIcon(kind: DriveFileKind): LucideIcon {
  return FILE_KIND_ICONS[kind] ?? File;
}

/** The icon of an entry; `open` shows a folder open (a drop target under the pointer, the current folder). */
export function entryIconFor(subject: EntryIconSubject, open = false): LucideIcon {
  switch (subject.type) {
    case "folder":
      return open ? FolderOpen : Folder;
    case "doc":
    case "sheet":
    case "slides":
      return DOC_ICONS[subject.type];
    case "file":
    case "virtual":
      return fileKindIcon(subject.fileKind);
  }
}

export interface EntryIconProps {
  entry: EntryIconSubject;
  open?: boolean;
  /** Size and colour overrides; default `h-4 w-4 text-muted-foreground`. */
  className?: string;
}

/** Decorative: the entry's name next to it carries the meaning. */
export function EntryIcon({ entry, open = false, className }: EntryIconProps) {
  const classes = cn("h-4 w-4 shrink-0 text-muted-foreground", className);
  // Module-level lookups, not entryIconFor(): a component returned by a call during render is a new component type
  // to React's lint (react-hooks/static-components).
  if (entry.type === "folder") return open ? <FolderOpen aria-hidden className={classes} /> : <Folder aria-hidden className={classes} />;
  if (entry.type === "file" || entry.type === "virtual") {
    const KindIcon = FILE_KIND_ICONS[entry.fileKind] ?? File;
    return <KindIcon aria-hidden className={classes} />;
  }
  const DocIcon = DOC_ICONS[entry.type];
  return <DocIcon aria-hidden className={classes} />;
}
