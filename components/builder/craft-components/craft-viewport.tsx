"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import { ViewportSettings } from "../craft-settings/viewport-settings";
import type React from "react";

type ViewportDirection = "stack" | "row" | "grid" | "free";

interface CraftViewportProps {
  viewportName: string;
  viewportWidth: number;
  direction: ViewportDirection;
  spacing: string;
  align: string;
  padding: string;
  backgroundColor: string;
  children?: React.ReactNode;
}

const gapMap: Record<string, string> = {
  small: "8px",
  medium: "16px",
  large: "24px",
};

function resolveGap(spacing: string): string {
  return gapMap[spacing] ?? spacing;
}

function getDirectionStyles(
  direction: ViewportDirection,
  gap: string,
  align: string
): React.CSSProperties {
  switch (direction) {
    case "stack":
      return {
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: align,
      };
    case "row":
      return {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
        alignItems: align,
      };
    case "grid":
      return {
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap,
        alignItems: align,
      };
    case "free":
      return {
        position: "relative",
      };
  }
}

export const CraftViewport: UserComponent<CraftViewportProps> = ({
  viewportWidth,
  direction,
  spacing,
  align,
  padding,
  backgroundColor,
  children,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  const gap = resolveGap(spacing);
  const directionStyles = getDirectionStyles(direction, gap, align);

  return (
    <div
      ref={(ref: HTMLElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        ...directionStyles,
        width: `${viewportWidth}px`,
        maxWidth: "100%",
        minHeight: "400px",
        padding,
        backgroundColor: backgroundColor || undefined,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
};

CraftViewport.craft = {
  displayName: "Viewport",
  isCanvas: true,
  props: {
    viewportName: "Desktop",
    viewportWidth: 1280,
    direction: "stack",
    spacing: "0px",
    align: "stretch",
    padding: "0",
    backgroundColor: "#ffffff",
  },
  related: { settings: ViewportSettings },
};
