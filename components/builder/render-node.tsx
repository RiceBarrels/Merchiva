"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNode, useEditor } from "@craftjs/core";
import { ROOT_NODE } from "@craftjs/utils";
import { ArrowUp, GripVertical, Trash2 } from "lucide-react";

// ─── Pointer helpers (mouse + touch) ───────────────────────────────────────

function getPointerCoords(e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent): { clientX: number; clientY: number } | null {
  if ("touches" in e) {
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return null;
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  return { clientX: (e as MouseEvent).clientX, clientY: (e as MouseEvent).clientY };
}

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

  const startResize = useCallback(
    (handle: HandlePosition, clientX: number, clientY: number) => {
      const r = dom.getBoundingClientRect();
      dragging.current = { handle, startX: clientX, startY: clientY, startW: r.width, startH: r.height };

      const onPointerMove = (ev: MouseEvent | TouchEvent) => {
        if (!dragging.current) return;
        const coords = getPointerCoords(ev);
        if (!coords) return;
        const { handle: h, startX, startY, startW, startH } = dragging.current;
        const dx = coords.clientX - startX;
        const dy = coords.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (h.includes("e")) newW = Math.max(20, startW + dx);
        if (h.includes("w")) newW = Math.max(20, startW - dx);
        if (h.includes("s")) newH = Math.max(20, startH + dy);
        if (h.includes("n")) newH = Math.max(20, startH - dy);

        if (h.includes("e") || h.includes("w")) dom.style.width = `${newW}px`;
        if (h.includes("s") || h.includes("n")) dom.style.height = `${newH}px`;

        setRect(dom.getBoundingClientRect());
      };

      const onPointerUp = () => {
        if (!dragging.current) return;
        dragging.current = null;
        onResize(dom.getBoundingClientRect().width, dom.getBoundingClientRect().height);
        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        document.removeEventListener("touchmove", onPointerMove);
        document.removeEventListener("touchend", onPointerUp);
      };

      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
    },
    [dom, onResize]
  );

  const handleMouseDown = useCallback(
    (handle: HandlePosition, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startResize(handle, e.clientX, e.clientY);
    },
    [startResize]
  );

  const handleTouchStart = useCallback(
    (handle: HandlePosition, e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      startResize(handle, touch.clientX, touch.clientY);
    },
    [startResize]
  );

  if (!rect) return null;

  const handleSize = "ontouchstart" in window ? 14 : 6;
  const handleOffset = handleSize / 2;

  const handles: { pos: HandlePosition; style: React.CSSProperties }[] = [
    { pos: "nw", style: { left: rect.left - handleOffset, top: rect.top - handleOffset } },
    { pos: "ne", style: { left: rect.right - handleOffset, top: rect.top - handleOffset } },
    { pos: "sw", style: { left: rect.left - handleOffset, top: rect.bottom - handleOffset } },
    { pos: "se", style: { left: rect.right - handleOffset, top: rect.bottom - handleOffset } },
    { pos: "n", style: { left: rect.left + rect.width / 2 - handleOffset, top: rect.top - handleOffset } },
    { pos: "s", style: { left: rect.left + rect.width / 2 - handleOffset, top: rect.bottom - handleOffset } },
    { pos: "w", style: { left: rect.left - handleOffset, top: rect.top + rect.height / 2 - handleOffset } },
    { pos: "e", style: { left: rect.right - handleOffset, top: rect.top + rect.height / 2 - handleOffset } },
  ];

  return ReactDOM.createPortal(
    <>
      {handles.map((h) => (
        <div
          key={h.pos}
          onMouseDown={(e) => handleMouseDown(h.pos, e)}
          onTouchStart={(e) => handleTouchStart(h.pos, e)}
          style={{
            position: "fixed",
            width: handleSize,
            height: handleSize,
            background: "white",
            border: "1px solid #3b82f6",
            borderRadius: 1,
            cursor: HANDLE_CURSORS[h.pos],
            zIndex: 9998,
            touchAction: "none",
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
    isStylePositioned,
    fixedX,
    fixedY,
    fixedZIndex,
  } = useNode((node) => {
    const resolvedName = typeof node.data.type === "object" && node.data.type !== null && "resolvedName" in node.data.type
      ? (node.data.type as { resolvedName: string }).resolvedName : "";
    const style = (node.data.props?.style as Record<string, string> | undefined) || {};
    return {
      isHover: node.events.hovered,
      dom: node.dom,
      name: node.data.custom?.displayName || node.data.displayName,
      moveable: query.node(node.id).isDraggable(),
      deletable: query.node(node.id).isDeletable(),
      parent: node.data.parent,
      nodeStyle: (node.data.props?.style as Record<string, string>) || null,
      isFixedNode: resolvedName === "CraftFixed",
      isStylePositioned: resolvedName !== "CraftFixed" && (style.position === "fixed" || style.position === "absolute"),
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

  // ─── Direct drag for style-positioned elements (position: fixed/absolute) ──
  const styleDragging = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  useEffect(() => {
    if (!dom || !isStylePositioned || !isActive) return;

    const startDrag = (clientX: number, clientY: number) => {
      const startLeft = parseFloat(dom.style.left) || 0;
      const startTop = parseFloat(dom.style.top) || 0;
      styleDragging.current = { startX: clientX, startY: clientY, startLeft, startTop };

      const onPointerMove = (ev: MouseEvent | TouchEvent) => {
        if (!styleDragging.current) return;
        const coords = getPointerCoords(ev);
        if (!coords) return;
        if ("cancelable" in ev && ev.cancelable) ev.preventDefault();
        const dx = coords.clientX - styleDragging.current.startX;
        const dy = coords.clientY - styleDragging.current.startY;
        dom.style.left = `${styleDragging.current.startLeft + dx}px`;
        dom.style.top = `${styleDragging.current.startTop + dy}px`;
      };

      const onPointerUp = () => {
        if (!styleDragging.current) return;
        const finalLeft = Math.round(parseFloat(dom.style.left) || 0);
        const finalTop = Math.round(parseFloat(dom.style.top) || 0);
        styleDragging.current = null;

        actions.setProp(id, (props: Record<string, unknown>) => {
          const s = (props.style as Record<string, string>) || {};
          s.left = `${finalLeft}px`;
          s.top = `${finalTop}px`;
          delete s.right;
          delete s.bottom;
          props.style = { ...s };
        });

        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        document.removeEventListener("touchmove", onPointerMove);
        document.removeEventListener("touchend", onPointerUp);
      };

      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-resize-handle]") || (e.target as HTMLElement).closest("[data-node-toolbar]")) return;
      e.stopPropagation();
      startDrag(e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("[data-resize-handle]") || (e.target as HTMLElement).closest("[data-node-toolbar]")) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      startDrag(touch.clientX, touch.clientY);
    };

    dom.style.cursor = "move";
    dom.style.touchAction = "none";
    dom.addEventListener("mousedown", onMouseDown);
    dom.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      dom.style.cursor = "";
      dom.style.touchAction = "";
      dom.removeEventListener("mousedown", onMouseDown);
      dom.removeEventListener("touchstart", onTouchStart);
    };
  }, [dom, isStylePositioned, isActive, actions, id]);

  // ─── Direct drag for CraftFixed elements ─────────────────────────────────
  const fixedDragging = useRef<{ startX: number; startY: number; startPropX: number; startPropY: number } | null>(null);

  useEffect(() => {
    if (!dom || !isFixedNode || !isActive) return;

    const startDrag = (clientX: number, clientY: number) => {
      fixedDragging.current = { startX: clientX, startY: clientY, startPropX: fixedX, startPropY: fixedY };

      const onPointerMove = (ev: MouseEvent | TouchEvent) => {
        if (!fixedDragging.current) return;
        const coords = getPointerCoords(ev);
        if (!coords) return;
        if ("cancelable" in ev && ev.cancelable) ev.preventDefault();
        const dx = coords.clientX - fixedDragging.current.startX;
        const dy = coords.clientY - fixedDragging.current.startY;
        dom.style.left = `${fixedDragging.current.startPropX + dx}px`;
        dom.style.top = `${fixedDragging.current.startPropY + dy}px`;
      };

      const onPointerUp = () => {
        if (!fixedDragging.current) return;
        fixedDragging.current = null;

        actions.setProp(id, (props: Record<string, unknown>) => {
          props.x = Math.round(parseFloat(dom.style.left) || 0);
          props.y = Math.round(parseFloat(dom.style.top) || 0);
        });

        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        document.removeEventListener("touchmove", onPointerMove);
        document.removeEventListener("touchend", onPointerUp);
      };

      document.addEventListener("mousemove", onPointerMove);
      document.addEventListener("mouseup", onPointerUp);
      document.addEventListener("touchmove", onPointerMove, { passive: false });
      document.addEventListener("touchend", onPointerUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-resize-handle]") || (e.target as HTMLElement).closest("[data-node-toolbar]")) return;
      e.stopPropagation();
      startDrag(e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest("[data-resize-handle]") || (e.target as HTMLElement).closest("[data-node-toolbar]")) return;
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      if (!touch) return;
      startDrag(touch.clientX, touch.clientY);
    };

    dom.style.cursor = "move";
    dom.style.touchAction = "none";
    dom.addEventListener("mousedown", onMouseDown);
    dom.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      dom.style.cursor = "";
      dom.style.touchAction = "";
      dom.removeEventListener("mousedown", onMouseDown);
      dom.removeEventListener("touchstart", onTouchStart);
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
              className="fixed z-[9999] flex h-6 items-center gap-0.5 rounded-t-sm bg-blue-500 px-1.5 text-white shadow-sm"
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
