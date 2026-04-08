"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { clampZoom } from "./canvas-utils";

const CANVAS_W = 1920;
const CANVAS_H = 4000;

type Props = {
  children: React.ReactNode; // content layer children
  controls: React.ReactNode; // controls layer children
  zoom: number;
  panX: number;
  panY: number;
  onZoomChange: (z: number) => void;
  onPanChange: (x: number, y: number) => void;
  onCanvasClick: () => void; // deselect
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
};

export function CanvasViewport({
  children,
  controls,
  zoom,
  panX,
  panY,
  onZoomChange,
  onPanChange,
  onCanvasClick,
  onPointerMove,
  onPointerUp,
  onContextMenu,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const spaceDown = useRef(false);

  // Wheel → zoom (cursor-centered)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (trackpad) or ctrl+scroll
        const factor = 1 - e.deltaY * 0.01;
        const newZoom = clampZoom(zoom * factor);
        // Keep point under cursor stable
        const cursorX = (e.clientX - rect.left) / zoom + panX;
        const cursorY = (e.clientY - rect.top) / zoom + panY;
        const newPanX = cursorX - (e.clientX - rect.left) / newZoom;
        const newPanY = cursorY - (e.clientY - rect.top) / newZoom;
        onZoomChange(newZoom);
        onPanChange(newPanX, newPanY);
      } else {
        // Regular scroll → pan
        onPanChange(panX + e.deltaX / zoom, panY + e.deltaY / zoom);
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoom, panX, panY, onZoomChange, onPanChange]);

  // Space key for panning mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        spaceDown.current = true;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceDown.current = false;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Middle click or space+left click → start pan
      if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
        e.preventDefault();
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [panX, panY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        onPanChange(
          panStart.current.panX - dx / zoom,
          panStart.current.panY - dy / zoom
        );
        return;
      }
      onPointerMove(e);
    },
    [zoom, onPanChange, onPointerMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning.current) {
        isPanning.current = false;
        return;
      }
      onPointerUp(e);
    },
    [onPointerUp]
  );

  const transform = `scale(${zoom}) translate(${-panX}px, ${-panY}px)`;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ cursor: spaceDown.current || isPanning.current ? "grab" : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCanvasClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
    >

      {/* Transform wrapper — applies zoom+pan to both layers */}
      <div
        data-canvas-transform
        style={{
          transform,
          transformOrigin: "0 0",
          width: CANVAS_W,
          height: CANVAS_H,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* Content layer — no pointer events */}
        <div className="absolute inset-0 pointer-events-none">
          {children}
        </div>

        {/* Controls layer — pointer events on individual handles */}
        <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {controls}
        </div>
      </div>

      {/* Zoom controls overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-sm shadow-sm px-1 py-0.5 z-10">
        <button
          onClick={() => onZoomChange(clampZoom(zoom / 1.2))}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors text-xs font-mono"
        >
          -
        </button>
        <button
          onClick={() => { onZoomChange(1); onPanChange(0, 0); }}
          className="px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors min-w-[42px] text-center"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(clampZoom(zoom * 1.2))}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors text-xs font-mono"
        >
          +
        </button>
      </div>
    </div>
  );
}
