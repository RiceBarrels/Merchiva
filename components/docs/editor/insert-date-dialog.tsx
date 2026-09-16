"use client";

/** Insert ▸ Date: pick a day, insert it as locale-formatted text. */
import { useId, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { parseLocalIsoDate, todayIsoDate } from "@/lib/docs/format";
import { useT } from "@/lib/i18n/context";

export function InsertDateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(date: Date): void;
}) {
  const t = useT();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(todayIsoDate());
  }
  const date = parseLocalIsoDate(value);

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.insert.date")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!date) return;
            onSubmit(date);
            onOpenChange(false);
          }}
        >
          <Field label={t("docs.insert.date")} htmlFor={inputId}>
            <Input id={inputId} type="date" value={value} onChange={(event) => setValue(event.target.value)} />
          </Field>
          <DialogActions
            onCancel={() => onOpenChange(false)}
            confirmType="submit"
            disabled={!date}
            confirmLabel={t("docs.insert.insertButton")}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
