"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftProductCardProps {
  productId: string;
  showPrice: boolean;
  showDescription: boolean;
}

export const CraftProductCard: UserComponent<CraftProductCardProps> = ({
  productId,
  showPrice,
  showDescription,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  // In the editor we render a placeholder since we don't have product context
  const name = productId ? `Product (${productId.slice(0, 8)}...)` : "Product Name";
  const price = 0;
  const category = "Category";

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "var(--sr-radius, 0.3rem)",
        overflow: "hidden",
        maxWidth: "320px",
      }}
    >
      <div
        style={{
          display: "flex",
          background: "#f9fafb",
          height: "180px",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "3rem",
        }}
      >
        🛍️
      </div>
      <div style={{ padding: "1rem" }}>
        <h3
          style={{
            fontFamily: "var(--sr-font-heading)",
            fontWeight: 700,
            marginBottom: "0.5rem",
            fontSize: "1rem",
          }}
        >
          {name}
        </h3>
        {showDescription && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--sr-secondary)",
              marginBottom: "0.5rem",
            }}
          >
            {category}
          </p>
        )}
        {showPrice && (
          <p
            style={{
              fontWeight: 700,
              color: "var(--sr-accent)",
              marginBottom: "0.75rem",
              fontSize: "1.125rem",
            }}
          >
            ${price.toFixed(2)}
          </p>
        )}
        <span
          style={{
            display: "block",
            textAlign: "center",
            background: "var(--sr-primary)",
            color: "#fff",
            padding: "0.5rem",
            borderRadius: "var(--sr-radius, 0.3rem)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          View Product
        </span>
      </div>
    </div>
  );
};

CraftProductCard.craft = {
  displayName: "Product Card",
  props: {
    productId: "",
    showPrice: true,
    showDescription: false,
  },
  related: {},
};
