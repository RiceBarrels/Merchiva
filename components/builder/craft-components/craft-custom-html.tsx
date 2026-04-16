"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftCustomHtmlProps {
  html: string;
}

export const CraftCustomHtml: UserComponent<CraftCustomHtmlProps> = ({ html }) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

CraftCustomHtml.craft = {
  displayName: "Custom HTML",
  props: {
    html: "<p>Your custom HTML here</p>",
  },
  related: {},
};
