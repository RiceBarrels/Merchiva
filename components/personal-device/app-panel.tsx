"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Slide-over that covers the pages area: 44px title bar with X, scrollable body. */
export function AppPanel({
  open,
  title,
  onClose,
  children,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          className={cn("absolute inset-0 z-[5] flex flex-col bg-background", className)}
        >
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
            <span className="text-[13px] font-semibold">{title}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => { hapticLight(); onClose(); }}
              className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
