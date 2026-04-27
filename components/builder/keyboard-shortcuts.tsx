"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, type NodeTree, type Node } from "@craftjs/core";

/**
 * Keyboard shortcuts for the builder.
 * Must be rendered inside <Editor>.
 *
 *   ⌘Z / Ctrl+Z       — Undo
 *   ⌘⇧Z / Ctrl+⇧Z     — Redo
 *   ⌘C / Ctrl+C       — Copy selected node (with children)
 *   ⌘X / Ctrl+X       — Cut selected node
 *   ⌘V / Ctrl+V       — Paste copied node tree
 *   ⌘D / Ctrl+D       — Duplicate selected node tree
 *   Delete / Backspace — Delete selected node
 *   Escape            — Deselect
 */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerializedNodes = Record<string, any>;

/**
 * Deep-clone a subtree from serialized nodes, assigning fresh IDs.
 * Returns a Craft.js NodeTree ready for `actions.addNodeTree()`.
 */
function cloneSubtree(
  allNodes: SerializedNodes,
  rootId: string,
  query: ReturnType<typeof useEditor>["query"]
): NodeTree | null {
  const sourceNode = allNodes[rootId];
  if (!sourceNode) return null;

  const idMap = new Map<string, string>();
  const nodes: Record<string, Node> = {};

  // Collect all node IDs in the subtree (BFS)
  const queue = [rootId];
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    const n = allNodes[id];
    if (n?.nodes) {
      for (const childId of n.nodes) {
        queue.push(childId);
      }
    }
    // Also check linkedNodes
    if (n?.linkedNodes) {
      for (const linkedId of Object.values(n.linkedNodes) as string[]) {
        queue.push(linkedId);
      }
    }
  }

  // Assign fresh IDs
  for (const oldId of ordered) {
    idMap.set(oldId, uid());
  }

  const newRootId = idMap.get(rootId)!;

  // Build nodes with new IDs
  for (const oldId of ordered) {
    const serialized = allNodes[oldId];
    if (!serialized) continue;

    const newId = idMap.get(oldId)!;

    // Remap child IDs
    const newChildIds = (serialized.nodes || [])
      .map((cid: string) => idMap.get(cid))
      .filter(Boolean) as string[];

    const newLinkedNodes: Record<string, string> = {};
    if (serialized.linkedNodes) {
      for (const [key, lid] of Object.entries(serialized.linkedNodes)) {
        const mapped = idMap.get(lid as string);
        if (mapped) newLinkedNodes[key] = mapped;
      }
    }

    // Determine parent in the cloned tree
    const oldParent = serialized.parent;
    const newParent = oldId === rootId ? undefined : (idMap.get(oldParent) || undefined);

    try {
      const freshNode = query
        .parseSerializedNode({
          ...serialized,
          parent: newParent,
          nodes: newChildIds,
          linkedNodes: newLinkedNodes,
        })
        .toNode((n: Node) => {
          n.id = newId;
        });

      nodes[newId] = freshNode;
    } catch {
      return null;
    }
  }

  return { rootNodeId: newRootId, nodes };
}

export function KeyboardShortcuts() {
  const { actions, query } = useEditor();
  const clipboardNodes = useRef<SerializedNodes | null>(null);
  const clipboardRootId = useRef<string | null>(null);

  const getSelectedId = useCallback((): string | null => {
    const selected = query.getEvent("selected").first();
    return selected ?? null;
  }, [query]);

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  }, []);

  const getParentId = useCallback(
    (nodeId: string): string => {
      try {
        const n = query.node(nodeId).get();
        return n.data.parent || "ROOT";
      } catch {
        return "ROOT";
      }
    },
    [query]
  );

  const isLocked = useCallback(
    (nodeId: string): boolean => {
      try {
        const n = query.node(nodeId).get();
        return !!(n.data.custom as { locked?: boolean } | undefined)?.locked;
      } catch {
        return false;
      }
    },
    [query]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      const mod = e.metaKey || e.ctrlKey;

      // Undo
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        try { actions.history.undo(); } catch {}
        return;
      }

      // Redo (Cmd+Shift+Z or Cmd+Y)
      if ((mod && e.shiftKey && e.key === "z") || (mod && e.key === "y")) {
        e.preventDefault();
        try { actions.history.redo(); } catch {}
        return;
      }

      // Copy
      if (mod && e.key === "c") {
        const id = getSelectedId();
        if (!id) return;
        e.preventDefault();
        try {
          const serialized = JSON.parse(query.serialize());
          clipboardNodes.current = serialized;
          clipboardRootId.current = id;
        } catch {}
        return;
      }

      // Cut
      if (mod && e.key === "x") {
        const id = getSelectedId();
        if (!id) return;
        e.preventDefault();
        if (isLocked(id)) return;
        try {
          const serialized = JSON.parse(query.serialize());
          clipboardNodes.current = serialized;
          clipboardRootId.current = id;
          actions.delete(id);
        } catch {}
        return;
      }

      // Paste
      if (mod && e.key === "v") {
        if (!clipboardNodes.current || !clipboardRootId.current) return;
        e.preventDefault();
        try {
          const tree = cloneSubtree(clipboardNodes.current, clipboardRootId.current, query);
          if (!tree) return;

          const selectedId = getSelectedId();
          const parentId = selectedId ? getParentId(selectedId) : "ROOT";
          actions.addNodeTree(tree, parentId);
        } catch (err) {
          console.error("Paste failed:", err);
        }
        return;
      }

      // Duplicate
      if (mod && e.key === "d") {
        const id = getSelectedId();
        if (!id) return;
        e.preventDefault();
        try {
          const serialized = JSON.parse(query.serialize());
          const tree = cloneSubtree(serialized, id, query);
          if (!tree) return;

          const parentId = getParentId(id);
          actions.addNodeTree(tree, parentId);
        } catch (err) {
          console.error("Duplicate failed:", err);
        }
        return;
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        const id = getSelectedId();
        if (!id) return;
        e.preventDefault();
        if (isLocked(id)) return;
        try {
          if (query.node(id).isDeletable()) {
            actions.delete(id);
          }
        } catch {}
        return;
      }

      // Escape
      if (e.key === "Escape") {
        e.preventDefault();
        actions.selectNode(undefined as unknown as string);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, query, getSelectedId, isInputFocused, getParentId, isLocked]);

  return null;
}
