"use client";

import { useState, useCallback } from "react";
import { useEditor } from "@craftjs/core";
import { ChevronDown, Plus, Globe, Component, Trash2, Settings } from "lucide-react";
import { PageSettingsDialog } from "./page-settings-dialog";
import { LayerTree, draggedNodeId } from "./layer-tree";
import { CraftLayout } from "./craft-components/craft-layout";
import { CraftFixed } from "./craft-components/craft-fixed";
import { cloneSubtree } from "./canvas-context-menu";
import { siteElementsToCraftState } from "@/lib/builder/craft-bridge";
import { useSiteComponents } from "@/lib/spacetimedb/hooks";
import { deleteComponent } from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import React from "react";
import type { Site, SitePage, SiteElement } from "@/lib/types";
import { componentDragState } from "./component-drag-state";

interface LeftPanelProps {
  site: Site;
  pages: SitePage[];
  activePageId: string;
  onPageSwitch: (pageId: string) => void;
  onPublish: () => void;
  onAddPage: (name: string) => void;
}

const PAGE_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-cyan-600",
];

function DropSection({
  label,
  onAdd,
  onDrop,
  children,
}: {
  label: string;
  onAdd: () => void;
  onDrop: (nodeId: string) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 shrink-0 transition-colors",
          over && "bg-accent"
        )}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (draggedNodeId) onDrop(draggedNodeId);
        }}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button type="button" onClick={onAdd} className="text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className={cn("flex-1 overflow-y-scroll px-1 pb-2", over && "bg-accent/30")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (draggedNodeId) onDrop(draggedNodeId);
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function LeftPanel({
  site,
  pages,
  activePageId,
  onPageSwitch,
  onAddPage,
  onPublish,
}: LeftPanelProps) {
  const [isAddingPage, setIsAddingPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [componentsOpen, setComponentsOpen] = useState(true);
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);
  const { actions, query } = useEditor();

  const [rawComponents] = useSiteComponents();
  const siteComponents = (rawComponents || []).filter(
    (c) => c.siteId === site.id || !c.siteId
  );

  const addElement = useCallback((fixed: boolean) => {
    const component = fixed ? CraftFixed : CraftLayout;
    const tree = query.parseReactElement(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(component as any)
    ).toNodeTree();
    actions.addNodeTree(tree, "ROOT");
  }, [actions, query]);

  const insertComponent = useCallback((elementData: SiteElement | string, meta?: { id: string; name: string }) => {
    try {
      const element: SiteElement = typeof elementData === "string"
        ? JSON.parse(elementData)
        : elementData;

      // Wrap in array for siteElementsToCraftState (which expects SiteElement[])
      const craftJson = siteElementsToCraftState([element]);
      const craftNodes = JSON.parse(craftJson);

      // The first child of ROOT is our component root
      const rootChildId = craftNodes.ROOT?.nodes?.[0];
      if (!rootChildId) return;

      const tree = cloneSubtree(craftNodes, rootChildId, query);
      if (!tree) return;

      // Tag the clone's root node so the layer tree can show a Component icon
      if (meta) {
        const rootNode = tree.nodes[tree.rootNodeId];
        if (rootNode) {
          rootNode.data.custom = {
            ...(rootNode.data.custom || {}),
            fromComponent: { id: meta.id, name: meta.name },
          };
        }
      }

      actions.addNodeTree(tree, "ROOT");
    } catch (err) {
      console.error("Insert component failed:", err);
    }
  }, [actions, query]);

  const handleDeleteComponent = useCallback(async (id: string) => {
    try {
      await deleteComponent(id);
    } catch (err) {
      console.error("Delete component failed:", err);
    }
  }, []);

  function handleAddPage() {
    const name = newPageName.trim();
    if (!name) return;
    onAddPage(name);
    setNewPageName("");
    setIsAddingPage(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleAddPage();
    } else if (e.key === "Escape") {
      setIsAddingPage(false);
      setNewPageName("");
    }
  }

  return (
    <div className="flex h-full w-60 flex-col border-r border-border bg-background text-foreground">
      {/* Site header */}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">
            {site.name}
          </span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">Team project</p>
        <Button
          onClick={onPublish}
          size="sm"
          className="w-full text-xs font-medium"
          variant="secondary"
        >
          Publish
        </Button>
      </div>

      <Separator />

      {/* Webpages section */}
      <div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Webpages
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsAddingPage(true)}
            className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-0.5 px-2 pb-2">
          {pages.map((page, i) => {
            const isActive = page.id === activePageId;
            return (
              <div
                key={page.id}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-[0.3rem] border border-transparent p-2 text-left cursor-pointer",
                  isActive
                    ? "border-border bg-accent text-foreground"
                    : "text-foreground hover:bg-accent/60"
                )}
                onClick={() => onPageSwitch(page.id)}
              >
                <div
                  className={cn(
                    "h-6 w-8 shrink-0 rounded-[0.2rem]",
                    PAGE_COLORS[i % PAGE_COLORS.length]
                  )}
                />
                <span className="flex-1 truncate text-xs">{page.name}</span>
                <button
                  type="button"
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground transition-opacity",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsPageId(page.id);
                  }}
                  title="Page settings"
                >
                  <Settings className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {isAddingPage && (
            <div className="px-1 pt-1">
              <Input
                type="text"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newPageName.trim()) {
                    setIsAddingPage(false);
                  }
                }}
                placeholder="Page name..."
                autoFocus
                className="h-7 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Components section */}
      <div>
        <button
          className="flex w-full items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors"
          onClick={() => setComponentsOpen(!componentsOpen)}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Components
          </span>
          <span className="text-[10px] text-muted-foreground">{siteComponents.length}</span>
        </button>

        {componentsOpen && (
          <div className="space-y-0.5 px-2 pb-2">
            {siteComponents.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                Right-click an element and select &quot;Save as Component&quot; to add here.
              </p>
            ) : (
              siteComponents.map((comp) => {
                const compIdStr = comp.id.toString();
                const parsedData: SiteElement = typeof comp.elementData === "string"
                  ? JSON.parse(comp.elementData)
                  : comp.elementData;
                return (
                  <div
                    key={compIdStr}
                    draggable
                    onDragStart={(e) => {
                      componentDragState.payload = {
                        id: compIdStr,
                        name: comp.name,
                        data: parsedData,
                      };
                      e.dataTransfer.effectAllowed = "copy";
                      // Required for drag to fire in some browsers
                      e.dataTransfer.setData("text/plain", comp.name);
                    }}
                    onDragEnd={() => {
                      componentDragState.payload = null;
                    }}
                    className="group flex items-center gap-2 rounded-[0.3rem] border border-transparent px-2 py-1.5 hover:border-border hover:bg-accent/60 cursor-grab active:cursor-grabbing"
                    onClick={() => insertComponent(comp.elementData, { id: compIdStr, name: comp.name })}
                    title="Click to insert or drag onto canvas"
                  >
                    <Component className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs text-foreground">{comp.name}</span>
                    <button
                      type="button"
                      className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteComponent(compIdStr);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Layers section */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DropSection
          label="Scrolls"
          onAdd={() => addElement(false)}
          onDrop={(nodeId) => {
            // Block CraftFixed elements from being dropped into scroll section
            const node = query.node(nodeId).get();
            const resolvedName = typeof node.data.type === "object" && node.data.type !== null && "resolvedName" in node.data.type
              ? (node.data.type as { resolvedName: string }).resolvedName : "";
            if (resolvedName === "CraftFixed") return;

            // Remove fixed/absolute positioning when moving into scroll flow
            actions.setProp(nodeId, (p: Record<string, unknown>) => {
              const s = (p.style as Record<string, string>) || {};
              if (s.position === "fixed" || s.position === "absolute") {
                delete s.position;
                delete s.top;
                delete s.right;
                delete s.bottom;
                delete s.left;
              }
              p.style = { ...s };
            });
          }}
        >
          <LayerTree filter="scroll" />
        </DropSection>
        <Separator />
        <DropSection
          label="Fixed"
          onAdd={() => addElement(true)}
          onDrop={(nodeId) => {
            const node = query.node(nodeId).get();
            const resolvedName = typeof node.data.type === "object" && node.data.type !== null && "resolvedName" in node.data.type
              ? (node.data.type as { resolvedName: string }).resolvedName : "";
            // CraftFixed is inherently fixed
            if (resolvedName === "CraftFixed") return;
            // Apply fixed positioning to regular elements
            actions.setProp(nodeId, (p: Record<string, unknown>) => {
              const s = (p.style as Record<string, string>) || {};
              if (s.position !== "fixed" && s.position !== "absolute") {
                s.position = "fixed";
                if (!s.top && !s.bottom) s.top = "20px";
                if (!s.left && !s.right) s.left = "20px";
              }
              p.style = { ...s };
            });
          }}
        >
          <LayerTree filter="fixed" />
        </DropSection>
      </div>

      {settingsPageId && (() => {
        const targetPage = pages.find((p) => p.id === settingsPageId);
        if (!targetPage) return null;
        return (
          <PageSettingsDialog
            open={!!settingsPageId}
            onOpenChange={(v) => { if (!v) setSettingsPageId(null); }}
            page={targetPage}
          />
        );
      })()}
    </div>
  );
}
