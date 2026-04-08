"use client";

import type { SiteElement } from "@/lib/types";
import type { DragOffset } from "./use-canvas-drag";

type SelectionProps = {
  element: SiteElement;
  zoom: number;
  offset: DragOffset | null; // transient modifier during drag
};

export function SelectionOutline({ element, zoom, offset }: SelectionProps) {
  const x = (element.x ?? 0) + (offset?.dx ?? 0);
  const y = (element.y ?? 0) + (offset?.dy ?? 0);
  const w = (element.width ?? 100) + (offset?.dw ?? 0);
  const h = (element.height ?? 100) + (offset?.dh ?? 0);

  const borderW = 1.5 / zoom;

  return (
    <>
      {/* Selection border */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          border: `${borderW}px solid #3b82f6`,
        }}
      />
      {/* Type label */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: x,
          top: y - 18 / zoom,
          fontSize: 10 / zoom,
          lineHeight: `${16 / zoom}px`,
          padding: `${1 / zoom}px ${4 / zoom}px`,
          backgroundColor: "#3b82f6",
          color: "#fff",
          borderRadius: 2 / zoom,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {element.type}
      </div>
      {/* Size label */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: x + w / 2,
          top: y + h + 4 / zoom,
          transform: "translateX(-50%)",
          fontSize: 9 / zoom,
          lineHeight: `${14 / zoom}px`,
          padding: `${1 / zoom}px ${4 / zoom}px`,
          backgroundColor: "#3b82f6",
          color: "#fff",
          borderRadius: 2 / zoom,
          fontWeight: 400,
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(w)} x {Math.round(h)}
      </div>
    </>
  );
}

// 8 resize handles: 4 corners + 4 edges
const HANDLES = [
  { id: "tl", cursor: "nwse-resize", ax: 0, ay: 0 },
  { id: "t",  cursor: "ns-resize",   ax: 0.5, ay: 0 },
  { id: "tr", cursor: "nesw-resize", ax: 1, ay: 0 },
  { id: "r",  cursor: "ew-resize",   ax: 1, ay: 0.5 },
  { id: "br", cursor: "nwse-resize", ax: 1, ay: 1 },
  { id: "b",  cursor: "ns-resize",   ax: 0.5, ay: 1 },
  { id: "bl", cursor: "nesw-resize", ax: 0, ay: 1 },
  { id: "l",  cursor: "ew-resize",   ax: 0, ay: 0.5 },
];

type HandleProps = {
  element: SiteElement;
  zoom: number;
  offset: DragOffset | null;
  onResizeStart: (e: React.PointerEvent, handle: string) => void;
};

export function ResizeHandles({ element, zoom, offset, onResizeStart }: HandleProps) {
  const x = (element.x ?? 0) + (offset?.dx ?? 0);
  const y = (element.y ?? 0) + (offset?.dy ?? 0);
  const w = (element.width ?? 100) + (offset?.dw ?? 0);
  const h = (element.height ?? 100) + (offset?.dh ?? 0);

  const size = 8 / zoom;

  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.id}
          className="absolute bg-white border border-blue-500"
          style={{
            pointerEvents: "auto",
            left: x + w * handle.ax - size / 2,
            top: y + h * handle.ay - size / 2,
            width: size,
            height: size,
            cursor: handle.cursor,
            borderWidth: 1 / zoom,
            borderRadius: handle.id.length === 2 ? 0 : size / 2, // corners square, edges round
          }}
          onPointerDown={(e) => onResizeStart(e, handle.id)}
        />
      ))}
    </>
  );
}

type HitAreaProps = {
  element: SiteElement;
  isSelected: boolean;
  isHovered: boolean;
  zoom: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

export function ElementHitArea({
  element,
  isSelected,
  isHovered,
  zoom,
  onPointerDown,
  onDoubleClick,
  onPointerEnter,
  onPointerLeave,
}: HitAreaProps) {
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const w = element.width ?? 100;
  const h = element.height ?? 100;

  return (
    <div
      className="absolute"
      style={{
        pointerEvents: "auto",
        left: x,
        top: y,
        width: w,
        height: h,
        cursor: "default",
        outline: isHovered && !isSelected ? `${1 / zoom}px solid #93c5fd` : undefined,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
  );
}
