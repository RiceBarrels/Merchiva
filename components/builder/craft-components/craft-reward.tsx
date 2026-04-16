"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftRewardProps {
  title: string;
  description: string;
  pointsLabel: string;
  backgroundColor: string;
  textColor: string;
}

export const CraftReward: UserComponent<CraftRewardProps> = ({
  title,
  description,
  pointsLabel,
  backgroundColor,
  textColor,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        background: backgroundColor,
        color: textColor,
        borderRadius: "var(--sr-radius, 0.3rem)",
        padding: "1.5rem 2rem",
        textAlign: "center",
        border: `1px solid ${textColor}30`,
      }}
    >
      <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎁</div>
      <h3
        style={{
          fontFamily: "var(--sr-font-heading)",
          fontWeight: 800,
          fontSize: "1.25rem",
          marginBottom: "0.375rem",
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: "0.9rem", opacity: 0.85, marginBottom: "1rem" }}>
        {description}
      </p>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "rgba(255,255,255,0.6)",
          padding: "0.5rem 1rem",
          borderRadius: "var(--sr-radius, 0.3rem)",
          border: `1px solid ${textColor}40`,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontFamily: "monospace",
            fontSize: "1.5rem",
          }}
        >
          0
        </span>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
          {pointsLabel}
        </span>
      </div>
    </div>
  );
};

CraftReward.craft = {
  displayName: "Reward",
  props: {
    title: "Earn Rewards",
    description: "Earn points on every purchase!",
    pointsLabel: "Points",
    backgroundColor: "#f0fdf4",
    textColor: "#166534",
  },
  related: {},
};
