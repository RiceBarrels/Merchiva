"use client";

// The row primitives every settings panel is built from.
//
// These used to be declared inside `SettingsPage`, which re-created the
// component type on every render — React then unmounted and remounted every
// row, losing focus in any input inside one. Hoisted here they are ordinary
// components, and the panels can be split out of the page without dragging
// their chrome along.

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { hapticSuccess } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface SRowProps {
  icon: ReactNode;
  title: string;
  meta?: string;
  right?: ReactNode;
  onClick?: () => void;
  isFirst?: boolean;
  /** Desktop: render as a standalone bordered card in the settings grid. */
  card?: boolean;
}

/** One settings row: icon tile, title, meta line, optional right slot. */
export function SRow({ icon, title, meta, right, onClick, isFirst, card }: SRowProps) {
  const Wrapper = onClick ? "button" : "div";
  // Mobile: list rows separated by border-t. lg + card: standalone bordered card.
  const baseBorder = `${isFirst ? "" : "border-t border-border"} ${card ? " lg:pt-6 lg:flex-col lg:items-start lg:border lg:border-border lg:rounded" : ""}`;
  const interactive = onClick ? "transition-colors active:bg-muted/40 lg:hover:bg-muted/40" : "";
  return (
    <Wrapper
      onClick={onClick}
      className={`flex items-center gap-3 px-[18px] py-3.5 w-full text-left ${card && " lg:pt-6 lg:flex-col lg:items-start"} ${baseBorder} ${interactive}`}
    >
      <IconTile>{icon}</IconTile>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {meta && <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</p>}
      </div>
      <div className={cn("flex justify-end items-end gap-2 shrink-0", card && "lg:w-full")}>
        {right}
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>
    </Wrapper>
  );
}

export interface SToggleRowProps {
  icon: ReactNode;
  title: string;
  meta?: string;
  checked: boolean;
  onChange: () => void;
  isFirst?: boolean;
  disabled?: boolean;
}

/** Settings row whose right slot is a switch. */
export function SToggleRow({ icon, title, meta, checked, onChange, isFirst, disabled }: SToggleRowProps) {
  return (
    <div className={`flex items-center gap-3 px-[18px] py-3.5 w-full ${isFirst ? "" : "border-t border-border"} ${disabled ? "opacity-60" : ""}`}>
      <IconTile>{icon}</IconTile>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={`Toggle ${title}`}
        onCheckedChange={() => {
          if (disabled) return;
          hapticSuccess();
          onChange();
        }}
      />
    </div>
  );
}

/** Small header above a group of rows inside a panel. */
export function SGroupHeader({ label }: { label: string }) {
  return (
    <div className="px-[18px] pt-5 pb-1.5 border-b border-border">
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}

/** Header above a category in the settings index (spans the desktop grid). */
export function SCategoryHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-[18px] pt-5 pb-1.5 lg:col-span-2 xl:col-span-3 lg:px-0 lg:pt-3 lg:pb-0">
      <Eyebrow>{children}</Eyebrow>
    </div>
  );
}

export interface SBadgeProps {
  children: ReactNode;
  tone?: "default" | "outline" | "ok" | "warn";
}

/** Compact status chip sized for a settings row's right slot. */
export function SBadge({ children, tone = "default" }: SBadgeProps) {
  const statusTone: StatusTone = tone === "ok" ? "success" : tone === "warn" ? "warning" : "neutral";
  return (
    <StatusBadge
      tone={statusTone}
      className={cn("px-1.5 text-[11px]", tone === "default" && "text-foreground", tone === "outline" && "bg-background text-foreground")}
    >
      {children}
    </StatusBadge>
  );
}
