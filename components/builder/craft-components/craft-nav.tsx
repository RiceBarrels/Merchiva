"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface NavLink {
  label: string;
  href: string;
}

interface CraftNavProps {
  logo: string;
  links: NavLink[];
  backgroundColor: string;
  textColor: string;
  sticky: boolean;
}

export const CraftNav: UserComponent<CraftNavProps> = ({
  logo,
  links,
  backgroundColor,
  textColor,
  sticky,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <nav
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        background: backgroundColor,
        padding: "0.875rem 2rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        position: sticky ? "sticky" : "relative",
        top: 0,
        zIndex: sticky ? 100 : undefined,
      }}
    >
      <span
        style={{
          fontFamily: "var(--sr-font-heading)",
          fontWeight: 800,
          fontSize: "1.125rem",
          color: textColor,
        }}
      >
        {logo}
      </span>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
        {links.map((l, i) => (
          <a
            key={i}
            href={l.href}
            style={{
              color: textColor,
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
              opacity: 0.85,
            }}
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
};

CraftNav.craft = {
  displayName: "Nav",
  props: {
    logo: "My Site",
    links: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
    ],
    backgroundColor: "#ffffff",
    textColor: "#09090b",
    sticky: false,
  },
  related: {},
};
