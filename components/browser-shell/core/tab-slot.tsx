"use client";

import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { shouldSkipTransition } from "@/components/page-tabs";
import { PageTransition } from "@/components/page-transition";
import { slotReveal } from "@/lib/browser-shell/keep-alive";
import { installSlotScrollMemory, type SlotScrollMemory } from "@/lib/browser-shell/scroll";
import type { TabId } from "@/lib/browser-shell/types";
import { cn } from "@/lib/utils";
import { TabNavigationProvider, createNavigationGate, replayNavigation, type TabNavigation } from "./tab-navigation";

const SLOT_SHOWN_CLASS = "flex min-h-0 flex-1 flex-col";
const PAGE_CLASS = "flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden";

interface TabSlotProps {
  /** The tab whose page this slot keeps (null: the boot slot, before the tab store binds). */
  readonly tabId: TabId | null;
  /** Displayed and rendering the live router state. */
  readonly active: boolean;
  /** Soft reloads of the tab: a change remounts the page. */
  readonly reloads: number;
  readonly live: TabNavigation;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Pauses media of a page that is being hidden (`display: none` does not stop playback). */
function pauseMedia(slot: HTMLElement | null): void {
  slot?.querySelectorAll<HTMLMediaElement>("video, audio").forEach((media) => {
    if (!media.paused) media.pause();
  });
}

/**
 * One tab's page (TabPageOutlet). The active slot renders the live router state; a hidden one
 * keeps rendering the navigation it last showed, inside `<Activity mode="hidden">`: its state
 * and DOM stay, its effects are cleaned up until it is shown again, and async work it started
 * keeps running. The slot element sits outside the Activity so its `data-tab-*` attributes,
 * scroll memory and media pause work while the page is hidden.
 */
export function TabSlot({ tabId, active, reloads, live, className, children }: TabSlotProps) {
  // The navigation shown when the slot was last active, stored during render. A slot that mounts
  // hidden (bookkeeping left over from a render React discarded) has shown nothing: it stays empty
  // until its tab is shown.
  const [shown, setShown] = useState<TabNavigation | null>(active ? live : null);
  if (active && shown !== live) setShown(live);
  const navigation = active ? live : shown;

  const slotRef = useRef<HTMLDivElement | null>(null);
  const memoryRef = useRef<SlotScrollMemory | null>(null);
  const hiddenRef = useRef(false);
  // The navigation on screen at the last active commit, which a reveal compares with.
  const onScreenRef = useRef<TabNavigation | null>(null);
  const [gate] = useState(() => createNavigationGate(active));
  const baseRouter = navigation?.router ?? null;
  const router = useMemo(() => baseRouter && gate.guard(baseRouter), [baseRouter, gate]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const memory = installSlotScrollMemory(slot);
    memoryRef.current = memory;
    return () => {
      memory.uninstall();
      memoryRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    gate.setShown(active);
    if (active) return;
    hiddenRef.current = true;
    pauseMedia(slotRef.current);
  }, [active, gate]);

  // Before paint: a page shown again gets its scroll offsets back (hiding reset them).
  useLayoutEffect(() => {
    if (!active) return;
    const hiddenWith = onScreenRef.current;
    onScreenRef.current = live;
    if (!hiddenRef.current) return;
    hiddenRef.current = false;
    const reveal = slotReveal(hiddenWith, live);
    // A page mounting now restores its entry like any mount: the restore scheduled for it runs.
    if (reveal === "fresh") return;
    // On another entry of the tab, that entry's restore (scheduled while the slot was hidden)
    // owns the scroll roots and resumes against this slot's page instead of being cancelled.
    memoryRef.current?.restore(reveal !== "same" && tabId ? { tabId, samePathname: reveal === "entry" } : undefined);
    // Drops the tab switch's skip request when the pathname did not change: no PageTransition
    // consumed it, and it must not swallow the next in-page transition.
    if (reveal !== "page") shouldSkipTransition();
  }, [active, live, tabId]);

  useEffect(() => {
    if (!active || !baseRouter) return;
    const held = gate.take();
    if (held) replayNavigation(held, baseRouter);
  }, [active, baseRouter, gate]);

  // Memoized so a hidden slot (whose navigation no longer changes) bails out of re-rendering.
  const page = useMemo(
    () =>
      navigation && (
        <TabNavigationProvider navigation={navigation} router={router} tabId={tabId}>
          <main data-tab-scroll-root="" className={cn(PAGE_CLASS, className)}>
            <PageTransition key={reloads}>{children}</PageTransition>
          </main>
        </TabNavigationProvider>
      ),
    [navigation, router, tabId, className, reloads, children],
  );

  return (
    <div
      ref={slotRef}
      data-tab-slot={tabId ?? ""}
      data-tab-active={active ? "true" : "false"}
      className={active ? SLOT_SHOWN_CLASS : "hidden"}
    >
      <Activity mode={active ? "visible" : "hidden"}>{page}</Activity>
    </div>
  );
}
