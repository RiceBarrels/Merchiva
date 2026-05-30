"use client";

import { usePathname } from "next/navigation";
import { useContext, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { shouldSkipTransition } from "@/components/page-tabs";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactNode } from "react";

function FrozenRouter({ children }: { children: ReactNode }) {
  const context = useContext(LayoutRouterContext);
  const frozen = useRef(context).current;

  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = useRef(false);

  if (shouldSkipTransition()) {
    skip.current = true;
  }

  const onAnimComplete = () => { skip.current = false; };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={skip.current ? false : { scale: 0.95, opacity: 0 }}
          animate={skip.current
            ? { scale: 1, opacity: 1, transition: { duration: 0 } }
            : {
                scale: 1,
                opacity: 1,
                transition: { duration: 0.2, ease: "easeOut" },
              }
          }
          exit={skip.current ? { transition: { duration: 0 } } : {
            scale: 0.95,
            opacity: 0,
            transition: { duration: 0.15, ease: "easeIn" },
          }}
          onAnimationComplete={onAnimComplete}
          className="flex flex-col flex-1 min-h-0 gap-1 overflow-y-auto px-2"
        >
          <FrozenRouter>{children}</FrozenRouter>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
