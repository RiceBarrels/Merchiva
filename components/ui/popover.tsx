"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  side,
  sideOffset = 4,
  anchor,
  ...props
}: PopoverPrimitive.Popup.Props & {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  anchor?: PopoverPrimitive.Positioner.Props["anchor"];
}) {
  return (
    // The Positioner is the element that is actually positioned, so the
    // stacking context has to live on it (like select / tooltip / context
    // menu) — z-index on the inner Popup alone left the panel under a
    // dialog's z-50 overlay, blurred and unclickable. z-[100] clears nested
    // dialog pages (50 + depth) but stays below the floating nav pill (200).
    // pointer-events-auto keeps it usable inside a modal vaul drawer.
    <PopoverPrimitive.Portal className="pointer-events-auto">
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        className="isolate z-[100] pointer-events-auto"
      >
        <PopoverPrimitive.Popup
          className={cn(
            "z-50 rounded-[0.3rem] border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
