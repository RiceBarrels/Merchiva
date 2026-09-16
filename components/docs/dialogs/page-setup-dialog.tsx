"use client";

/**
 * File ▸ Page setup: paper size, orientation, margins, header/footer distances and the
 * two Word header options. Values are shared through the Y.Doc, so applying them repaginates for everyone.
 *
 * Lengths are shown in the locale's unit (inches for US English, centimetres elsewhere) and stored in inches; the
 * form keeps raw strings while typing so a half-typed "1." doesn't snap back.
 */
import { useId, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  PAPER_IDS,
  PAPER_SIZES,
  formatLength,
  normalizePageSetup,
  parseLength,
  type DocMargins,
  type DocPageSetup,
  type PageOrientation,
  type PaperId,
} from "@/lib/docs/page-setup";
import { useT } from "@/lib/i18n/context";

type LengthKey = "top" | "right" | "bottom" | "left" | "header" | "footer" | "width" | "height";

type Draft = {
  paper: PaperId;
  orientation: PageOrientation;
  differentFirstPage: boolean;
  differentOddEven: boolean;
  lengths: Record<LengthKey, string>;
};

function toDraft(setup: DocPageSetup, unit: "in" | "cm"): Draft {
  const at = (value: number) => formatLength(value, unit);
  return {
    paper: setup.paper,
    orientation: setup.orientation,
    differentFirstPage: setup.differentFirstPage,
    differentOddEven: setup.differentOddEven,
    lengths: {
      top: at(setup.margins.top),
      right: at(setup.margins.right),
      bottom: at(setup.margins.bottom),
      left: at(setup.margins.left),
      header: at(setup.headerDistance),
      footer: at(setup.footerDistance),
      width: at(setup.customWidth),
      height: at(setup.customHeight),
    },
  };
}

function fromDraft(draft: Draft, unit: "in" | "cm", fallback: DocPageSetup): DocPageSetup {
  const at = (key: LengthKey, backup: number) => parseLength(draft.lengths[key], unit) ?? backup;
  const margins: DocMargins = {
    top: at("top", fallback.margins.top),
    right: at("right", fallback.margins.right),
    bottom: at("bottom", fallback.margins.bottom),
    left: at("left", fallback.margins.left),
  };
  return normalizePageSetup(
    {
      paper: draft.paper,
      orientation: draft.orientation,
      customWidth: at("width", fallback.customWidth),
      customHeight: at("height", fallback.customHeight),
      margins,
      headerDistance: at("header", fallback.headerDistance),
      footerDistance: at("footer", fallback.footerDistance),
      differentFirstPage: draft.differentFirstPage,
      differentOddEven: draft.differentOddEven,
      background: fallback.background,
    },
    fallback,
  );
}

export function PageSetupDialog({
  open,
  onOpenChange,
  setup,
  unit,
  canEdit,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  setup: DocPageSetup;
  unit: "in" | "cm";
  canEdit: boolean;
  onSubmit(next: DocPageSetup): void;
}) {
  const t = useT();
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(setup, unit));
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(toDraft(setup, unit));
  }

  const setLength = (key: LengthKey, value: string) =>
    setDraft((prev) => ({ ...prev, lengths: { ...prev.lengths, [key]: value } }));

  const unitLabel = t(unit === "in" ? "docs.pageSetup.inches" : "docs.pageSetup.centimetres");
  const paperItems = PAPER_IDS.map((id) => ({
    value: id,
    label:
      id === "custom"
        ? t("docs.pageSetup.custom")
        : `${t(`docs.pageSetup.paper.${id}`)} · ${formatLength(PAPER_SIZES[id].width, unit)} × ${formatLength(PAPER_SIZES[id].height, unit)} ${unitLabel}`,
  }));

  const lengthField = (key: LengthKey, labelKey: string) => (
    <Field label={t(labelKey)} htmlFor={`${ids}-${key}`}>
      <Input
        id={`${ids}-${key}`}
        inputMode="decimal"
        dir="ltr"
        className="font-mono tabular-nums"
        disabled={!canEdit}
        value={draft.lengths[key]}
        onChange={(event) => setLength(key, event.target.value)}
      />
    </Field>
  );

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.pageSetup.title")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (canEdit) onSubmit(fromDraft(draft, unit, setup));
            onOpenChange(false);
          }}
        >
          <Field label={t("docs.pageSetup.paperSize")} htmlFor={`${ids}-paper`}>
            <Select
              items={paperItems}
              value={draft.paper}
              onValueChange={(value) => {
                if (value) setDraft((prev) => ({ ...prev, paper: value as PaperId }));
              }}
            >
              <SelectTrigger id={`${ids}-paper`} disabled={!canEdit}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paperItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {draft.paper === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              {lengthField("width", "docs.pageSetup.width")}
              {lengthField("height", "docs.pageSetup.height")}
            </div>
          )}

          <Field label={t("docs.pageSetup.orientation")}>
            <SegmentedControl
              aria-label={t("docs.pageSetup.orientation")}
              fullWidth
              options={[
                { value: "portrait", label: t("docs.pageSetup.portrait"), disabled: !canEdit },
                { value: "landscape", label: t("docs.pageSetup.landscape"), disabled: !canEdit },
              ]}
              value={draft.orientation}
              onChange={(value) => setDraft((prev) => ({ ...prev, orientation: value }))}
            />
          </Field>

          <fieldset className="grid gap-3">
            <legend className="text-xs font-medium text-muted-foreground">
              {t("docs.pageSetup.margins")} ({unitLabel})
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {lengthField("top", "docs.pageSetup.marginTop")}
              {lengthField("bottom", "docs.pageSetup.marginBottom")}
              {lengthField("left", "docs.pageSetup.marginLeft")}
              {lengthField("right", "docs.pageSetup.marginRight")}
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="text-xs font-medium text-muted-foreground">{t("docs.headerFooter.title")}</legend>
            <div className="grid grid-cols-2 gap-3">
              {lengthField("header", "docs.pageSetup.headerDistance")}
              {lengthField("footer", "docs.pageSetup.footerDistance")}
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("docs.headerFooter.differentFirstPage")}</span>
              <Switch
                checked={draft.differentFirstPage}
                disabled={!canEdit}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, differentFirstPage: checked === true }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("docs.headerFooter.differentOddEven")}</span>
              <Switch
                checked={draft.differentOddEven}
                disabled={!canEdit}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, differentOddEven: checked === true }))}
              />
            </label>
          </fieldset>

          <DialogActions onCancel={() => onOpenChange(false)} confirmType="submit" disabled={!canEdit} confirmLabel={t("docs.pageSetup.apply")} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
