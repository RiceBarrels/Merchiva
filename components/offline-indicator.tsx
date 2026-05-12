"use client";

import { useOfflineMode } from "@/lib/offline-mode";
import { WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

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
          className="fixed top-3 left-3 z-[9999] flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-white shadow-lg"
        >
          <WifiOff className="h-3 w-3" />
          <span className="text-[11px] font-semibold leading-none">
            Offline{pendingCount > 0 ? ` · ${pendingCount}` : ""}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
