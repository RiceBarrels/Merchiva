"use client";

import type { ComponentType, ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

/*
 * Bottom sheet for the mobile chrome (mobile-safari spec §13). Sits above the chrome, the tab
 * overview and every DynamicUIElement page (overlay z-[89], content z-[90]) and is marked
 * `data-shell-sheet`, so the foreign-overlay detector ignores it and useVirtualKeyboard does
 * not count its inputs as page inputs. Never put a Base UI Select inside: its z-50 positioner
 * would render underneath. Use OptionRow lists or a native <select>.
 */

export interface ShellDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Opened from inside another ShellDrawer (vaul NestedRoot). */
  nested?: boolean;
  /** Rendered at the end of the title row. */
  headerAction?: ReactNode;
}

export function ShellDrawer({ open, onOpenChange, title, children, className, nested = false, headerAction }: ShellDrawerProps) {
  const Root = nested ? DrawerPrimitive.NestedRoot : DrawerPrimitive.Root;
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-[89] bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DrawerPrimitive.Content
          data-shell-sheet=""
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-t-xl border-t border-border bg-popover text-sm text-popover-foreground outline-none",
            className,
          )}
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)" }}
        >
          <div aria-hidden className="mx-auto mt-3 h-1 w-[100px] shrink-0 rounded-full bg-muted" />
          <div className="flex min-h-[36px] items-center gap-2 px-4 pt-3 pb-2">
            <DrawerPrimitive.Title className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </DrawerPrimitive.Title>
            {headerAction}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Root>
  );
}

export interface SheetRowProps {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  onClick?(): void;
  /** Right-aligned content (count, current value, badge). */
  trailing?: ReactNode;
  /** Secondary line under the label (paths, emails). */
  description?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  /** Marks the row as the current choice. */
  current?: boolean;
}

/** 48px sheet row (spec §13): icon, label, optional description and trailing slot. */
export function SheetRow({ icon: Icon, children, onClick, trailing, description, destructive = false, disabled = false, current }: SheetRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex min-h-[48px] w-full items-center gap-3 px-4 py-1.5 text-start text-[14px] outline-none transition-colors",
        "hover:bg-muted/60 focus-visible:bg-muted active:bg-muted disabled:pointer-events-none disabled:opacity-40",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {Icon && <Icon className={cn("h-4 w-4 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description != null && (
          <span className="block truncate font-mono text-[11.5px] text-muted-foreground">{description}</span>
        )}
      </span>
      {trailing}
    </button>
  );
}

/** Section of a sheet: optional Eyebrow label, separated from the previous section by a border. */
export function SheetSection({ label, children, first = false }: { label?: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={cn(!first && "border-t border-border")} aria-label={label}>
      {label && (
        <Eyebrow as="h3" className="px-4 pt-3 pb-1">
          {label}
        </Eyebrow>
      )}
      {children}
    </section>
  );
}
