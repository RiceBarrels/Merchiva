"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import { ButtonSettings } from "../craft-settings/button-settings";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface CraftButtonProps {
  label: string;
  href: string;
  variant: ButtonVariant;
  size: ButtonSize;
  fullWidth: boolean;
}

const sizeStyles: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: "0.375rem 0.75rem", fontSize: "0.8125rem" },
  md: { padding: "0.5rem 1rem", fontSize: "0.875rem" },
  lg: { padding: "0.75rem 1.5rem", fontSize: "1rem" },
};

const variantStyles: Record<
  ButtonVariant,
  React.CSSProperties
> = {
  primary: {
    backgroundColor: "var(--sr-primary, #1a1a1a)",
    color: "#ffffff",
    border: "none",
  },
  secondary: {
    backgroundColor: "var(--sr-secondary, #f5f5f4)",
    color: "var(--sr-text, #1a1a1a)",
    border: "none",
  },
  outline: {
    backgroundColor: "transparent",
    color: "var(--sr-text, #1a1a1a)",
    border: "1px solid var(--sr-text, #d4d4d4)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--sr-text, #1a1a1a)",
    border: "none",
  },
};

export const CraftButton: UserComponent<CraftButtonProps> = ({
  label,
  href,
  variant,
  size,
  fullWidth,
}) => {
  const {
    connectors: { connect, drag },
    nodeStyle,
  } = useNode((node) => ({
    nodeStyle: (node.data.props?.style as Record<string, string>) || null,
  }));

  const sizeStyle = sizeStyles[size];
  const vStyle = variantStyles[variant];

  return (
    <a
      ref={(ref: HTMLAnchorElement | null) => {
        if (ref) connect(drag(ref));
      }}
      href={href}
      onClick={(e) => e.preventDefault()}
      style={{
        ...vStyle,
        padding: sizeStyle.padding,
        fontSize: nodeStyle?.fontSize || sizeStyle.fontSize,
        fontFamily: nodeStyle?.fontFamily || undefined,
        fontWeight: nodeStyle?.fontWeight ? Number(nodeStyle.fontWeight) || nodeStyle.fontWeight : 500,
        color: nodeStyle?.color || vStyle.color,
        display: fullWidth ? "block" : "inline-block",
        width: fullWidth ? "100%" : undefined,
        textAlign: "center",
        textDecoration: "none",
        borderRadius: "var(--sr-radius, 0.3rem)",
        cursor: "pointer",
        lineHeight: 1.5,
        boxSizing: "border-box",
      }}
    >
      {label}
    </a>
  );
};

CraftButton.craft = {
  displayName: "Button",
  props: {
    label: "Click me",
    href: "#",
    variant: "primary",
    size: "md",
    fullWidth: false,
  },
  related: { settings: ButtonSettings },
};
