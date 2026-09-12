"use client";

import { useState } from "react";
import { ChevronDown, Plus, Globe } from "lucide-react";
import { PageSettingsDialog } from "./page-settings-dialog";
import { PageTemplateDialog } from "./page-template-dialog";
import { ValuePanel } from "./value-panel";
import { TokenPanel } from "./token-panel";
import { PagesTree } from "./pages-tree";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Site, SitePage } from "@/lib/types";
import type { PageTemplateId } from "@/lib/builder/page-templates";
import type { HtmlSelectionInfo } from "./html-canvas";
import { pageColor } from "./page-colors";
import { Eyebrow } from "@/components/ui/eyebrow";

interface HtmlLeftPanelProps {
  site: Site;
  pages: SitePage[];
  activePageId: string;
  onPageSwitch: (pageId: string) => void;
  onPublish: () => void;
  onAddPage: (name: string, templateId: PageTemplateId) => void;
  // Layers panel — when these are passed, render a DOM tree of the current page.
  html?: string;
  selectedSelector?: string | null;
  onSelectElement?: (info: HtmlSelectionInfo) => void;
}

// HTML-mode left panel: site header + page list + publish, with no Craft.js
// dependencies. Components/Layers/Values sections from the Craft.js LeftPanel
// don't apply when the canvas is just an HTML string.
export function HtmlLeftPanel({
  site,
  pages,
  activePageId,
  onPageSwitch,
  onAddPage,
  onPublish,
  html,
  selectedSelector,
  onSelectElement,
}: HtmlLeftPanelProps) {
  const t = useT();
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-background text-foreground">
      {/* Site header */}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{site.name}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{t("builder.leftPanel.teamProject")}</p>
        <Button onClick={onPublish} size="sm" className="w-full text-xs font-medium" variant="secondary">
          {t("builder.leftPanel.publish")}
        </Button>
      </div>

      <Separator />

      {/* Pages + nested layers + values, all in one scrollable column */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <Eyebrow as="span">{t("builder.leftPanel.pagesAndLayers")}</Eyebrow>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsAddingPage(true)}
            className="text-muted-foreground"
            title={t("builder.leftPanel.newPage")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {onSelectElement ? (
          <PagesTree
            pages={pages}
            activePageId={activePageId}
            activeHtml={html ?? ""}
            selectedSelector={selectedSelector}
            onPageSwitch={onPageSwitch}
            onSelectElement={onSelectElement}
            onPageSettings={(pageId) => setSettingsPageId(pageId)}
          />
        ) : (
          // Fallback: just the page list, no layers (used when no html context)
          <div className="space-y-0.5 px-2 pb-2">
            {pages.map((page, i) => {
              const isActive = page.id === activePageId;
              return (
                <button
                  key={page.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded border border-transparent p-2 text-left cursor-pointer",
                    isActive
                      ? "border-border bg-accent text-foreground"
                      : "text-foreground hover:bg-accent/60",
                  )}
                  onClick={() => onPageSwitch(page.id)}
                >
                  <div className={cn("h-6 w-8 shrink-0 rounded", pageColor(i))} />
                  <span className="flex-1 truncate text-xs">{page.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <Separator />

        {/* Global values — referenced in HTML as {key} and resolved at render */}
        <ValuePanel site={site} />

        <Separator />

        {/* Design tokens — site-level overrides of the global --mv-* tokens
            picked from globals.css. Overrides flow through site.tokens and
            are inlined into the iframe and storefront wrappers. */}
        <TokenPanel site={site} />
      </div>

      <PageTemplateDialog
        open={isAddingPage}
        onOpenChange={setIsAddingPage}
        existingNames={pages.map((p) => p.name)}
        onCreate={(name, templateId) => onAddPage(name, templateId)}
      />

      {settingsPageId &&
        (() => {
          const targetPage = pages.find((p) => p.id === settingsPageId);
          if (!targetPage) return null;
          return (
            <PageSettingsDialog
              open={!!settingsPageId}
              onOpenChange={(v) => {
                if (!v) setSettingsPageId(null);
              }}
              page={targetPage}
            />
          );
        })()}
    </div>
  );
}
