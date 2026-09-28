"use client";

// "Move" for one or more Drive entries (drive-ui §7.6): a one-level folder picker that starts in
// the entries' own container. The roots it offers come from moveRoots (the Store root, and the My
// files of the one member who owns everything moved); a root that is not offered is not shown.
// Every folder row and the "Move here" button ask planMove, so the dialog never offers a move
// the module would refuse: a folder the entries can't enter (itself, one inside it, one in the
// trash) is disabled with the reason, and any other block is said under the list. A move that
// changes who can see the items says so and relabels the button. "New folder" creates a folder
// where the picker is and enters it.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Folder, FolderPlus, HardDrive, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DialogActions } from "@/components/ui/dialog-actions";
import { Input } from "@/components/ui/input";
import { OptionRow } from "@/components/ui/option-row";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { entryDisplayName } from "@/components/drive/list/entry-card";
import { folderContainer, type DriveTree } from "@/components/drive/model/entries";
import { MOVE_BLOCK_I18N, moveRoots, planMove, type MoveActor, type MoveBlockReason, type MovePlan } from "@/components/drive/model/move";
import { cleanEntryName, driveNameProblem, uniqueSiblingName } from "@/components/drive/model/names";
import type { DriveEntry, DriveMoveTarget, FolderEntry } from "@/components/drive/model/types";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { spaceChangeCopy } from "./space-change-dialog";

/** Blocks that make a folder impossible to enter, not just to move into. */
const ENTER_BLOCKS: ReadonlySet<MoveBlockReason> = new Set<MoveBlockReason>(["intoSelf", "intoDescendant", "targetTrashed"]);

export interface MoveDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** What moves (kept by the caller after closing). */
  entries: readonly DriveEntry[];
  tree: DriveTree;
  actor: MoveActor;
  /** org_member id → display name, for another member's My files. */
  memberNames: ReadonlyMap<string, string>;
  /** Moves. Resolve to close the dialog; reject to keep it open (the caller shows the error). */
  onMove(plan: MovePlan): Promise<void>;
  /** Creates a folder in `target` and resolves to its id; absent = no "New folder". Rejects after showing the error. */
  onCreateFolder?(target: DriveMoveTarget, name: string): Promise<string>;
}

/** The container the entries are in, when they all share one; else null (the picker starts at the roots). */
function startOf(entries: readonly DriveEntry[]): DriveMoveTarget | null {
  const first = entries[0]?.location;
  if (!first) return null;
  const same = entries.every((e) => e.location && e.location.space === first.space && e.location.parentId === first.parentId
    && (first.space === "store" || e.location.ownerMemberId === first.ownerMemberId));
  return same ? { space: first.space, parentId: first.parentId, ownerMemberId: first.space === "my" ? first.ownerMemberId : "" } : null;
}

export function MoveDialog({ open, onOpenChange, entries, tree, actor, memberNames, onMove, onCreateFolder }: MoveDialogProps) {
  const { t, locale } = useI18n();
  const [location, setLocation] = useState<DriveMoveTarget | null>(() => startOf(entries));
  const [moving, setMoving] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** Names of folders created here that the subscription has not delivered yet. */
  const [madeNames, setMadeNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLocation(startOf(entries));
      setMoving(false);
      setDraft(null);
      setCreating(false);
    }
  }

  const roots = useMemo(() => moveRoots(entries, tree, actor), [entries, tree, actor]);
  const folders = useMemo(
    (): FolderEntry[] => (location ? tree.childrenOf(location).filter((e): e is FolderEntry => e.type === "folder" && e.trashedAt === null) : []),
    [location, tree],
  );
  const plan = useMemo(() => (location ? planMove(entries, location, tree, actor) : null), [location, entries, tree, actor]);

  const rootLabel = (target: DriveMoveTarget): string => {
    if (target.space === "store") return t("drive.dialogs.storeRoot");
    if (target.ownerMemberId === actor.memberId) return t("drive.dialogs.myFiles");
    const name = memberNames.get(target.ownerMemberId);
    return name ? fmt(t("drive.dialogs.memberFiles"), { name }) : t("drive.list.formerMember");
  };
  const locationLabel = (target: DriveMoveTarget): string => {
    if (target.parentId === "") return rootLabel(target);
    const folder = tree.folders.get(target.parentId);
    if (folder) return entryDisplayName(folder, t);
    return madeNames.get(target.parentId) ?? t("drive.list.untitled.folder");
  };
  const goUp = () => {
    if (!location || location.parentId === "") {
      setLocation(null);
      return;
    }
    const folder = tree.folders.get(location.parentId);
    const parent = folder?.location;
    setLocation(parent ? { space: parent.space, parentId: parent.parentId, ownerMemberId: parent.space === "my" ? parent.ownerMemberId : "" } : null);
  };

  const submit = async () => {
    if (!plan || plan.blocked !== null || moving) return;
    setMoving(true);
    try {
      await onMove(plan);
      onOpenChange(false);
    } catch {
      // Stay open; onMove reports the error.
    } finally {
      setMoving(false);
    }
  };

  const siblingNames = folders.map((folder) => folder.name);
  const draftProblem = draft === null ? null : driveNameProblem(draft, "folder");
  const createFolder = async () => {
    if (!location || !onCreateFolder || draft === null || draftProblem || creating) return;
    const name = cleanEntryName(draft);
    setCreating(true);
    try {
      const id = await onCreateFolder(location, name);
      setMadeNames((prev) => new Map(prev).set(id, name));
      setDraft(null);
      setLocation({ space: location.space, parentId: id, ownerMemberId: location.space === "my" ? location.ownerMemberId : "" });
    } catch {
      // Keep the draft; onCreateFolder reports the error.
    } finally {
      setCreating(false);
    }
  };

  const canCreateHere = location !== null && !!onCreateFolder && plan?.blocked !== "targetNotWritable" && plan?.blocked !== "targetTrashed";
  const copy = spaceChangeCopy(plan?.changesSpace ?? null);
  const title =
    entries.length === 1
      ? fmt(t("drive.dialogs.moveTitleOne"), { name: entryDisplayName(entries[0], t) })
      : fmt(t("drive.dialogs.moveTitle"), { count: entries.length });
  const confirmLabel = plan?.changesSpace && !plan.blocked
    ? t(copy.confirmKey)
    : fmt(t("drive.dialogs.moveHere"), { folder: location ? locationLabel(location) : "" });

  const rootRows = [roots.my, roots.store].filter((root): root is DriveMoveTarget => root !== null);

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="[overflow-wrap:anywhere]">{title}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-3">
          <div className="flex min-h-8 items-center gap-1.5">
            {location !== null && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("drive.dialogs.back")} title={t("drive.dialogs.back")} onClick={goUp}>
                <ChevronLeft aria-hidden className="rtl:rotate-180" />
              </Button>
            )}
            <p dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {location ? locationLabel(location) : t("drive.nav.label")}
            </p>
            {canCreateHere && draft === null && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setDraft(uniqueSiblingName(t("drive.dialogs.untitledFolder"), siblingNames, locale))}>
                <FolderPlus aria-hidden />
                {t("drive.dialogs.newFolderHere")}
              </Button>
            )}
          </div>

          {draft !== null && (
            <form
              className="flex items-center gap-2"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void createFolder();
              }}
            >
              <Input
                value={draft}
                dir="auto"
                autoFocus
                aria-label={t("drive.dialogs.nameLabel")}
                aria-invalid={draftProblem ? true : undefined}
                readOnly={creating}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDraft(event.target.value)}
                className="h-8 min-w-0 flex-1"
              />
              <Button type="submit" size="sm" disabled={creating || draftProblem !== null}>
                {t("drive.dialogs.create")}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={creating} onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
            </form>
          )}

          <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto overscroll-contain">
            {location === null
              ? rootRows.map((root) => (
                  <OptionRow
                    key={`${root.space}:${root.ownerMemberId}`}
                    role="button"
                    aria-checked={undefined}
                    hideCheck
                    icon={root.space === "store" ? Store : HardDrive}
                    title={<span dir="auto">{rootLabel(root)}</span>}
                    meta={<ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground rtl:rotate-180" />}
                    onSelect={() => setLocation(root)}
                  />
                ))
              : folders.map((folder) => {
                  const blocked = planMove(entries, folderContainer(folder), tree, actor).blocked;
                  const closed = blocked !== null && ENTER_BLOCKS.has(blocked);
                  return (
                    <OptionRow
                      key={folder.key}
                      role="button"
                      aria-checked={undefined}
                      aria-disabled={closed || undefined}
                      hideCheck
                      icon={Folder}
                      title={<span dir="auto">{entryDisplayName(folder, t)}</span>}
                      description={closed && blocked ? t(MOVE_BLOCK_I18N[blocked]) : undefined}
                      meta={closed ? undefined : <ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground rtl:rotate-180" />}
                      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-background"
                      onSelect={() => {
                        if (!closed) setLocation(folderContainer(folder));
                      }}
                    />
                  );
                })}
            {location !== null && folders.length === 0 && (
              <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t("drive.dialogs.noFolders")}</p>
            )}
          </div>

          {plan?.blocked && (
            <p role="status" className="text-xs text-muted-foreground">
              {t(MOVE_BLOCK_I18N[plan.blocked])}
            </p>
          )}
          {plan?.changesSpace && !plan.blocked && (
            <Callout tone="warning">
              {t(copy.warningKey)}{" "}
              <span className="tabular-nums">{fmt(t("drive.dialogs.spaceChangeCount"), { items: plan.affected.items, documents: plan.affected.documents })}</span>
            </Callout>
          )}

          <DialogActions
            onCancel={() => onOpenChange(false)}
            onConfirm={() => {
              void submit();
            }}
            saving={moving}
            disabled={!plan || plan.blocked !== null}
            cancelLabel={t("common.cancel")}
            confirmLabel={<span dir="auto" className="max-w-56 truncate">{confirmLabel}</span>}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
