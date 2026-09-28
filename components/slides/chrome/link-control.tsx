"use client";

// Link button of the Slides toolbar (slides.md §6.2, §13): a small form in a popover. While typing, the link goes on
// the selected text (or the link under the caret); with elements selected, on all of their text. Only http(s) and
// mailto links are kept (linkHrefFromInput → safeHref); the renderer checks them again.
import { useId, useState } from "react";
import { Link as LinkIcon } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { linkHrefFromInput } from "@/components/slides/chrome/text-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/context";

function LinkForm({ initial, onApply, onRemove }: { initial: string | null; onApply(href: string): void; onRemove(): void }) {
  const t = useT();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initial ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const href = linkHrefFromInput(value);
        if (href === "") setInvalid(true);
        else onApply(href);
      }}
    >
      <label htmlFor={inputId} className="text-[12px] font-medium text-muted-foreground">
        {t("docs.link.url")}
      </label>
      <Input
        id={inputId}
        value={value}
        type="url"
        inputMode="url"
        dir="ltr"
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={t("docs.link.placeholder")}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          if (invalid) setInvalid(false);
        }}
      />
      {invalid && (
        <p id={errorId} className="text-[12px] text-destructive">
          {t("docs.link.invalid")}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {initial !== null && (
          <Button type="button" variant="ghost" size="sm" className="me-auto" onClick={onRemove}>
            {t("docs.link.remove")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={value.trim() === ""}>
          {t("docs.link.apply")}
        </Button>
      </div>
    </form>
  );
}

export function LinkControl({ href, disabled, onChange }: { href: string | null; disabled?: boolean; onChange(href: string | null): void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.format.link");
  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        render={<ToolbarIconButton aria-label={label} title={label} disabled={disabled} data-active={href ? "" : undefined} aria-pressed={href !== null} />}
      >
        <LinkIcon className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3" finalFocus={finalFocus} data-slides-picker="">
        <LinkForm
          initial={href}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onRemove={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
