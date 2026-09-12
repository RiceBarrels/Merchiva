import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FieldProps extends Omit<React.ComponentProps<"div">, "title"> {
  label: React.ReactNode;
  /** Forwarded to the Label's `htmlFor`; pass the control's `id`. */
  htmlFor?: string;
  /** Help text under the control (`text-xs text-muted-foreground`). */
  hint?: React.ReactNode;
  /** Error text; replaces `hint` and uses `text-destructive`. */
  error?: React.ReactNode;
  /** Marks the label with a required indicator. */
  required?: boolean;
  /**
   * `stacked` (default): label above control, for forms and dialogs.
   * `inline`: compact `[label | control]` grid for inspector / settings panels.
   */
  layout?: "stacked" | "inline";
  /** Inline layout label column width. Default 56px (builder inspector). */
  labelWidth?: number;
}

/**
 * Label + control + hint/error, one recipe for dialogs, settings and the builder inspector.
 * Replaces raw `<label className="text-[11px] …">` + `<input>` pairs.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  layout = "stacked",
  labelWidth = 56,
  className,
  children,
  ...props
}: FieldProps) {
  const message = error ?? hint;
  const inline = layout === "inline";
  return (
    <div
      data-slot="field"
      data-layout={layout}
      data-invalid={error ? "" : undefined}
      className={cn(inline ? "grid items-center gap-x-2 gap-y-1" : "grid gap-1.5", className)}
      style={inline ? { gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` } : undefined}
      {...props}
    >
      <Label htmlFor={htmlFor} className={cn(inline && "text-[10.5px] font-normal text-muted-foreground")}>
        {label}
        {required && <span aria-hidden className="text-destructive">*</span>}
      </Label>
      <div className="min-w-0">{children}</div>
      {message && (
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground", inline && "col-start-2")}>{message}</p>
      )}
    </div>
  );
}
