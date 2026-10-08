"use client";

// The anyone-with-the-link form (web only). The server page loads the
// public-safe copy (lib/forms/server/public-handlers.ts) and hands it here;
// this screen says whose form it is and where the answers go, renders the
// questions with the shared Forms renderer (lazy; no file or photo question
// ever reaches it) and posts through use-public-submit.ts.

import { useEffect } from "react";
import { CheckCircle2, FileQuestion, Lock } from "lucide-react";
import { LazySurveyHost } from "@/components/forms/renderer/lazy-host";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { confirmationText } from "@/lib/forms/survey-adapter";
import type { PublicFormPayload } from "@/lib/forms/server/public-handlers";
import { usePublicSubmit } from "./use-public-submit";

export interface PublicFormViewProps {
  token: string;
  form: PublicFormPayload | null;
  /** The load failure (`not_found`, `not_configured`, `unavailable`) when `form` is null. */
  loadError: string | null;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}

export function PublicFormView({ token, form, loadError }: PublicFormViewProps) {
  const t = useT();
  const { submit, markLoaded, honeypot } = usePublicSubmit(token, form?.stamp ?? null);

  useEffect(() => {
    markLoaded();
  }, [markLoaded]);

  if (!form) {
    const key = loadError === "not_found" ? "forms.public.notFound" : "forms.public.unavailable";
    return (
      <Frame>
        <EmptyState icon={FileQuestion} title={t(`${key}Title`)} description={t(`${key}Body`)} />
      </Frame>
    );
  }

  const header = (
    <header className="flex flex-col gap-1 border-b border-border pb-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{form.storeName}</p>
      <h1 className="text-xl font-semibold text-foreground">{form.title}</h1>
    </header>
  );

  if (!form.open || !form.definition) {
    return (
      <Frame>
        {header}
        <EmptyState icon={Lock} title={t("forms.public.closedTitle")} description={t("forms.public.closedBody")} />
      </Frame>
    );
  }

  const definition = form.definition;
  return (
    <Frame>
      {header}
      <p className="text-sm text-muted-foreground">
        {fmt(t("forms.public.answersGoTo"), { store: form.storeName })}
      </p>
      {/* Honeypot: off-screen and out of the tab order; a person never fills it. */}
      <div aria-hidden="true" className="pointer-events-none absolute -start-[10000px] top-auto h-px w-px overflow-hidden">
        <label>
          {t("forms.public.honeypotLabel")}
          <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {/*
        The definition is public-safe (the server refuses to serve one with a file or photo question), and
        `upload={null}` keeps file questions off in the renderer as well. The host shows a refused submit itself.
        No "send another": one page is one response id, so a second send would be a no-op replay.
      */}
      <LazySurveyHost
        definition={definition}
        mode="fill"
        upload={null}
        onSubmit={submit}
        renderComplete={() => (
          <EmptyState icon={CheckCircle2} title={t("forms.public.sentTitle")} description={confirmationText(definition, t)} />
        )}
      />
      <p className="text-xs text-muted-foreground">{t("forms.public.noSecrets")}</p>
    </Frame>
  );
}
