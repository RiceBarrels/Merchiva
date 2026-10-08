"use client";

// Build ▸ Preview (design B.6): the form as a respondent sees it on /manager, rendered by the same host as the fill
// page in `preview` mode — nothing is submitted and file questions never upload. A width toggle shows the phone
// layout; "Start over" clears the answers.

import { useState } from "react";
import { Eye, FileQuestion, Monitor, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { FormDefinitionV1 } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { LazySurveyHost } from "./lazy-host";

type PreviewWidth = "desktop" | "phone";

export interface FormPreviewProps {
  /** The definition to show (the builder's draft, saved or not). null = the form cannot be read. */
  definition: FormDefinitionV1 | null;
  className?: string;
}

const noSubmit = async () => {};

export function FormPreview({ definition, className }: FormPreviewProps) {
  const t = useT();
  const [width, setWidth] = useState<PreviewWidth>("desktop");
  const [round, setRound] = useState(0);
  const hasQuestions = !!definition?.questions.some((q) => q.type !== "section" && !q.archived);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Callout tone="info" icon={Eye} className="flex-1">{t("forms.preview.notice")}</Callout>
        <div className="flex items-center gap-2">
          <SegmentedControl<PreviewWidth>
            size="sm"
            aria-label={t("forms.preview.widthLabel")}
            value={width}
            onChange={setWidth}
            options={[
              { value: "desktop", label: t("forms.preview.desktop"), icon: Monitor },
              { value: "phone", label: t("forms.preview.phone"), icon: Smartphone },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => setRound((n) => n + 1)}>
            <RotateCcw className="h-4 w-4" />
            {t("forms.preview.restart")}
          </Button>
        </div>
      </div>
      {!definition || !hasQuestions ? (
        <EmptyState
          icon={FileQuestion}
          title={t(definition ? "forms.preview.emptyTitle" : "forms.errors.invalid_definition")}
          description={definition ? t("forms.preview.emptyBody") : undefined}
        />
      ) : (
        <div
          className={cn(
            "mx-auto w-full rounded-lg border border-border bg-background p-4 transition-[max-width] duration-200",
            width === "phone" ? "max-w-[390px]" : "max-w-3xl",
          )}
        >
          <LazySurveyHost
            key={`${round}:${width}`}
            definition={definition}
            mode="preview"
            layout={width === "phone" ? "wizard" : "single"}
            upload={null}
            onSubmit={noSubmit}
            renderComplete={(restart) => (
              <div className="flex flex-col items-start gap-3 py-6">
                <p className="text-sm">{t("forms.preview.completed")}</p>
                <Button variant="outline" size="sm" onClick={restart}>
                  <RotateCcw className="h-4 w-4" />
                  {t("forms.preview.restart")}
                </Button>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
