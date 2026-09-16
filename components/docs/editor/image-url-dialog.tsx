"use client";

/** Insert ▸ Image ▸ By URL. Only http(s) links that load as images are inserted. */
import { useId, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";

export function ImageUrlDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Resolves true when inserted. */
  onSubmit(url: string): Promise<boolean>;
}) {
  const t = useT();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl("");
      setBusy(false);
    }
  }

  const submit = async () => {
    if (busy || !url.trim()) return;
    setBusy(true);
    try {
      if (await onSubmit(url)) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("docs.image.insert")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("docs.image.urlLabel")} htmlFor={inputId}>
            <Input
              id={inputId}
              type="url"
              inputMode="url"
              dir="ltr"
              value={url}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={t("docs.image.urlPlaceholder")}
              readOnly={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <DialogActions
            onCancel={() => onOpenChange(false)}
            confirmType="submit"
            saving={busy}
            disabled={!url.trim()}
            confirmLabel={t("docs.image.insert")}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
