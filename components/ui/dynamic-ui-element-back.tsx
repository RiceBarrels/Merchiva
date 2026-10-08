"use client";

import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CORNER_BUTTON_CLASS, CORNER_OFFSET_PX, CORNER_RESERVE_PX } from "@/components/ui/corner-button";
import { useMountedBrowserShell } from "@/lib/browser-shell/shell-dom";
import type { ShellLayout } from "@/lib/browser-shell/types";
import { useT } from "@/lib/i18n/context";
import { getSafeAreaInsets } from "@/lib/safe-area";
import { cn } from "@/lib/utils";

/*
 * The visible Back of a DynamicUIElement phone page (the <640px full-screen variant in
 * dynamic-ui-element.tsx). The /manager phone layout has no browser chrome with a back control,
 * so the page carries its own in the top-left corner, with its title in a pill beside it.
 *
 * It renders inside the page's popup, outside its scroller: it stays in the modal focus trap,
 * moves with the page's swipe and exit slide, and a nested page (z 50 + depth) covers it.
 * The page system is physically LTR (it slides in from the right and is swiped right to close),
 * so the button stays on the physical left in RTL locales too.
 */

/**
 * Whether a phone page shows the visible Back: only on the browser shell's phone layout. The
 * legacy MobileShell draws its own FloatingNavButton (no shell is marked there), and /store,
 * /personal, /choose and setup render without a shell.
 */
export function dialogBackVisible(shell: ShellLayout | null): boolean {
  return shell === "mobile";
}

/**
 * The page's safe top: a fixed full-screen page clears the status bar itself. On the web only
 * the CSS inset is set (an iOS home-screen app reports it, the Capacitor plugin reports 0); on
 * native both report the same inset. The larger clears the status bar without counting it twice.
 */
export function dialogSafeTop(pluginTop: number): string {
  const top = Number.isFinite(pluginTop) && pluginTop > 0 ? pluginTop : 0;
  return `max(env(safe-area-inset-top, 0px), ${top}px)`;
}

/** Top of the Back row: the corner offset below the same safe top the content reserve uses. */
export function dialogBackTop(pluginTop: number): string {
  return `calc(${dialogSafeTop(pluginTop)} + ${CORNER_OFFSET_PX}px)`;
}

interface BackProps {
  /** The page's own title (DynamicUIElementTitle's mobileTitle); no pill when empty. */
  title: string;
  /** The page's Back handler, the one its hidden [data-dialog-back] button runs. */
  onBack: () => void;
  /** True while the page slides out, so a second tap cannot close it twice. */
  exiting: boolean;
}

/**
 * The Back button and title pill, ungated. The row's right inset keeps the pill clear of a
 * top-end corner button (the channel's group info).
 */
export function DynamicUIElementBackBar({ title, onBack, exiting }: BackProps) {
  const t = useT();
  const reducedMotion = useReducedMotion() ?? false;
  const pillTransition = reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
  return (
    <div
      className="pointer-events-none absolute z-40 flex items-center gap-2"
      style={{ top: dialogBackTop(getSafeAreaInsets().top), left: CORNER_OFFSET_PX, right: CORNER_RESERVE_PX + CORNER_OFFSET_PX, direction: "ltr" }}
    >
      <button
        type="button"
        onClick={onBack}
        disabled={exiting}
        aria-label={t("components.mobile.goBack")}
        className={cn(CORNER_BUTTON_CLASS, "pointer-events-auto shrink-0")}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {title && (
          <motion.span
            key="title"
            dir="auto"
            className="min-w-0 truncate rounded-full border border-border bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"
            initial={reducedMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reducedMotion ? 0 : -8 }}
            transition={pillTransition}
          >
            {title}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The Back of a DynamicUIElement phone page, shown only on the /manager phone layout. */
export function DynamicUIElementBack(props: BackProps) {
  const shell = useMountedBrowserShell();
  if (!dialogBackVisible(shell)) return null;
  return <DynamicUIElementBackBar {...props} />;
}
