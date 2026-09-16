"use client";

/**
 * Version history list (docs-editor-ui spec §5.1, plan D44). Desktop: inside `SidePanelFrame` (`variant="panel"`).
 * Mobile: the Version history page (`variant="page"`); tapping a row there opens the full-screen preview.
 *
 * Props:
 * - `documentId`, `access`, `memberId` — rows come from `useDocumentVersions(documentId, true)`, newest first, under a
 *   synthetic "Current version" row. Day headers use `Intl.DateTimeFormat(locale, { dateStyle: "full" })`
 *   (sticky in the panel). Includes the "Only show named versions" switch.
 * - `selectedVersionId` — highlighted row; `null` = "Current version".
 * - `onSelectVersion(versionId | null)` — the editor core enters or leaves preview (`?version=` in the URL).
 * - `onNameCurrentVersion()` — "Name this version" on the current row. The editor core opens `NameVersionDialog` and
 *   saves with `provider.saveVersion("named", name)`.
 * - `onRestoreVersion(versionId)` — row menu "Restore this version" (needs `access.canEdit`). The editor core opens
 *   `RestoreVersionAlert` and runs `restoreDocumentVersion`.
 *
 * Handled here, with toasts:
 * - **Rename** an existing version (`access.canEdit`): `NameVersionDialog mode="rename"` →
 *   `renameDocumentVersion(documentId, versionId, name)`; an empty name reverts it to autosaved, which for a named
 *   version only its creator or a manager may do (the server rejects anyone else), so the dialog requires a name then.
 * - **Delete** (`access.canEdit` and creator or `access.canManage`): confirm `docs.versions.deleteConfirm` →
 *   `deleteDocumentVersion(documentId, versionId)`. If the deleted version is selected, it calls `onSelectVersion(null)`.
 */
import { useId, useMemo, useState } from "react";
import { History, Loader2, MoreVertical, Pencil, RotateCcw, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NameVersionDialog } from "@/components/docs/dialogs/name-version-dialog";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";
import { intlLocale } from "@/lib/docs/format";
import type { DocAccess, DocVersion } from "@/lib/docs/types";
import { useI18n } from "@/lib/i18n/context";
import { deleteDocumentVersion, renameDocumentVersion } from "@/lib/spacetimedb/actions";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";

import { useMemberNameResolver } from "./panel-hooks";

export interface VersionHistoryPanelProps {
  variant: "panel" | "page";
  documentId: string;
  access: DocAccess;
  memberId: string | null;
  selectedVersionId: string | null;
  onSelectVersion(versionId: string | null): void;
  onNameCurrentVersion(): void;
  onRestoreVersion(versionId: string): void;
}

interface DayGroup {
  key: string;
  label: string;
  versions: DocVersion[];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function VersionHistoryPanel({
  variant,
  documentId,
  access,
  memberId,
  selectedVersionId,
  onSelectVersion,
  onNameCurrentVersion,
  onRestoreVersion,
}: VersionHistoryPanelProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const switchId = useId();
  const nameOf = useMemberNameResolver();
  const { versions, isReady } = useDocumentVersions(documentId, true);
  const [onlyNamed, setOnlyNamed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocVersion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocVersion | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tag = intlLocale(locale);
  const formats = useMemo(
    () => ({
      day: new Intl.DateTimeFormat(tag, { dateStyle: "full" }),
      time: new Intl.DateTimeFormat(tag, { timeStyle: "short" }),
    }),
    [tag],
  );

  const groups = useMemo(() => {
    const list = onlyNamed ? versions.filter((version) => !!version.name) : versions;
    const out: DayGroup[] = [];
    for (const version of list) {
      const key = dayKey(version.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.versions.push(version);
      else out.push({ key, label: formats.day.format(version.createdAt), versions: [version] });
    }
    return out;
  }, [versions, onlyNamed, formats]);

  const failure = (err: unknown) => {
    const code = docErrorCode(err);
    toast.error(code && code !== "invalid" ? t(DOC_ERROR_I18N_KEYS[code]) : t("docs.versions.actionFailed"));
  };

  const canDelete = (version: DocVersion) =>
    access.canEdit && (access.canManage || (memberId !== null && version.createdByMemberId === memberId));

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    try {
      await deleteDocumentVersion(documentId, target.id);
      if (selectedVersionId === target.id) onSelectVersion(null);
      toast.success(t("docs.versions.deleted"));
      setDeleteTarget(null);
    } catch (err) {
      failure(err);
    } finally {
      setDeleting(false);
    }
  };

  const page = variant === "page";
  const rowClass = (selected: boolean) =>
    cn("flex items-center gap-1 pe-1 transition-colors", selected ? "bg-muted" : "hover:bg-muted/60");
  const rowButtonClass = cn(
    "min-w-0 flex-1 px-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
    page ? "min-h-12 py-2.5" : "py-2",
  );

  const menuTrigger = (label: string) => (
    <DocMenuTrigger render={<Button type="button" variant="ghost" size={page ? "icon-sm" : "icon-xs"} aria-label={label} />}>
      <MoreVertical className="h-3.5 w-3.5" />
    </DocMenuTrigger>
  );

  return (
    <section aria-label={t("docs.versions.title")} data-variant={variant} className="flex min-h-0 flex-col">
      <div className={cn("flex items-center justify-between gap-3 border-b border-border", page ? "px-1 pb-3" : "px-3 py-2")}>
        <label htmlFor={switchId} className="text-[12.5px] text-muted-foreground">
          {t("docs.versions.onlyNamed")}
        </label>
        <Switch id={switchId} size="sm" checked={onlyNamed} onCheckedChange={(checked) => setOnlyNamed(checked)} />
      </div>

      <ul className="flex flex-col" aria-busy={!isReady || undefined}>
        <li>
          <div className={rowClass(selectedVersionId === null)}>
            <button
              type="button"
              className={rowButtonClass}
              aria-current={selectedVersionId === null ? "true" : undefined}
              onClick={() => onSelectVersion(null)}
            >
              <span className="block truncate text-[13px] font-medium text-foreground">{t("docs.versions.current")}</span>
            </button>
            {access.canEdit && (
              <DocMenu>
                {menuTrigger(t("docs.versions.actions"))}
                <DocMenuContent align="end">
                  <DocMenuItem icon={Tag} onClick={onNameCurrentVersion}>
                    {t("docs.versions.name")}
                  </DocMenuItem>
                </DocMenuContent>
              </DocMenu>
            )}
          </div>
        </li>

        {!isReady ? (
          <li className="flex justify-center p-6" role="status" aria-label={t("common.loading")}>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </li>
        ) : groups.length === 0 ? (
          <li>
            <EmptyState compact icon={History} title={t("docs.versions.emptyTitle")} description={t("docs.versions.emptyDescription")} />
          </li>
        ) : (
          groups.map((group) => (
            <li key={group.key}>
              <Eyebrow
                as="h4"
                className={cn("border-b border-border bg-background px-3 py-1.5", !page && "sticky top-0 z-10")}
              >
                {group.label}
              </Eyebrow>
              <ul>
                {group.versions.map((version) => {
                  const selected = selectedVersionId === version.id;
                  const time = formats.time.format(version.createdAt);
                  const author = nameOf(version.createdByMemberId);
                  return (
                    <li key={version.id} className={rowClass(selected)}>
                      <button
                        type="button"
                        className={rowButtonClass}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelectVersion(version.id)}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {version.name ? (
                            <span className="truncate text-[13px] font-medium text-foreground">{version.name}</span>
                          ) : (
                            <span className="font-mono text-[12.5px] tabular-nums text-foreground">{time}</span>
                          )}
                          {!version.name && version.kind === "auto" && (
                            <StatusBadge tone="neutral" size="xs">
                              {t("docs.versions.autosaved")}
                            </StatusBadge>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                          {version.name ? (
                            <>
                              <span className="font-mono tabular-nums">{time}</span>
                              {" · "}
                              {author}
                            </>
                          ) : (
                            author
                          )}
                        </span>
                      </button>
                      {access.canEdit && (
                        <DocMenu>
                          {menuTrigger(t("docs.versions.actions"))}
                          <DocMenuContent align="end">
                            <DocMenuItem icon={version.name ? Pencil : Tag} onClick={() => setRenameTarget(version)}>
                              {version.name ? t("docs.versions.rename") : t("docs.versions.name")}
                            </DocMenuItem>
                            <DocMenuItem icon={RotateCcw} onClick={() => onRestoreVersion(version.id)}>
                              {t("docs.versions.restore")}
                            </DocMenuItem>
                            {canDelete(version) && (
                              <DocMenuItem icon={Trash2} destructive onClick={() => setDeleteTarget(version)}>
                                {t("docs.versions.delete")}
                              </DocMenuItem>
                            )}
                          </DocMenuContent>
                        </DocMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))
        )}
      </ul>

      <NameVersionDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        mode="rename"
        allowClear={renameTarget?.kind !== "named" || canDelete(renameTarget)}
        initialName={renameTarget?.name ?? ""}
        onSubmit={async (name) => {
          const target = renameTarget;
          if (!target) return;
          if (name === (target.name ?? "")) return;
          try {
            await renameDocumentVersion(documentId, target.id, name);
            if (name) toast.success(t("docs.versions.named"));
          } catch (err) {
            failure(err);
            throw err;
          }
        }}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("docs.versions.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("docs.versions.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} aria-busy={deleting || undefined} onClick={() => void confirmDelete()}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
