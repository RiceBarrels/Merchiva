"use client";

/** Shared vaul drawer shell + full-width rows for the mobile editor sheets (docs-editor-ui spec §7.3). */
import type { ComponentType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export function MobileDrawer({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-shell-sheet="" className={cn("max-h-[85vh]", className)}>
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 overflow-y-auto pb-[max(env(safe-area-inset-bottom,0px),12px)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function SheetRow({
  icon: Icon,
  label,
  onSelect,
  disabled,
  destructive,
  chevron,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onSelect(): void;
  disabled?: boolean;
  destructive?: boolean;
  /** Opens a nested sheet. */
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex h-12 w-full items-center gap-3 px-4 text-start text-[15px] text-foreground outline-none active:bg-muted focus-visible:bg-muted disabled:opacity-50",
        destructive && "text-destructive",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {chevron && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
    </button>
  );
}

export function SheetDivider() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
