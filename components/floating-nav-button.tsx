"use client";

import { createPortal } from "react-dom";
import { ArrowRight, ArrowLeft, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useT } from "@/lib/i18n/context";

interface FloatingNavButtonProps {
  /** "back" = plain back arrow; "menu" = animated hamburger/X/ArrowRight */
  mode: "back" | "menu";
  /** Title shown in the pill to the right of the button */
  title?: string;
  /** Called when the button is clicked in back mode */
  onBack?: () => void;
  /** Called when the button is clicked in menu mode (and no dialog is open) */
  onToggle?: () => void;
  /** Called when in menu mode and a dialog is open (triggers dialog back) */
  onDialogBack?: () => void;
  /** Whether the sidebar is open (menu mode) */
  isOpen?: boolean;
  /** Whether a dialog is currently open (menu mode) */
  hasDialog?: boolean;
  /** Number of open dialogs (menu mode) */
  openDialogs?: number;
  /** Horizontal translation from drag (menu mode) */
  translateX?: number;
  /** Disable CSS transitions during drag */
  dragging?: boolean;
  /** Swipe-to-close progress 0→1 for the topmost dialog */
  dialogSwipe?: number;
  /** Rotation of the button from drag progress (menu mode, no dialog) */
  btnRotation?: number;
  /** Opacity of the Menu icon (menu mode) */
  menuOpacity?: number;
  /** Opacity of the X icon (menu mode) */
  xOpacity?: number;
  /** iOS safe area top inset in px */
  safeAreaTop?: number;
  zIndex?: number;
  /** In tab-bar mode the button only appears for dialogs — spin in/out, no hamburger */
  tabBarMode?: boolean;
}

export function FloatingNavButton({
  mode,
  title,
  onBack,
  onToggle,
  onDialogBack,
  isOpen = false,
  hasDialog = false,
  openDialogs = 0,
  translateX = 0,
  dragging = false,
  dialogSwipe = 0,
  btnRotation = 0,
  menuOpacity = 1,
  xOpacity = 0,
  safeAreaTop = 0,
  zIndex = 50,
  tabBarMode = false,
}: FloatingNavButtonProps) {
  const t = useT();
  const handleClick = () => {
    if (mode === "back") {
      onBack?.();
    } else if (hasDialog) {
      onDialogBack?.();
    } else {
      onToggle?.();
    }
  };

  const buttonStyle: React.CSSProperties = {
    left: 0,
    top: safeAreaTop,
    zIndex,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)",
    ...(mode === "menu" && !hasDialog
      ? {
          transform: `translateX(${translateX}px)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }
      : {
          transform: "none",
          transition: "none",
        }),
  };

  // Pill swipe animation values
  const pillOpacity = mode === "back" ? 1 : 1 - dialogSwipe;
  const pillScale = mode === "back" ? 1 : 1 - dialogSwipe * 0.7;
  const pillX = mode === "back" ? 0 : -dialogSwipe * 30;
  const pillTransition =
    mode === "back" || dialogSwipe === 0
      ? { type: "spring" as const, damping: 20, stiffness: 400, delay: 0.1 }
      : { duration: 0 };

  const showTitle = mode === "back" ? !!title : hasDialog && !!title;

  if (typeof document === "undefined") return null;

  const mobileContent = typeof document !== "undefined" ? document.getElementById("mobile-content") : null;

  if (tabBarMode) {
    return createPortal(

      <AnimatePresence>
        {hasDialog && (
          <>
            <motion.button
              onClick={handleClick}
              className="fixed p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 m-4 z-999"
              style={{ left: 0, top: safeAreaTop, zIndex, boxShadow: "0 4px 14px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)" }}
              initial={{ opacity: 0, scale: 0, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0, rotate: 180 }}
              transition={{ type: "spring", damping: 18, stiffness: 350 }}
              aria-label={t("components.mobile.goBack")}
            >
              <ArrowLeft className="h-5 w-5" />
            </motion.button>
            {showTitle && (
              <motion.div
                key={title}
                className="fixed"
                style={{ top: 26 + safeAreaTop, left: 72, zIndex: zIndex + 1 }}
                initial={{ opacity: 0, scale: 0.3, x: -30 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.3, x: -30 }}
                transition={{ type: "spring", damping: 20, stiffness: 400, delay: 0.05 }}
              >
                <div
                  className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg"
                  style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)" }}
                >
                  {title}
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  return createPortal(
    <>
      {/* Circular button */}
      <button
        onClick={handleClick}
        className="fixed p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 m-4 z-999 lg:hidden"
        style={buttonStyle}
        aria-label={
          mode === "back"
            ? t("components.mobile.goBack")
            : hasDialog
            ? t("components.mobile.goBack")
            : isOpen
            ? t("components.mobile.closeMenu")
            : t("components.mobile.openMenu")
        }
      >
        {mode === "back" ? (
          <ArrowLeft className="h-5 w-5" />
        ) : (
          <motion.span
            className="relative block h-5 w-5"
            animate={{
              rotate: hasDialog
                ? openDialogs > 1
                  ? -180
                  : -180 + dialogSwipe * 180
                : btnRotation,
            }}
            transition={
              dragging || dialogSwipe > 0
                ? { duration: 0 }
                : { type: "spring", damping: 20, stiffness: 300 }
            }
          >
            <ArrowRight
              className="h-5 w-5 absolute inset-0"
              style={{
                opacity: hasDialog ? (openDialogs > 1 ? 1 : 1 - dialogSwipe) : 0,
                transition: dialogSwipe > 0 ? "none" : "opacity 200ms",
              }}
            />
            <Menu
              className="h-5 w-5 absolute inset-0"
              style={{
                opacity: hasDialog ? (openDialogs > 1 ? 0 : dialogSwipe) : menuOpacity,
                transition: dialogSwipe > 0 || dragging ? "none" : "opacity 200ms",
              }}
            />
            <X
              className="h-5 w-5 absolute inset-0"
              style={{
                opacity: hasDialog ? 0 : xOpacity,
                transition: dragging ? "none" : "opacity 200ms",
              }}
            />
          </motion.span>
        )}
      </button>

      {/* Title pill */}
      <AnimatePresence>
        {showTitle && (
          <motion.div
            key={title}
            className="fixed"
            style={{ top: 26 + safeAreaTop, left: 72, zIndex: zIndex + 1 }}
            initial={{ opacity: 0, scale: 0.3, x: -30 }}
            animate={{ opacity: pillOpacity, scale: pillScale, x: pillX }}
            exit={{ opacity: 0, scale: 0.3, x: -30 }}
            transition={pillTransition}
          >
            <div
              className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg"
              style={{ boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)" }}
            >
              {title}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    hasDialog ? document.body : (mobileContent ?? document.body)
  );
}
