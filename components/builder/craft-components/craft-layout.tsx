"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import { LayoutSettings } from "../craft-settings/layout-settings";
import React from "react";

type LayoutDirection = "stack" | "row" | "grid" | "free";

interface CraftLayoutProps {
  tag: string;
  href: string;
  direction: LayoutDirection;
  spacing: string;
  align: string;
  justify: string;
  padding: string;
  backgroundColor: string;
  columns: number;
  borderRadius: string;
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
    case "free":
      return {
        position: "relative",
      };
  }
}

export const CraftLayout: UserComponent<CraftLayoutProps> = ({
  tag,
  href,
  direction,
  spacing,
  align,
  justify,
  padding,
  backgroundColor,
  columns,
  borderRadius,
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

  const element = tag || "div";
  const isLink = element === "a";

  const elementProps: Record<string, unknown> = {
    ref: (ref: HTMLElement | null) => {
      if (ref) connect(drag(ref));
    },
    style: {
      ...directionStyles,
      padding,
      backgroundColor: backgroundColor || undefined,
      borderRadius: borderRadius || undefined,
      minHeight: "40px",
      textDecoration: isLink ? "none" : undefined,
      color: nodeStyle?.color || (isLink ? "inherit" : undefined),
      fontFamily: nodeStyle?.fontFamily || undefined,
      fontSize: nodeStyle?.fontSize || undefined,
      fontWeight: nodeStyle?.fontWeight || undefined,
      textAlign: (nodeStyle?.textAlign as React.CSSProperties["textAlign"]) || undefined,
      lineHeight: nodeStyle?.lineHeight || undefined,
      letterSpacing: nodeStyle?.letterSpacing || undefined,
    },
  };

  if (isLink) {
    elementProps.href = href || "#";
    elementProps.onClick = (e: React.MouseEvent) => e.preventDefault();
  }

  return React.createElement(element, elementProps, children);
};

CraftLayout.craft = {
  displayName: "Layout",
  isCanvas: true,
  props: {
    tag: "div",
    href: "",
    direction: "stack",
    spacing: "medium",
    align: "stretch",
    justify: "flex-start",
    padding: "1rem",
    backgroundColor: "",
    columns: 2,
    borderRadius: "",
  },
  related: { settings: LayoutSettings },
};
