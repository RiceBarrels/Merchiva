"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import { resolver } from "./craft-components/resolver";
import { siteElementsToCraftState } from "@/lib/builder/craft-bridge";
import { RenderNode } from "./render-node";
import { CraftBuilderToolbar as BuilderToolbar, type BuilderTab } from "./toolbar";
import { LeftPanel } from "./left-panel";
import { DesignPanel } from "./design-panel";
import { ToolBar } from "./tool-bar";
import { CanvasContextMenu } from "./canvas-context-menu";
import { AutoSaver } from "./auto-saver";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { CraftCanvas } from "./craft-components/craft-canvas";
import { FlowFnEditor } from "./flowfn-editor";
import { AiElementInserter } from "./ai-element-inserter";
import { MerchivaChat, type BuilderModeContext } from "@/components/merchiva-chat-dashboard";
import { themeVars } from "@/components/site-renderer";
import { createPage, updateSite } from "@/lib/spacetimedb/actions";
import { buildPageTemplate, type PageTemplateId } from "@/lib/builder/page-templates";
import { BuilderSiteProvider } from "@/lib/builder/site-context";
import type { Site, SitePage, Product } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Wraps MerchivaChat with builder-mode context derived from the live Craft.js state.
// Must be rendered inside the <Editor> provider so useEditor() works.
function BuilderMerchivaChat({
  site,
  activePage,
}: {
  site: Site;
  activePage: SitePage | undefined;
}) {
  const { query } = useEditor();
  // Re-serialize on every render — cheap, and ensures the AI sees current canvas state
  // each time it sends a message. The MerchivaChat itself memoizes the context object.
  const elements = useMemo(() => {
    try {
      const nodes = query.getSerializedNodes();
      const out: Array<{ name: string; type: string; props: Record<string, unknown> }> = [];
      for (const [id, node] of Object.entries(nodes)) {
        if (id === "ROOT") continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const n = node as any;
        const name = String(
          n.custom?.displayName ||
            n.displayName ||
            (n.type?.resolvedName ? n.type.resolvedName.replace("Craft", "") : "Element"),
        );
        const type = n.type?.resolvedName
          ? n.type.resolvedName.replace("Craft", "").toLowerCase()
          : "unknown";
        out.push({ name, type, props: n.props || {} });
      }
      return out;
    } catch {
      return [];
    }
    // Re-run whenever the active page changes — for in-place edits the AI re-fetches
    // when it next sends a message via the memoized storeContext in MerchivaChat.
  }, [query, activePage]);

  const builderContext: BuilderModeContext = {
    siteId: site.id,
    siteName: site.name,
    pageId: activePage?.id ?? "",
    pageName: activePage?.name ?? "(no page)",
    elements,
    theme: site.theme as unknown as Record<string, unknown> | undefined,
  };

  return <MerchivaChat compact header={false} builderContext={builderContext} />;
}

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
  const [rightPanel, setRightPanel] = useState<"design" | "ai">("design");

  // Tab system
  const [tabs, setTabs] = useState<BuilderTab[]>(() => {
    const initial: BuilderTab[] = pages.slice(0, 1).map((p) => ({ kind: "page" as const, pageId: p.id }));
    return initial.length ? initial : [{ kind: "page" as const, pageId: pages[0]?.id || "" }];
  });
  const [activeTab, setActiveTab] = useState<BuilderTab>(tabs[0]);

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
    const existing = tabs.find((t) => t.kind === "page" && t.pageId === pageId);
    if (existing) {
      setActiveTab(existing);
    } else {
      const newTab: BuilderTab = { kind: "page", pageId };
      setTabs((t) => [...t, newTab]);
      setActiveTab(newTab);
    }
  }, [tabs]);

  const handleTabSwitch = useCallback((tab: BuilderTab) => {
    setActiveTab(tab);
    if (tab.kind === "page") setActivePageId(tab.pageId);
  }, []);

  const handleTabClose = useCallback((tab: BuilderTab) => {
    setTabs((prev) => {
      const next = prev.filter((t) => {
        if (tab.kind === "functions" && t.kind === "functions") return false;
        if (tab.kind === "page" && t.kind === "page" && t.pageId === tab.pageId) return false;
        return true;
      });
      if (next.length === 0) {
        const fallback: BuilderTab = { kind: "page", pageId: pages[0]?.id || "" };
        next.push(fallback);
      }
      // Switch active tab if we closed the active one
      const wasActive = (tab.kind === "functions" && activeTab.kind === "functions") ||
        (tab.kind === "page" && activeTab.kind === "page" && tab.pageId === activeTab.pageId);
      if (wasActive) {
        const newActive = next[next.length - 1];
        setActiveTab(newActive);
        if (newActive.kind === "page") setActivePageId(newActive.pageId);
      }
      return next;
    });
  }, [activeTab, pages]);

  const handleTabOpen = useCallback((tab: BuilderTab) => {
    if (tab.kind === "functions" && tabs.some((t) => t.kind === "functions")) {
      setActiveTab(tabs.find((t) => t.kind === "functions")!);
      return;
    }
    if (tab.kind === "page" && tabs.some((t) => t.kind === "page" && t.pageId === tab.pageId)) {
      setActiveTab(tab);
      setActivePageId(tab.pageId);
      return;
    }
    setTabs((t) => [...t, tab]);
    setActiveTab(tab);
    if (tab.kind === "page") setActivePageId(tab.pageId);
  }, [tabs]);

  const handlePublish = useCallback(async () => {
    try {
      await updateSite(site.id, { published: true });
    } catch (err) {
      console.error("Publish failed:", err);
    }
  }, [site.id]);

  const handleAddPage = useCallback(
    async (name: string, templateId: PageTemplateId) => {
      try {
        const elements = buildPageTemplate(templateId);
        await createPage({
          siteId: site.id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
          sortOrder: pages.length,
          elements: JSON.stringify(elements),
        });
      } catch (err) {
        console.error("Add page failed:", err);
      }
    },
    [site.id, pages.length]
  );

  const showDesignEditor = activeTab.kind === "page";

  return (
    <BuilderSiteProvider value={site}>
    <Editor
      key={activePageId}
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
          tabs={tabs}
          activeTab={activeTab}
          onTabSwitch={handleTabSwitch}
          onTabClose={handleTabClose}
          onTabOpen={handleTabOpen}
        />
        {showDesignEditor ? (
          <div className="flex flex-1 overflow-hidden">
            <LeftPanel
              site={site}
              pages={pages}
              activePageId={activePageId}
              onPageSwitch={handlePageSwitch}
              onPublish={handlePublish}
              onAddPage={handleAddPage}
            />
            <CanvasContextMenu siteId={site.id}>
              <div
                className="relative flex-1 overflow-auto bg-muted"
                data-craft-canvas
                style={site.theme ? themeVars(site.theme) : {}}
              >
                <div className="mx-auto p-8" style={{ maxWidth: 1400 }}>
                  {hasState ? (
                    <Frame data={initialState}>
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
            <div
              className={`flex shrink-0 flex-col border-l border-border bg-background transition-[width] duration-200 ${rightPanel === "ai" ? "w-[380px]" : "w-64"}`}
            >
              <Tabs
                value={rightPanel}
                onValueChange={(v) => setRightPanel(v as "design" | "ai")}
                className="gap-0 border-b border-border"
              >
                <TabsList variant="line" className="w-full">
                  <TabsTrigger value="design" className="text-[11px]">Design</TabsTrigger>
                  <TabsTrigger value="ai" className="text-[11px]">Mr. Merchiva</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex-1 overflow-hidden">
                {rightPanel === "design" ? (
                  <DesignPanel pages={pages} />
                ) : (
                  <BuilderMerchivaChat site={site} activePage={activePage} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <FlowFnEditor siteId={site.id} />
          </div>
        )}
      </div>
      <AiElementInserter />
      <KeyboardShortcuts />
      <AutoSaver
        activePageId={activePageId}
        setSaving={setSaving}
        setSavedAt={setSavedAt}
        pages={pages}
      />
    </Editor>
    </BuilderSiteProvider>
  );
}
