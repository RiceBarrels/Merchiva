"use client";

/**
 * Comment / reply / edit composer (docs-editor-ui spec §4.10 "CommentComposer").
 * Mod+Enter submits, Esc cancels. `onSubmit` resolves to clear the field; when it rejects the text is kept (the
 * caller already showed the error).
 */
import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** Mirrors the server's `DOC_COMMENT_MAX`. */
export const COMMENT_BODY_MAX = 4000;

export interface CommentComposerProps {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  onSubmit(body: string): Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Reply field: one line with the buttons hidden until focused or filled. */
  compact?: boolean;
  className?: string;
}

export function CommentComposer({
  placeholder,
  submitLabel,
  initialValue = "",
  onSubmit,
  onCancel,
  autoFocus = false,
  compact = false,
  className,
}: CommentComposerProps): React.JSX.Element {
  const t = useT();
  const fieldId = useId();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(autoFocus);

  const body = value.trim();
  const showActions = !compact || focused || value.length > 0 || saving;

  const submit = async () => {
    if (!body || saving) return;
    setSaving(true);
    try {
      await onSubmit(body);
      setValue("");
    } catch {
      // Keep the text; the caller reported the error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      data-no-activate=""
      noValidate
      className={cn("grid gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <Textarea
        id={fieldId}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={COMMENT_BODY_MAX}
        autoFocus={autoFocus}
        readOnly={saving}
        aria-busy={saving || undefined}
        rows={compact && !showActions ? 1 : 2}
        className={cn("text-[13px] md:text-[13px]", compact && !showActions ? "min-h-8 py-1.5" : "min-h-14")}
        onFocus={() => setFocused(true)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape" && onCancel) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      {showActions && (
        <div className="flex items-center justify-end gap-1.5">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!body || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
