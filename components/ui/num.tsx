"use client";

import { cn } from "@/lib/utils";
import { TableCell } from "@/components/ui/table";
import { useCurrency, type FormatOptions } from "@/lib/currency";

interface NumBaseProps {
  /** Dim the number (secondary metrics, zero values). */
  muted?: boolean;
  /** Text-only status hue, e.g. deltas. */
  tone?: "success" | "warning" | "danger";
  /** `sm` (default) = text-sm, `xs` = text-xs, `lg` = text-lg headline. */
  size?: "xs" | "sm" | "lg";
  className?: string;
}

const TONE: Record<NonNullable<NumBaseProps["tone"]>, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-destructive",
};

const SIZE: Record<NonNullable<NumBaseProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  lg: "text-lg font-semibold",
};

function numClasses({ muted, tone, size = "sm", className }: NumBaseProps) {
  return cn("font-mono tabular-nums", SIZE[size], muted && "text-muted-foreground", tone && TONE[tone], className);
}

export interface NumProps extends NumBaseProps, Omit<React.ComponentProps<"span">, "className"> {
  /** Already-formatted text, or a raw number (rendered with `toLocaleString`). */
  value: React.ReactNode;
  /** Digits after the decimal point when `value` is a number. */
  decimals?: number;
}

/** Inline number / ID / timestamp: always `font-mono tabular-nums`. */
export function Num({ value, decimals, muted, tone, size, className, ...props }: NumProps) {
  const text =
    typeof value === "number"
      ? value.toLocaleString("en-US", decimals === undefined ? undefined : { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : value;
  return <span data-slot="num" className={numClasses({ muted, tone, size, className })} {...props}>{text}</span>;
}

export interface MoneyProps extends NumBaseProps, Omit<React.ComponentProps<"span">, "className"> {
  /** Amount in major units (e.g. 12.5 for $12.50). */
  value: number | null | undefined;
  /** Passed to `useCurrency().format`. */
  format?: FormatOptions;
  /** Show a leading "+" for positive values (deltas). */
  signed?: boolean;
}

/** Amount in the organization's active currency, mono + tabular. */
export function Money({ value, format, signed = false, muted, tone, size, className, ...props }: MoneyProps) {
  const { format: fmt } = useCurrency();
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const text = `${signed && n > 0 ? "+" : ""}${fmt(n, format)}`;
  return <span data-slot="money" className={numClasses({ muted, tone, size, className })} {...props}>{text}</span>;
}

type CellProps = Omit<React.ComponentProps<typeof TableCell>, "align"> & { align?: "left" | "right" };

/** Right-aligned mono table cell for numeric columns. */
export function NumCell({ align = "right", className, ...props }: CellProps) {
  return <TableCell data-slot="num-cell" className={cn("font-mono tabular-nums", align === "right" && "text-right", className)} {...props} />;
}

/** Numeric table head that matches NumCell alignment. */
export function numHeadClass(align: "left" | "right" = "right") {
  return align === "right" ? "text-right" : undefined;
}
