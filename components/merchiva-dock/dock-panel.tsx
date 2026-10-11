"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "motion/react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/geometric";
import { NotificationDot } from "@/components/ui/notification-dot";
import { useActiveTab, useTabsSnapshot } from "@/lib/browser-shell";
import { useSingleTabShell } from "@/lib/browser-shell/single-tab";
import { usePermissions } from "@/lib/context/permissions";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDot } from "@/lib/notifications/dots-context";
import { cn } from "@/lib/utils";
import { clearDockFocusPending, closeMerchivaDock, isDockFocusPending, openMerchivaDock } from "./dock-state";
import { isMacPlatform, merchivaShortcutLabel } from "./shortcut";

/** Width of the collapsed desktop dock: the rail with the vertical "Mr. Merchiva" label. */
export const RAIL_WIDTH = 44;

/** Key of the one Merchiva outside the browser shell and on the single-tab phone layout, where there are no tabs to tell apart. */
const WINDOW_SCOPE = "__window__";

/** The quiet area a chat shows until it has loaded. */
export function ChatLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size={16} className="text-muted-foreground" />
    </div>
  );
}

// The chat is several thousand lines plus a markdown renderer; load it when the dock first opens,
// not with every /manager page.
const MerchivaChat = dynamic(
  () => import("@/components/merchiva-chat-dashboard").then((m) => m.MerchivaChat),
  { ssr: false, loading: () => <ChatLoading /> },
);

/** Owners, or members with `merchiva.view` — the same gate as the chat itself. */
export function useCanUseMerchiva(): boolean {
  const { isOwner, can } = usePermissions();
  return isOwner || can("merchiva", "view");
}

export function MerchivaMark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded bg-foreground text-background"
      style={{ width: size, height: size }}
    >
      <MerchivaLogo size={Math.round(size * 0.6)} />
    </span>
  );
}

export function shortcutHint(label: string): string {
  return `${label} (${merchivaShortcutLabel(isMacPlatform())})`;
}

/**
 * One Merchiva per browser tab, each with its own conversation: this tab can be planning the
 * schedule while the next one does something else. A tab's chat mounts the first time the dock is
 * open on it and then stays mounted — hidden while another tab is showing or the dock is collapsed —
 * so a reply keeps streaming in after the user switches away. Closing a tab drops its chat; its
 * conversation stays saved, so reopening the tab brings it back. `idle` shows in place of a chat
 * the showing tab has not mounted yet. The phone layout shows one tab and never switches, so there
 * the window has one Merchiva, as outside the shell: a deep link that lands in a new hidden tab
 * keeps the conversation instead of starting an empty one.
 */
export function TabChats({ open, idle = null }: { open: boolean; idle?: ReactNode }) {
  const snapshot = useTabsSnapshot();
  const activeTab = useActiveTab();
  const singleTab = useSingleTabShell();
  const tabbed = snapshot.scope !== null && !singleTab;
  const current = tabbed ? activeTab?.id ?? null : WINDOW_SCOPE;

  const [kept, setKept] = useState<readonly string[]>([]);
  const openTabs = new Set(snapshot.tabs.map((tab) => tab.id));
  const next = kept.filter((scope) => (tabbed ? openTabs.has(scope) : scope === WINDOW_SCOPE));
  if (open && current && !next.includes(current)) next.push(current);
  if (next.length !== kept.length || next.some((scope, i) => scope !== kept[i])) setKept(next);

  const hostRef = useRef<HTMLDivElement>(null);
  useComposerFocus(open, current, hostRef);

  return (
    <div ref={hostRef} className="flex min-h-0 flex-1 flex-col">
      {next.map((scope) => {
        const shown = scope === current;
        return (
          <div key={scope} data-merchiva-chat={scope} className={cn("min-h-0 flex-1 flex-col", shown ? "flex" : "hidden")}>
            <MerchivaChat compact header={false} sessionScope={scope === WINDOW_SCOPE ? undefined : scope} active={open && shown} />
          </div>
        );
      })}
      {current && next.includes(current) ? null : idle}
    </div>
  );
}

/**
 * When the user opens the dock (shortcut or rail), put the caret in the showing tab's composer —
 * once its chat has loaded. A dock restored open on page load leaves focus alone, and so does one
 * swiped open on the phone (dock-reveal.ts), so the keyboard stays down.
 */
function useComposerFocus(open: boolean, current: string | null, hostRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!open || !current || !host || !isDockFocusPending()) return;
    const find = () => host.querySelector<HTMLTextAreaElement>(`[data-merchiva-chat="${CSS.escape(current)}"] textarea`);
    const focus = (): boolean => {
      const composer = find();
      if (!composer) return false;
      composer.focus({ preventScroll: true });
      clearDockFocusPending();
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 10_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [open, current, hostRef]);
}

/**
 * The desktop dock, as it was before the browser shell: collapsed, a rail on the right edge with a
 * vertical "Mr. Merchiva" label; open, the chat with the label settled into its header. The rail
 * and the collapse button toggle it, and so does ⌘⇧M. Its width lives in the panel group around it
 * (dock-layout.tsx). A reply he finished while the dock was closed puts a notification dot on the
 * rail's open button; opening the dock reads it (dock-dots.ts).
 */
export function MerchivaSidePanel({ open }: { open: boolean }) {
  const { t, dir } = useI18n();
  const reducedMotion = useReducedMotion();
  const rtl = dir === "rtl";
  const openLabel = t("merchiva.dock.open");
  const closeLabel = t("merchiva.dock.close");
  const dot = useDot({ app: "merchiva" }) && !open;
  // The label glides between the rail's centre and the header's start edge.
  const edge = (value: number) => (rtl ? { right: value } : { left: value });

  return (
    <aside aria-label={t("merchiva.name")} className="relative flex h-full w-full overflow-hidden bg-background">
      <div
        inert={!open}
        className={cn(
          "absolute inset-0 flex flex-col transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex min-h-[42px] shrink-0 items-center px-3 py-2">
          <div className="flex-1" />
          <Button variant="ghost" size="icon-xs" onClick={closeMerchivaDock} aria-label={closeLabel} title={shortcutHint(closeLabel)}>
            <PanelRightClose className="h-4 w-4 text-muted-foreground rtl:-scale-x-100" />
          </Button>
        </div>
        <TabChats open={open} />
      </div>

      <button
        type="button"
        inert={open}
        onClick={openMerchivaDock}
        aria-label={dot ? fmt(t("notify.dot.withName"), { name: openLabel }) : openLabel}
        aria-expanded={false}
        title={shortcutHint(openLabel)}
        className={cn(
          "absolute inset-y-0 start-0 flex flex-col items-center pt-3 outline-none transition-opacity duration-200 hover:bg-muted/60 focus-visible:bg-muted motion-reduce:transition-none",
          open ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        style={{ width: RAIL_WIDTH }}
      >
        <span className="relative flex">
          <PanelRightOpen className="h-4 w-4 text-muted-foreground rtl:-scale-x-100" />
          <NotificationDot show={dot} />
        </span>
      </button>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 z-20 flex select-none items-center gap-2"
        initial={false}
        animate={
          open
            ? { ...edge(14), top: 11, rotate: 0, scale: 1, x: 0, y: 0 }
            : { ...edge(RAIL_WIDTH / 2), top: "50%", rotate: 90, scale: 0.9, x: rtl ? "50%" : "-50%", y: "-50%" }
        }
        transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38, mass: 0.6 }}
      >
        <MerchivaMark />
        <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-foreground">{t("merchiva.name")}</span>
      </motion.div>
    </aside>
  );
}
