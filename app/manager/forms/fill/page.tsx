"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardX, Info, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PermissionGuard } from "@/components/permission-guard";
import { LazySurveyHost } from "@/components/forms/renderer/lazy-host";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import { confirmationText } from "@/lib/forms/survey-adapter";
import { formPeriod } from "@/lib/forms/period";
import type { Answers, FormView } from "@/lib/forms/types";
import type { FormUploadContext } from "@/lib/forms/uploads";
import { newDocumentId } from "@/lib/docs/ids";
import { useT } from "@/lib/i18n/context";
import { useNow } from "@/lib/use-now";
import { submitFormResponse } from "@/lib/spacetimedb/actions/forms";
import { useForm, useFormUploadDevice, useMyFormResponses } from "@/lib/spacetimedb/hooks/useForms";

/**
 * `/manager/forms/fill?id=<uuid>`: a member answers a form on /manager with the renderer (design B.6). A static route
 * with a query parameter so the Capacitor export keeps it; `useSearchParams` sits inside Suspense. The renderer chunk
 * loads only here and in the builder's preview.
 */
export default function FormFillPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={<Loading />}>
        <FormFillRoute />
      </Suspense>
    </PermissionGuard>
  );
}

function Loading() {
  return <div className="flex justify-center py-16"><Spinner size={20} /></div>;
}

function BackToForms() {
  const t = useT();
  return (
    <Link href="/manager/forms" className={buttonVariants({ variant: "outline", size: "sm" })}>
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      {t("forms.fill.backToForms")}
    </Link>
  );
}

/** Why `form` cannot take an answer from this member now, as an i18n key; null = it can. */
function blockedKey(form: FormView, alreadyAnswered: boolean, now: number): string | null {
  if (!form.definition) return "forms.errors.invalid_definition";
  if (form.status !== "open") return "forms.errors.not_open";
  if (form.closesAt && form.closesAt.getTime() <= now) return "forms.errors.closed";
  if (alreadyAnswered) return "forms.errors.already_submitted";
  return null;
}

function FormFillRoute() {
  const t = useT();
  const id = useSearchParams().get("id") ?? "";
  const { form, isReady, notPublished } = useForm(id);
  const mine = useMyFormResponses();
  const now = useNow(30_000);
  // One id per response: re-sending after a dropped connection is a no-op on the server, never a duplicate.
  const responseId = useRef(newDocumentId());
  // Set once this page sent a response, so the confirmation is not replaced by "already answered".
  const [sent, setSent] = useState(false);

  const alreadyAnswered = useMemo(() => {
    if (!form || form.perMember === "unlimited") return false;
    const period = formPeriod(form.perMember, now);
    return mine.responses.some((r) => r.formId === form.id && r.period === period);
  }, [form, mine.responses, now]);

  const { deviceAccountRole, holdsStoreSession } = useFormUploadDevice();
  const upload = useMemo<FormUploadContext | null>(
    () => (form ? { organizationId: form.organizationId, surface: "manager", deviceAccountRole, holdsStoreSession } : null),
    [form, deviceAccountRole, holdsStoreSession],
  );

  if (!isReady || (form && !mine.isReady)) return <Loading />;

  if (notPublished || !form) {
    return (
      <div className="pb-24">
        <PageHeader title={t("forms.fill.title")} />
        <EmptyState
          icon={ClipboardX}
          title={t(notPublished ? "forms.errors.not_published" : "forms.errors.not_found")}
          action={<BackToForms />}
        />
      </div>
    );
  }

  const blocked = blockedKey(form, alreadyAnswered && !sent, now.getTime());
  const definition = form.definition;
  const submit = async (answers: Answers) => {
    await submitFormResponse({
      formId: form.id, organizationId: form.organizationId, answers, surface: "manager", responseId: responseId.current,
    });
    responseId.current = newDocumentId();
    setSent(true);
  };

  return (
    <div className="pb-24">
      <PageHeader title={form.title} subtitle={t("forms.fill.subtitle")} right={<BackToForms />} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 lg:p-6">
        {blocked || !definition ? (
          <EmptyState icon={ClipboardX} title={t(blocked ?? "forms.errors.invalid_definition")} action={<BackToForms />} />
        ) : (
          <>
            <Callout tone="neutral" icon={Info}>
              {t("forms.disclosure.respondentNote")}
              {form.hasFileQuestions && <> {t("forms.fill.filesNote")}</>}
            </Callout>
            <LazySurveyHost
              definition={definition}
              mode="fill"
              layout="single"
              upload={upload}
              onSubmit={submit}
              renderComplete={(restart) => (
                <EmptyState
                  icon={CheckCircle2}
                  title={confirmationText(definition, t)}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <BackToForms />
                      {form.perMember === "unlimited" && (
                        <Button size="sm" onClick={restart}>
                          <Plus className="h-4 w-4" />
                          {t("forms.fill.another")}
                        </Button>
                      )}
                    </div>
                  }
                />
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}
