"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface PricingPlan {
  name: string;
  price: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted: boolean;
}

interface CraftPricingTableProps {
  plans: PricingPlan[];
}

export const CraftPricingTable: UserComponent<CraftPricingTableProps> = ({
  plans,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  if (!plans.length) {
    return (
      <div
        ref={(ref: HTMLDivElement | null) => {
          if (ref) connect(drag(ref));
        }}
        style={{
          padding: "2rem",
          color: "#9ca3af",
          textAlign: "center",
          border: "1px dashed #e5e7eb",
        }}
      >
        Add plans in the properties panel
      </div>
    );
  }

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${plans.length}, 1fr)`,
        gap: "1.5rem",
      }}
    >
      {plans.map((plan, i) => (
        <div
          key={i}
          style={{
            border: `2px solid ${plan.highlighted ? "var(--sr-accent)" : "#e5e7eb"}`,
            borderRadius: "var(--sr-radius, 0.3rem)",
            padding: "2rem",
            position: "relative",
          }}
        >
          {plan.highlighted && (
            <div
              style={{
                position: "absolute",
                top: "-12px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--sr-accent)",
                color: "#fff",
                padding: "0.125rem 0.75rem",
                borderRadius: "99px",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              Popular
            </div>
          )}
          <h3
            style={{
              fontFamily: "var(--sr-font-heading)",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            {plan.name}
          </h3>
          <p style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "1.5rem" }}>
            {plan.price}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              marginBottom: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {(plan.features || []).map((f, j) => (
              <li
                key={j}
                style={{
                  fontSize: "0.875rem",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: "var(--sr-accent)",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>{" "}
                {f}
              </li>
            ))}
          </ul>
          <span
            style={{
              display: "block",
              textAlign: "center",
              padding: "0.625rem",
              background: plan.highlighted
                ? "var(--sr-accent)"
                : "var(--sr-primary)",
              color: "#fff",
              borderRadius: "var(--sr-radius, 0.3rem)",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            {plan.ctaLabel || "Get Started"}
          </span>
        </div>
      ))}
    </div>
  );
};

CraftPricingTable.craft = {
  displayName: "Pricing Table",
  props: {
    plans: [
      {
        name: "Basic",
        price: "Free",
        features: ["Feature 1", "Feature 2"],
        ctaLabel: "Get Started",
        ctaHref: "#",
        highlighted: false,
      },
      {
        name: "Pro",
        price: "$29/mo",
        features: [
          "Everything in Basic",
          "Priority support",
          "Advanced features",
        ],
        ctaLabel: "Start Pro",
        ctaHref: "#",
        highlighted: true,
      },
    ],
  },
  related: {},
};
