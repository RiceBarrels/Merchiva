"use client";

import { useState, useCallback } from "react";
import { useEditor } from "@craftjs/core";
import { ChevronDown, Plus, Globe } from "lucide-react";
import { LayerTree, draggedNodeId } from "./layer-tree";
import { CraftLayout } from "./craft-components/craft-layout";
import { CraftFixed } from "./craft-components/craft-fixed";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import React from "react";
import type { Site, SitePage } from "@/lib/types";

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
  const { actions, query } = useEditor();

  const addElement = useCallback((fixed: boolean) => {
    const component = fixed ? CraftFixed : CraftLayout;
    const tree = query.parseReactElement(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(component as any)
    ).toNodeTree();
    actions.addNodeTree(tree, "ROOT");
  }, [actions, query]);

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
              <Button
                key={page.id}
                variant="ghost"
                onClick={() => onPageSwitch(page.id)}
                className={cn(
                  "flex w-full items-center justify-start gap-2 rounded-[0.3rem] border border-transparent p-2 h-auto text-left",
                  isActive
                    ? "border-border bg-accent text-foreground hover:bg-accent hover:text-foreground"
                    : "text-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "h-6 w-8 shrink-0 rounded-[0.2rem]",
                    PAGE_COLORS[i % PAGE_COLORS.length]
                  )}
                />
                <span className="truncate text-xs">{page.name}</span>
              </Button>
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

            // Remove fixed positioning
            actions.setProp(nodeId, (p: Record<string, unknown>) => {
              const s = (p.style as Record<string, string>) || {};
              delete s.position;
              delete s.top;
              delete s.right;
              delete s.bottom;
              delete s.left;
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
          onDrop={() => {
            // CraftFixed elements are inherently fixed — no style changes needed
            // Non-fixed elements cannot be converted to fixed via drag (different component type)
          }}
        >
          <LayerTree filter="fixed" />
        </DropSection>
      </div>
    </div>
  );
}
