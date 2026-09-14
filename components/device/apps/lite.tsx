"use client";

// Building blocks for the "lite" device apps (/store + /personal). These
// screens are for frontline staff who may not read well: one task per
// screen, big tap targets, an icon next to every label, few numbers, no
// tables / filters / settings. Keep to these primitives so every app feels
// the same; the manager back office (/manager) stays the power-user path.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { Spinner } from "@/components/ui/loaders/geometric";
import { EmptyState } from "@/components/ui/empty-state";

/** Scrollable page body with consistent padding. */
export function LiteScreen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-h-full flex-col gap-4 px-4 py-4", className)}>{children}</div>;
}

/** Small uppercase label above a group. */
export function LiteSection({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** One big statement: a title and a large value (today's count, my next shift…). */
export function LiteStat({ icon: Icon, label, value, sub, tone = "default", className }: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-4",
        tone === "success" && "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950",
        tone === "warning" && "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
        tone === "destructive" && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
        tone === "default" && "border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </div>
      <div className="mt-1.5 text-[32px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-2 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Full-width 56px action. `tone` picks primary / outline / danger. */
export function LiteButton({ icon: Icon, label, onClick, tone = "primary", disabled, busy, className }: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "primary" | "outline" | "danger";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => { hapticLight(); onClick(); }}
      className={cn(
        "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-lg px-4 text-[16px] font-semibold transition-colors active:translate-y-px disabled:opacity-50",
        tone === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        tone === "outline" && "border border-border bg-background text-foreground hover:bg-muted",
        tone === "danger" && "bg-destructive text-white hover:bg-destructive/90",
        className,
      )}
    >
      {busy ? <Spinner size={18} /> : Icon && <Icon className="h-5 w-5" />}
      {label}
    </button>
  );
}

/** 64px list row: icon tile, big title, one-line sub, optional right slot. */
export function LiteRow({ icon: Icon, iconTone = "muted", title, sub, right, onClick, chevron, className }: {
  icon?: LucideIcon;
  iconTone?: "muted" | "primary" | "success" | "warning" | "destructive";
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  /** Show a chevron on the right (implies tappable). */
  chevron?: boolean;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick ? () => { hapticLight(); onClick(); } : undefined}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left",
        onClick && "active:bg-muted",
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "grid h-10 w-10 flex-none place-items-center rounded",
            iconTone === "muted" && "bg-muted text-foreground",
            iconTone === "primary" && "bg-primary text-primary-foreground",
            iconTone === "success" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
            iconTone === "warning" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
            iconTone === "destructive" && "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        {sub && <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {right && <span className="flex-none text-[15px] font-mono tabular-nums">{right}</span>}
      {chevron && <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />}
    </Tag>
  );
}

/** Big search box (48px). */
export function LiteSearch({ value, onChange, placeholder, autoFocus, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex h-12 items-center gap-2.5 rounded-lg border border-input bg-background px-3", className)}>
      <Search className="h-5 w-5 flex-none text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/** Centered spinner for the loading state. */
export function LiteLoading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" />
    </div>
  );
}

/** Empty state with an icon and one short sentence. */
export function LiteEmpty({ icon, title, description, className }: { icon: LucideIcon; title: string; description?: string; className?: string }) {
  return <EmptyState icon={icon} title={title} description={description} className={cn("min-h-[40vh]", className)} />;
}

/** Big pill toggle group (2–4 options). */
export function LiteChoice<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", options.length <= 2 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {options.map((o) => {
        const Icon = o.icon;
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => { hapticLight(); onChange(o.value); }}
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-lg border text-[15px] font-medium",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground active:bg-muted",
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
