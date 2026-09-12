"use client";

import { useCallback, useState } from "react";
import { useEditor, type NodeTree, type Node } from "@craftjs/core";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementFooter,
} from "@/components/ui/dynamic-ui-element";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Component,
} from "lucide-react";
import { craftNodeToSiteElement, siteElementsToCraftState } from "@/lib/builder/craft-bridge";
import { saveComponent } from "@/lib/spacetimedb/actions";
import { componentDragState } from "./component-drag-state";
import type { SiteElement } from "@/lib/types";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerializedNodes = Record<string, any>;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export function cloneSubtree(
  allNodes: SerializedNodes,
  rootId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any
): NodeTree | null {
  const sourceNode = allNodes[rootId];
  if (!sourceNode) return null;

  const idMap = new Map<string, string>();
  const nodes: Record<string, Node> = {};

  const queue = [rootId];
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    const n = allNodes[id];
    if (n?.nodes) queue.push(...n.nodes);
    if (n?.linkedNodes) {
      for (const lid of Object.values(n.linkedNodes) as string[]) queue.push(lid);
    }
  }

  for (const oldId of ordered) idMap.set(oldId, uid());
  const newRootId = idMap.get(rootId)!;

  for (const oldId of ordered) {
    const serialized = allNodes[oldId];
    if (!serialized) continue;
    const newId = idMap.get(oldId)!;
    const newChildIds = (serialized.nodes || []).map((c: string) => idMap.get(c)).filter(Boolean) as string[];
    const newLinked: Record<string, string> = {};
    if (serialized.linkedNodes) {
      for (const [k, v] of Object.entries(serialized.linkedNodes)) {
        const m = idMap.get(v as string);
        if (m) newLinked[k] = m;
      }
    }
    const newParent = oldId === rootId ? undefined : idMap.get(serialized.parent) || undefined;
    try {
      const freshNode = query
        .parseSerializedNode({ ...serialized, parent: newParent, nodes: newChildIds, linkedNodes: newLinked })
        .toNode((n: Node) => { n.id = newId; });
      nodes[newId] = freshNode;
    } catch { return null; }
  }
  return { rootNodeId: newRootId, nodes };
}

// Module-level clipboard for copy/paste across context menu uses
let clipboardNodes: SerializedNodes | null = null;
let clipboardRootId: string | null = null;

interface CanvasContextMenuProps {
  children: React.ReactNode;
  siteId: string;
}

export function CanvasContextMenu({ children, siteId }: CanvasContextMenuProps) {
  const { actions, query } = useEditor();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [componentName, setComponentName] = useState("");
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const getSelectedId = useCallback((): string | null => {
    return query.getEvent("selected").first() ?? null;
  }, [query]);

  const isLocked = useCallback((id: string | null): boolean => {
    if (!id) return false;
    try {
      const n = query.node(id).get();
      return !!(n.data.custom as { locked?: boolean } | undefined)?.locked;
    } catch {
      return false;
    }
  }, [query]);

  const handleCopy = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    clipboardNodes = JSON.parse(query.serialize());
    clipboardRootId = id;
  }, [getSelectedId, query]);

  const handleCut = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    if (isLocked(id)) return;
    clipboardNodes = JSON.parse(query.serialize());
    clipboardRootId = id;
    try { actions.delete(id); } catch {}
  }, [getSelectedId, query, actions, isLocked]);

  const handlePaste = useCallback(() => {
    if (!clipboardNodes || !clipboardRootId) return;
    const tree = cloneSubtree(clipboardNodes, clipboardRootId, query);
    if (!tree) return;
    const selectedId = getSelectedId();
    let parentId = "ROOT";
    if (selectedId) {
      try { parentId = query.node(selectedId).get().data.parent || "ROOT"; } catch {}
    }
    try { actions.addNodeTree(tree, parentId); } catch (err) { console.error("Paste failed:", err); }
  }, [getSelectedId, query, actions]);

  const handleDuplicate = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    const serialized = JSON.parse(query.serialize());
    const tree = cloneSubtree(serialized, id, query);
    if (!tree) return;
    let parentId = "ROOT";
    try { parentId = query.node(id).get().data.parent || "ROOT"; } catch {}
    try { actions.addNodeTree(tree, parentId); } catch (err) { console.error("Duplicate failed:", err); }
  }, [getSelectedId, query, actions]);

  const handleDelete = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    if (isLocked(id)) return;
    try {
      if (query.node(id).isDeletable()) actions.delete(id);
    } catch {}
  }, [getSelectedId, query, actions, isLocked]);

  const handleHide = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    try {
      const n = query.node(id).get();
      actions.setHidden(id, !n.data.hidden);
    } catch {}
  }, [getSelectedId, query, actions]);

  const handleSelectParent = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    try {
      const parentId = query.node(id).get().data.parent;
      if (parentId) actions.selectNode(parentId);
    } catch {}
  }, [getSelectedId, query, actions]);

  const handleSaveAsComponentClick = useCallback(() => {
    const id = getSelectedId();
    if (!id) return;
    setPendingNodeId(id);
    setComponentName("");
    setSaveDialogOpen(true);
  }, [getSelectedId]);

  const handleSaveComponent = useCallback(async () => {
    if (!pendingNodeId || !componentName.trim()) return;
    setSaving(true);
    try {
      const serialized = query.serialize();
      const element = craftNodeToSiteElement(serialized, pendingNodeId);
      if (!element) return;
      await saveComponent({
        siteId,
        name: componentName.trim(),
        elementData: element,
      });
      setSaveDialogOpen(false);
    } catch (err) {
      console.error("Save component failed:", err);
    } finally {
      setSaving(false);
    }
  }, [pendingNodeId, componentName, query, siteId]);

  const dropComponentAt = useCallback((payload: { id: string; name: string; data: SiteElement }, align?: { h?: "left" | "center" | "right"; v?: "top" | "middle" | "bottom" }) => {
    try {
      const craftJson = siteElementsToCraftState([payload.data]);
      const craftNodes = JSON.parse(craftJson);
      const rootChildId = craftNodes.ROOT?.nodes?.[0];
      if (!rootChildId) return;
      const tree = cloneSubtree(craftNodes, rootChildId, query);
      if (!tree) return;

      const rootNode = tree.nodes[tree.rootNodeId];
      if (rootNode) {
        rootNode.data.custom = {
          ...(rootNode.data.custom || {}),
          fromComponent: { id: payload.id, name: payload.name },
        };
        if (align) {
          const style = (rootNode.data.props?.style as Record<string, string> | undefined) || {};
          const next: Record<string, string> = { ...style, position: "fixed" };
          if (align.h === "left") { next.left = "20px"; delete next.right; }
          else if (align.h === "right") { next.right = "20px"; delete next.left; }
          else if (align.h === "center") { next.left = "50%"; next.transform = (next.transform ? next.transform + " " : "") + "translateX(-50%)"; delete next.right; }
          if (align.v === "top") { next.top = "20px"; delete next.bottom; }
          else if (align.v === "bottom") { next.bottom = "20px"; delete next.top; }
          else if (align.v === "middle") { next.top = "50%"; next.transform = (next.transform ? next.transform + " " : "") + "translateY(-50%)"; delete next.bottom; }
          rootNode.data.props = { ...rootNode.data.props, style: next };
        }
      }

      actions.addNodeTree(tree, "ROOT");
    } catch (err) {
      console.error("Drop component failed:", err);
    }
  }, [actions, query]);

  const handleComponentDrop = useCallback((e: React.DragEvent) => {
    const payload = componentDragState.payload;
    if (!payload) return;
    e.preventDefault();
    componentDragState.payload = null;
    dropComponentAt(payload);
  }, [dropComponentAt]);

  const selected = getSelectedId();
  const selectedLocked = isLocked(selected);
  const hasClipboard = !!clipboardNodes && !!clipboardRootId;

  // ── Component drag overlay (3x3 alignment zones) ─────────────────────────
  const [showAlignOverlay, setShowAlignOverlay] = useState(false);
  const [hoverZone, setHoverZone] = useState<string | null>(null);

  const zones: { id: string; h?: "left" | "center" | "right"; v?: "top" | "middle" | "bottom"; gridArea: string }[] = [
    { id: "tl", h: "left",   v: "top",    gridArea: "1 / 1" },
    { id: "tc", h: "center", v: "top",    gridArea: "1 / 2" },
    { id: "tr", h: "right",  v: "top",    gridArea: "1 / 3" },
    { id: "ml", h: "left",   v: "middle", gridArea: "2 / 1" },
    { id: "mc", h: "center", v: "middle", gridArea: "2 / 2" },
    { id: "mr", h: "right",  v: "middle", gridArea: "2 / 3" },
    { id: "bl", h: "left",   v: "bottom", gridArea: "3 / 1" },
    { id: "bc", h: "center", v: "bottom", gridArea: "3 / 2" },
    { id: "br", h: "right",  v: "bottom", gridArea: "3 / 3" },
  ];

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className="relative flex flex-1 min-h-0 min-w-0"
          onDragEnter={() => {
            if (componentDragState.payload) setShowAlignOverlay(true);
          }}
          onDragOver={(e) => {
            if (componentDragState.payload) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragLeave={(e) => {
            // Only hide when leaving the canvas itself (not child nodes)
            const related = e.relatedTarget as globalThis.Node | null;
            const target = e.currentTarget as unknown as globalThis.Node;
            if (!related || !target.contains(related)) {
              setShowAlignOverlay(false);
              setHoverZone(null);
            }
          }}
          onDrop={(e) => {
            setShowAlignOverlay(false);
            setHoverZone(null);
            handleComponentDrop(e);
          }}
        >
          {children}
          {showAlignOverlay && componentDragState.payload && (
            <div className="pointer-events-none absolute inset-0 z-40">
              <div
                className="pointer-events-auto absolute inset-8 grid rounded-lg border-2 border-dashed border-primary/40 bg-primary/5"
                style={{ gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr 1fr" }}
              >
                {zones.map((z) => (
                  <div
                    key={z.id}
                    style={{ gridArea: z.gridArea }}
                    className={cn(
                      "flex items-center justify-center border border-dashed border-primary/20 transition-colors",
                      hoverZone === z.id ? "bg-primary/25 border-primary" : "hover:bg-primary/15"
                    )}
                    onDragEnter={() => setHoverZone(z.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (componentDragState.payload) e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const payload = componentDragState.payload;
                      componentDragState.payload = null;
                      setShowAlignOverlay(false);
                      setHoverZone(null);
                      if (payload) dropComponentAt(payload, { h: z.h, v: z.v });
                    }}
                  >
                    <span className="text-[9px] uppercase tracking-wider text-primary/70 font-semibold select-none">
                      {z.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={handleCopy} disabled={!selected}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <ContextMenuShortcut>&#8984;C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleCut} disabled={!selected || selectedLocked}>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>&#8984;X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handlePaste} disabled={!hasClipboard}>
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Paste
            <ContextMenuShortcut>&#8984;V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleDuplicate} disabled={!selected}>
            <CopyPlus className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>&#8984;D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleSaveAsComponentClick} disabled={!selected}>
            <Component className="mr-2 h-4 w-4" />
            Save as Component
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleSelectParent} disabled={!selected}>
            <ArrowUp className="mr-2 h-4 w-4" />
            Select parent
          </ContextMenuItem>
          <ContextMenuItem onClick={handleHide} disabled={!selected}>
            <EyeOff className="mr-2 h-4 w-4" />
            Toggle visibility
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} disabled={!selected || selectedLocked} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete{selectedLocked ? " (locked)" : ""}
            <ContextMenuShortcut>&#9003;</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DynamicUIElement open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DynamicUIElementContent className="sm:max-w-sm">
          <DynamicUIElementHeader>
            <DynamicUIElementTitle className="text-sm">Save as Component</DynamicUIElementTitle>
          </DynamicUIElementHeader>
          <Input
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
            placeholder="Component name..."
            autoFocus
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && componentName.trim()) handleSaveComponent();
            }}
          />
          <DynamicUIElementFooter>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSaveDialogOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveComponent}
              disabled={!componentName.trim() || saving}
              className="text-xs"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DynamicUIElementFooter>
        </DynamicUIElementContent>
      </DynamicUIElement>
    </>
  );
}
