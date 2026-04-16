"use client";

import { useState, useCallback, useEffect } from "react";
import { Editor, Frame, Element } from "@craftjs/core";
import { resolver } from "./craft-components/resolver";
import { siteElementsToCraftState } from "@/lib/builder/craft-bridge";
import { RenderNode } from "./render-node";
import { BuilderToolbar } from "./toolbar";
import { LeftPanel } from "./left-panel";
import { DesignPanel } from "./design-panel";
import { ToolBar } from "./tool-bar";
import { CanvasContextMenu } from "./canvas-context-menu";
import { AutoSaver } from "./auto-saver";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { CraftCanvas } from "./craft-components/craft-canvas";
import { themeVars } from "@/components/site-renderer";
import { createPage, updateSite } from "@/lib/spacetimedb/actions";
import type { Site, SitePage, Product } from "@/lib/types";

interface BuilderEditorProps {
  site: Site;
  pages: SitePage[];
  products: Product[];
  organizationId: string;
}

export function BuilderEditor({
  site,
  pages,
  products,
  organizationId,
}: BuilderEditorProps) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const activePage = pages.find((p) => p.id === activePageId);
  const initialState = activePage
    ? siteElementsToCraftState(activePage.elements ?? [])
    : "";

  const hasState =
    initialState && initialState !== "{}" && initialState !== "{}";

  // Preload Google Fonts used in the page elements
  useEffect(() => {
    const fonts = new Set<string>();
    const SYSTEM = new Set(["system-ui", "Georgia", "Arial", "Courier New", "Helvetica", "sans-serif", "serif", "monospace", "inherit"]);

    function collectFonts(elements: typeof pages[number]["elements"]) {
      for (const el of elements) {
        const style = (el.props?.style as Record<string, string>) || {};
        if (style.fontFamily) {
          const family = style.fontFamily.split(",")[0].trim().replace(/['"]/g, "");
          if (family && !SYSTEM.has(family)) fonts.add(family);
        }
        if (el.children) collectFonts(el.children);
      }
    }

    if (activePage?.elements) collectFonts(activePage.elements);

    fonts.forEach((family) => {
      const id = `gfont-${family.replace(/\s+/g, "-")}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
        document.head.appendChild(link);
      }
    });
  }, [activePage]);

  const handlePageSwitch = useCallback((pageId: string) => {
    setActivePageId(pageId);
  }, []);

  const handlePublish = useCallback(async () => {
    try {
      await updateSite(site.id, { published: true });
    } catch (err) {
      console.error("Publish failed:", err);
    }
  }, [site.id]);

  const handleAddPage = useCallback(
    async (name: string) => {
      try {
        await createPage(
          site.id,
          name,
          name.toLowerCase().replace(/\s+/g, "-"),
          pages.length
        );
      } catch (err) {
        console.error("Add page failed:", err);
      }
    },
    [site.id, pages.length]
  );

  return (
    <Editor
      resolver={resolver}
      enabled={true}
      onRender={RenderNode}
    >
      <div className="flex h-screen flex-col">
        <BuilderToolbar
          site={site}
          pages={pages}
          activePageId={activePageId}
          onPageSwitch={handlePageSwitch}
          saving={saving}
          savedAt={savedAt}
        />
        <div className="flex flex-1 overflow-hidden">
          <LeftPanel
            site={site}
            pages={pages}
            activePageId={activePageId}
            onPageSwitch={handlePageSwitch}
            onPublish={handlePublish}
            onAddPage={handleAddPage}
          />
          {/* Canvas area */}
          <CanvasContextMenu>
            <div
              className="relative flex-1 overflow-auto bg-muted"
              data-craft-canvas
              style={site.theme ? themeVars(site.theme) : {}}
            >
              <div className="mx-auto p-8" style={{ maxWidth: 1400 }}>
                {hasState ? (
                  <Frame json={initialState}>
                    <Element canvas is={CraftCanvas} />
                  </Frame>
                ) : (
                  <Frame>
                    <Element canvas is={CraftCanvas} />
                  </Frame>
                )}
              </div>
              <ToolBar />
            </div>
          </CanvasContextMenu>
          <DesignPanel />
        </div>
      </div>
      <KeyboardShortcuts />
      <AutoSaver
        activePageId={activePageId}
        setSaving={setSaving}
        setSavedAt={setSavedAt}
        pages={pages}
      />
    </Editor>
  );
}
