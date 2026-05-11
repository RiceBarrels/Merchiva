"use client";

import Link from "next/link";
import { useEditor } from "@craftjs/core";
import {
  ArrowLeft,
  Globe,
  Loader2,
  Redo2,
  Undo2,
  Check,
  X,
  Workflow,
  Plus,
} from "lucide-react";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Site, SitePage } from "@/lib/types";

export type BuilderTab =
  | { kind: "page"; pageId: string }
  | { kind: "functions" };

interface BuilderToolbarProps {
  site: Site;
  pages: SitePage[];
  activePageId: string;
  onPageSwitch: (pageId: string) => void;
  saving: boolean;
  savedAt: number | null;
  tabs: BuilderTab[];
  activeTab: BuilderTab;
  onTabSwitch: (tab: BuilderTab) => void;
  onTabClose: (tab: BuilderTab) => void;
  onTabOpen: (tab: BuilderTab) => void;
}

export function BuilderToolbar({
  site,
  pages,
  saving,
  savedAt,
  tabs,
  activeTab,
  onTabSwitch,
  onTabClose,
  onTabOpen,
}: BuilderToolbarProps) {
  const { actions, canUndo, canRedo } = useEditor((state, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  function formatSavedAt(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function isActiveTab(tab: BuilderTab): boolean {
    if (tab.kind === "functions" && activeTab.kind === "functions") return true;
    if (tab.kind === "page" && activeTab.kind === "page" && tab.pageId === activeTab.pageId) return true;
    return false;
  }

  const hasFunctionsTab = tabs.some((t) => t.kind === "functions");

  return (
    <div className="flex h-10 items-center border-b border-border bg-background text-foreground">
      {/* Back */}
      <Link
        href="/~/builder"
        className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground border-r border-border"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {/* Tabs */}
      <div className="flex h-full min-w-0 flex-1 items-end overflow-x-auto">
        {tabs.map((tab, i) => {
          const active = isActiveTab(tab);
          const label = tab.kind === "functions"
            ? "Functions"
            : pages.find((p) => p.id === tab.pageId)?.name || "Page";
          const icon = tab.kind === "functions"
            ? <Workflow className="h-3.5 w-3.5 shrink-0" />
            : <Globe className="h-3.5 w-3.5 shrink-0" />;

          return (
            <div
              key={tab.kind === "functions" ? "fn" : tab.pageId}
              className={cn(
                "group relative flex h-full items-center gap-1.5 border-r border-border px-3 cursor-pointer select-none text-xs",
                active
                  ? "bg-background text-foreground font-medium border-b-2 border-b-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-accent/60 hover:text-foreground border-b-2 border-b-transparent"
              )}
              onClick={() => onTabSwitch(tab)}
            >
              {icon}
              <span className="max-w-[120px] truncate">{label}</span>
              {tabs.length > 1 && (
                <button
                  className={cn(
                    "ml-1 flex h-4 w-4 items-center justify-center rounded-sm hover:bg-accent",
                    active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  )}
                  onClick={(e) => { e.stopPropagation(); onTabClose(tab); }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* New tab button */}
        {!hasFunctionsTab && (
          <button
            className="flex h-full items-center gap-1 px-2 text-muted-foreground hover:text-foreground hover:bg-accent/60 text-xs"
            onClick={() => onTabOpen({ kind: "functions" })}
            title="Open Functions editor"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Right section */}
      <div className="flex h-full shrink-0 items-center gap-1 border-l border-border px-2">
        {/* Save status */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          ) : savedAt ? (
            <>
              <Check className="h-3 w-3 text-green-600" />
              <span>Saved {formatSavedAt(savedAt)}</span>
            </>
          ) : null}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Undo / Redo (only for page tabs) */}
        {activeTab.kind === "page" && (
          <>
            <button
              onClick={() => { hapticLight(); actions.history.undo(); }}
              disabled={!canUndo}
              className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => { hapticLight(); actions.history.redo(); }}
              disabled={!canRedo}
              className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-border" />
          </>
        )}

        {/* Preview */}
        <Link
          href={`/preview/${site.id}`}
          target="_blank"
          className="flex h-7 items-center gap-1 rounded-[0.3rem] px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Globe className="h-3.5 w-3.5" />
          Preview
        </Link>
      </div>
    </div>
  );
}
