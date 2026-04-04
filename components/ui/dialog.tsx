"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeft, XIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
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
const MobileDialogDepthContext = React.createContext(0);
// Global counter for open mobile dialogs
let globalDialogCount = 0;
const globalDialogIds: string[] = [];
const dialogListeners = new Set<(count: number) => void>();
export function useOpenDialogCount() {
  const [count, setCount] = React.useState(globalDialogCount);
  React.useEffect(() => {
    dialogListeners.add(setCount);
    setCount(globalDialogCount);
    return () => { dialogListeners.delete(setCount); };
  }, []);
  return count;
}
function notifyDialogListeners() {
  dialogListeners.forEach((fn) => fn(globalDialogCount));
}
// Global swipe progress for the topmost dialog (0 = fully open, 1 = fully swiped away)
let globalSwipeProgress = 0;
const swipeListeners = new Set<(p: number) => void>();
export function useDialogSwipeProgress() {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    swipeListeners.add(setP);
    return () => { swipeListeners.delete(setP); };
  }, []);
  return p;
}
function setGlobalSwipeProgress(p: number) {
  globalSwipeProgress = p;
  swipeListeners.forEach((fn) => fn(p));
}
// Title registry — immune to Strict Mode double-mount
const titleRegistry = new Map<string, string>(); // instanceId → title
let titleIdSeq = 0;
const titleListeners = new Set<(title: string) => void>();

function getTitles(): string[] { return Array.from(titleRegistry.values()); }
function getTopTitle(): string { const t = getTitles(); return t[t.length - 1] ?? ""; }
function notifyTitles() { const t = getTopTitle(); titleListeners.forEach((fn) => fn(t)); syncDialogsToUrl(); }

export function useDialogTitle() {
  const [title, setTitle] = React.useState(getTopTitle());
  React.useEffect(() => {
    titleListeners.add(setTitle);
    setTitle(getTopTitle());
    return () => { titleListeners.delete(setTitle); };
  }, []);
  return title;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let prevTitleCount = 0;
// Track whether a popstate is being handled to avoid pushing during close
let handlingPopstate = false;

function syncDialogsToUrl() {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const titles = [...new Set(getTitles())];
    const url = new URL(window.location.href);
    if (titles.length > 0) {
      url.searchParams.set("dialogs", titles.map((t) => encodeURIComponent(t)).join(","));
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

// Listen for back button → close the topmost dialog
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const titles = getTitles();
    if (titles.length === 0) return;
    handlingPopstate = true;
    // Find and click the topmost dialog's back/close button
    const topIdx = titles.length - 1;
    const topDialog = document.getElementById(`mobile-dialog-${topIdx}`);
    const backBtn = topDialog?.querySelector("[data-dialog-back]") as HTMLButtonElement | null;
    if (backBtn) {
      backBtn.click();
    } else {
      // Desktop: find the topmost open dialog's close button
      const closeBtns = document.querySelectorAll('[data-slot="dialog-close"]');
      const lastClose = closeBtns[closeBtns.length - 1] as HTMLButtonElement | null;
      lastClose?.click();
    }
    setTimeout(() => { handlingPopstate = false; }, 100);
  });
}

function registerTitle(title: string): string {
  const id = `dt-${++titleIdSeq}`;
  titleRegistry.set(id, title);
  notifyTitles();
  return id;
}
function unregisterTitle(id: string) {
  titleRegistry.delete(id);
  notifyTitles();
}
// Pass title to mobile header bar
const MobileDialogTitleContext = React.createContext<{
  title: string;
  setTitle: (t: string) => void;
}>({ title: "", setTitle: () => {} });

function MobileDialogPage({
  children,
  className,
  noPadding = false,
  ...props
}: DialogPrimitive.Popup.Props & { noPadding?: boolean }) {
  const [mobileTitle, setMobileTitle] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const myDepth = React.useRef(0);
  const myId = React.useRef("");

  // Register on mount, unregister on unmount
  React.useEffect(() => {
    myDepth.current = globalDialogCount;
    myId.current = `mobile-dialog-${myDepth.current}`;
    globalDialogIds.push(myId.current);
    globalDialogCount++;
    notifyDialogListeners();
    return () => {
      globalDialogCount--;
      const idx = globalDialogIds.indexOf(myId.current);
      if (idx >= 0) globalDialogIds.splice(idx, 1);
      notifyDialogListeners();
    };
  }, []);

  const depth = myDepth.current;
  const [offsetX, setOffsetX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [entered, setEntered] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const axis = React.useRef<"h" | "v" | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    return () => {
      setGlobalSwipeProgress(0);
    };
  }, []);

  // Slide in on mount
  React.useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  // Swipe to close
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onStart(e: TouchEvent) {
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

  const bgShift = entered && !exiting
    ? -screenW * 0.3 * (1 - progress)
    : 0;

  const transition = dragging ? "none" : "transform 500ms cubic-bezier(0.32, 0.72, 0, 1)";

  // Move the layer directly behind this dialog
  React.useEffect(() => {
    const targetId = depth === 0 ? "mobile-content" : `mobile-dialog-${depth - 1}`;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translateX(${bgShift}px)`;
    return () => {
      el.style.transition = transition;
      el.style.transform = "";
    };
  }, [entered, exiting, bgShift, transition, depth]);

  return (
    <MobileDialogDepthContext.Provider value={depth + 1}>
      <MobileDialogTitleContext.Provider value={{ title: mobileTitle, setTitle: setMobileTitle }}>
      {/* Foreground dialog page */}
      <div
        id={`mobile-dialog-${depth}`}
        className="fixed inset-0"
        style={{
          transform: fgTransform,
          transition,
          zIndex: 50 + depth,
        }}
      >
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className="absolute inset-0 flex flex-col bg-background text-sm text-foreground outline-none w-full max-w-none"
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
      </MobileDialogTitleContext.Provider>
    </MobileDialogDepthContext.Provider>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  noPadding = false,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  noPadding?: boolean
}) {
  // Detect mobile via matchMedia — initialize with correct value to avoid
  // false→true transition that causes MobileDialogPage double-mount
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
      <DialogPortal>
        <MobileDialogPage className={className} noPadding={noPadding} {...props}>
          {children}
        </MobileDialogPage>
      </DialogPortal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
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
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 max-[639px]:hidden", className)}
      {...props}
    />
  )
}

function DialogFooter({
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

function DialogTitle({ className, children, mobileTitle, ...props }: DialogPrimitive.Title.Props & { mobileTitle?: string }) {
  const { setTitle } = React.useContext(MobileDialogTitleContext);
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

function DialogDescription({
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
