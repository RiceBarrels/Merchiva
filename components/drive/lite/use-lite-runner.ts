"use client";

// What a tap does in the Drive lite app (drive-ui §14.3–§14.4): opening an entry (a folder in its tab, a file in
// its preview screen, a Doc, Sheet or Slides file in its editor inside the panel), and each row of the actions
// drawer. Anything that changes something is asked again when it can't be undone from here (delete, delete
// forever) or changes who can see it (share with the store, move back to my files); the rest runs at once.
//
// The rows come from liteActionOptions over the entry's access, so nothing is offered that the module would
// refuse; the runner still checks the entry's type before each call.

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { DriveAction } from "@/components/drive/model/actions";
import { MOVE_BLOCK_I18N, moveRoots, planMove } from "@/components/drive/model/move";
import type { DriveDocKind, DriveEntry } from "@/components/drive/model/types";
import { useT } from "@/lib/i18n/context";
import type { LiteNav, LitePanels } from "./lite-context";
import { folderScreen } from "./lite-state";
import type { LiteDrive } from "./use-lite-drive";

const OPEN_AS_KIND: Readonly<Partial<Record<DriveAction, DriveDocKind>>> = { openAsDoc: "doc", openAsSheet: "sheet", openAsSlides: "slides" };

export interface LiteRunner {
  openEntry(entry: DriveEntry): void;
  act(entry: DriveEntry, action: DriveAction): void;
}

export function useLiteRunner(drive: LiteDrive, nav: LiteNav, panels: LitePanels): LiteRunner {
  const t = useT();
  const { data, docsInstalled, moveActor, runWrite, download, openAs } = drive;
  const actorMemberId = data.actor.memberId;
  const { tree } = data;

  const openEntry = useCallback(
    (entry: DriveEntry) => {
      switch (entry.type) {
        case "folder":
          nav.push(folderScreen(entry, actorMemberId));
          return;
        case "doc":
        case "sheet":
        case "slides":
          if (entry.type === "doc" && !docsInstalled) toast(t("device.lite.drive.docsOff"));
          else nav.push({ kind: "editor", docKind: entry.type, id: entry.id });
          return;
        case "file":
        case "virtual":
          nav.push({ kind: "preview", key: entry.key });
          return;
      }
    },
    [nav, actorMemberId, docsInstalled, t],
  );

  const act = useCallback(
    (entry: DriveEntry, action: DriveAction) => {
      switch (action) {
        case "open":
          openEntry(entry);
          return;
        case "preview":
          if (entry.type === "file" || entry.type === "virtual") nav.push({ kind: "preview", key: entry.key });
          return;
        case "details":
          panels.openDetails(entry);
          return;
        case "download":
          // Straight from the tap: the save may need a window.
          if (entry.type === "file" || entry.type === "virtual") download(entry);
          return;
        case "openAsDoc":
        case "openAsSheet":
        case "openAsSlides": {
          const kind = OPEN_AS_KIND[action];
          if (entry.type === "file" && kind) openAs(entry, kind);
          return;
        }
        case "rename":
          if (entry.type === "virtual") return;
          panels.openName({
            mode: "rename",
            entry,
            target: null,
            initialName: entry.name,
            kind: entry.type,
          });
          return;
        case "move":
          panels.openMove([entry]);
          return;
        case "moveToStore":
        case "moveToMy": {
          const roots = moveRoots([entry], tree, moveActor);
          const root = action === "moveToStore" ? roots.store : roots.my;
          if (!root) return;
          const plan = planMove([entry], root, tree, moveActor);
          if (plan.blocked === "sameLocation") return;
          if (plan.blocked !== null) toast.error(t(MOVE_BLOCK_I18N[plan.blocked]));
          else panels.openSpaceChange(plan);
          return;
        }
        case "trash":
        case "deleteForever":
          panels.openConfirm({ action, entry });
          return;
        case "restore":
          void runWrite({ kind: "restore", entries: [entry] }, t("drive.home.restored"));
          return;
        case "openNewTab":
        case "openOriginal":
        case "share":
        case "star":
        case "unstar":
        case "select":
          // Never offered on the devices (model/actions.ts MANAGER_ONLY).
          return;
      }
    },
    [openEntry, nav, panels, download, openAs, tree, moveActor, runWrite, t],
  );

  return useMemo(() => ({ openEntry, act }), [openEntry, act]);
}
