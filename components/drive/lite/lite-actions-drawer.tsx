"use client";

// The bottom sheets of one entry in the Drive lite app (drive-ui §14.4): its actions, its details, and the
// second question before something that can't be undone here (delete, delete forever) or that changes who can
// see it (share with the store, move back to my files). Every sheet reads the router's context and keeps its
// last entry while it slides away. Writes go through the context's runWrite, which toasts how they went.

import { useMemo } from "react";
import { HardDrive, Store, Trash2 } from "lucide-react";
import { DeviceDrawer, type DeviceDrawerOption } from "@/components/device/device-drawer";
import { LiteButton } from "@/components/device/apps/lite";
import { folderContainer } from "@/components/drive/model/entries";
import type { DriveEntry } from "@/components/drive/model/types";
import { EntryDetails } from "@/components/drive/preview/details-list";
import { entryLabel } from "@/components/drive/preview/preview-mode";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext } from "./lite-context";
import { liteActionOptions } from "./lite-actions";
import { liteTargetLabel } from "./lite-labels";

/** The entry as the tree has it now (a rename or a move may have landed since the sheet opened). */
function useFresh(entry: DriveEntry | null): DriveEntry | null {
  const { drive } = useLiteDriveContext();
  if (!entry) return null;
  return drive.data.tree.byKey.get(entry.key) ?? entry;
}

export function LiteActionsDrawer() {
  const t = useT();
  const { drive, nav, panels, act } = useLiteDriveContext();
  const entry = useFresh(panels.state.actions);
  const { ctx, movesFor } = drive;
  // On the entry's own preview, "Preview" / "Open" would lead where the person already is.
  const onItsPreview = entry !== null && nav.top.kind === "preview" && nav.top.key === entry.key;
  // moveRoots walks a folder's content: once per entry and tree, not on every render of the panel.
  const rows = useMemo(() => {
    if (!entry) return [];
    const all = liteActionOptions(entry, ctx, movesFor(entry));
    return onItsPreview ? all.filter((option) => option.action !== "preview" && option.action !== "open") : all;
  }, [entry, ctx, movesFor, onItsPreview]);
  const options: DeviceDrawerOption[] = entry
    ? rows.map((option) => ({
        id: option.action,
        icon: option.icon,
        label: t(option.labelKey),
        tone: option.tone,
        onSelect: () => {
          panels.close();
          act(entry, option.action);
        },
      }))
    : [];
  return (
    <DeviceDrawer
      open={panels.state.open === "actions"}
      onOpenChange={(open) => { if (!open) panels.close(); }}
      title={entry ? entryLabel(entry, t) : t("device.lite.drive.actions")}
      options={options}
    />
  );
}

export function LiteDetailsDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  const entry = useFresh(panels.state.details);
  const tree = drive.data.tree;
  return (
    <DeviceDrawer
      open={panels.state.open === "details"}
      onOpenChange={(open) => { if (!open) panels.close(); }}
      title={entry ? entryLabel(entry, t) : t("device.lite.drive.details")}
      cancelLabel={t("common.close")}
    >
      {entry && (
        <EntryDetails
          entry={entry}
          path={entry.type === "virtual" ? [] : tree.pathOf(entry)}
          childCount={entry.type === "folder" ? tree.childrenOf(folderContainer(entry)).length : null}
          className="pb-2"
        />
      )}
    </DeviceDrawer>
  );
}

export function LiteConfirmDrawer() {
  const t = useT();
  const { drive, nav, panels } = useLiteDriveContext();
  const confirm = panels.state.confirm;
  const entry = useFresh(confirm?.entry ?? null);
  const forever = confirm?.action === "deleteForever";
  const name = entry ? entryLabel(entry, t) : "";

  const run = () => {
    if (!confirm || !entry) return;
    panels.close();
    // Once it is gone, its preview closes, if that is still where the person is when the write lands (up to the
    // reducer timeout later; they may have gone Back or elsewhere meanwhile).
    const leavePreview = (ok: boolean) => {
      if (ok) nav.popIfTop({ kind: "preview", key: entry.key });
    };
    if (forever) {
      void drive.runWrite({ kind: "deleteForever", entries: [entry] }, t("drive.home.deletedForever")).then(leavePreview);
      return;
    }
    const undo = () => void drive.runWrite({ kind: "restore", entries: [entry] }, t("drive.home.restored"));
    void drive.runWrite({ kind: "trash", entries: [entry] }, t("drive.home.trashed"), undo).then(leavePreview);
  };

  const option: DeviceDrawerOption = {
    id: "confirm",
    icon: Trash2,
    label: t(forever ? "device.lite.drive.deleteForever" : "device.lite.drive.trashItem"),
    sub: forever && entry?.type === "folder" ? t("drive.dialogs.deleteForeverFolderNote") : undefined,
    tone: "warn",
    onSelect: run,
  };
  return (
    <DeviceDrawer
      open={panels.state.open === "confirm"}
      onOpenChange={(open) => { if (!open) panels.close(); }}
      title={fmt(t(forever ? "device.lite.drive.confirmDeleteForever" : "device.lite.drive.confirmTrash"), { name })}
      options={entry ? [option] : []}
    />
  );
}

/** "Share with store" / "Move to my files": who can see it changes, so it is asked first. */
export function LiteSpaceChangeDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  const plan = panels.state.space;
  const toStore = plan?.changesSpace === "toStore";
  const { tree, actor, memberNames } = drive.data;
  const moved = plan ? plan.affected.items + plan.affected.documents : 0;

  const run = () => {
    if (!plan) return;
    panels.close();
    const folder = liteTargetLabel(plan.target, { folders: tree.folders, actorMemberId: actor.memberId, memberNames, t });
    void drive.runWrite({ kind: "move", plan }, fmt(t("drive.home.moved"), { folder }));
  };

  return (
    <DeviceDrawer
      open={panels.state.open === "space"}
      onOpenChange={(open) => { if (!open) panels.close(); }}
      title={t(toStore ? "drive.dialogs.spaceChangeTitleToStore" : "drive.dialogs.spaceChangeTitleToMy")}
    >
      {plan && (
        <div className="flex flex-col gap-3 pb-1">
          <p className="text-[15px] leading-relaxed">{t(toStore ? "device.lite.drive.toStoreWarning" : "device.lite.drive.toMyWarning")}</p>
          {moved > 1 && (
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {fmt(t("drive.dialogs.spaceChangeCount"), { items: plan.affected.items, documents: plan.affected.documents })}
            </p>
          )}
          <LiteButton
            icon={toStore ? Store : HardDrive}
            label={t(toStore ? "device.lite.drive.moveToStore" : "device.lite.drive.moveToMy")}
            busy={drive.busy}
            onClick={run}
          />
        </div>
      )}
    </DeviceDrawer>
  );
}
