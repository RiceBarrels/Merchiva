"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftHeroProps {
  title: string;
  subtitle: string;
  backgroundImage: string;
  backgroundColor: string;
  ctaLabel: string;
  ctaHref: string;
  align: string;
  height: string;
  textColor: string;
}

export const CraftHero: UserComponent<CraftHeroProps> = ({
  title,
  subtitle,
  backgroundImage,
  backgroundColor,
  ctaLabel,
  ctaHref,
  align,
  height,
  textColor,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        minHeight: height,
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat, ${backgroundColor}`
          : backgroundColor,
        display: "flex",
        alignItems: "center",
        justifyContent:
          align === "left"
            ? "flex-start"
            : align === "right"
              ? "flex-end"
              : "center",
        padding: "4rem 2rem",
      }}
    >
      <div
        style={{
          maxWidth: "640px",
          textAlign: align as React.CSSProperties["textAlign"],
          color: textColor || undefined,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--sr-font-heading)",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 800,
            marginBottom: "1rem",
            lineHeight: 1.15,
            color: textColor || "var(--sr-text)",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: "1.125rem",
              marginBottom: "2rem",
              opacity: 0.8,
              color: textColor || "var(--sr-text)",
            }}
          >
            {subtitle}
          </p>
        )}
        {ctaLabel && (
          <a
            href={ctaHref}
            style={{
              display: "inline-block",
              background: "var(--sr-primary)",
              color: "#fff",
              padding: "0.75rem 2rem",
              borderRadius: "var(--sr-radius)",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "1rem",
            }}
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
};

CraftHero.craft = {
  displayName: "Hero",
  props: {
    title: "Welcome to Our Site",
    subtitle: "Tell your story here.",
    backgroundImage: "",
    backgroundColor: "#f9fafb",
    ctaLabel: "Get Started",
    ctaHref: "#",
    align: "center",
    height: "480px",
    textColor: "",
  },
  related: {},
};
