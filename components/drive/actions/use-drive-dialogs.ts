"use client";

// The dialogs of the Drive manager page and what their buttons do (drive-ui §7.6–§7.7): name (new
// folder, rename), move, space change, delete forever and share. Each target keeps its value after
// closing, so the dialog keeps its text while it animates out. The submit functions toast a failure
// and reject, so the dialog stays open with what the person typed; useDriveActions opens them.

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { DriveTree } from "@/components/drive/model/entries";
import type { MovePlan } from "@/components/drive/model/move";
import { uniqueSiblingName } from "@/components/drive/model/names";
import type { DocEntry, DriveDocKind, DriveEntry, DriveMoveTarget } from "@/components/drive/model/types";
import { announceWrite } from "./action-toasts";
import { driveWriteErrorKey, type DriveWrite, type DriveWriteResult } from "./drive-writes";

export interface DriveDialogTarget<T> {
  readonly open: boolean;
  /** Kept after closing, so the dialog keeps its text while it animates out. */
  readonly value: T | null;
}

export interface DriveNameTarget {
  mode: "newFolder" | "rename";
  /** The entry renamed (rename). */
  entry: DriveEntry | null;
  /** Where the folder is created (newFolder). */
  target: DriveMoveTarget | null;
  initialName: string;
  kind: "folder" | "file" | DriveDocKind;
}

export interface UseDriveDialogsOptions {
  tree: DriveTree;
  /** runDriveWrite with the page's actor and store. */
  write(w: DriveWrite): Promise<DriveWriteResult>;
  /** Moves and toasts where things went (useDriveActions). */
  runMove(plan: MovePlan): Promise<void>;
  /** After "New folder" landed in `target` (not the move dialog's, which shows its new folder itself). */
  onFolderCreated?(target: DriveMoveTarget): void;
  t: (key: string) => string;
  locale: string;
}

export interface DriveDialogs {
  name: DriveDialogTarget<DriveNameTarget>;
  setNameOpen(open: boolean): void;
  submitName(name: string): Promise<void>;
  /** Opens "New folder" in `target` with a free "Untitled folder" name. */
  createFolder(target: DriveMoveTarget): void;
  openRename(entry: DriveEntry): void;
  move: DriveDialogTarget<readonly DriveEntry[]>;
  setMoveOpen(open: boolean): void;
  openMove(entries: readonly DriveEntry[]): void;
  submitMove(plan: MovePlan): Promise<void>;
  /** "New folder" inside the move dialog; resolves to the new folder's id. */
  createFolderIn(target: DriveMoveTarget, name: string): Promise<string>;
  spaceChange: DriveDialogTarget<MovePlan>;
  setSpaceChangeOpen(open: boolean): void;
  openSpaceChange(plan: MovePlan): void;
  confirmSpaceChange(): Promise<void>;
  remove: DriveDialogTarget<readonly DriveEntry[]>;
  setRemoveOpen(open: boolean): void;
  openRemove(entries: readonly DriveEntry[]): void;
  confirmRemove(): Promise<void>;
  share: DriveDialogTarget<DocEntry>;
  setShareOpen(open: boolean): void;
  openShare(entry: DocEntry): void;
}

const CLOSED = { open: false, value: null } as const;

/** Opens a dialog target with `value`. */
function opener<T>(set: Dispatch<SetStateAction<DriveDialogTarget<T>>>): (value: T) => void {
  return (value) => set({ open: true, value });
}

/** Opens or closes a dialog target, keeping its value. */
function openSetter<T>(set: Dispatch<SetStateAction<DriveDialogTarget<T>>>): (next: boolean) => void {
  return (next) => set((prev) => ({ ...prev, open: next }));
}

export function useDriveDialogs({ tree, write, runMove, onFolderCreated, t, locale }: UseDriveDialogsOptions): DriveDialogs {
  const [name, setName] = useState<DriveDialogTarget<DriveNameTarget>>(CLOSED);
  const [move, setMove] = useState<DriveDialogTarget<readonly DriveEntry[]>>(CLOSED);
  const [spaceChange, setSpaceChange] = useState<DriveDialogTarget<MovePlan>>(CLOSED);
  const [remove, setRemove] = useState<DriveDialogTarget<readonly DriveEntry[]>>(CLOSED);
  const [share, setShare] = useState<DriveDialogTarget<DocEntry>>(CLOSED);

  const setters = useMemo(
    () => ({
      setNameOpen: openSetter(setName),
      setMoveOpen: openSetter(setMove),
      openMove: opener(setMove),
      setSpaceChangeOpen: openSetter(setSpaceChange),
      openSpaceChange: opener(setSpaceChange),
      setRemoveOpen: openSetter(setRemove),
      openRemove: opener(setRemove),
      setShareOpen: openSetter(setShare),
      openShare: opener(setShare),
    }),
    [],
  );

  const createFolder = useCallback(
    (target: DriveMoveTarget) => {
      const siblings = tree.childrenOf(target).map((entry) => entry.name);
      const initialName = uniqueSiblingName(t("drive.dialogs.untitledFolder"), siblings, locale);
      setName({ open: true, value: { mode: "newFolder", entry: null, target, initialName, kind: "folder" } });
    },
    [tree, t, locale],
  );

  const openRename = useCallback((entry: DriveEntry) => {
    if (entry.type === "virtual") return;
    setName({ open: true, value: { mode: "rename", entry, target: null, initialName: entry.name, kind: entry.type } });
  }, []);

  /** A write from a dialog: toast and rethrow on failure, so the dialog stays open. */
  const fromDialog = useCallback(
    async (task: () => Promise<void>) => {
      try {
        await task();
      } catch (err) {
        toast.error(t(driveWriteErrorKey(err)));
        throw err;
      }
    },
    [t],
  );

  const submitName = useCallback(
    (value: string) =>
      fromDialog(async () => {
        const current = name.value;
        if (current?.mode === "rename" && current.entry) {
          await write({ kind: "rename", entry: current.entry, name: value });
        } else if (current?.mode === "newFolder" && current.target) {
          await write({ kind: "newFolder", target: current.target, name: value });
          onFolderCreated?.(current.target);
        }
      }),
    [fromDialog, name.value, write, onFolderCreated],
  );

  const createFolderIn = useCallback(
    async (target: DriveMoveTarget, value: string): Promise<string> => {
      let id = "";
      await fromDialog(async () => {
        id = (await write({ kind: "newFolder", target, name: value })).createdId ?? "";
      });
      return id;
    },
    [fromDialog, write],
  );

  const submitMove = useCallback((plan: MovePlan) => fromDialog(() => runMove(plan)), [fromDialog, runMove]);

  const confirmSpaceChange = useCallback(async () => {
    const plan = spaceChange.value;
    if (plan) await fromDialog(() => runMove(plan));
  }, [fromDialog, runMove, spaceChange.value]);

  const confirmRemove = useCallback(async () => {
    const entries = remove.value;
    if (!entries) return;
    await fromDialog(async () => {
      const result = await write({ kind: "deleteForever", entries });
      announceWrite(result, { success: t("drive.home.deletedForever") }, t);
    });
  }, [fromDialog, remove.value, write, t]);

  return useMemo(
    () => ({
      ...setters,
      name, submitName, createFolder, openRename,
      move, submitMove, createFolderIn,
      spaceChange, confirmSpaceChange,
      remove, confirmRemove,
      share,
    }),
    [setters, name, submitName, createFolder, openRename, move, submitMove, createFolderIn, spaceChange, confirmSpaceChange, remove, confirmRemove, share],
  );
}
