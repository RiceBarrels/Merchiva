"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface FooterLink {
  label: string;
  href: string;
}

interface CraftFooterProps {
  text: string;
  links: FooterLink[];
  backgroundColor: string;
  textColor: string;
}

export const CraftFooter: UserComponent<CraftFooterProps> = ({
  text,
  links,
  backgroundColor,
  textColor,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <footer
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        background: backgroundColor,
        color: textColor,
        padding: "2.5rem 2rem",
        textAlign: "center",
      }}
    >
      {links.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            justifyContent: "center",
            marginBottom: "1rem",
            flexWrap: "wrap",
          }}
        >
          {links.map((l, i) => (
            <a
              key={i}
              href={l.href}
              style={{
                color: textColor,
                textDecoration: "none",
                fontSize: "0.875rem",
              }}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
      <p style={{ fontSize: "0.875rem", margin: 0 }}>{text}</p>
    </footer>
  );
};

CraftFooter.craft = {
  displayName: "Footer",
  props: {
    text: "\u00a9 2024 My Site. All rights reserved.",
    links: [],
    backgroundColor: "#18181b",
    textColor: "#9ca3af",
  },
  related: {},
};
