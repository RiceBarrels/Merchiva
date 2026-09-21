"use client";

// Runs the per-document menu actions of the docs home and owns the rename,
// delete-forever and share dialog targets. Reducer failures surface as toasts
// (`[doc.<code>]` → docs.errors.*, anything else → the given fallback key).

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { documentHref } from "@/lib/docs/hrefs";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import {
  deleteDocumentForever,
  duplicateDocument,
  renameDocument,
  restoreDocument,
  toggleDocumentStar,
  trashDocument,
} from "@/lib/spacetimedb/actions";
import type { DocItemAction, DocListItem } from "./doc-list-model";

/** i18n key for a docs reducer failure. */
export function docErrorToastKey(err: unknown, fallbackKey: string): string {
  const code = docErrorCode(err);
  return code ? DOC_ERROR_I18N_KEYS[code] : fallbackKey;
}

export interface DocDialogTarget {
  readonly open: boolean;
  /** Kept after closing so the dialog doesn't lose its text while animating out. */
  readonly item: DocListItem | null;
}

const CLOSED: DocDialogTarget = { open: false, item: null };

export interface DocItemActions {
  run(item: DocListItem, action: DocItemAction): void;
  rename: DocDialogTarget;
  setRenameOpen(open: boolean): void;
  /** Rejects (after toasting) so RenameDialog stays open. */
  submitRename(title: string): Promise<void>;
  remove: DocDialogTarget;
  setRemoveOpen(open: boolean): void;
  /** Rejects (after toasting) so DeleteForeverDialog stays open. */
  confirmRemove(): Promise<void>;
  share: DocDialogTarget;
  setShareOpen(open: boolean): void;
}

export function useDocItemActions(): DocItemActions {
  const t = useT();
  const openUrl = useDocsOpenUrl();
  const [rename, setRename] = useState<DocDialogTarget>(CLOSED);
  const [remove, setRemove] = useState<DocDialogTarget>(CLOSED);
  const [share, setShare] = useState<DocDialogTarget>(CLOSED);
  // Ignores repeat clicks while the same action on the same document is in flight.
  const inflight = useRef(new Set<string>());

  const fail = useCallback(
    (err: unknown) => {
      toast.error(t(docErrorToastKey(err, "docs.home.actionFailed")));
    },
    [t],
  );

  const once = useCallback(
    (key: string, task: () => Promise<void>) => {
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      task()
        .catch((err: unknown) => fail(err))
        .finally(() => {
          inflight.current.delete(key);
        });
    },
    [fail],
  );

  const restore = useCallback(
    (documentId: string) =>
      once(`restore:${documentId}`, async () => {
        await restoreDocument(documentId);
        toast.success(t("docs.trash.restoredToast"));
      }),
    [once, t],
  );

  const run = useCallback(
    (item: DocListItem, action: DocItemAction) => {
      const id = item.doc.id;
      switch (action) {
        case "open":
          openUrl(documentHref(id), "current");
          return;
        case "openNewTab":
          openUrl(documentHref(id), "new-foreground");
          return;
        case "rename":
          setRename({ open: true, item });
          return;
        case "share":
          setShare({ open: true, item });
          return;
        case "deleteForever":
          setRemove({ open: true, item });
          return;
        case "star":
        case "unstar":
          once(`star:${id}`, () => toggleDocumentStar(id));
          return;
        case "copy":
          once(`copy:${id}`, async () => {
            const title = fmt(t("docs.copy.title"), { title: item.doc.title.trim() || t("docs.untitled") });
            const copyId = await duplicateDocument({ sourceDocumentId: id, title });
            toast.success(t("docs.copy.toast"), {
              action: { label: t("docs.menu.open"), onClick: () => openUrl(documentHref(copyId), "current") },
            });
          });
          return;
        case "trash":
          once(`trash:${id}`, async () => {
            await trashDocument(id);
            toast(t("docs.trash.movedToast"), {
              action: { label: t("docs.trash.undo"), onClick: () => restore(id) },
            });
          });
          return;
        case "restore":
          restore(id);
          return;
      }
    },
    [once, openUrl, restore, t],
  );

  const submitRename = useCallback(
    async (title: string) => {
      const target = rename.item;
      if (!target) return;
      try {
        await renameDocument(target.doc.id, title);
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [rename.item, fail],
  );

  const confirmRemove = useCallback(async () => {
    const target = remove.item;
    if (!target) return;
    try {
      await deleteDocumentForever(target.doc.id);
      toast.success(t("docs.deleteForever.toast"));
    } catch (err) {
      fail(err);
      throw err;
    }
  }, [remove.item, fail, t]);

  const setRenameOpen = useCallback((open: boolean) => setRename((prev) => ({ ...prev, open })), []);
  const setRemoveOpen = useCallback((open: boolean) => setRemove((prev) => ({ ...prev, open })), []);
  const setShareOpen = useCallback((open: boolean) => setShare((prev) => ({ ...prev, open })), []);

  return useMemo(
    () => ({ run, rename, setRenameOpen, submitRename, remove, setRemoveOpen, confirmRemove, share, setShareOpen }),
    [run, rename, setRenameOpen, submitRename, remove, setRemoveOpen, confirmRemove, share, setShareOpen],
  );
}
