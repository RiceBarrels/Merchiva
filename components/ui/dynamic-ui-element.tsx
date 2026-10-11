"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { displayedDialogPage, lastShownDialogClose } from "@/lib/browser-shell/shell-dom";
import { useDialogDepth, useOpenDynamicUIElementCount } from "@/components/ui/dialog-depth";
import { useDialogBgPush } from "@/components/ui/dialog-bg-push";
import { useDialogHost } from "@/components/ui/dialog-host";
import {
  MobileDynamicUIElementPage,
  MobileDynamicUIElementTitleContext,
  useDynamicUIElementSwipeProgress,
} from "@/components/ui/dynamic-ui-element-page";

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
  // In a host that covers part of the screen (dialog-host.ts `pageRoot`) the page stays inside the
  // host's box: the rest of the screen keeps working, and a tap there does not close the page.
  const contained = typeof useDialogHost()?.pageRoot === "function"
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
      {...(contained ? { modal: false, disablePointerDismissal: true } : {})}
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

// Open dialogs and their depths (open order, not effect order): components/ui/dialog-depth.ts
export { useOpenDynamicUIElementCount }
// The phone page's swipe progress, for chromes that follow the finger
export { useDynamicUIElementSwipeProgress }
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
      const topDialog = displayedDialogPage(topIdx);
      const backBtn = topDialog?.querySelector("[data-dialog-back]") as HTMLButtonElement | null;
      if (backBtn) {
        backBtn.click();
      } else {
        lastShownDialogClose()?.click();
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

  // A host covering part of the screen takes the phone page at any width, inside its own box.
  const host = useDialogHost();
  const pageRoot = host?.pageRoot;
  if (isMobile || pageRoot) {
    return (
      <DynamicUIElementPortal container={pageRoot ? pageRoot() : undefined}>
        <MobileDynamicUIElementPage noPadding={noPadding} contained={!!pageRoot} {...props}>
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
  // A phone page shows its title in the Back's pill instead: below 640px, and in a host's page root at any width.
  const contained = typeof useDialogHost()?.pageRoot === "function"
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 max-[639px]:hidden", contained && "hidden", className)}
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
