"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import type React from "react";

interface CraftCanvasProps {
  children?: React.ReactNode;
}

export const CraftCanvas: UserComponent<CraftCanvasProps> = ({ children }) => {
  const {
    connectors: { connect },
  } = useNode();

  // Check if canvas has children by inspecting React children
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div
      ref={(ref: HTMLElement | null) => {
        if (ref) connect(ref);
      }}
      style={{
        position: "relative",
        minHeight: 400,
        padding: "1rem",
        background: "#ffffff",
        borderRadius: "0.3rem",
        border: isEmpty ? "2px dashed #d4d4d8" : "1px solid #e5e7eb",
      }}
    >
      {isEmpty ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 360,
            color: "#a1a1aa",
            fontSize: "0.875rem",
          }}
        >
          Drag elements here
        </div>
      ) : (
        children
      )}
    </div>
  );
};

CraftCanvas.craft = {
  displayName: "Canvas",
  isCanvas: true,
  props: {},
};
