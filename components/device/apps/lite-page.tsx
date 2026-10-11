"use client";

// Second-level screens of the lite apps. On /personal a detail or a form opens as a DynamicUIElement
// page (in from the right, Back in the corner, swipe right to go back); on /store it stays the bottom
// sheet the tablet already uses. Short confirm sheets (send / leave / sign off) stay DeviceDrawers on
// both surfaces.

import type { ReactNode } from "react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { DeviceDrawer } from "@/components/device/device-drawer";

/**
 * A DynamicUIElement page. Its close cannot be refused: by the time `onClose` runs the page has
 * already slid away, so a handler that ignored it would leave an invisible open page behind.
 */
export function LitePage({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DynamicUIElement open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DynamicUIElementContent>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle>{title}</DynamicUIElementTitle>
        </DynamicUIElementHeader>
        {/* At least the page's height, so a screen with its actions at the bottom (a form) keeps them there. */}
        <div className="flex min-h-full flex-col gap-4">{children}</div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

/** A page on /personal, the bottom sheet on /store. */
export function LiteSubPage({ surface, open, onClose, onPageClose, title, cancelLabel, maxWidth, children }: {
  surface: "store" | "personal";
  open: boolean;
  /** The sheet's close; it may refuse while something is saving. */
  onClose: () => void;
  /** The page's close, which must always close (see LitePage). Defaults to `onClose`. */
  onPageClose?: () => void;
  title: string;
  cancelLabel?: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  if (surface === "personal") {
    return <LitePage open={open} onClose={onPageClose ?? onClose} title={title}>{children}</LitePage>;
  }
  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      onCancel={onClose}
      title={title}
      cancelLabel={cancelLabel}
      maxWidth={maxWidth}
    >
      {children}
    </DeviceDrawer>
  );
}
