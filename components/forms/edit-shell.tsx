"use client";

// /manager/forms/edit?id=<uuid>&view=build|preview|responses|share — one form's tabbed page.
//
// Builders (owners and managers, canManageForms) get all four tabs and the status actions (open, close,
// reopen, archive, delete). Everyone else only sees their own responses here (RLS returns no one else's) and
// answers through /manager/forms/fill. `useSearchParams` sits under the page's Suspense boundary.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ClipboardX, MoreHorizontal, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/page-header";
import { FormBuilder } from "@/components/forms/builder";
import { useFormAutosave, type FormAutosave } from "@/components/forms/builder/use-autosave";
import { ConfirmDialog } from "@/components/forms/list/confirm-dialog";
import { BUILDER_VIEWS, FORM_STATUS_TONE, formEditHref, formFillHref, type FormEditView } from "@/components/forms/list/status";
import { FormPreview } from "@/components/forms/renderer/form-preview";
import { FormResponses } from "@/components/forms/responses";
import { SharePanel } from "@/components/forms/share/share-panel";
import { useTabActions } from "@/lib/browser-shell/hooks";
import type { FormStatus, FormView } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";
import { formsPageContext } from "@/lib/merchiva/workspace-page-context";
import { deleteForm, formsErrorKey, setFormStatus } from "@/lib/spacetimedb/actions/forms";
import { useCanManageForms, useForm } from "@/lib/spacetimedb/hooks/useForms";

function isBuilderView(value: string | null): value is FormEditView {
  return !!value && (BUILDER_VIEWS as readonly string[]).includes(value);
}

/** The primary status move for a form: publish a draft, close an open form, reopen a closed one. */
const PRIMARY_NEXT: Partial<Record<FormStatus, FormStatus>> = { draft: "open", open: "closed", closed: "open" };

export function FormEditShell() {
  const t = useT();
  const params = useSearchParams();
  const formId = params.get("id") ?? "";
  const requested = params.get("view");
  const canManage = useCanManageForms();
  const { form, meta, isReady, notPublished } = useForm(formId);
  // The builder's draft lives here, not in the Build tab, so switching to Preview neither drops an unsaved (or
  // invalid) edit nor shows an older version: Preview renders the draft whenever it is valid.
  const autosave = useFormAutosave(canManage ? form : null, (meta?.responseCount ?? 0) > 0);
  const { openUrl, navigateActive } = useTabActions();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const view: FormEditView = canManage ? (isBuilderView(requested) ? requested : "build") : "responses";
  useMerchivaPageContext(form ? formsPageContext({ view: "", shown: 0, form: form.title, tab: view }) : null);

  const backToList = () => openUrl("/manager/forms", "current");

  if (!isReady) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    );
  }
  if (notPublished || !form) {
    return (
      <div className="pb-24">
        <PageHeader title={t("forms.title")} />
        <EmptyState
          className="py-20"
          icon={ClipboardX}
          title={t(notPublished ? "forms.list.notPublished" : "forms.edit.notFound")}
          description={t(notPublished ? "forms.list.notPublishedDesc" : "forms.edit.notFoundDesc")}
          action={<Button variant="outline" size="sm" onClick={backToList}>{t("forms.edit.backToList")}</Button>}
        />
      </div>
    );
  }

  const changeStatus = async (status: FormStatus) => {
    setBusy(true);
    try {
      await setFormStatus(form.id, status);
      toast.success(t(`forms.edit.statusChanged.${status}`));
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteForm(form.id);
      toast.success(t("forms.edit.deleted"));
      backToList();
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
      setBusy(false);
    }
  };

  const next = PRIMARY_NEXT[form.status];

  return (
    <div className="pb-24">
      <PageHeader
        title={form.title}
        subtitle={`${t(`forms.kind.${form.kind}`)} · ${t(`forms.status.${form.status}`)}`}
        right={canManage ? (
          <div className="flex items-center gap-2">
            {next && (
              <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => { void changeStatus(next); }}>
                {t(`forms.edit.action.${form.status}`)}
              </Button>
            )}
            <StatusMenu
              form={form}
              busy={busy}
              onFill={() => openUrl(formFillHref(form.id), "current")}
              onStatus={(s) => { void changeStatus(s); }}
              onDelete={() => setDeleteOpen(true)}
            />
          </div>
        ) : undefined}
      />

      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={backToList}>
            <ArrowLeft className="rtl:rotate-180" />
            {t("forms.title")}
          </Button>
          <StatusBadge tone={FORM_STATUS_TONE[form.status]}>{t(`forms.status.${form.status}`)}</StatusBadge>
          <div className="ms-auto flex items-center gap-2">
            {canManage ? (
              <SegmentedControl<FormEditView>
                size="sm"
                aria-label={form.title}
                value={view}
                onChange={(v) => navigateActive(formEditHref(form.id, v), { mode: "replace" })}
                options={BUILDER_VIEWS.map((v) => ({ value: v, label: t(`forms.edit.view.${v}`) }))}
              />
            ) : form.status === "open" ? (
              <Button size="sm" className="gap-1" onClick={() => openUrl(formFillHref(form.id), "current")}>
                <PenLine />
                {t("forms.list.fill")}
              </Button>
            ) : null}
          </div>
        </div>

        <EditView view={view} form={form} meta={meta} autosave={autosave} />
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("forms.edit.deleteTitle")}
        description={t("forms.edit.deleteDesc")}
        confirmLabel={t("forms.edit.delete")}
        destructive
        onConfirm={() => { void remove(); }}
      />
    </div>
  );
}

function EditView({ view, form, meta, autosave }: {
  view: FormEditView; form: FormView; meta: ReturnType<typeof useForm>["meta"]; autosave: FormAutosave;
}) {
  const t = useT();
  switch (view) {
    case "build":
      return <FormBuilder form={form} meta={meta} autosave={autosave} />;
    case "preview": {
      const draftValid = !!autosave.draft && autosave.issues.length === 0;
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {!draftValid && autosave.draft && <Callout tone="warning">{t("forms.preview.invalidDraft")}</Callout>}
          <FormPreview definition={draftValid ? autosave.draft : form.definition} />
        </div>
      );
    }
    case "responses":
      return <FormResponses form={form} />;
    case "share":
      return <SharePanel form={form} meta={meta} />;
  }
}

function StatusMenu({
  form,
  busy,
  onFill,
  onStatus,
  onDelete,
}: {
  form: FormView;
  busy: boolean;
  /** Answer the form yourself (open forms only). */
  onFill: () => void;
  onStatus: (status: FormStatus) => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={t("forms.edit.more")} title={t("forms.edit.more")} disabled={busy} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {form.status === "open" && (
          <>
            <DropdownMenuItem onClick={onFill}>{t("forms.list.fill")}</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {form.status === "archived" ? (
          <DropdownMenuItem onClick={() => onStatus("closed")}>{t("forms.edit.unarchive")}</DropdownMenuItem>
        ) : (
          <>
            {form.status === "open" && <DropdownMenuItem onClick={() => onStatus("draft")}>{t("forms.edit.backToDraft")}</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => onStatus("archived")}>{t("forms.edit.archive")}</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>{t("forms.edit.delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
