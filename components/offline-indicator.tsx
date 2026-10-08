"use client";

import { useOfflineMode } from "@/lib/offline-mode";
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { isOffline, pendingCount } = useOfflineMode();

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={cn(
            "fixed top-3 left-3 z-[9999] [html[data-browser-shell=desktop]_&]:top-auto [html[data-browser-shell=desktop]_&]:bottom-3",
            // On the phone shell corner buttons own both ends of the top row (the menu, a dialog page's
            // physically-left Back and its title, end actions): there the badge spans the screen below
            // that row (safe area + CORNER_OFFSET_PX + CORNER_BUTTON_SIZE_PX + 8px = 3.75rem), sits at
            // its inline end, grows from that end and lets taps through.
            "[html[data-browser-shell=mobile]_&]:pointer-events-none [html[data-browser-shell=mobile]_&]:right-3 [html[data-browser-shell=mobile]_&]:top-[calc(env(safe-area-inset-top,0px)+3.75rem)] [html[data-browser-shell=mobile]_&]:flex [html[data-browser-shell=mobile]_&]:justify-end [html[data-browser-shell=mobile]_&]:origin-right [html[data-browser-shell=mobile][dir=rtl]_&]:origin-left",
          )}
        >
          <StatusBadge tone="danger" className="gap-1.5 font-semibold">
            <WifiOff className="h-3 w-3" />
            Offline{pendingCount > 0 ? ` · ${pendingCount}` : ""}
          </StatusBadge>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
