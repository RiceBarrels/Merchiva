"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";

export interface DialogActionsProps extends React.ComponentProps<"div"> {
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  /** Shows a spinner in the confirm button and disables both. */
  saving?: boolean;
  disabled?: boolean;
  /** Renders the confirm button as `variant="destructive"`. */
  destructive?: boolean;
  /** `submit` lets the confirm button submit an enclosing `<form>`. */
  confirmType?: "button" | "submit";
  /** Extra left-aligned content (e.g. a secondary "Delete" link). */
  secondary?: React.ReactNode;
  /** Draw the top border. Default true. */
  divider?: boolean;
  size?: "sm" | "default";
}

/**
 * Standard dialog / sheet footer: right-aligned Cancel + Confirm, optional secondary slot on the left.
 * Replaces the six copied `<Separator/><div className="flex justify-end gap-2">…` blocks.
 */
export function DialogActions({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  saving = false,
  disabled = false,
  destructive = false,
  confirmType = "button",
  secondary,
  divider = true,
  size = "sm",
  className,
  ...props
}: DialogActionsProps) {
  const t = useT();
  return (
    <div
      data-slot="dialog-actions"
      className={cn("flex items-center gap-2", divider && "border-t border-border pt-3", className)}
      {...props}
    >
      {secondary && <div className="mr-auto flex items-center gap-2">{secondary}</div>}
      <div className={cn("flex items-center gap-2", !secondary && "ml-auto")}>
        {onCancel && (
          <Button type="button" variant="outline" size={size} onClick={onCancel} disabled={saving}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
        )}
        <Button
          type={confirmType}
          variant={destructive ? "destructive" : "default"}
          size={size}
          onClick={confirmType === "button" ? onConfirm : undefined}
          disabled={disabled || saving}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel ?? t("common.save")}
        </Button>
      </div>
    </div>
  );
}
