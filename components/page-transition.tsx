"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { shouldSkipTransition } from "@/components/page-tabs";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReactNode } from "react";

function FrozenRouter({ children }: { children: ReactNode }) {
  const context = useContext(LayoutRouterContext);
  const [frozen] = useState(context);

  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

/**
 * The element under the animated page where a page's bottom bar (BottomTabBar) portals to, so
 * it stays put while the page above it transitions. `undefined` outside a PageTransition; `null`
 * until the element mounts.
 */
const PageBottomBarSlot = createContext<HTMLElement | null | undefined>(undefined);

export function usePageBottomBarSlot(): HTMLElement | null | undefined {
  return useContext(PageBottomBarSlot);
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skip = useRef(false);
  const [bottomBarSlot, setBottomBarSlot] = useState<HTMLElement | null>(null);
  const lastPathname = useRef<string | null>(null);

  // A skip request (PageTabs click, browser-shell tab switch) is consumed by the render that
  // shows the new pathname, not by unrelated re-renders in between. Refs keep the decision
  // stable across StrictMode's double render, so they are read during render on purpose.
  /* eslint-disable react-hooks/refs */
  if (lastPathname.current !== pathname) {
    lastPathname.current = pathname;
    if (shouldSkipTransition()) skip.current = true;
  }
  const skipNow = skip.current;
  /* eslint-enable react-hooks/refs */

  const onAnimComplete = () => { skip.current = false; };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <PageBottomBarSlot.Provider value={bottomBarSlot}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={skipNow ? false : { scale: 0.95, opacity: 0 }}
            animate={skipNow
              ? { scale: 1, opacity: 1, transition: { duration: 0 } }
              : {
                  scale: 1,
                  opacity: 1,
                  transition: { duration: 0.2, ease: "easeOut" },
                }
            }
            exit={skipNow ? { transition: { duration: 0 } } : {
              scale: 0.95,
              opacity: 0,
              transition: { duration: 0.15, ease: "easeIn" },
            }}
            onAnimationComplete={onAnimComplete}
            data-tab-scroll-root=""
            className="flex flex-col flex-1 min-h-0 gap-1 overflow-y-auto px-2"
          >
            <FrozenRouter>{children}</FrozenRouter>
            <div aria-hidden className="pointer-events-none -mt-1 shrink-0" style={{ height: "var(--shell-scroll-pad, 0px)" }} />
          </motion.div>
        </AnimatePresence>
      </PageBottomBarSlot.Provider>
      <div ref={setBottomBarSlot} className="shrink-0 empty:hidden" />
    </div>
  );
}
