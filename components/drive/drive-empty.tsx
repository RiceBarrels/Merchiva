"use client";

// What an empty Drive view says (drive-ui §7.8), one state per DriveEmptyKind. Where the person
// may add files, My files offers Upload and New folder, Store and a folder offer Upload; a search
// offers "Clear filters", and a folder that is gone offers the way back to My files.

import {
  Clock, FolderOpen, FolderPlus, FolderX, HardDrive, LayoutGrid, SearchX, Star, Store, Trash2, Upload, UserRound, Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { DriveEmptyKind } from "@/components/drive/model/listing";
import { useT } from "@/lib/i18n/context";

interface EmptyCopy {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string | null;
}

const COPY: Readonly<Record<DriveEmptyKind, EmptyCopy>> = {
  my: { icon: HardDrive, titleKey: "drive.list.empty.myTitle", descriptionKey: "drive.list.empty.myDescription" },
  store: { icon: Store, titleKey: "drive.list.empty.storeTitle", descriptionKey: "drive.list.empty.storeDescription" },
  folder: { icon: FolderOpen, titleKey: "drive.list.empty.folderTitle", descriptionKey: "drive.list.empty.folderDescription" },
  shared: { icon: Users, titleKey: "drive.list.empty.sharedTitle", descriptionKey: "drive.list.empty.sharedDescription" },
  recent: { icon: Clock, titleKey: "drive.list.empty.recentTitle", descriptionKey: "drive.list.empty.recentDescription" },
  starred: { icon: Star, titleKey: "drive.list.empty.starredTitle", descriptionKey: "drive.list.empty.starredDescription" },
  trash: { icon: Trash2, titleKey: "drive.list.empty.trashTitle", descriptionKey: "drive.list.empty.trashDescription" },
  member: { icon: UserRound, titleKey: "drive.list.empty.memberTitle", descriptionKey: "drive.list.empty.memberDescription" },
  apps: { icon: LayoutGrid, titleKey: "drive.apps.empty", descriptionKey: null },
  search: { icon: SearchX, titleKey: "drive.list.empty.searchTitle", descriptionKey: "drive.list.empty.searchDescription" },
  missingFolder: { icon: FolderX, titleKey: "drive.list.empty.missingFolderTitle", descriptionKey: "drive.list.empty.missingFolderDescription" },
};

export interface DriveEmptyProps {
  kind: DriveEmptyKind;
  /** Files can be added here right now (a create target, connected, notice acknowledged). */
  canCreate: boolean;
  onUpload(): void;
  onNewFolder(): void;
  onClearFilters(): void;
  onGoToMy(): void;
  className?: string;
}

export function DriveEmpty({ kind, canCreate, onUpload, onNewFolder, onClearFilters, onGoToMy, className }: DriveEmptyProps) {
  const t = useT();
  const copy = COPY[kind];

  let action: React.ReactNode = null;
  if (kind === "search") {
    action = (
      <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
        {t("drive.home.clearFilters")}
      </Button>
    );
  } else if (kind === "missingFolder") {
    action = (
      <Button type="button" variant="outline" size="sm" onClick={onGoToMy}>
        {t("drive.list.empty.goToMy")}
      </Button>
    );
  } else if (canCreate && (kind === "my" || kind === "store" || kind === "folder")) {
    action = (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={onUpload}>
          <Upload aria-hidden className="h-3.5 w-3.5" />
          {t("drive.home.upload")}
        </Button>
        {kind === "my" && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onNewFolder}>
            <FolderPlus aria-hidden className="h-3.5 w-3.5" />
            {t("drive.menu.newFolder")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <EmptyState
      icon={copy.icon}
      title={t(copy.titleKey)}
      description={copy.descriptionKey ? t(copy.descriptionKey) : undefined}
      action={action ?? undefined}
      className={className}
      data-drive-empty={kind}
    />
  );
}
