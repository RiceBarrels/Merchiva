"use client";

// "New form": pick a template (blank first), create the draft, open the builder.
// A blank form also picks its kind here: the kind is fixed at creation and decides
// where the form shows on the store tablet (Today's checklists, Report something).
// Template copy resolves through the creator's t() once, at creation (lib/forms/templates.ts).

import { useState } from "react";
import { toast } from "sonner";
import { CheckSquare, ClipboardList, FilePlus2, MessageSquareHeart, Siren, Thermometer, Sun, type LucideIcon } from "lucide-react";
import { DialogActions } from "@/components/ui/dialog-actions";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useT } from "@/lib/i18n/context";
import { FORM_DEFAULT_RESPONSE_LIMIT } from "@/lib/forms/limits";
import { buildBlankForm, buildFormTemplate, FORM_TEMPLATES, type FormTemplateId } from "@/lib/forms/templates";
import { FORM_KINDS, type FormKind } from "@/lib/forms/types";
import { createForm, formsErrorKey, updateFormSettings } from "@/lib/spacetimedb/actions/forms";

const TEMPLATE_ICON: Record<FormTemplateId, LucideIcon> = {
  blank: FilePlus2,
  openingChecklist: Sun,
  closingChecklist: CheckSquare,
  incidentReport: Siren,
  customerFeedback: MessageSquareHeart,
  equipmentCheck: Thermometer,
};

export function NewFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new form's id once the draft exists. */
  onCreated: (formId: string) => void;
}) {
  const t = useT();
  const [picked, setPicked] = useState<FormTemplateId>("blank");
  const [blankKind, setBlankKind] = useState<FormKind>("form");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const template = picked === "blank" ? buildBlankForm(blankKind, t) : buildFormTemplate(picked, t);
      const formId = await createForm({ kind: template.kind, definition: template.definition });
      // createForm starts every form as unlimited; a checklist template repeats daily (and tracks completion).
      const defaultTracking = template.kind === "checklist";
      if (template.perMember !== "unlimited" || template.trackCompletion !== defaultTracking) {
        await updateFormSettings(formId, {
          audience: "members",
          perMember: template.perMember,
          responseLimit: FORM_DEFAULT_RESPONSE_LIMIT,
          closesAt: null,
          trackCompletion: template.trackCompletion,
          notifyOwner: true,
        }).catch(() => undefined);
      }
      onOpenChange(false);
      onCreated(formId);
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DynamicUIElementContent className="max-w-lg">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("forms.newForm.title")}>{t("forms.newForm.title")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("forms.newForm.description")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="space-y-2 px-4 pb-2" role="radiogroup" aria-label={t("forms.newForm.templates")}>
          {FORM_TEMPLATES.map((tpl) => (
            <OptionRow
              key={tpl.id}
              role="radio"
              aria-checked={picked === tpl.id}
              selected={picked === tpl.id}
              onSelect={() => setPicked(tpl.id)}
              icon={TEMPLATE_ICON[tpl.id] ?? ClipboardList}
              title={t(tpl.titleKey)}
              description={t(tpl.descriptionKey)}
              disabled={busy}
            />
          ))}
        </div>
        {picked === "blank" && (
          <div className="space-y-1.5 px-4 pb-2">
            <p className="text-xs font-medium text-muted-foreground">{t("forms.builder.type")}</p>
            <SegmentedControl
              aria-label={t("forms.builder.type")}
              options={FORM_KINDS.map((kind) => ({ value: kind, label: t(`forms.kind.${kind}`), disabled: busy }))}
              value={blankKind}
              onChange={setBlankKind}
              size="sm"
              fullWidth
            />
            <p className="text-xs text-muted-foreground">{t("forms.newForm.kindHint")}</p>
          </div>
        )}
        <DialogActions
          className="px-4 pb-4"
          onCancel={() => onOpenChange(false)}
          onConfirm={() => { void create(); }}
          confirmLabel={t("forms.newForm.create")}
          saving={busy}
        />
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
