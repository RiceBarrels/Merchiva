"use client";

import { useCallback } from "react";
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
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  EyeOff,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerializedNodes = Record<string, any>;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function cloneSubtree(
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
}

export function CanvasContextMenu({ children }: CanvasContextMenuProps) {
  const { actions, query } = useEditor();

  const getSelectedId = useCallback((): string | null => {
    return query.getEvent("selected").first() ?? null;
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
    clipboardNodes = JSON.parse(query.serialize());
    clipboardRootId = id;
    try { actions.delete(id); } catch {}
  }, [getSelectedId, query, actions]);

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
    try {
      if (query.node(id).isDeletable()) actions.delete(id);
    } catch {}
  }, [getSelectedId, query, actions]);

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

  const selected = getSelectedId();
  const hasClipboard = !!clipboardNodes && !!clipboardRootId;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex flex-1 min-h-0 min-w-0">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={handleCopy} disabled={!selected}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCut} disabled={!selected}>
          <Scissors className="mr-2 h-4 w-4" />
          Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handlePaste} disabled={!hasClipboard}>
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDuplicate} disabled={!selected}>
          <CopyPlus className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
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
        <ContextMenuItem onClick={handleDelete} disabled={!selected} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
