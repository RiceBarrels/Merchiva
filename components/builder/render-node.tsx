"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNode, useEditor } from "@craftjs/core";
import { ROOT_NODE } from "@craftjs/utils";
import { ArrowUp, GripVertical, Trash2 } from "lucide-react";

// ─── Resize handles ────────────────────────────────────────────────────────

type HandlePosition = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  ne: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", sw: "nesw-resize",
};

function ResizeHandles({
  dom,
  onResize,
}: {
  dom: HTMLElement;
  onResize: (dw: number, dh: number) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dragging = useRef<{ handle: HandlePosition; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Track element rect
  useEffect(() => {
    const update = () => setRect(dom.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dom);
    const canvas = document.querySelector("[data-craft-canvas]");
    canvas?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      canvas?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [dom]);

  const handleMouseDown = useCallback(
    (handle: HandlePosition, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = dom.getBoundingClientRect();
      dragging.current = { handle, startX: e.clientX, startY: e.clientY, startW: r.width, startH: r.height };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const { handle: h, startX, startY, startW, startH } = dragging.current;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (h.includes("e")) newW = Math.max(20, startW + dx);
        if (h.includes("w")) newW = Math.max(20, startW - dx);
        if (h.includes("s")) newH = Math.max(20, startH + dy);
        if (h.includes("n")) newH = Math.max(20, startH - dy);

        // Live preview
        if (h.includes("e") || h.includes("w")) dom.style.width = `${newW}px`;
        if (h.includes("s") || h.includes("n")) dom.style.height = `${newH}px`;

        setRect(dom.getBoundingClientRect());
      };

      const onMouseUp = () => {
        if (!dragging.current) return;
        const r2 = dom.getBoundingClientRect();
        const dw = r2.width - dragging.current.startW;
        const dh = r2.height - dragging.current.startH;
        dragging.current = null;
        onResize(r2.width, r2.height);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [dom, onResize]
  );

  if (!rect) return null;

  const handles: { pos: HandlePosition; style: React.CSSProperties }[] = [
    // Corners
    { pos: "nw", style: { left: rect.left - 3, top: rect.top - 3 } },
    { pos: "ne", style: { left: rect.right - 3, top: rect.top - 3 } },
    { pos: "sw", style: { left: rect.left - 3, top: rect.bottom - 3 } },
    { pos: "se", style: { left: rect.right - 3, top: rect.bottom - 3 } },
    // Edges
    { pos: "n", style: { left: rect.left + rect.width / 2 - 3, top: rect.top - 3 } },
    { pos: "s", style: { left: rect.left + rect.width / 2 - 3, top: rect.bottom - 3 } },
    { pos: "w", style: { left: rect.left - 3, top: rect.top + rect.height / 2 - 3 } },
    { pos: "e", style: { left: rect.right - 3, top: rect.top + rect.height / 2 - 3 } },
  ];

  return ReactDOM.createPortal(
    <>
      {handles.map((h) => (
        <div
          key={h.pos}
          onMouseDown={(e) => handleMouseDown(h.pos, e)}
          style={{
            position: "fixed",
            width: 6,
            height: 6,
            background: "white",
            border: "1px solid #3b82f6",
            borderRadius: 1,
            cursor: HANDLE_CURSORS[h.pos],
            zIndex: 9998,
            ...h.style,
          }}
        />
      ))}
    </>,
    document.body
  );
}

// ─── RenderNode ─────────────────────────────────────────────────────────────

export function RenderNode({ render }: { render: React.ReactElement }) {
  const { id } = useNode();
  const { actions, query, isActive } = useEditor((_, query) => ({
    isActive: query.getEvent("selected").contains(id),
  }));

  const {
    isHover,
    dom,
    name,
    moveable,
    deletable,
    connectors: { drag },
    parent,
    nodeStyle,
    isFixedNode,
    fixedX,
    fixedY,
    fixedZIndex,
  } = useNode((node) => {
    const resolvedName = typeof node.data.type === "object" && node.data.type !== null && "resolvedName" in node.data.type
      ? (node.data.type as { resolvedName: string }).resolvedName : "";
    return {
      isHover: node.events.hovered,
      dom: node.dom,
      name: node.data.custom?.displayName || node.data.displayName,
      moveable: query.node(node.id).isDraggable(),
      deletable: query.node(node.id).isDeletable(),
      parent: node.data.parent,
      nodeStyle: (node.data.props?.style as Record<string, string>) || null,
      isFixedNode: resolvedName === "CraftFixed",
      fixedX: (node.data.props?.x as number) ?? 0,
      fixedY: (node.data.props?.y as number) ?? 0,
      fixedZIndex: (node.data.props?.zIndex as number) ?? 100,
    };
  });

  // Apply props.style from Design Panel to DOM.
  // Skip typography keys — those are handled by each component reading props.style directly.
  const SKIP_KEYS = new Set(["fontFamily", "fontSize", "fontWeight", "color", "textAlign", "lineHeight", "letterSpacing"]);
  const prevAppliedKeys = useRef<string[]>([]);

  useEffect(() => {
    if (!dom) return;
    for (const key of prevAppliedKeys.current) {
      if (!nodeStyle || !(key in nodeStyle)) {
        dom.style.setProperty(key.replace(/([A-Z])/g, "-$1").toLowerCase(), "");
      }
    }
    if (nodeStyle) {
      const keys: string[] = [];
      for (const [key, value] of Object.entries(nodeStyle)) {
        if (value && !SKIP_KEYS.has(key)) {
          const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
          // In editor: convert fixed → absolute (relative to canvas, not viewport)
          if (key === "position" && value === "fixed") {
            dom.style.setProperty(cssKey, "absolute");
          } else {
            dom.style.setProperty(cssKey, value);
          }
          keys.push(key);
        }
      }
      prevAppliedKeys.current = keys;
    } else {
      prevAppliedKeys.current = [];
    }
  }, [dom, nodeStyle]);

  // Apply absolute positioning for CraftFixed nodes in the editor
  useEffect(() => {
    if (!dom || !isFixedNode) return;
    dom.style.position = "absolute";
    dom.style.left = `${fixedX}px`;
    dom.style.top = `${fixedY}px`;
    dom.style.zIndex = `${fixedZIndex}`;
  }, [dom, isFixedNode, fixedX, fixedY, fixedZIndex]);

  // Selection/hover outline
  useEffect(() => {
    if (!dom) return;
    if (isActive) {
      dom.style.outline = "2px solid #3b82f6";
      dom.style.outlineOffset = "-1px";
    } else if (isHover) {
      dom.style.outline = "1px solid #93c5fd";
      dom.style.outlineOffset = "-1px";
    } else {
      dom.style.outline = "";
      dom.style.outlineOffset = "";
    }
  }, [dom, isActive, isHover]);

  // ─── Direct drag for CraftFixed elements ─────────────────────────────────
  const fixedDragging = useRef<{ startX: number; startY: number; startPropX: number; startPropY: number } | null>(null);

  useEffect(() => {
    if (!dom || !isFixedNode || !isActive) return;

    const onMouseDown = (e: MouseEvent) => {
      // Don't intercept if clicking on resize handles or toolbar
      if ((e.target as HTMLElement).closest("[data-resize-handle]") || (e.target as HTMLElement).closest("[data-node-toolbar]")) return;

      e.stopPropagation();
      fixedDragging.current = { startX: e.clientX, startY: e.clientY, startPropX: fixedX, startPropY: fixedY };

      const onMouseMove = (ev: MouseEvent) => {
        if (!fixedDragging.current) return;
        const dx = ev.clientX - fixedDragging.current.startX;
        const dy = ev.clientY - fixedDragging.current.startY;
        // Live preview
        dom.style.left = `${fixedDragging.current.startPropX + dx}px`;
        dom.style.top = `${fixedDragging.current.startPropY + dy}px`;
      };

      const onMouseUp = () => {
        if (!fixedDragging.current) return;
        const finalX = fixedDragging.current.startPropX + (parseInt(dom.style.left) - fixedDragging.current.startPropX);
        const finalY = fixedDragging.current.startPropY + (parseInt(dom.style.top) - fixedDragging.current.startPropY);
        fixedDragging.current = null;

        // Commit x/y to CraftFixed props
        actions.setProp(id, (props: Record<string, unknown>) => {
          props.x = Math.round(parseFloat(dom.style.left) || 0);
          props.y = Math.round(parseFloat(dom.style.top) || 0);
        });

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    dom.style.cursor = "move";
    dom.addEventListener("mousedown", onMouseDown);
    return () => {
      dom.style.cursor = "";
      dom.removeEventListener("mousedown", onMouseDown);
    };
  }, [dom, isFixedNode, isActive, actions, id, fixedX, fixedY]);

  // Handle resize commit
  const handleResize = useCallback(
    (newW: number, newH: number) => {
      actions.setProp(id, (props: Record<string, unknown>) => {
        const s = (props.style as Record<string, string>) || {};
        s.width = `${Math.round(newW)}px`;
        s.height = `${Math.round(newH)}px`;
        props.style = { ...s };
      });
    },
    [actions, id]
  );

  // Floating indicator
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  const getPos = useCallback((el: HTMLElement | null) => {
    if (!el) return { top: "0px", left: "0px" };
    const rect = el.getBoundingClientRect();
    return {
      top: `${rect.top > 0 ? rect.top : rect.bottom}px`,
      left: `${rect.left}px`,
    };
  }, []);

  useEffect(() => {
    const container = document.querySelector("[data-craft-canvas]");
    if (!container) return;
    const onScroll = () => {
      if (!indicatorRef.current || !dom) return;
      const pos = getPos(dom);
      indicatorRef.current.style.top = pos.top;
      indicatorRef.current.style.left = pos.left;
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [dom, getPos]);

  const isRoot = id === ROOT_NODE;

  return (
    <>
      {/* Floating name + actions toolbar */}
      {(isHover || isActive) && dom && !isRoot
        ? ReactDOM.createPortal(
            <div
              ref={indicatorRef}
              className="fixed z-[9999] flex h-6 items-center gap-0.5 rounded-b-sm bg-blue-500 px-1.5 text-white shadow-sm"
              style={{
                left: getPos(dom).left,
                top: getPos(dom).top,
                marginTop: -24,
                fontSize: 11,
                lineHeight: "11px",
              }}
            >
              <span className="mr-1 truncate font-medium" style={{ maxWidth: 100 }}>
                {name}
              </span>
              {moveable && (
                <button
                  ref={(r) => { if (r) drag(r); }}
                  className="flex h-5 w-5 cursor-grab items-center justify-center rounded hover:bg-blue-600 active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3" />
                </button>
              )}
              {parent && (
                <button
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-blue-600"
                  onClick={() => actions.selectNode(parent)}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
              )}
              {deletable && (
                <button
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded hover:bg-red-500"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    actions.delete(id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>,
            document.body
          )
        : null}

      {/* Resize handles (only on selected, non-root) */}
      {isActive && dom && !isRoot && (
        <ResizeHandles dom={dom} onResize={handleResize} />
      )}

      {render}
    </>
  );
}
