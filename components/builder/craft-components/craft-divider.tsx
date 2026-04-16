"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftDividerProps {
  color: string;
  thickness: string;
  margin: string;
}

export const CraftDivider: UserComponent<CraftDividerProps> = ({
  color,
  thickness,
  margin,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <hr
      ref={(r: HTMLHRElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        border: "none",
        borderTop: `${thickness} solid ${color}`,
        margin,
      }}
    />
  );
};

CraftDivider.craft = {
  displayName: "Divider",
  props: {
    color: "#e5e7eb",
    thickness: "1px",
    margin: "1.5rem 0",
  },
  related: {},
};
