"use client";

// The /personal channel's conversation list: the channel workspace's sidebar (starred, channels
// and direct messages with their unread, mention and notification marks; search; new channel /
// new DM) in a drawer that slides in from the inline start over the conversation, like Discord's.

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/lib/i18n/context";

export function ChannelDrawer({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  /** The list: a ChannelSidebar. */
  children: ReactNode;
}) {
  const { t, dir } = useI18n();
  const reduced = useReducedMotion() ?? false;
  const offscreen = dir === "rtl" ? "100%" : "-100%";
  const transition = reduced ? { duration: 0 } : { duration: 0.24, ease: [0.2, 0.7, 0.2, 1] as const };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div key="channel-drawer" className="absolute inset-0 z-30" data-no-swipe>
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />
          <motion.nav
            aria-label={t("personalDevice.chat.channels")}
            className="absolute inset-y-0 start-0 flex w-[85%] max-w-[320px] flex-col border-e border-border bg-background shadow-xl"
            initial={{ x: offscreen }}
            animate={{ x: 0 }}
            exit={{ x: offscreen }}
            transition={transition}
          >
            {children}
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  );
}
