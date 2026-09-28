"use client";

// "Move" in the Drive lite app (drive-ui §14.4): a bottom sheet that walks folders one level at a time, starting
// where the entry is. The roots the person may move it to (Store, the owner's files) are offered from the top of
// a root; a folder it can't go into says why; moving between Store and someone's files says who will see it and
// how much moves. "Move here" is the one button. The plan is the manager's (planMove), so the module's rules
// are checked before anything is sent.

import { useMemo, useState } from "react";
import { ChevronLeft, Folder, FolderInput, HardDrive, Store } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { LiteButton, LiteRow, LiteSection } from "@/components/device/apps/lite";
import { folderContainer } from "@/components/drive/model/entries";
import { MOVE_BLOCK_I18N, moveRoots, planMove } from "@/components/drive/model/move";
import type { DriveEntry, DriveMoveTarget, FolderEntry } from "@/components/drive/model/types";
import { entryLabel } from "@/components/drive/preview/preview-mode";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext } from "./lite-context";
import { liteTargetLabel } from "./lite-labels";

const STORE_ROOT: DriveMoveTarget = { space: "store", parentId: "", ownerMemberId: "" };

/** The container an entry sits in (for a folder: one level up from its content). */
function containerOf(entry: DriveEntry | undefined): DriveMoveTarget {
  const location = entry?.location;
  if (!location) return STORE_ROOT;
  return { space: location.space, parentId: location.parentId, ownerMemberId: location.space === "my" ? location.ownerMemberId : "" };
}

const sameTarget = (a: DriveMoveTarget, b: DriveMoveTarget) =>
  a.space === b.space && a.parentId === b.parentId && (a.space === "store" || a.ownerMemberId === b.ownerMemberId);

export function LiteFolderPicker() {
  const { t, locale } = useI18n();
  const { drive, panels } = useLiteDriveContext();
  const { tree, actor, memberNames } = drive.data;
  const open = panels.state.open === "move";
  const requested = panels.state.move;
  const entries = useMemo(() => requested.map((entry) => tree.byKey.get(entry.key) ?? entry), [requested, tree]);

  // Browsing starts where the (first) entry is, each time the sheet opens for new entries.
  const [browse, setBrowse] = useState<{ for: readonly DriveEntry[]; here: DriveMoveTarget }>(() => ({ for: requested, here: containerOf(requested[0]) }));
  if (open && browse.for !== requested) setBrowse({ for: requested, here: containerOf(requested[0]) });
  const here = browse.here;
  const go = (target: DriveMoveTarget) => setBrowse({ for: requested, here: target });

  const labelCtx = { folders: tree.folders, actorMemberId: actor.memberId, memberNames, t };
  const { moveActor } = drive;
  // Memoised: the sheet stays mounted (and keeps its last entries while it slides away) as the tree changes.
  const view = useMemo(() => {
    if (entries.length === 0) return null;
    const roots = moveRoots(entries, tree, moveActor);
    const movingIds = new Set(entries.map((entry) => entry.key));
    const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    const folders = tree
      .childrenOf(here)
      .filter((entry): entry is FolderEntry => entry.type === "folder" && !movingIds.has(entry.key))
      .sort((a, b) => collator.compare(entryLabel(a, t), entryLabel(b, t)))
      .map((folder) => ({ folder, inside: folderContainer(folder), reason: planMove(entries, folderContainer(folder), tree, moveActor).blocked }));
    return {
      plan: planMove(entries, here, tree, moveActor),
      rootChoices: here.parentId === "" ? [roots.store, roots.my].filter((root): root is DriveMoveTarget => root !== null && !sameTarget(root, here)) : [],
      folders,
    };
  }, [entries, here, tree, moveActor, locale, t]);
  const plan = view?.plan ?? null;
  const rootChoices = view?.rootChoices ?? [];
  const folders = view?.folders ?? [];
  const hereFolder = here.parentId !== "" ? (tree.folders.get(here.parentId) ?? null) : null;
  const up = hereFolder ? containerOf(hereFolder) : null;

  const blocked = plan?.blocked ?? null;
  const title = entries.length === 1
    ? fmt(t("drive.dialogs.moveTitleOne"), { name: entryLabel(entries[0], t) })
    : fmt(t("drive.dialogs.moveTitle"), { count: entries.length });

  const run = () => {
    if (!plan || plan.blocked !== null) return;
    const folder = liteTargetLabel(plan.target, labelCtx);
    // The sheet closes only if it is still this move's when the write lands (another sheet may be open by then).
    void drive.runWrite({ kind: "move", plan }, fmt(t("drive.home.moved"), { folder })).then((ok) => {
      if (ok) panels.closeIf("move", requested);
    });
  };

  return (
    <DeviceDrawer open={open} onOpenChange={(next) => { if (!next) panels.close(); }} title={title}>
      <div className="flex flex-col gap-3 pb-1">
        {up && (
          <LiteRow
            icon={ChevronLeft}
            title={fmt(t("device.lite.drive.backTo"), { name: liteTargetLabel(up, labelCtx) })}
            onClick={() => go(up)}
          />
        )}
        <LiteSection title={liteTargetLabel(here, labelCtx)}>
          <div className="flex flex-col gap-2">
            {rootChoices.map((root) => (
              <LiteRow
                key={`${root.space}:${root.ownerMemberId}`}
                icon={root.space === "store" ? Store : HardDrive}
                title={liteTargetLabel(root, labelCtx)}
                chevron
                onClick={() => go(root)}
              />
            ))}
            {folders.map(({ folder, inside, reason }) => (
              <LiteRow
                key={folder.key}
                icon={Folder}
                title={<span dir="auto">{entryLabel(folder, t)}</span>}
                sub={reason && reason !== "sameLocation" ? t(MOVE_BLOCK_I18N[reason]) : undefined}
                chevron
                onClick={() => go(inside)}
              />
            ))}
            {folders.length === 0 && rootChoices.length === 0 && (
              <p className="px-1 text-[13px] text-muted-foreground">{t("drive.dialogs.noFolders")}</p>
            )}
          </div>
        </LiteSection>
        {plan && blocked === null && plan.changesSpace && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[14px]">{t(plan.changesSpace === "toStore" ? "device.lite.drive.toStoreWarning" : "device.lite.drive.toMyWarning")}</p>
            {plan.affected.items + plan.affected.documents > 1 && (
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {fmt(t("drive.dialogs.spaceChangeCount"), { items: plan.affected.items, documents: plan.affected.documents })}
              </p>
            )}
          </div>
        )}
        {blocked !== null && blocked !== "sameLocation" && (
          <p className="text-[13px] text-destructive">{t(MOVE_BLOCK_I18N[blocked])}</p>
        )}
        <LiteButton icon={FolderInput} label={t("device.lite.drive.moveHere")} busy={drive.busy} disabled={blocked !== null} onClick={run} />
      </div>
    </DeviceDrawer>
  );
}
