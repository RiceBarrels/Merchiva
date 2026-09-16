"use client";

import { useOfflineMode } from "@/lib/offline-mode";
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { StatusBadge } from "@/components/ui/status-badge";

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
          className="fixed top-3 left-3 z-[9999] [html[data-browser-shell=desktop]_&]:top-auto [html[data-browser-shell=desktop]_&]:bottom-3"
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
