"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftCartProps {
  title: string;
  emptyText: string;
  checkoutLabel: string;
}

export const CraftCart: UserComponent<CraftCartProps> = ({
  title,
  emptyText,
  checkoutLabel,
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
        border: "1px solid #e5e7eb",
        borderRadius: "var(--sr-radius, 0.3rem)",
        padding: "1.5rem",
        maxWidth: "480px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--sr-font-heading)",
          fontWeight: 700,
          fontSize: "1.25rem",
          marginBottom: "1rem",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          padding: "2rem 0",
          textAlign: "center",
          color: "var(--sr-secondary)",
          fontSize: "0.875rem",
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          marginBottom: "1rem",
        }}
      >
        {emptyText}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "1rem",
          fontWeight: 600,
        }}
      >
        <span>Total</span>
        <span>$0.00</span>
      </div>
      <button
        type="button"
        style={{
          width: "100%",
          background: "var(--sr-primary)",
          color: "#fff",
          padding: "0.625rem",
          borderRadius: "var(--sr-radius, 0.3rem)",
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
          fontSize: "0.875rem",
        }}
      >
        {checkoutLabel}
      </button>
    </div>
  );
};

CraftCart.craft = {
  displayName: "Cart",
  props: {
    title: "Your Cart",
    emptyText: "Your cart is empty.",
    checkoutLabel: "Checkout",
  },
  related: {},
};
