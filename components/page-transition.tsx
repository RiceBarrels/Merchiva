"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { shouldSkipTransition } from "@/components/page-tabs";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = useRef(false);

  if (shouldSkipTransition()) {
    skip.current = true;
  }

  const onAnimComplete = () => { skip.current = false; };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={pathname}
        initial={skip.current ? false : { opacity: 0, x: 80, scale: 0.96, filter: "blur(6px)" }}
        animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
        exit={skip.current ? { opacity: 0 } : { opacity: 0, x: -50, scale: 0.98, filter: "blur(4px)" }}
        transition={skip.current
          ? { duration: 0 }
          : {
              type: "spring",
              damping: 28,
              stiffness: 280,
              mass: 0.9,
              opacity: { duration: 0.2 },
              filter: { duration: 0.25 },
            }
        }
        onAnimationComplete={onAnimComplete}
        className="flex flex-col flex-1 min-h-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
