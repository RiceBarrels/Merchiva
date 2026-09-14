"use client";

// Bottom sheet: grab handle, title, 60px option rows, Cancel row. `children`
// replaces the option list for custom panes (PIN pad, QR scanner).

import type { ComponentType, ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";

export interface DeviceDrawerOption {
  id: string;
  /** Lucide icon or one of the custom glyphs in app-icons.tsx. */
  icon: ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  tone?: "default" | "primary" | "warn";
  hidden?: boolean;
  onSelect: () => void;
}

export interface DeviceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options?: DeviceDrawerOption[];
  /** Custom pane (PIN pad, QR scanner) rendered instead of the option list. */
  children?: ReactNode;
  cancelLabel?: string;
  onCancel?: () => void;
  /** Max width on wide screens (tablet centers a 400px sheet). */
  maxWidth?: number;
}

export function DeviceDrawer({ open, onOpenChange, title, options, children, cancelLabel, onCancel, maxWidth }: DeviceDrawerProps) {
  const t = useT();
  const cancel = () => {
    hapticLight();
    if (onCancel) onCancel();
    else onOpenChange(false);
  };
  // `{cond && <Pane/>}` children evaluate to `false` on the option pane;
  // treat any falsy child as "no custom pane" so the option list renders.
  const hasCustomPane = children !== undefined && children !== null && children !== false;
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DrawerPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-auto max-h-[85vh] w-full flex-col rounded-t-[20px] border-t border-border bg-background px-4 pb-6 text-foreground outline-none"
          style={maxWidth ? { maxWidth } : undefined}
          aria-describedby={undefined}
        >
          <div className="mx-auto mb-2.5 mt-2 h-1 w-9 shrink-0 rounded-full bg-border" />
          <DrawerPrimitive.Title className="mb-3.5 mt-1 text-[16px] font-semibold">{title}</DrawerPrimitive.Title>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {hasCustomPane
              ? children
              : (options ?? [])
                .filter((o) => !o.hidden)
                .map((o) => {
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        hapticLight();
                        o.onSelect();
                      }}
                      className="mb-2 flex h-[60px] w-full items-center gap-3 rounded-lg border border-border px-3 text-left active:bg-muted"
                    >
                      <span
                        className={cn(
                          "grid h-9 w-9 flex-none place-items-center rounded",
                          o.tone === "primary"
                            ? "bg-primary text-primary-foreground"
                            : o.tone === "warn"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-foreground",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[14px] font-semibold">{o.label}</b>
                        {o.sub && <span className="block truncate text-[12px] text-muted-foreground">{o.sub}</span>}
                      </span>
                    </button>
                  );
                })}
          </div>
          <button
            type="button"
            onClick={cancel}
            className="mt-1 grid h-11 w-full place-items-center text-[14px] font-medium text-muted-foreground"
          >
            {cancelLabel ?? t("device.cancel")}
          </button>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
