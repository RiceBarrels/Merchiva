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
} from "lucide-react";
import { hapticLight } from "@/lib/haptics";
import type { Site, SitePage } from "@/lib/types";

interface BuilderToolbarProps {
  site: Site;
  pages: SitePage[];
  activePageId: string;
  onPageSwitch: (pageId: string) => void;
  saving: boolean;
  savedAt: number | null;
}

export function BuilderToolbar({
  site,
  saving,
  savedAt,
}: BuilderToolbarProps) {
  const { actions, canUndo, canRedo } = useEditor((state, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  function formatSavedAt(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex h-10 items-center gap-1 border-b border-border bg-background px-2 text-foreground">
      {/* Back */}
      <Link
        href="/builder"
        className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {/* Site name */}
      <span className="ml-1 truncate text-sm font-semibold text-foreground">
        {site.name}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

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

      {/* Divider */}
      <div className="h-4 w-px bg-border" />

      {/* Undo / Redo */}
      <button
        onClick={() => {
          hapticLight();
          actions.history.undo();
        }}
        disabled={!canUndo}
        className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => {
          hapticLight();
          actions.history.redo();
        }}
        disabled={!canRedo}
        className="flex h-7 w-7 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
      >
        <Redo2 className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="h-4 w-px bg-border" />

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
  );
}
