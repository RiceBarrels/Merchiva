"use client";

import { useState, useCallback, useEffect } from "react";
import { useEditor, Frame, Element } from "@craftjs/core";
import Link from "next/link";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Loader2,
  Check,
  ChevronDown,
  Plus,
  Type,
  Image as ImageIcon,
  LayoutDashboard,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hapticLight } from "@/lib/haptics";
import { CraftCanvas } from "../craft-components/craft-canvas";
import { CraftText } from "../craft-components/craft-text";
import { CraftImage } from "../craft-components/craft-image";
import { CraftLayout } from "../craft-components/craft-layout";
import { AutoSaver } from "../auto-saver";
import { themeVars } from "@/components/site-renderer";
import { siteElementsToCraftState } from "@/lib/builder/craft-bridge";
import type { Site, SitePage } from "@/lib/types";
import React from "react";

// ─── Mobile Toolbar ─────────────────────────────────────────────────────────

function MobileToolbar({
  site,
  saving,
  savedAt,
}: {
  site: Site;
  saving: boolean;
  savedAt: number | null;
}) {
  const { actions, canUndo, canRedo } = useEditor((_state, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  return (
    <div className="flex h-11 items-center gap-1 border-b border-border bg-background px-2 shrink-0">
      <Link
        href="/builder"
        className="flex h-8 w-8 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <span className="ml-1 truncate text-sm font-semibold">{site.name}</span>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : savedAt ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : null}
      </div>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => { hapticLight(); actions.history.undo(); }}
        disabled={!canUndo}
        className="flex h-8 w-8 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent disabled:opacity-30"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => { hapticLight(); actions.history.redo(); }}
        disabled={!canRedo}
        className="flex h-8 w-8 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-accent disabled:opacity-30"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Mobile Page Switcher ───────────────────────────────────────────────────

function MobilePageSwitcher({
  pages,
  activePageId,
  onSwitch,
}: {
  pages: SitePage[];
  activePageId: string;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = pages.find((p) => p.id === activePageId);

  return (
    <div className="border-b border-border bg-background px-3 py-2 shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-xs font-medium text-foreground truncate">
          {active?.name ?? "Page"}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          /{active?.slug === "index" ? "" : active?.slug}
        </span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
        <div className="flex-1" />
        <Badge variant="secondary" className="text-[10px]">{pages.length} pages</Badge>
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSwitch(p.id); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[0.3rem] px-2 py-1.5 text-left text-xs transition-colors",
                p.id === activePageId ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <span className="truncate">{p.name}</span>
              <span className="font-mono text-muted-foreground">/{p.slug === "index" ? "" : p.slug}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile Design Panel (bottom sheet) ─────────────────────────────────────

function MobileDesignPanel() {
  const { selected, selectedNodeId, selectedNodeName, selectedNodeProps, selectedNodeType, parentId, currentIndex, siblingCount, actions } = useEditor((state) => {
    const [currentNodeId] = state.events.selected;
    if (!currentNodeId) return { selected: false, selectedNodeId: "", selectedNodeName: "", selectedNodeProps: {} as Record<string, unknown>, selectedNodeType: "", parentId: "", currentIndex: 0, siblingCount: 0 };
    const node = state.nodes[currentNodeId];
    if (!node) return { selected: false, selectedNodeId: "", selectedNodeName: "", selectedNodeProps: {} as Record<string, unknown>, selectedNodeType: "", parentId: "", currentIndex: 0, siblingCount: 0 };
    const pid = node.data.parent;
    const parentNode = pid ? state.nodes[pid] : null;
    const siblings = parentNode?.data.nodes || [];
    return {
      selected: true,
      selectedNodeId: currentNodeId,
      selectedNodeName: node.data.displayName || node.data.type?.toString() || "Element",
      selectedNodeProps: node.data.props || {},
      selectedNodeType: node.data.type?.toString() || "",
      parentId: pid || "",
      currentIndex: siblings.indexOf(currentNodeId),
      siblingCount: siblings.length,
    };
  });

  const setProp = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNodeId) return;
      actions.setProp(selectedNodeId, (props: Record<string, unknown>) => {
        props[key] = value;
      });
    },
    [actions, selectedNodeId]
  );

  if (!selected) {
    return (
      <div className="border-t border-border bg-background px-4 py-3 text-center shrink-0">
        <p className="text-xs text-muted-foreground">Tap an element to edit</p>
      </div>
    );
  }

  const props = selectedNodeProps;
  const style = (props.style as Record<string, string>) || {};
  const isText = selectedNodeType.includes("Text");
  const isImage = selectedNodeType.includes("Image");

  return (
    <div className="border-t border-border bg-background shrink-0 max-h-[45vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border sticky top-0 bg-background z-10">
        <span className="text-xs font-medium text-foreground truncate">{selectedNodeName}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentIndex <= 0}
          onClick={() => { if (parentId && currentIndex > 0) { hapticLight(); actions.move(selectedNodeId, parentId, currentIndex - 1); } }}
          title="Move up"
        >
          <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={currentIndex >= siblingCount - 1}
          onClick={() => { if (parentId && currentIndex < siblingCount - 1) { hapticLight(); actions.move(selectedNodeId, parentId, currentIndex + 2); } }}
          title="Move down"
        >
          <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => { if (selectedNodeId) actions.delete(selectedNodeId); }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => actions.selectNode()}
          className="text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 py-2 space-y-3">
        {/* Text content */}
        {isText && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Content</Label>
            <Input
              className="h-7 text-xs"
              value={(props.content as string) || ""}
              onChange={(e) => setProp("content", e.target.value)}
            />
          </div>
        )}

        {/* Image src */}
        {isImage && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Image URL</Label>
            <Input
              className="h-7 text-xs"
              value={(props.src as string) || ""}
              onChange={(e) => setProp("src", e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        {/* Font size */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Font size</Label>
          <Input
            className="h-7 text-xs"
            value={style.fontSize || (props.fontSize as string) || ""}
            onChange={(e) => setProp("style", { ...style, fontSize: e.target.value })}
            placeholder="16px"
          />
        </div>

        {/* Color */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={style.color || (props.color as string) || "#000000"}
              onChange={(e) => setProp("style", { ...style, color: e.target.value })}
              className="h-7 w-7 rounded-[0.3rem] border border-border cursor-pointer p-0"
            />
            <Input
              className="h-7 text-xs font-mono flex-1"
              value={style.color || (props.color as string) || ""}
              onChange={(e) => setProp("style", { ...style, color: e.target.value })}
              placeholder="#000000"
            />
          </div>
        </div>

        {/* Background */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Background</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={style.backgroundColor || (props.backgroundColor as string) || "#ffffff"}
              onChange={(e) => setProp("style", { ...style, backgroundColor: e.target.value })}
              className="h-7 w-7 rounded-[0.3rem] border border-border cursor-pointer p-0"
            />
            <Input
              className="h-7 text-xs font-mono flex-1"
              value={style.backgroundColor || (props.backgroundColor as string) || ""}
              onChange={(e) => setProp("style", { ...style, backgroundColor: e.target.value })}
              placeholder="transparent"
            />
          </div>
        </div>

        {/* Padding */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">Padding</Label>
          <Input
            className="h-7 text-xs"
            value={style.padding || (props.padding as string) || ""}
            onChange={(e) => setProp("style", { ...style, padding: e.target.value })}
            placeholder="0px"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Element Insert Bar ──────────────────────────────────────────────

function MobileInsertBar() {
  const { actions, query } = useEditor();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addElement = useCallback((component: any) => {
    hapticLight();
    const tree = query.parseReactElement(React.createElement(component)).toNodeTree();
    actions.addNodeTree(tree, "ROOT");
  }, [actions, query]);

  const tools = [
    { label: "Layout", icon: LayoutDashboard, component: CraftLayout },
    { label: "Image", icon: ImageIcon, component: CraftImage },
    { label: "Text", icon: Type, component: CraftText },
  ];

  return (
    <div className="flex items-center gap-0.5 border-t border-border bg-background px-2 py-1.5 shrink-0">
      <span className="text-[10px] text-muted-foreground font-medium mr-1.5">Add:</span>
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.label}
            onClick={() => addElement(tool.component)}
            className="flex items-center gap-1 rounded-[0.3rem] px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent"
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── MobileBuilderLayout ────────────────────────────────────────────────────
// This is the mobile alternative to the desktop's three-panel layout.
// It lives INSIDE the <Editor> context so useEditor() works.

export function MobileBuilderLayout({
  site,
  pages,
  activePageId,
  onPageSwitch,
  saving,
  savedAt,
}: {
  site: Site;
  pages: SitePage[];
  activePageId: string;
  onPageSwitch: (id: string) => void;
  saving: boolean;
  savedAt: number | null;
}) {
  const activePage = pages.find((p) => p.id === activePageId);
  const initialState = activePage
    ? siteElementsToCraftState(activePage.elements ?? [])
    : "";
  const hasState = initialState && initialState !== "{}";

  return (
    <div className="flex h-[100dvh] flex-col">
      <MobileToolbar site={site} saving={saving} savedAt={savedAt} />
      <MobilePageSwitcher pages={pages} activePageId={activePageId} onSwitch={onPageSwitch} />

      {/* Canvas */}
      <div
        className="relative flex-1 overflow-auto bg-muted"
        data-craft-canvas
        style={site.theme ? themeVars(site.theme) : {}}
      >
        <div className="p-4">
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
      </div>

      <MobileDesignPanel />
      <MobileInsertBar />
      <AutoSaver
        activePageId={activePageId}
        setSaving={() => {}}
        setSavedAt={() => {}}
        pages={pages}
      />
    </div>
  );
}
