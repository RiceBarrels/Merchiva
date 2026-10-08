"use client";

// What the spreadsheet chrome can do (sheets.md §10.4, §10.7, §10.8, §11.6, §11.7). Writes go through the actions
// wrappers or the session's own methods; navigation only through the surface's opener (useDocsOpenUrl), so inside
// a device panel nothing leaves the panel. Failures become a toast through sheetOrDocErrorKey.

import { useMemo, type Dispatch, type RefObject } from "react";
import { toast } from "sonner";

import type { DriveActor } from "@/components/drive/drive-actor";
import type { DocsOpenUrl } from "@/components/docs/docs-open-context";
import { saveBlob } from "@/lib/docs/download";
import { exportFilename } from "@/lib/docs/export/utils";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import { DRIVE_HOME_HREF, sheetHref } from "@/lib/drive/hrefs";
import { docSpace } from "@/lib/drive/model";
import type { DriveDocTarget } from "@/lib/drive/types";
import { fmt } from "@/lib/i18n/fmt";
import { createSheetDocument } from "@/lib/sheets/create";
import { sheetErrorCode, sheetOrDocErrorKey } from "@/lib/sheets/errors";
import type { SheetLeaseView } from "@/lib/sheets/lease";
import type { SheetLossyItem } from "@/lib/sheets/types";
import type { SheetSessionFacade } from "@/lib/sheets/use-sheet-session";
import { writeXlsx } from "@/lib/sheets/xlsx/client";
import { duplicateDocument, renameDocument, toggleDocumentStar } from "@/lib/spacetimedb/actions";
import { renameDriveDocument, restoreDriveEntries, trashDriveEntries } from "@/lib/spacetimedb/actions/drive";
import type { SheetHostHandle, SheetUiAction } from "./sheet-editor-context";

type Translate = (key: string) => string;

/** A toast for any failure a spreadsheet screen meets (`[sheet.*]`, `[doc.*]`, `[drive.*]`, network). */
export function reportSheetError(err: unknown, t: Translate): void {
  toast.error(t(sheetOrDocErrorKey(err)));
}

export interface SheetActions {
  /** Where File ▸ New and Import ▸ Open as new put a spreadsheet (sheets.md §10.4). */
  newTarget: DriveDocTarget;
  goHome(): void;
  openSheet(documentId: string, isNew?: boolean): void;
  createNew(): Promise<void>;
  /** Refused while acting for a PIN operator: duplicateDocument makes the copy the signed-in (tablet) account's. */
  makeCopy(): Promise<void>;
  openShare(): void;
  openImport(): void;
  downloadXlsx(): Promise<void>;
  downloadCsv(): Promise<void>;
  nameCurrentVersion(): void;
  saveNamedVersion(name: string): Promise<void>;
  showVersionHistory(): void;
  previewVersion(versionId: string | null): void;
  askRestore(versionId: string): void;
  /** Restores a version's bytes (holder only); `time` names the safety version saved first. */
  restoreVersion(state: Uint8Array, time: string): Promise<void>;
  rename(): void;
  renameTo(title: string): Promise<void>;
  /** The signed-in account's star; a no-op while acting for a PIN operator (the star would be the tablet's). */
  toggleStar(): Promise<void>;
  trash(): Promise<void>;
  restoreFromTrash(): Promise<void>;
  /**
   * "Edit" / "Ask to edit" / "Edit here" / "Start editing". Resolves with the lease view once the server answered
   * (the row is applied before the reducer resolves), or null when it failed (already toasted) or nothing was sent.
   */
  requestEdit(): Promise<SheetLeaseView | null>;
  stopEditing(): Promise<void>;
  cancelRequest(): Promise<void>;
  handOver(): Promise<void>;
  declineRequest(): Promise<void>;
  reload(): Promise<void>;
  discardChanges(): Promise<void>;
}

export interface UseSheetActionsInput {
  doc: DocumentMeta;
  access: DocAccess;
  actor: DriveActor;
  facade: SheetSessionFacade;
  host: SheetHostHandle | null;
  mobile: boolean;
  dispatch: Dispatch<SheetUiAction>;
  openDocsUrl: DocsOpenUrl;
  titleInputRef: RefObject<HTMLInputElement | null>;
  confirmLossy(kind: "import" | "export", items: SheetLossyItem[]): Promise<boolean>;
  t: Translate;
  locale: string;
}

export function useSheetActions(input: UseSheetActionsInput): SheetActions {
  const { doc, access, actor, facade, host, mobile, dispatch, openDocsUrl, titleInputRef, confirmLossy, t, locale } = input;
  const session = facade.session;

  return useMemo((): SheetActions => {
    const untitled = t("sheets.untitled");
    const space = docSpace(doc);
    const newTarget: DriveDocTarget =
      actor.surface === "store"
        ? { organizationId: doc.organizationId, space: "store", folderId: space === "store" ? doc.folderId : "", actingMemberId: actor.actingMemberId }
        : { organizationId: doc.organizationId, space, folderId: doc.folderId, actingMemberId: "" };
    const entries = { documentIds: [doc.id], actingMemberId: actor.actingMemberId, organizationId: doc.organizationId };
    const openSheet = (documentId: string, isNew = false) => openDocsUrl(sheetHref(documentId, { isNew }), "new-foreground");

    const save = async (blob: Blob, name: string) => {
      const result = await saveBlob(blob, name);
      if (result === "unsupported") toast.error(t("sheets.export.unsupported"));
    };

    const run = async (work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (err) {
        reportSheetError(err, t);
      }
    };

    return {
      newTarget,
      goHome: () => openDocsUrl(DRIVE_HOME_HREF, "current"),
      openSheet,
      createNew: () => run(async () => openSheet(await createSheetDocument(newTarget, { locale, t }), true)),
      makeCopy: () =>
        run(async () => {
          if (actor.acting) {
            toast.error(t("drive.errors.forbidden"));
            return;
          }
          // The copy starts from the server's rows: everything this session edited goes there first.
          if (session) {
            await session.flush();
            await session.compactNow().catch(() => false);
          }
          const id = await duplicateDocument({ sourceDocumentId: doc.id, title: fmt(t("sheets.menu.copyName"), { title: doc.title || untitled }) });
          toast.success(t("sheets.menu.copied"), { action: { label: t("docs.menu.open"), onClick: () => openSheet(id) } });
        }),
      openShare: () => dispatch({ type: "openDialog", dialog: "share" }),
      openImport: () => {
        if (access.canEdit) dispatch({ type: "openDialog", dialog: "import" });
      },
      downloadXlsx: async () => {
        if (!host) return;
        const toastId = toast.loading(t("sheets.export.preparing"));
        let file: { blob: Blob; lossy: SheetLossyItem[] };
        try {
          file = await writeXlsx(host.exportWorkbook());
        } catch {
          toast.error(t("sheets.export.failed"));
          return;
        } finally {
          toast.dismiss(toastId);
        }
        if (file.lossy.length > 0 && !(await confirmLossy("export", file.lossy))) return;
        await save(file.blob, exportFilename(doc.title, "xlsx", untitled)).catch(() => toast.error(t("sheets.export.failed")));
      },
      downloadCsv: async () => {
        let sheet: { sheetName: string; csv: string } | null = null;
        try {
          sheet = host?.activeSheetCsv() ?? null;
        } catch {
          sheet = null;
        }
        if (!sheet) {
          toast.error(t("sheets.export.failed"));
          return;
        }
        const blob = new Blob([sheet.csv], { type: "text/csv;charset=utf-8" });
        const base = sheet.sheetName ? `${doc.title || untitled} - ${sheet.sheetName}` : doc.title;
        await save(blob, exportFilename(base, "csv", untitled)).catch(() => toast.error(t("sheets.export.failed")));
      },
      nameCurrentVersion: () => {
        if (access.canEdit) dispatch({ type: "openDialog", dialog: "nameVersion" });
      },
      saveNamedVersion: async (name) => {
        if (!session) throw new Error("No live session");
        try {
          await session.saveVersion("named", name);
          toast.success(t("sheets.versions.named"));
        } catch (err) {
          if (sheetErrorCode(err) === "versions_full") toast.error(t("sheets.versions.full"));
          else reportSheetError(err, t);
          throw err;
        }
      },
      showVersionHistory: () => dispatch({ type: "setHistory", open: true }),
      previewVersion: (versionId) => dispatch({ type: "preview", versionId }),
      askRestore: (versionId) => {
        if (access.canEdit) dispatch({ type: "askRestore", versionId });
      },
      restoreVersion: async (state, time) => {
        if (!session) throw new Error("No live session");
        try {
          await session.restoreVersion(state, fmt(t("sheets.versions.beforeRestore"), { time }));
          dispatch({ type: "preview", versionId: null });
          toast.success(t("sheets.versions.restored"));
        } catch (err) {
          const code = sheetErrorCode(err);
          if (code === "versions_full") toast.error(t("sheets.versions.full"));
          else if (code === "invalid" || code === null) toast.error(t("sheets.versions.restoreFailed"));
          else reportSheetError(err, t);
          throw err;
        }
      },
      rename: () => {
        if (!access.canEdit || doc.trashedAt) return;
        if (mobile) {
          dispatch({ type: "openDialog", dialog: "rename" });
          return;
        }
        // After the menu that triggered this closes (its focus return sees the input and stays put).
        window.requestAnimationFrame(() => {
          const field = titleInputRef.current;
          field?.focus();
          field?.select();
        });
      },
      renameTo: async (title) => {
        try {
          // On /store the operator renames (the tablet account may not even see the file); elsewhere the caller.
          if (actor.acting) {
            await renameDriveDocument(doc.id, title, { actingMemberId: actor.actingMemberId, organizationId: doc.organizationId });
          } else {
            await renameDocument(doc.id, title);
          }
        } catch (err) {
          reportSheetError(err, t);
          throw err;
        }
      },
      // toggleDocumentStar rejects a trashed document ([doc.trashed]) and stars for the caller identity, which on
      // /store is the tablet account, not the operator (the chrome hides the star there).
      toggleStar: () => (doc.trashedAt || actor.acting ? Promise.resolve() : run(() => toggleDocumentStar(doc.id))),
      trash: () =>
        run(async () => {
          if (!access.canManage) return;
          await session?.flush();
          await trashDriveEntries(entries);
          toast(t("sheets.menu.movedToTrash"), {
            action: { label: t("sheets.menu.undo"), onClick: () => void restoreDriveEntries(entries).catch((err: unknown) => reportSheetError(err, t)) },
          });
          openDocsUrl(DRIVE_HOME_HREF, "current");
        }),
      restoreFromTrash: () => run(() => restoreDriveEntries(entries)),
      requestEdit: async () => {
        if (!session) return null;
        try {
          await session.requestEdit();
          return session.lease;
        } catch (err) {
          toast.error(t(sheetErrorCode(err) === "offline" ? "sheets.errors.offline" : "sheets.lease.failed"));
          return null;
        }
      },
      stopEditing: () => run(async () => session?.stopEditing()),
      cancelRequest: () => run(async () => session?.cancelRequest()),
      handOver: () => run(async () => session?.handOver()),
      declineRequest: () => run(async () => session?.declineRequest()),
      reload: () => run(async () => session?.reload()),
      discardChanges: () => run(async () => session?.discardChanges()),
    };
  }, [doc, access, actor.surface, actor.actingMemberId, actor.acting, session, host, mobile, dispatch, openDocsUrl, titleInputRef, confirmLossy, t, locale]);
}
