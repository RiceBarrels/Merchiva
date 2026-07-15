"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeft, XIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { getSafeAreaInsets } from "@/lib/safe-area";

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * SafeDialog: waits for document.readyState === "complete" before allowing open.
 * If the page is still loading, retries every 1s until ready, then opens.
 */
function DynamicUIElement({
  open,
  onOpenChange,
  ...props
}: DialogPrimitive.Root.Props) {
  const [ready, setReady] = React.useState(false)
  const [pendingOpen, setPendingOpen] = React.useState(false)

  React.useEffect(() => {
    if (typeof document === "undefined") return
    if (document.readyState === "complete") {
      setReady(true)
      return
    }
    const onReady = () => setReady(true)
    window.addEventListener("load", onReady)
    // Fallback: poll every 1s
    const interval = setInterval(() => {
      if (document.readyState === "complete") {
        setReady(true)
        clearInterval(interval)
      }
    }, 1000)
    return () => {
      window.removeEventListener("load", onReady)
      clearInterval(interval)
    }
  }, [])

  // If caller tries to open before page is ready, queue it
  React.useEffect(() => {
    if (open && !ready) {
      setPendingOpen(true)
    }
  }, [open, ready])

  // When page becomes ready and there's a pending open, fire it
  React.useEffect(() => {
    if (ready && pendingOpen) {
      setPendingOpen(false)
      onOpenChange?.(true, undefined as never)
    }
  }, [ready, pendingOpen, onOpenChange])

  const safeOpen = ready ? open : false

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={safeOpen}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

function DynamicUIElementTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DynamicUIElementPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DynamicUIElementClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DynamicUIElementOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        "bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

// Track stacked mobile dialogs for iOS-like depth effect
const MobileDynamicUIElementDepthContext = React.createContext(0);
// Global counter for open mobile dialogs
let globalDynamicUIElementCount = 0;
const globalDynamicUIElementIds: string[] = [];
const dynamicUIElementListeners = new Set<(count: number) => void>();
export function useOpenDynamicUIElementCount() {
  const [count, setCount] = React.useState(globalDynamicUIElementCount);
  React.useEffect(() => {
    dynamicUIElementListeners.add(setCount);
    setCount(globalDynamicUIElementCount);
    return () => { dynamicUIElementListeners.delete(setCount); };
  }, []);
  return count;
}
function notifyDynamicUIElementListeners() {
  dynamicUIElementListeners.forEach((fn) => fn(globalDynamicUIElementCount));
}
// Global swipe progress for the topmost dialog (0 = fully open, 1 = fully swiped away)
let globalDynamicUIElementSwipeProgress = 0;
const dynamicUIElementSwipeListeners = new Set<(p: number) => void>();
export function useDynamicUIElementSwipeProgress() {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    dynamicUIElementSwipeListeners.add(setP);
    return () => { dynamicUIElementSwipeListeners.delete(setP); };
  }, []);
  return p;
}
function setGlobalSwipeProgress(p: number) {
  globalDynamicUIElementSwipeProgress = p;
  dynamicUIElementSwipeListeners.forEach((fn) => fn(p));
}
// Title registry — immune to Strict Mode double-mount
const dynamicUIElementTitleRegistry = new Map<string, string>(); // instanceId → title
let dynamicUIElementTitleIdSeq = 0;
const dynamicUIElementTitleListeners = new Set<(title: string) => void>();

function getTitles(): string[] { return Array.from(dynamicUIElementTitleRegistry.values()); }
function getTopTitle(): string { const t = getTitles(); return t[t.length - 1] ?? ""; }
function notifyTitles() { const t = getTopTitle(); dynamicUIElementTitleListeners.forEach((fn) => fn(t)); syncDynamicUIElementsToUrl(); }

export function useDynamicUIElementTitle() {
  const [title, setTitle] = React.useState(getTopTitle());
  React.useEffect(() => {
    dynamicUIElementTitleListeners.add(setTitle);
    setTitle(getTopTitle());
    return () => { dynamicUIElementTitleListeners.delete(setTitle); };
  }, []);
  return title;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let prevTitleCount = 0;
// Track whether a popstate is being handled to avoid pushing during close
let handlingPopstate = false;

function syncDynamicUIElementsToUrl() {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const titles = [...new Set(getTitles())];
    const url = new URL(window.location.href);
    if (titles.length > 0) {
      url.searchParams.set("dialogs", titles.join(","));
    } else {
      url.searchParams.delete("dialogs");
    }
    // Push when a new dialog opens, replace otherwise (close / URL cleanup)
    if (titles.length > prevTitleCount && !handlingPopstate) {
      window.history.pushState({ dialogs: titles.length }, "", url.toString());
    } else {
      window.history.replaceState({ dialogs: titles.length }, "", url.toString());
    }
    prevTitleCount = titles.length;
  }, 300);
}

// Listen for back/forward button → close or reopen dialogs
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const urlDialogs = getDynamicUIElementsFromUrl();
    const openDialogs = getTitles();

    if (urlDialogs.length > openDialogs.length) {
      // Forward navigation — reopen dialogs that are in URL but not open
      handlingPopstate = true;
      urlDialogs.forEach((title) => {
        if (!openDialogs.includes(title)) {
          requestDynamicUIElementOpen(title);
        }
      });
      setTimeout(() => { handlingPopstate = false; }, 100);
    } else if (openDialogs.length > 0) {
      // Back navigation — close the topmost dialog
      handlingPopstate = true;
      const topIdx = openDialogs.length - 1;
      const topDialog = document.getElementById(`mobile-dialog-${topIdx}`);
      const backBtn = topDialog?.querySelector("[data-dialog-back]") as HTMLButtonElement | null;
      if (backBtn) {
        backBtn.click();
      } else {
        const closeBtns = document.querySelectorAll('[data-slot="dialog-close"]');
        const lastClose = closeBtns[closeBtns.length - 1] as HTMLButtonElement | null;
        lastClose?.click();
      }
      setTimeout(() => { handlingPopstate = false; }, 100);
    }
  });
}

/** Parse dialog titles from the current URL's ?dialogs= param */
function getDynamicUIElementsFromUrl(): string[] {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("dialogs");
  if (!raw) return [];
  return raw.split(",").map((t) => decodeURIComponent(t));
}

// Event system for forward-navigation dialog reopening
const dynamicUIElementOpenListeners = new Map<string, Set<() => void>>(); // title → callbacks

function requestDynamicUIElementOpen(title: string) {
  dynamicUIElementOpenListeners.get(title)?.forEach((fn) => fn());
}

/**
 * Hook: use instead of useState(false) for dialog open state.
 * Auto-opens the dialog if its title is in the URL's ?dialogs= param on mount.
 * Also reopens when the user presses the browser forward button.
 */
export function useDynamicUIElementUrl(title: string): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = React.useState(() => getDynamicUIElementsFromUrl().includes(title));

  React.useEffect(() => {
    const cb = () => setOpen(true);
    let set = dynamicUIElementOpenListeners.get(title);
    if (!set) {
      set = new Set();
      dynamicUIElementOpenListeners.set(title, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) dynamicUIElementOpenListeners.delete(title);
    };
  }, [title]);

  return [open, setOpen];
}

function registerTitle(title: string): string {
  const id = `dt-${++dynamicUIElementTitleIdSeq}`;
  dynamicUIElementTitleRegistry.set(id, title);
  notifyTitles();
  return id;
}
function unregisterTitle(id: string) {
  dynamicUIElementTitleRegistry.delete(id);
  notifyTitles();
}
// Pass title to mobile header bar
const MobileDynamicUIElementTitleContext = React.createContext<{
  title: string;
  setTitle: (t: string) => void;
  exiting: boolean;
}>({ title: "", setTitle: () => {}, exiting: false });

/**
 * Resolve the DOM element that should be pushed left when a dialog opens.
 *
 * - depth 0 dialogs push the app shell (id="mobile-content" on the mobile
 *   layout, id="desktop-content" on the desktop layout; only one exists at a
 *   time because the two shells are mutually-exclusive in the sidebar code).
 * - depth > 0 dialogs push the dialog right below them (id="mobile-dialog-N").
 *
 * Returns null until React has committed an id to look up, so the caller
 * skips work cleanly on the first render.
 */
function findBgTarget(depth: number): HTMLElement | null {
  if (depth < 0) return null;
  if (typeof document === "undefined") return null;
  if (depth > 0) return document.getElementById(`mobile-dialog-${depth - 1}`);
  return (
    document.getElementById("mobile-content") ??
    document.getElementById("desktop-content")
  );
}

const DIALOG_BG_TRANSITION =
  "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Shared push-the-bg-left side effect.
 *
 * Used by every dialog mode (mobile full-screen sheet, desktop right-side
 * panel, desktop centered modal). The effect is split into:
 *
 * 1. Style updates — useLayoutEffect that re-applies inline transform every
 *    time bg geometry changes. Critically, it does NOT clear the styles when
 *    the dep array changes — that was the previous bug (cleanup ran on every
 *    re-render, briefly snapping the bg back to identity before re-applying
 *    the same transform, which the eye reads as "no animation").
 *
 * 2. Unmount cleanup — a separate useEffect with [] deps that animates the
 *    bg back to identity, then clears all inline styles once the slide-back
 *    finishes. This runs ONLY when the dialog page unmounts, so opening more
 *    or changing state never resets the bg in-flight.
 */
function useDialogBgPush({
  depth,
  shift,
  scale,
  radius,
  active,
  transition,
}: {
  depth: number;
  shift: number;
  scale: number;
  radius: number;
  active: boolean;
  // Override the default ease (for example "none" while the user is dragging
  // so the bg tracks the finger instead of lerping behind it). Defaults to the
  // 500ms cubic-bezier used for open / close.
  transition?: string;
}) {
  const targetRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    targetRef.current = findBgTarget(depth);
  }, [depth]);

  const tr = transition ?? DIALOG_BG_TRANSITION;
  React.useLayoutEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.style.transition = tr;
    el.style.transform = `translateX(${shift}px) scale(${scale})`;
    el.style.borderRadius = `${radius}px`;
    el.style.overflow = active ? "hidden" : "";
  }, [shift, scale, radius, active, depth, tr]);

  React.useEffect(() => {
    return () => {
      const el = targetRef.current;
      if (!el) return;
      el.style.transition = DIALOG_BG_TRANSITION;
      el.style.transform = "";
      el.style.borderRadius = "";
      window.setTimeout(() => {
        if (!el) return;
        el.style.overflow = "";
        el.style.transition = "";
      }, 520);
    };
  }, []);
}

/**
 * Allocate a fresh dialog depth (0, 1, 2 …) and register / unregister the
 * matching `mobile-dialog-N` id so nested dialogs can target each other.
 *
 * Returns the depth as state — the first render produces -1 (skip side
 * effects), then the layout effect commits the real depth before paint. This
 * is more reliable than the previous ref-based approach where depth lagged
 * one render behind the actual mount order.
 */
function useDialogDepth(): number {
  const [depth, setDepth] = React.useState<number>(-1);
  const myIdRef = React.useRef<string>("");
  React.useLayoutEffect(() => {
    const d = globalDynamicUIElementCount;
    myIdRef.current = `mobile-dialog-${d}`;
    globalDynamicUIElementIds.push(myIdRef.current);
    globalDynamicUIElementCount++;
    setDepth(d);
    notifyDynamicUIElementListeners();
    return () => {
      globalDynamicUIElementCount--;
      const idx = globalDynamicUIElementIds.indexOf(myIdRef.current);
      if (idx >= 0) globalDynamicUIElementIds.splice(idx, 1);
      notifyDynamicUIElementListeners();
    };
  }, []);
  return depth;
}

function MobileDynamicUIElementPage({
  children,
  className,
  noPadding = false,
  ...props
}: DialogPrimitive.Popup.Props & { noPadding?: boolean }) {
  const [mobileTitle, setMobileTitle] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const depth = useDialogDepth();
  const [offsetX, setOffsetX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [entered, setEntered] = React.useState(false);
  const enteredRef = React.useRef(false);
  const [exiting, setExiting] = React.useState(false);
  const outerRef = React.useRef<HTMLDivElement>(null);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const axis = React.useRef<"h" | "v" | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    return () => {
      setGlobalSwipeProgress(0);
    };
  }, []);

  // Swipe to close
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onStart(e: TouchEvent) {
      if (!enteredRef.current) {
        enteredRef.current = true;
        setEntered(true);
      }
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      axis.current = null;
    }
    function onMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (axis.current !== "h" || dx < 0) return;
      e.preventDefault();
      setDragging(true);
      setOffsetX(dx);
      const sw = window.innerWidth || 400;
      setGlobalSwipeProgress(Math.min(1, dx / sw));
    }
    function onEnd(e: TouchEvent) {
      if (axis.current !== "h") { axis.current = null; return; }
      const dx = e.changedTouches[0].clientX - startX.current;
      if (dx > 80) {
        setDragging(false);
        setExiting(true);
        setGlobalSwipeProgress(1);
        setTimeout(() => {
          closeRef.current?.click();
          // Reset after dialog is fully closed
          setTimeout(() => setGlobalSwipeProgress(0), 50);
        }, 250);
      } else {
        setDragging(false);
        setOffsetX(0);
        setGlobalSwipeProgress(0);
      }
      axis.current = null;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Progress: 0 = fully open, 1 = fully swiped away
  const screenW = typeof window !== "undefined" ? window.innerWidth : 400;
  const progress = dragging ? Math.min(1, offsetX / screenW) : 0;

  const fgTransform = exiting
    ? "translateX(100%)"
    : dragging
    ? `translateX(${offsetX}px)`
    : entered
    ? "translateX(0)"
    : "translateX(100%)";

  const bgActive = !exiting;
  const bgScale = bgActive ? 0.94 + 0.06 * progress : 1;
  const bgShift = bgActive ? -screenW * 0.3 * (1 - progress) : 0;
  const bgRadius = bgActive ? Math.round(12 * (1 - progress)) : 0;

  const transition = dragging ? "none" : DIALOG_BG_TRANSITION;

  // Push the layer underneath us — handled by the shared hook so the cleanup
  // semantics stay correct (no per-dep-change snap-back; unmount animates
  // smoothly to identity). Previously this was inlined here with a cleanup
  // that reset transform on every dep change, which made the bg occasionally
  // skip its slide-left because the reset raced the apply.
  useDialogBgPush({
    depth,
    shift: bgShift,
    scale: bgScale,
    radius: bgRadius,
    active: bgActive,
    transition,
  });

  return (
    <MobileDynamicUIElementDepthContext.Provider value={depth + 1}>
      <MobileDynamicUIElementTitleContext.Provider value={{ title: mobileTitle, setTitle: setMobileTitle, exiting }}>
      {/* Foreground dialog page */}
      <div
        ref={outerRef}
        id={`mobile-dialog-${depth}`}
        className="fixed inset-0"
        style={{
          transform: fgTransform,
          transition: entered ? transition : "none",
          animation: (!entered && !exiting && !dragging) ? "slideInRight 500ms cubic-bezier(0.32, 0.72, 0, 1) both" : undefined,
          willChange: "transform",
          zIndex: 50 + depth,
        }}
        onAnimationEnd={(e) => {
          if (e.animationName === "slideInRight") {
            enteredRef.current = true;
            setEntered(true);
          }
        }}
      >
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        initialFocus={false}
        className="absolute inset-0 flex flex-col bg-background text-sm text-foreground outline-none w-full max-w-none p-0!"
        style={{
          borderRadius: (entered && !dragging && !exiting) ? "0" : "48px 0 0 48px",
          boxShadow: "-8px 0 30px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div ref={ref} className="flex flex-col h-full">
          <DialogPrimitive.Close ref={closeRef} className="hidden" />
          <button
            data-dialog-back
            onClick={() => {
              setExiting(true);
              setTimeout(() => closeRef.current?.click(), 500);
            }}
            className="hidden"
          />
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: noPadding ? 0 : 16, paddingTop: noPadding ? 64 : 64 }}>
            {children}
          </div>
        </div>
      </DialogPrimitive.Popup>
      </div>
      </MobileDynamicUIElementTitleContext.Provider>
    </MobileDynamicUIElementDepthContext.Provider>
  );
}

function DynamicUIElementContent({
  className,
  children,
  showCloseButton = true,
  noPadding = false,
  side,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  noPadding?: boolean
  side?: "right"
}) {
  // Detect mobile via matchMedia — initialize with correct value to avoid
  // false→true transition that causes MobileDynamicUIElementPage double-mount.
  // NOTE: 640px is deliberate for this overlay (page-sheet vs side-panel) and
  // intentionally differs from the app's 768px layout fork (lib/use-is-mobile).
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
  );

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isMobile) {
    return (
      <DynamicUIElementPortal>
        <MobileDynamicUIElementPage className={className} noPadding={noPadding} {...props}>
          <div className="w-full" style={{ height: getSafeAreaInsets().top }} />
          {children}
        </MobileDynamicUIElementPage>
      </DynamicUIElementPortal>
    );
  }

  // Desktop right-side panel (Sheet behaviour) — the layer underneath gets a
  // medium push (~60px) so the panel reads as a sheet sliding in over the app,
  // not just a floating overlay.
  if (side === "right") {
    return (
      <DesktopSidePanelPage
        className={className}
        showCloseButton={showCloseButton}
        {...props}
      >
        {children}
      </DesktopSidePanelPage>
    );
  }

  return (
    <DesktopCenteredModalPage
      className={className}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DesktopCenteredModalPage>
  );
}

/**
 * Desktop right-side sheet. Tracks dialog depth + pushes the layer below it
 * leftward so it feels like an iOS-style stack (not just a floating overlay).
 */
function DesktopSidePanelPage({
  children,
  className,
  showCloseButton,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  const depth = useDialogDepth();
  useDialogBgPush({
    depth,
    shift: -60,
    scale: 0.985,
    radius: 12,
    active: true,
  });
  return (
    <DynamicUIElementPortal>
      <DynamicUIElementOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        initialFocus={false}
        className={cn(
          "fixed right-0 top-0 bottom-0 z-50 h-full w-full max-w-md bg-background outline-none shadow-2xl duration-300 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right overflow-y-auto",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DynamicUIElementPortal>
  );
}

/**
 * Desktop centered modal. Push is subtle (~16px / scale 0.99) — the modal
 * already has its own zoom-in animation, and a heavier shift would compete
 * with that. The point is the depth cue, not a full sheet slide.
 */
function DesktopCenteredModalPage({
  children,
  className,
  showCloseButton,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  const depth = useDialogDepth();
  useDialogBgPush({
    depth,
    shift: -16,
    scale: 0.99,
    radius: 8,
    active: true,
  });
  return (
    <DynamicUIElementPortal>
      <DynamicUIElementOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        initialFocus={false}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full min-w-[calc(50%-2rem)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DynamicUIElementPortal>
  )
}

function DynamicUIElementHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 max-[639px]:hidden", className)}
      {...props}
    />
  )
}

function DynamicUIElementFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DynamicUIElementTitle({ className, children, mobileTitle, ...props }: DialogPrimitive.Title.Props & { mobileTitle?: string }) {
  const { setTitle, exiting } = React.useContext(MobileDynamicUIElementTitleContext);
  const text = mobileTitle || (typeof children === "string" ? children : "");

  // Set mobile header title via context
  React.useEffect(() => {
    if (text) setTitle(text);
    return () => setTitle("");
  }, [text, setTitle]);

  // Register title globally for URL sync (works for both desktop & mobile)
  const titleIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (text && !titleIdRef.current) {
      titleIdRef.current = registerTitle(text);
    }
    return () => {
      if (titleIdRef.current) {
        unregisterTitle(titleIdRef.current);
        titleIdRef.current = null;
      }
    };
  }, [text]);

  // Unregister title immediately when dialog starts exiting
  React.useEffect(() => {
    if (exiting && titleIdRef.current) {
      unregisterTitle(titleIdRef.current);
      titleIdRef.current = null;
    }
  }, [exiting]);

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  )
}

function DynamicUIElementDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DynamicUIElement,
  DynamicUIElementClose,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementFooter,
  DynamicUIElementHeader,
  DynamicUIElementOverlay,
  DynamicUIElementPortal,
  DynamicUIElementTitle,
  DynamicUIElementTrigger,
}
