"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftMembershipWidgetProps {
  title: string;
  tierName: string;
  tierColor: string;
  tierIcon: string;
  showPoints: boolean;
  previewPerks: string[];
}

export const CraftMembershipWidget: UserComponent<CraftMembershipWidgetProps> = ({
  title,
  tierName,
  tierColor,
  tierIcon,
  showPoints,
  previewPerks,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        border: `2px solid ${tierColor}`,
        borderRadius: "var(--sr-radius)",
        padding: "1.5rem",
        maxWidth: "400px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <span style={{ fontSize: "2rem" }}>{tierIcon}</span>
        <div>
          <p
            style={{
              fontFamily: "var(--sr-font-heading)",
              fontWeight: 800,
              fontSize: "1.125rem",
              margin: 0,
              color: tierColor,
            }}
          >
            {tierName}
          </p>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--sr-secondary)",
              margin: 0,
            }}
          >
            {title}
          </p>
        </div>
      </div>
      {showPoints && (
        <div
          style={{
            background: `${tierColor}15`,
            border: `1px solid ${tierColor}40`,
            borderRadius: "4px",
            padding: "0.625rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Your Points</span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 800,
              fontSize: "1.25rem",
              color: tierColor,
            }}
          >
            0
          </span>
        </div>
      )}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {previewPerks.map((perk, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              fontSize: "0.875rem",
            }}
          >
            <span style={{ color: tierColor, fontWeight: 700, flexShrink: 0 }}>
              ✓
            </span>
            {perk}
          </li>
        ))}
      </ul>
      <button
        style={{
          marginTop: "1rem",
          width: "100%",
          padding: "0.625rem",
          background: tierColor,
          color: "#fff",
          border: "none",
          borderRadius: "var(--sr-radius)",
          fontWeight: 700,
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        Claim a Perk
      </button>
    </div>
  );
};

CraftMembershipWidget.craft = {
  displayName: "Membership Widget",
  props: {
    title: "Member Benefits",
    tierName: "Gold Member",
    tierColor: "#f59e0b",
    tierIcon: "⭐",
    showPoints: true,
    previewPerks: [
      "Free drink every 3 hours",
      "10% off weekends",
      "Priority seating",
    ],
  },
  related: {},
};
