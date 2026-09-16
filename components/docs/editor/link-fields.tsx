"use client";

/**
 * Shared URL + text form for the desktop link popover and the mobile link sheet.
 */
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";

export interface LinkFieldsProps {
  initialHref: string;
  initialText: string;
  /** Whether the caret/selection is inside an existing link (shows Remove). */
  hasLink: boolean;
  /** Return false when the link is invalid. */
  onApply(href: string, text: string): boolean;
  onRemove(): void;
  autoFocus?: boolean;
}

export function LinkFields({ initialHref, initialText, hasLink, onApply, onRemove, autoFocus = true }: LinkFieldsProps) {
  const t = useT();
  const hrefId = useId();
  const textId = useId();
  const errorId = useId();
  const [href, setHref] = useState(initialHref);
  const [text, setText] = useState(initialText);
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const ok = onApply(href, text);
        setInvalid(!ok);
      }}
    >
      <Field label={t("docs.link.url")} htmlFor={hrefId} error={invalid ? t("docs.link.invalid") : undefined}>
        <Input
          id={hrefId}
          value={href}
          type="url"
          inputMode="url"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("docs.link.placeholder")}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            setHref(event.target.value);
            if (invalid) setInvalid(false);
          }}
        />
      </Field>
      <Field label={t("docs.link.text")} htmlFor={textId}>
        <Input id={textId} value={text} autoComplete="off" onChange={(event) => setText(event.target.value)} />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {hasLink && (
          <Button type="button" variant="ghost" size="sm" className="me-auto" onClick={onRemove}>
            {t("docs.link.remove")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!href.trim()}>
          {t("docs.link.apply")}
        </Button>
      </div>
    </form>
  );
}

/** Current link href and selection text for prefilling the link form. */
export function readLinkSelection(editor: {
  getAttributes(name: string): Record<string, unknown>;
  isActive(name: string): boolean;
  state: { selection: { from: number; to: number; empty: boolean }; doc: { textBetween(from: number, to: number, sep?: string): string } };
}): { href: string; text: string; hasLink: boolean } {
  const hasLink = editor.isActive("link");
  const rawHref = editor.getAttributes("link").href;
  const { from, to, empty } = editor.state.selection;
  return {
    href: typeof rawHref === "string" ? rawHref : "",
    text: empty ? "" : editor.state.doc.textBetween(from, to, " "),
    hasLink,
  };
}
