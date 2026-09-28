"use client";

// "New" on the Drive lite home (drive-ui §14.3): a bottom sheet with Folder, Doc (when the Docs app is
// installed), Sheet, Slides and "Choose photos". A folder asks for its name; a document is created where the
// person is and opens in its editor inside the panel; photos go through the library picker. The picker opens
// from the same tap that closes the sheet, which the browser needs to allow it. While uploads are off (the file
// store is unavailable; the home screen's note says so) "Choose photos" is not offered.

import { FileText, FolderPlus, Images, Presentation, Sheet } from "lucide-react";
import { DeviceDrawer, type DeviceDrawerOption } from "@/components/device/device-drawer";
import { uniqueSiblingName } from "@/components/drive/model/names";
import type { DriveMoveTarget } from "@/components/drive/model/types";
import { useI18n } from "@/lib/i18n/context";
import { useLiteDriveContext } from "./lite-context";

export interface LiteNewDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Where the new things go. */
  target: DriveMoveTarget;
  /** Opens the photo library (useDriveFilePickers().pickPhotos); null while uploads are off. */
  onPickPhotos: (() => void) | null;
}

export function LiteNewDrawer({ open, onOpenChange, target, onPickPhotos }: LiteNewDrawerProps) {
  const { t, locale } = useI18n();
  const { drive, panels } = useLiteDriveContext();
  const pick = (run: () => void) => () => {
    onOpenChange(false);
    run();
  };

  const options: DeviceDrawerOption[] = [
    {
      id: "folder",
      icon: FolderPlus,
      label: t("device.lite.drive.newFolder"),
      onSelect: pick(() => {
        const siblings = drive.data.tree.childrenOf(target).map((entry) => entry.name);
        const initialName = uniqueSiblingName(t("drive.dialogs.untitledFolder"), siblings, locale);
        panels.openName({ mode: "newFolder", entry: null, target, initialName, kind: "folder" });
      }),
    },
    {
      id: "doc",
      icon: FileText,
      label: t("device.lite.drive.newDoc"),
      hidden: !drive.docsInstalled,
      onSelect: pick(() => drive.createDocument("doc", target)),
    },
    { id: "sheet", icon: Sheet, label: t("device.lite.drive.newSheet"), onSelect: pick(() => drive.createDocument("sheet", target)) },
    { id: "slides", icon: Presentation, label: t("device.lite.drive.newSlides"), onSelect: pick(() => drive.createDocument("slides", target)) },
    {
      id: "photos",
      icon: Images,
      label: t("device.lite.drive.choosePhotos"),
      hidden: onPickPhotos === null,
      onSelect: pick(() => onPickPhotos?.()),
    },
  ];

  return <DeviceDrawer open={open} onOpenChange={onOpenChange} title={t("device.lite.drive.new")} options={options} />;
}
