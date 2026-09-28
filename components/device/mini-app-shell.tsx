"use client";

// The device surfaces open a catalog app the way a phone opens a mini app:
// the home screen shrinks back behind a dark backdrop and the app rises from
// the bottom edge to cover the whole screen. There is no title bar — the only
// chrome is a floating close button in the top-left corner.
//
// Two pieces, because the two live on opposite ends of the tree:
//   • MiniAppSurface wraps a device screen's outermost element. It owns the
//     shrink transform and hosts the slot the app is portalled into, so the
//     app escapes the surface's own transform, overflow and (on /personal)
//     its 480px phone frame.
//   • MiniAppShell is rendered wherever the open state lives (AppsPane on
//     /store, the screen itself on /personal) and portals into that slot.
//
// The portal is what makes the cover work: a transformed ancestor becomes the
// containing block for `position: fixed`, so a fixed overlay rendered inside
// the shrinking screen would shrink with it.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface MiniAppSurfaceValue {
  /** Where an open app renders — null until the surface has mounted. */
  slot: HTMLElement | null;
  /** True from the moment an app opens until its exit animation has finished,
   *  so the screen stays shrunk behind the app on the way out too. */
  setShrunk: (shrunk: boolean) => void;
}

const MiniAppSurfaceContext = createContext<MiniAppSurfaceValue | null>(null);

/** Wraps a device screen so an app can cover it. Use on the outermost element. */
export function MiniAppSurface({ children, overlay, className }: {
  children: ReactNode;
  /** Device chrome that must stay visible above an open app — the store's
   *  about-to-log-out dimmer. Positioned against the surface; give it a
   *  z-index above the app's z-50. */
  overlay?: ReactNode;
  className?: string;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [shrunk, setShrunk] = useState(false);

  return (
    <MiniAppSurfaceContext.Provider value={{ slot, setShrunk }}>
      <div className={cn("relative h-[100dvh] w-full overflow-hidden bg-black", className)}>
        <div
          className={cn(
            "h-full w-full origin-center transition-[transform,opacity,border-radius] duration-300 ease-[cubic-bezier(.2,.7,.2,1)]",
            shrunk && "scale-[0.92] overflow-hidden rounded-[20px] opacity-70",
          )}
        >
          {children}
        </div>
        <div ref={setSlot} />
        {overlay}
      </div>
    </MiniAppSurfaceContext.Provider>
  );
}

export interface MiniAppShellProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the app — there is no visible title bar to carry it. */
  title?: string;
  /** Overrides the close button's label (defaults to common.close). */
  closeLabel?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Full-screen app over its MiniAppSurface. Slides up from the bottom, closes
 * on the floating top-left X or Escape.
 */
export function MiniAppShell({ open, onClose, title, closeLabel, children, className }: MiniAppShellProps) {
  const t = useT();
  const surface = useContext(MiniAppSurfaceContext);
  const safeArea = getSafeAreaInsets();

  const setShrunk = surface?.setShrunk;
  useEffect(() => {
    if (open) setShrunk?.(true);
  }, [open, setShrunk]);
  // Leaving the surface with an app open (a log-out, an idle lock) unmounts
  // this without an exit animation, so the screen has to be released here too.
  useEffect(() => () => setShrunk?.(false), [setShrunk]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Content that handled Escape itself (a dialog, a slideshow) keeps it:
      // one press closes the innermost thing, not the whole app behind it.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!surface?.slot) return null;

  return createPortal(
    <AnimatePresence onExitComplete={() => setShrunk?.(false)}>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-no-swipe
          className={cn("absolute inset-0 z-50 overflow-hidden bg-background text-foreground", className)}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          // The delay lets the screen behind start shrinking first, so the two
          // read as one movement instead of a race.
          transition={{ duration: 0.34, ease: [0.2, 0.7, 0.2, 1], delay: open ? 0.06 : 0 }}
        >
          <div
            className="h-full overflow-y-auto overscroll-contain"
            // Clears the floating close button so an app's first row is never
            // underneath it.
            style={{ paddingTop: safeArea.top + 52 }}
          >
            {children}
          </div>
          <button
            type="button"
            aria-label={closeLabel ?? t("common.close")}
            onClick={() => { hapticLight(); onClose(); }}
            style={{ top: safeArea.top + 10 }}
            className="absolute left-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm active:scale-95"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    surface.slot,
  );
}
