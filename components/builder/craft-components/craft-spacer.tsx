"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftSpacerProps {
  height: string;
}

export const CraftSpacer: UserComponent<CraftSpacerProps> = ({ height }) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{ height }}
    />
  );
};

CraftSpacer.craft = {
  displayName: "Spacer",
  props: {
    height: "48px",
  },
  related: {},
};
