"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import { FixedSettings } from "../craft-settings/fixed-settings";
import React from "react";

type LayoutDirection = "stack" | "row" | "grid";

interface CraftFixedProps {
  x: number;
  y: number;
  zIndex: number;
  direction: LayoutDirection;
  spacing: string;
  align: string;
  justify: string;
  padding: string;
  backgroundColor: string;
  columns: number;
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
  direction: LayoutDirection,
  gap: string,
  align: string,
  justify: string,
  columns: number
): React.CSSProperties {
  switch (direction) {
    case "stack":
      return {
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: align,
        justifyContent: justify || undefined,
      };
    case "row":
      return {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        gap,
        alignItems: align,
        justifyContent: justify || undefined,
      };
    case "grid":
      return {
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap,
        alignItems: align,
        justifyContent: justify || undefined,
      };
  }
}

export const CraftFixed: UserComponent<CraftFixedProps> = ({
  x,
  y,
  zIndex,
  direction,
  spacing,
  align,
  justify,
  padding,
  backgroundColor,
  columns,
  children,
}) => {
  const {
    connectors: { connect, drag },
    nodeStyle,
  } = useNode((node) => ({
    nodeStyle: (node.data.props?.style as Record<string, string>) || null,
  }));

  const gap = resolveGap(spacing);
  const directionStyles = getDirectionStyles(direction, gap, align, justify, columns);

  return (
    <div
      ref={(ref: HTMLElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        ...directionStyles,
        padding,
        backgroundColor: backgroundColor || undefined,
        minHeight: "40px",
        // Fixed positioning is applied by RenderNode as absolute (in editor)
        // x/y are applied by RenderNode via style.left/style.top
        color: nodeStyle?.color || undefined,
        fontFamily: nodeStyle?.fontFamily || undefined,
        fontSize: nodeStyle?.fontSize || undefined,
        fontWeight: nodeStyle?.fontWeight || undefined,
        textAlign: (nodeStyle?.textAlign as React.CSSProperties["textAlign"]) || undefined,
        lineHeight: nodeStyle?.lineHeight || undefined,
        letterSpacing: nodeStyle?.letterSpacing || undefined,
      }}
      data-fixed-element
    >
      {children}
    </div>
  );
};

CraftFixed.craft = {
  displayName: "Fixed",
  isCanvas: true,
  props: {
    x: 0,
    y: 0,
    zIndex: 100,
    direction: "stack",
    spacing: "medium",
    align: "stretch",
    justify: "flex-start",
    padding: "1rem",
    backgroundColor: "",
    columns: 2,
  },
  related: { settings: FixedSettings },
};
