"use client";

import { useNode, type UserComponent } from "@craftjs/core";
import { DynamicIcon } from "@/components/icon-picker";

interface CraftIconProps {
  name: string;
  size: number;
  color: string;
  align: string;
}

export const CraftIcon: UserComponent<CraftIconProps> = ({
  name,
  size,
  color,
  align,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{ textAlign: align as React.CSSProperties["textAlign"] }}
    >
      <DynamicIcon name={name} size={size} color={color || "var(--sr-primary)"} />
    </div>
  );
};

CraftIcon.craft = {
  displayName: "Icon",
  props: {
    name: "Star",
    size: 32,
    color: "",
    align: "left",
  },
  related: {},
};
