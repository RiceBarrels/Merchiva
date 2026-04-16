"use client";

import { useState, useCallback, useRef } from "react";
import { useEditor } from "@craftjs/core";
import { ChevronRight, ChevronDown, Eye, EyeOff, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Drag state (module-level to share between all LayerNode instances) ─────

// Exported so DropSection in left-panel can read the currently dragged node
export let draggedNodeId: string | null = null;

type LayerFilter = "all" | "scroll" | "fixed";

function isCraftFixed(nodeData: { type: unknown }): boolean {
  return typeof nodeData.type === "object" && nodeData.type !== null && "resolvedName" in nodeData.type
    && (nodeData.type as { resolvedName: string }).resolvedName === "CraftFixed";
}

interface LayerNodeProps {
  nodeId: string;
  depth: number;
  filter?: LayerFilter;
}

function LayerNode({ nodeId, depth, filter = "all" }: LayerNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dropPosition, setDropPosition] = useState<"above" | "inside" | "below" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const { node, selected, hovered, actions, query, childIds, isFixedNode } = useEditor(
    (state) => {
      const n = state.nodes[nodeId];
      if (!n) return { node: null, selected: false, hovered: false, childIds: [], isFixedNode: false };
      const resolvedName = typeof n.data.type === "object" && n.data.type !== null && "resolvedName" in n.data.type
        ? (n.data.type as { resolvedName: string }).resolvedName
        : "";
      return {
        node: n,
        selected: state.events.selected.has(nodeId),
        hovered: state.events.hovered.has(nodeId),
        childIds: n.data.nodes || [],
        isFixedNode: resolvedName === "CraftFixed",
      };
    }
  );

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      actions.selectNode(nodeId);
    },
    [actions, nodeId]
  );

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsed((prev) => !prev);
    },
    []
  );

  const handleToggleHidden = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!node) return;
      actions.setHidden(nodeId, !node.data.hidden);
    },
    [actions, nodeId, node]
  );

  // ─── Drag handlers ──────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      draggedNodeId = nodeId;
      e.dataTransfer.effectAllowed = "move";
      // Make the drag image semi-transparent
      if (rowRef.current) {
        e.dataTransfer.setDragImage(rowRef.current, 0, 0);
      }
    },
    [nodeId]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedNodeId || draggedNodeId === nodeId) {
        setDropPosition(null);
        return;
      }

      // Block fixed elements from being dragged over scroll targets
      try {
        const draggedNode = query.node(draggedNodeId).get();
        if (isCraftFixed(draggedNode.data)) {
          const getTopLevelAncestor = (nId: string): string => {
            const n = query.node(nId).get();
            if (!n.data.parent || n.data.parent === "ROOT") return nId;
            return getTopLevelAncestor(n.data.parent);
          };
          const topAncestor = getTopLevelAncestor(nodeId);
          if (!isCraftFixed(query.node(topAncestor).get().data)) {
            setDropPosition(null);
            e.dataTransfer.dropEffect = "none";
            return;
          }
        }
      } catch { /* ignore lookup errors */ }

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const h = rect.height;

      // Top 25%: above, middle 50%: inside (if canvas node), bottom 25%: below
      const isCanvas = node?.data.isCanvas;
      if (y < h * 0.25) {
        setDropPosition("above");
      } else if (y > h * 0.75) {
        setDropPosition("below");
      } else if (isCanvas) {
        setDropPosition("inside");
      } else {
        setDropPosition(y < h * 0.5 ? "above" : "below");
      }

      e.dataTransfer.dropEffect = "move";
    },
    [nodeId, node, query]
  );

  const handleDragLeave = useCallback(() => {
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropPosition(null);

      if (!draggedNodeId || draggedNodeId === nodeId || !node) return;

      try {
        // Check if the dragged node is an ancestor of target (prevent circular)
        const isAncestor = (ancestorId: string, descendantId: string): boolean => {
          const n = query.node(descendantId).get();
          if (!n.data.parent) return false;
          if (n.data.parent === ancestorId) return true;
          return isAncestor(ancestorId, n.data.parent);
        };

        if (isAncestor(draggedNodeId, nodeId)) return;

        // Prevent fixed elements from being dropped into the scroll section
        const draggedNode = query.node(draggedNodeId).get();
        if (isCraftFixed(draggedNode.data)) {
          const getTopLevelAncestor = (nId: string): string => {
            const n = query.node(nId).get();
            if (!n.data.parent || n.data.parent === "ROOT") return nId;
            return getTopLevelAncestor(n.data.parent);
          };
          const topAncestor = getTopLevelAncestor(nodeId);
          if (!isCraftFixed(query.node(topAncestor).get().data)) return;
        }

        const parentId = node.data.parent || "ROOT";

        if (dropPosition === "inside" && node.data.isCanvas) {
          // Move into this node as last child
          actions.move(draggedNodeId, nodeId, childIds.length);
        } else if (dropPosition === "above") {
          // Move before this node in its parent
          const parentNode = query.node(parentId).get();
          const siblings = parentNode.data.nodes || [];
          const idx = siblings.indexOf(nodeId);
          actions.move(draggedNodeId, parentId, Math.max(0, idx));
        } else if (dropPosition === "below") {
          // Move after this node in its parent
          const parentNode = query.node(parentId).get();
          const siblings = parentNode.data.nodes || [];
          const idx = siblings.indexOf(nodeId);
          actions.move(draggedNodeId, parentId, idx + 1);
        }
      } catch (err) {
        console.error("Layer drag failed:", err);
      }

      draggedNodeId = null;
    },
    [nodeId, node, dropPosition, actions, query, childIds]
  );

  const handleDragEnd = useCallback(() => {
    draggedNodeId = null;
    setDropPosition(null);
  }, []);

  if (!node) return null;

  const displayName =
    node.data.custom?.displayName ||
    node.data.displayName ||
    (typeof node.data.type === "object" &&
    node.data.type !== null &&
    "resolvedName" in node.data.type
      ? (node.data.type as { resolvedName: string }).resolvedName.replace("Craft", "")
      : "Element");

  const hasChildren = childIds.length > 0;
  const isHidden = node.data.hidden;
  const isRoot = nodeId === "ROOT";

  if (isRoot) {
    return (
      <>
        {childIds.map((childId: string) => (
          <LayerNode key={childId} nodeId={childId} depth={0} filter={filter} />
        ))}
      </>
    );
  }

  // Filter: at top level (depth 0), check if this node matches the filter
  if (depth === 0 && filter === "scroll" && isFixedNode) return null;
  if (depth === 0 && filter === "fixed" && !isFixedNode) return null;

  return (
    <div>
      <div
        ref={rowRef}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        className={cn(
          "group relative flex h-7 cursor-pointer items-center gap-0.5 rounded-[0.3rem] pr-1 text-xs transition-colors",
          selected
            ? "bg-accent text-accent-foreground"
            : hovered
              ? "bg-accent/50 text-foreground"
              : "text-foreground hover:bg-accent/30",
          isHidden && "opacity-40",
          draggedNodeId === nodeId && "opacity-30"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleSelect}
      >
        {/* Drop indicator lines */}
        {dropPosition === "above" && (
          <div className="absolute left-0 right-0 top-0 h-0.5 bg-primary rounded-full" />
        )}
        {dropPosition === "below" && (
          <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full" />
        )}
        {dropPosition === "inside" && (
          <div className="absolute inset-0 rounded-[0.3rem] border-2 border-primary pointer-events-none" />
        )}

        {/* Drag handle */}
        <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 active:cursor-grabbing" />

        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        {/* Node name */}
        <span className="flex-1 truncate">{displayName}</span>

        {/* Visibility toggle */}
        <button
          onClick={handleToggleHidden}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground",
            isHidden ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            "hover:text-foreground"
          )}
        >
          {isHidden ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div>
          {childIds.map((childId: string) => (
            <LayerNode key={childId} nodeId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LayerTree({ filter = "all" }: { filter?: LayerFilter }) {
  return (
    <div className="space-y-0.5">
      <LayerNode nodeId="ROOT" depth={0} filter={filter} />
    </div>
  );
}
