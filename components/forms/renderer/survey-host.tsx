"use client";

// The Forms renderer host (design B.1, B.7): the only importer of the vendor renderer and its stylesheets, loaded
// with next/dynamic (ssr: false) through ./lazy-host.tsx, on /manager only — never on /store or /personal.
// The renderer is not trusted: it gets JSON built from an allowlist (lib/forms/survey-adapter.ts), uploads go
// through the Drive pipeline into the respondent's My files (lib/forms/uploads.ts, `storeDataAsText` is off), and
// its data is mapped back with fromSurveyData and checked with validateAnswers before the reducer re-validates.
// Never register onTextMarkdown, never change expressionVariableDelimiters.

import "survey-core/survey-core.min.css";
import "survey-core/themes/adapters/shadcn-base-nova.min.css";
import "./survey-overrides.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { Model, surveyLocalization } from "survey-core";
import { Survey } from "survey-react-ui";
import { Callout } from "@/components/ui/callout";
import { validateAnswers } from "@/lib/forms/answers";
import { formIssueKey } from "@/lib/forms/schema";
import { fromSurveyData, SurveyAdapterError, toSurveyJson, type SurveyAdapterLayout } from "@/lib/forms/survey-adapter";
import type { Answers, FileQuestion, FormDefinitionV1 } from "@/lib/forms/types";
import { formFilesAllowed, uploadFormFiles, type FormUploadContext } from "@/lib/forms/uploads";
import { useI18n } from "@/lib/i18n/context";
import { RTL_LOCALES } from "@/lib/i18n/config";
import { formsErrorKey } from "@/lib/spacetimedb/actions/forms";
import { cn } from "@/lib/utils";
import { setupSurveyLocale } from "./survey-locale";

export interface SurveyHostProps {
  definition: FormDefinitionV1;
  /** `preview` never submits and never uploads (file questions are read-only). */
  mode: "fill" | "preview";
  layout?: SurveyAdapterLayout;
  /** Who answers, and where (fill mode). null = file and photo questions are off here. */
  upload?: FormUploadContext | null;
  /** Called with validated answers; reject to keep the form open (the host shows the error). */
  onSubmit: (answers: Answers) => Promise<void>;
  /** After a successful submit, in place of the form. */
  renderComplete: (restart: () => void) => React.ReactNode;
  className?: string;
}

function fileQuestionOf(def: FormDefinitionV1, id: string): FileQuestion | null {
  const q = def.questions.find((x) => x.id === id);
  return q && (q.type === "photo" || q.type === "file") ? q : null;
}

function errorText(err: unknown, t: (key: string) => string): string {
  return t(formsErrorKey(err));
}

export function SurveyHost(props: SurveyHostProps) {
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  if (done) {
    return <>{props.renderComplete(() => { setDone(false); setRound((n) => n + 1); })}</>;
  }
  return <SurveyRound key={round} {...props} onDone={() => setDone(true)} />;
}

function SurveyRound({ definition, mode, layout, upload, onSubmit, className, onDone }: SurveyHostProps & { onDone: () => void }) {
  const { locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const previews = useRef(new Map<string, string>());
  const allowFiles = mode === "fill" && !!upload && formFilesAllowed(upload);
  // Latest callbacks for the model's handlers, which are bound once per model.
  const live = useRef({ onSubmit, onDone, upload, t });
  useEffect(() => {
    live.current = { onSubmit, onDone, upload, t };
  });

  const built = useMemo(() => {
    setupSurveyLocale(surveyLocalization, locale, t);
    try {
      return { model: new Model(toSurveyJson(definition, { locale, mode, t, layout, allowFiles })), failed: false };
    } catch (err) {
      if (!(err instanceof SurveyAdapterError)) throw err;
      return { model: null, failed: true };
    }
  }, [definition, locale, mode, layout, allowFiles, t]);

  useEffect(() => {
    const model = built.model;
    if (!model) return;
    const urls = previews.current;

    model.onUploadFiles.add((_, options) => {
      const ctx = live.current.upload;
      const question = fileQuestionOf(definition, options.name);
      if (!allowFiles || !ctx || !question) {
        options.callback("error", live.current.t("forms.errors.files_not_allowed"));
        return;
      }
      const files = Array.from(options.files);
      const already = Array.isArray(options.question.value) ? options.question.value.length : 0;
      uploadFormFiles(files, question, ctx, {}, already)
        .then(({ driveItemIds }) => {
          driveItemIds.forEach((id, i) => urls.set(id, URL.createObjectURL(files[i])));
          options.callback("success", files.map((file, i) => ({ file, content: driveItemIds[i] })));
        })
        .catch((err: unknown) => options.callback("error", errorText(err, live.current.t)));
    });

    // Previews come from the files picked in this session; a Drive item is never fetched by the renderer.
    model.onDownloadFile.add((_, options) => {
      const url = typeof options.content === "string" ? urls.get(options.content) : undefined;
      if (url) options.callback("success", url);
      else options.callback("error");
    });

    model.onCompleting.add(async (sender, options) => {
      if (mode === "preview") return;
      setError(null);
      const checked = validateAnswers(definition, fromSurveyData(definition, sender.data), { allowFiles });
      if (!checked.ok) {
        options.allow = false;
        setError(live.current.t(formIssueKey(checked.issues[0])));
        return;
      }
      try {
        await live.current.onSubmit(checked.value);
      } catch (err) {
        options.allow = false;
        setError(errorText(err, live.current.t));
      }
    });

    model.onComplete.add(() => live.current.onDone());

    return () => {
      model.onUploadFiles.clear();
      model.onDownloadFile.clear();
      model.onCompleting.clear();
      model.onComplete.clear();
    };
  }, [built, definition, mode, allowFiles]);

  // Object URLs live as long as this round.
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  if (built.failed || !built.model) {
    return <Callout tone="danger">{t("forms.errors.invalid_definition")}</Callout>;
  }
  return (
    <div
      dir={RTL_LOCALES.has(locale) ? "rtl" : "ltr"}
      className={cn("forms-survey-host sjs-theme-overrides flex flex-col gap-3", className)}
    >
      {error && <Callout tone="danger">{error}</Callout>}
      <Survey model={built.model} />
    </div>
  );
}
