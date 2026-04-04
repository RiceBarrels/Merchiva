"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeft, XIcon } from "lucide-react"

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
  const depth = React.useContext(MobileDialogDepthContext);
  const [mobileTitle, setMobileTitle] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [entered, setEntered] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const axis = React.useRef<"h" | "v" | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

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
    }
    function onEnd(e: TouchEvent) {
      if (axis.current !== "h") { axis.current = null; return; }
      const dx = e.changedTouches[0].clientX - startX.current;
      if (dx > 80) {
        setDragging(false);
        setExiting(true);
        setTimeout(() => closeRef.current?.click(), 250);
      } else {
        setDragging(false);
        setOffsetX(0);
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

  // Move the actual page content behind this dialog
  React.useEffect(() => {
    const root = document.getElementById("mobile-content");
    if (!root) return;
    const prev = root.style.transition;
    const prevTransform = root.style.transform;
    root.style.transition = transition;
    root.style.transform = `translateX(${bgShift}px)`;
    return () => {
      root.style.transition = prev;
      root.style.transform = prevTransform;
    };
  });

  return (
    <MobileDialogDepthContext.Provider value={depth + 1}>
      <MobileDialogTitleContext.Provider value={{ title: mobileTitle, setTitle: setMobileTitle }}>
      {/* Foreground dialog page */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className="fixed inset-0 z-50 flex flex-col bg-background text-sm text-foreground outline-none w-full max-w-none"
        style={{
          transform: fgTransform,
          transition,
          zIndex: 50 + depth,
          borderRadius: (entered && !dragging && !exiting) ? "0" : "48px 0 0 48px",
          boxShadow: "-8px 0 30px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div ref={ref} className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <DialogPrimitive.Close
              ref={closeRef}
              className="p-1 -ml-1 rounded-md text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </DialogPrimitive.Close>
            {mobileTitle && (
              <span className="text-base font-semibold truncate">{mobileTitle}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: noPadding ? 0 : 16 }}>
            {children}
          </div>
        </div>
      </DialogPrimitive.Popup>
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
  // Detect mobile via matchMedia
  const [isMobile, setIsMobile] = React.useState(false);

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

  React.useEffect(() => {
    if (text) setTitle(text);
    return () => setTitle("");
  }, [text, setTitle]);

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
