"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftMenuGridProps {
  columns?: 2 | 3 | 4;
  showCategories?: boolean;
  showSearch?: boolean;
  showPrice?: boolean;
  showDescription?: boolean;
  buttonText?: string;
  emptyText?: string;
  cardStyle?: "minimal" | "bordered" | "shadow";
}

const PLACEHOLDER_ITEMS = [
  { name: "Cappuccino", price: 4.5, category: "Drinks", description: "Rich espresso with steamed milk foam" },
  { name: "Croissant", price: 3.0, category: "Food", description: "Flaky, buttery French pastry" },
  { name: "Avocado Toast", price: 8.5, category: "Food", description: "Sourdough with fresh avocado and seasoning" },
  { name: "Green Smoothie", price: 6.0, category: "Drinks", description: "Spinach, banana, and almond milk blend" },
  { name: "Caesar Salad", price: 9.5, category: "Food", description: "Romaine, croutons, parmesan, and caesar dressing" },
  { name: "Espresso", price: 3.5, category: "Drinks", description: "Double shot of rich espresso" },
];

const CATEGORIES = ["All", "Drinks", "Food"];

function getCardBorder(cardStyle: CraftMenuGridProps["cardStyle"]): string {
  switch (cardStyle) {
    case "minimal":
      return "none";
    case "shadow":
      return "none";
    case "bordered":
    default:
      return "1px solid #e5e7eb";
  }
}

function getCardShadow(cardStyle: CraftMenuGridProps["cardStyle"]): string {
  switch (cardStyle) {
    case "shadow":
      return "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)";
    default:
      return "none";
  }
}

export const CraftMenuGrid: UserComponent<CraftMenuGridProps> = ({
  columns = 3,
  showCategories = true,
  showSearch = true,
  showPrice = true,
  showDescription = false,
  buttonText = "Add to Cart",
  cardStyle = "bordered",
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{ width: "100%" }}
    >
      {/* Search bar */}
      {showSearch && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid #e5e7eb",
              borderRadius: "var(--sr-radius, 0.3rem)",
              padding: "0.5rem 0.75rem",
              gap: "0.5rem",
              background: "#fff",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9ca3af"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
              Search menu items...
            </span>
          </div>
        </div>
      )}

      {/* Category tabs */}
      {showCategories && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          {CATEGORIES.map((cat, i) => (
            <span
              key={cat}
              style={{
                display: "inline-block",
                padding: "0.375rem 0.875rem",
                borderRadius: "99px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
                background: i === 0 ? "var(--sr-primary, #1c1917)" : "transparent",
                color: i === 0 ? "#fff" : "var(--sr-text, #1c1917)",
                border: i === 0 ? "none" : "1px solid #e5e7eb",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: "1rem",
        }}
      >
        {PLACEHOLDER_ITEMS.map((item) => (
          <div
            key={item.name}
            style={{
              border: getCardBorder(cardStyle),
              borderRadius: "var(--sr-radius, 0.3rem)",
              overflow: "hidden",
              boxShadow: getCardShadow(cardStyle),
              background: "#fff",
            }}
          >
            {/* Image placeholder */}
            <div
              style={{
                width: "100%",
                height: "140px",
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d1d5db"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>

            {/* Content */}
            <div style={{ padding: "0.75rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: showDescription ? "0.375rem" : "0.625rem",
                }}
              >
                <h4
                  style={{
                    fontFamily: "var(--sr-font-heading)",
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                    margin: 0,
                    color: "var(--sr-text, #1c1917)",
                  }}
                >
                  {item.name}
                </h4>
                {showPrice && (
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "0.9375rem",
                      color: "var(--sr-accent, #1c1917)",
                      flexShrink: 0,
                      marginLeft: "0.5rem",
                    }}
                  >
                    ${item.price.toFixed(2)}
                  </span>
                )}
              </div>

              {showDescription && (
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--sr-secondary, #6b7280)",
                    margin: "0 0 0.625rem 0",
                    lineHeight: 1.4,
                  }}
                >
                  {item.description}
                </p>
              )}

              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "var(--sr-primary, #1c1917)",
                  color: "#fff",
                  padding: "0.4375rem",
                  borderRadius: "var(--sr-radius, 0.3rem)",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {buttonText}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

CraftMenuGrid.craft = {
  displayName: "Menu Grid",
  props: {
    columns: 3,
    showCategories: true,
    showSearch: true,
    showPrice: true,
    showDescription: false,
    buttonText: "Add to Cart",
    emptyText: "No items available",
    cardStyle: "bordered",
  },
  related: {},
};
