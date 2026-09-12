"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { DomTree } from "./dom-tree";
import type { SitePage } from "@/lib/types";
import type { HtmlSelectionInfo } from "./html-canvas";
import { pageColor } from "./page-colors";

interface PagesTreeProps {
  pages: SitePage[];
  activePageId: string;
  // Live html for the active page (may differ from activePage.html if there
  // are unsaved edits). Inactive pages read page.html from props directly.
  activeHtml: string;
  selectedSelector?: string | null;
  onPageSwitch: (pageId: string) => void;
  onSelectElement: (info: HtmlSelectionInfo) => void;
  onPageSettings: (pageId: string) => void;
}

// Combined Pages + Layers navigator (Webflow / Figma style). Each page is a
// collapsible root; expanding it shows its DOM tree underneath. Clicking a
// layer that belongs to a non-active page auto-switches to that page first.
export function PagesTree({
  pages,
  activePageId,
  activeHtml,
  selectedSelector,
  onPageSwitch,
  onSelectElement,
  onPageSettings,
}: PagesTreeProps) {
  const t = useT();
  // Auto-expand the active page so its layers are visible immediately.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [activePageId]: true,
  }));

  return (
    <ul className="space-y-0.5 px-2 pb-2 select-none">
      {pages.map((page, i) => {
        const isActive = page.id === activePageId;
        const open = expanded[page.id] ?? false;
        // Active page uses live html; others use the persisted html (or "" if none yet)
        const pageHtml = isActive ? activeHtml : (page.html ?? "");
        const hasLayers = pageHtml.trim().length > 0;

        return (
          <li key={page.id}>
            <div
              className={cn(
                "group flex w-full items-center gap-1 rounded border border-transparent p-1.5 cursor-pointer text-[12px]",
                isActive
                  ? "border-border bg-accent text-foreground"
                  : "text-foreground hover:bg-accent/60",
              )}
              onClick={() => onPageSwitch(page.id)}
            >
              <button
                type="button"
                className="h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((m) => ({ ...m, [page.id]: !open }));
                }}
                title={open ? t("builder.pagesTree.collapse") : t("builder.pagesTree.expand")}
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <div
                className={cn(
                  "h-5 w-6 shrink-0 rounded",
                  pageColor(i),
                )}
              />
              <span className="flex-1 truncate">{page.name}</span>
              <button
                type="button"
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground transition-opacity",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onPageSettings(page.id);
                }}
                title={t("builder.pagesTree.pageSettings")}
              >
                <Settings className="h-3 w-3" />
              </button>
            </div>

            {open && (
              <div className="mt-0.5 ml-3 border-l border-border pl-1">
                {hasLayers ? (
                  <DomTree
                    html={pageHtml}
                    selectedSelector={isActive ? (selectedSelector ?? null) : null}
                    onSelect={(info) => {
                      // If clicking a layer in another page, switch first so
                      // the iframe can apply selection to the right document.
                      if (!isActive) onPageSwitch(page.id);
                      onSelectElement(info);
                    }}
                  />
                ) : (
                  <div className="px-2 py-1 text-[10.5px] text-muted-foreground italic">
                    {t("builder.pagesTree.emptyPage")}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
