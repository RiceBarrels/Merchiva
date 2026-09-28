"use client";

// The Drive manager page's action runner (drive-ui §7.7): what every menu item, selection button,
// key, drop and preview-sheet button does. Writes go through runDriveWrite (drive-writes.ts, shared
// with the lite app), which names the actor and splits large batches; this hook adds the toasts,
// "Undo" after a trash, a busy state per entry and the dialogs (use-drive-dialogs.ts).
//
// Nothing here offers what the module would refuse: the menus come from driveActionGroups, moves
// are planned with planMove before anything is sent, and a blocked drop says why. Downloads start
// synchronously inside the click (startDownload). A repeated action on the same entry while the
// first is running is ignored. Failures surface as toasts and never throw out of a handler.

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import type { DriveActor } from "@/components/drive/drive-actor";
import { readDownloadEnv, type DownloadDeps, type DownloadableEntry } from "@/components/drive/download";
import type { DriveDropHandlers } from "@/components/drive/list/use-entry-dnd";
import type { ActionContext, DriveAction, DriveBulkAction } from "@/components/drive/model/actions";
import type { DriveTree } from "@/components/drive/model/entries";
import { canDropOn, MOVE_BLOCK_I18N, moveRoots, planMove, type MoveActor, type MovePlan } from "@/components/drive/model/move";
import type { DriveDocKind, DriveEntry, DriveMoveTarget, FileEntry } from "@/components/drive/model/types";
import type { DriveEntryActions } from "@/components/drive/preview/open-entry";
import type { DriveUrlState } from "@/components/drive/use-drive-url-state";
import { dateKey } from "@/lib/date-key";
import { isOrgAdminRole } from "@/lib/drive/access";
import { DRIVE_IMPORT_FAILED_KEY } from "@/lib/drive/editors";
import { documentFileHref } from "@/lib/drive/hrefs";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";
import { fmt } from "@/lib/i18n/fmt";
import { announceCreatedAway, announceWrite, countMessage, startDownload } from "./action-toasts";
import { driveWriteErrorKey, runDriveWrite, type DriveWrite, type DriveWriteResult } from "./drive-writes";
import { entryHref, folderParams, isDocEntry } from "./entry-links";
import { docCreateErrorMessage, docTargetOf, openAsTargetOf, openFileAs } from "./open-as";
import { useDriveDialogs, type DriveDialogs } from "./use-drive-dialogs";

export type { DriveDialogTarget, DriveNameTarget } from "./use-drive-dialogs";

export interface UseDriveActionsOptions {
  tree: DriveTree;
  actor: DriveActor;
  ctx: ActionContext;
  url: DriveUrlState;
  openUrl: DocsOpenUrl;
  loader: DriveUrlLoader;
  organizationId: string;
  /** The store's members (active ones may own My-files targets); names label other members' roots. */
  members: readonly { id: string; name: string; active: boolean }[];
  /** Touch "Select": enters selection mode with the entry. */
  onSelect?(key: string): void;
  /** How long a reducer call may go unanswered; default REDUCER_TIMEOUT_MS. */
  timeoutMs?: number;
  t: (key: string) => string;
  locale: string;
}

export interface DriveActions extends DriveEntryActions, DriveDialogs {
  moveActor: MoveActor;
  runBulk(entries: readonly DriveEntry[], action: DriveBulkAction): void;
  /** Moves dropped or dragged entries (a space change asks first). */
  moveKeys(keys: readonly string[], target: DriveMoveTarget): void;
  /** Drag-and-drop moves; null while offline. */
  drop: DriveDropHandlers | null;
  /** Where an entry's name links: a folder opens in place, a file previews, a document opens its editor. */
  hrefFor(entry: DriveEntry): string;
  /** A plain click on a file's link opens its preview through the URL state (so closing it steps Back). */
  openInPlace(entry: DriveEntry): boolean;
  /** Entries with an action running. */
  busyKeys: ReadonlySet<string>;
}

const NO_MOVES = { toStore: false, toMy: false };
const OPEN_AS_KIND: Partial<Record<DriveAction, DriveDocKind>> = { openAsDoc: "doc", openAsSheet: "sheet", openAsSlides: "slides" };

const isDownloadable = (entry: DriveEntry): entry is DownloadableEntry => entry.type === "file" || entry.type === "virtual";

type EntryMoves = { toStore: boolean; toMy: boolean };
const movesCache = new WeakMap<DriveTree, WeakMap<MoveActor, Map<string, EntryMoves>>>();

/** moveRoots for one entry (the menus' "Move to Store / My files"); it walks folders, so once per entry, tree and actor. */
function entryMoves(entry: DriveEntry, tree: DriveTree, actor: MoveActor): EntryMoves {
  if (entry.type === "virtual" || !entry.access.canMove) return NO_MOVES;
  let byActor = movesCache.get(tree);
  if (!byActor) {
    byActor = new WeakMap();
    movesCache.set(tree, byActor);
  }
  let byKey = byActor.get(actor);
  if (!byKey) {
    byKey = new Map();
    byActor.set(actor, byKey);
  }
  let moves = byKey.get(entry.key);
  if (!moves) {
    const roots = moveRoots([entry], tree, actor);
    moves = { toStore: roots.store !== null, toMy: roots.my !== null };
    byKey.set(entry.key, moves);
  }
  return moves;
}

export function useDriveActions(opts: UseDriveActionsOptions): DriveActions {
  const { tree, actor, ctx, url, openUrl, loader, organizationId, members, onSelect, timeoutMs, t, locale } = opts;
  const [running, setRunning] = useState<ReadonlyMap<string, DriveAction>>(new Map());
  const inflight = useRef(new Set<string>());

  const activeIds = useMemo(() => new Set(members.filter((m) => m.active).map((m) => m.id)), [members]);
  const memberNames = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const moveActor = useMemo(
    (): MoveActor => ({
      memberId: actor.memberId,
      orgAdmin: isOrgAdminRole(actor.role),
      canEditAll: actor.canEditAll,
      caller: null,
      storeOnly: false,
      isActiveMember: (id: string) => activeIds.has(id),
    }),
    [actor.memberId, actor.role, actor.canEditAll, activeIds],
  );
  const deps = useMemo(() => ({ actingMemberId: actor.actingMemberId, organizationId, timeoutMs }), [actor.actingMemberId, organizationId, timeoutMs]);
  const write = useCallback((w: DriveWrite): Promise<DriveWriteResult> => runDriveWrite(w, deps), [deps]);

  /** Runs `task` once per entry and action at a time; its failure becomes a toast. The task starts synchronously. */
  const once = useCallback(
    (key: string, action: DriveAction, task: () => Promise<unknown>) => {
      const id = `${action}:${key}`;
      if (inflight.current.has(id)) return;
      inflight.current.add(id);
      setRunning((prev) => new Map(prev).set(key, action));
      let run: Promise<unknown>;
      try {
        run = task();
      } catch (err) {
        run = Promise.reject(err);
      }
      run
        .catch((err: unknown) => {
          toast.error(t(driveWriteErrorKey(err)));
        })
        .finally(() => {
          inflight.current.delete(id);
          setRunning((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        });
    },
    [t],
  );

  /** "Moved to {folder}": a folder's name, or the root it is. */
  const targetLabel = useCallback(
    (target: DriveMoveTarget): string => {
      if (target.parentId !== "") return tree.folders.get(target.parentId)?.name.trim() || t("drive.list.untitled.folder");
      if (target.space === "store") return t("drive.nav.store");
      if (target.ownerMemberId === actor.memberId) return t("drive.nav.my");
      const owner = memberNames.get(target.ownerMemberId);
      return owner ? fmt(t("drive.nav.memberFiles"), { name: owner }) : t("drive.list.formerMember");
    },
    [tree, actor.memberId, memberNames, t],
  );

  const runMove = useCallback(
    async (plan: MovePlan) => {
      const result = await write({ kind: "move", plan });
      const folder = targetLabel(plan.target);
      const count = plan.itemIds.length + plan.documentIds.length;
      announceWrite(result, { success: count === 1 ? fmt(t("drive.home.moved"), { folder }) : fmt(t("drive.home.movedMany"), { count, folder }) }, t);
    },
    [write, targetLabel, t],
  );

  // A folder made in the root of My files from Shared, Recent or Starred lands out of view: say where it went.
  const onFolderCreated = useCallback(
    (target: DriveMoveTarget) =>
      announceCreatedAway(target, { section: ctx.section, actorMemberId: actor.memberId, showMyFiles: () => url.go({ space: "my" }) }, t),
    [ctx.section, actor.memberId, url, t],
  );
  const dialogs = useDriveDialogs({ tree, write, runMove, onFolderCreated, t, locale });
  const { openSpaceChange } = dialogs;

  const restore = useCallback(
    (entries: readonly DriveEntry[]) =>
      once(entries[0]?.key ?? "", "restore", async () => {
        const result = await write({ kind: "restore", entries });
        announceWrite(result, { success: countMessage(t, "drive.home.restored", "drive.home.restoredMany", result.total) }, t);
      }),
    [once, write, t],
  );

  const trash = useCallback(
    (entries: readonly DriveEntry[]) =>
      once(entries[0]?.key ?? "", "trash", async () => {
        const result = await write({ kind: "trash", entries });
        const success = countMessage(t, "drive.home.trashed", "drive.home.trashedMany", result.total);
        announceWrite(result, { success, action: { label: t("drive.home.undo"), onClick: () => restore(entries) } }, t);
      }),
    [once, write, restore, t],
  );

  /** A drop or a shortcut: say why it can't happen, confirm a space change, else move. */
  const startMove = useCallback(
    (plan: MovePlan) => {
      if (plan.blocked === "sameLocation") return;
      if (plan.blocked !== null) {
        toast.error(t(MOVE_BLOCK_I18N[plan.blocked]));
        return;
      }
      if (plan.changesSpace) {
        openSpaceChange(plan);
        return;
      }
      once(plan.itemIds[0] ?? plan.documentIds[0] ?? "", "move", () => runMove(plan));
    },
    [once, runMove, openSpaceChange, t],
  );

  const entriesOf = useCallback(
    (keys: readonly string[]) =>
      keys.flatMap((key) => {
        const entry = tree.byKey.get(key);
        return entry ? [entry] : [];
      }),
    [tree],
  );

  const moveKeys = useCallback(
    (keys: readonly string[], target: DriveMoveTarget) => startMove(planMove(entriesOf(keys), target, tree, moveActor)),
    [startMove, entriesOf, tree, moveActor],
  );

  const drop = useMemo(
    (): DriveDropHandlers | null =>
      ctx.offline ? null : { canDrop: (keys, target) => canDropOn(entriesOf(keys), target, tree, moveActor), onDrop: moveKeys },
    [ctx.offline, entriesOf, tree, moveActor, moveKeys],
  );

  const downloadDeps = useCallback(
    (): DownloadDeps => ({ loader, env: readDownloadEnv(), zipName: fmt(t("drive.home.zipName"), { date: dateKey() }) }),
    [loader, t],
  );

  const view = useMemo(() => ({ space: url.space, folder: url.folder, member: url.member, source: url.source }), [url.space, url.folder, url.member, url.source]);
  const hrefFor = useCallback((entry: DriveEntry) => entryHref(entry, view, actor.memberId), [view, actor.memberId]);

  const openInPlace = useCallback(
    (entry: DriveEntry): boolean => {
      if (entry.type !== "file" && entry.type !== "virtual") return false;
      url.go({ preview: entry.key });
      return true;
    },
    [url],
  );

  const moveFor = useCallback((entry: DriveEntry) => entryMoves(entry, tree, moveActor), [tree, moveActor]);

  const openAs = useCallback(
    (entry: FileEntry, kind: DriveDocKind) => {
      const target = docTargetOf(openAsTargetOf(entry, tree, actor.memberId), organizationId, actor.actingMemberId);
      const toastId = toast.loading(t("drive.preview.importing"));
      return openFileAs(entry, kind, { loader, target, t, locale, openUrl, timeoutMs })
        .catch((err: unknown) => {
          toast.error(docCreateErrorMessage(err, t, DRIVE_IMPORT_FAILED_KEY));
        })
        .finally(() => toast.dismiss(toastId));
    },
    [tree, actor.memberId, actor.actingMemberId, organizationId, loader, t, locale, openUrl, timeoutMs],
  );

  const { openRename, openMove, openRemove, openShare } = dialogs;
  const onAction = useCallback(
    (entry: DriveEntry, action: DriveAction) => {
      switch (action) {
        case "open":
          if (entry.type === "folder") url.go(folderParams(entry, actor.memberId));
          else if (isDocEntry(entry)) openUrl(documentFileHref(entry.doc), "current");
          return;
        case "openNewTab":
          openUrl(hrefFor(entry), "new-foreground");
          return;
        case "preview":
        case "details":
          url.go({ preview: entry.key });
          return;
        case "download":
          // Straight from the click: the first save may need a window.
          if (isDownloadable(entry)) once(entry.key, "download", () => startDownload([entry], downloadDeps(), t));
          return;
        case "openAsDoc":
        case "openAsSheet":
        case "openAsSlides": {
          const kind = OPEN_AS_KIND[action];
          if (entry.type === "file" && kind) once(entry.key, action, () => openAs(entry, kind));
          return;
        }
        case "openOriginal":
          if (entry.type === "virtual" && entry.originRoute) openUrl(entry.originRoute, "current");
          return;
        case "rename":
          openRename(entry);
          return;
        case "move":
          openMove([entry]);
          return;
        case "moveToStore":
        case "moveToMy": {
          const roots = moveRoots([entry], tree, moveActor);
          const root = action === "moveToStore" ? roots.store : roots.my;
          if (root) startMove(planMove([entry], root, tree, moveActor));
          return;
        }
        case "share":
          if (isDocEntry(entry)) openShare(entry);
          return;
        case "star":
        case "unstar":
          if (entry.type !== "virtual") once(entry.key, action, () => write({ kind: "star", entry }));
          return;
        case "select":
          onSelect?.(entry.key);
          return;
        case "trash":
          trash([entry]);
          return;
        case "restore":
          restore([entry]);
          return;
        case "deleteForever":
          openRemove([entry]);
          return;
      }
    },
    [url, actor.memberId, openUrl, hrefFor, once, downloadDeps, t, openAs, openRename, openMove, tree, moveActor, startMove, openShare, write, onSelect, trash, restore, openRemove],
  );

  const runBulk = useCallback(
    (entries: readonly DriveEntry[], action: DriveBulkAction) => {
      if (entries.length === 0) return;
      switch (action) {
        case "move":
          openMove(entries);
          return;
        case "download": {
          // Straight from the click, like a single download.
          const files = entries.filter(isDownloadable);
          if (files.length > 0) once(files[0].key, "download", () => startDownload(files, downloadDeps(), t));
          return;
        }
        case "trash":
          trash(entries);
          return;
        case "restore":
          restore(entries);
          return;
        case "deleteForever":
          openRemove(entries);
          return;
      }
    },
    [openMove, once, downloadDeps, t, trash, restore, openRemove],
  );

  const busyKeys = useMemo(() => new Set(running.keys()), [running]);
  const runningFor = useCallback((entry: DriveEntry) => running.get(entry.key) ?? null, [running]);

  return useMemo(
    () => ({ ...dialogs, ctx, moveActor, moveFor, onAction, runningFor, runBulk, moveKeys, drop, hrefFor, openInPlace, busyKeys }),
    [dialogs, ctx, moveActor, moveFor, onAction, runningFor, runBulk, moveKeys, drop, hrefFor, openInPlace, busyKeys],
  );
}
