"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftCheckoutProps {
  title: string;
  submitLabel: string;
}

export const CraftCheckout: UserComponent<CraftCheckoutProps> = ({
  title,
  submitLabel,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "var(--sr-radius, 0.3rem)",
    fontSize: "0.875rem",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.8125rem",
    fontWeight: 500,
    marginBottom: "0.25rem",
  };

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "var(--sr-radius, 0.3rem)",
        padding: "2rem",
        maxWidth: "540px",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--sr-font-heading)",
          fontWeight: 700,
          marginBottom: "1.5rem",
          fontSize: "1.25rem",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <label style={labelStyle}>First Name</label>
            <input type="text" placeholder="Jane" style={inputStyle} readOnly />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input type="text" placeholder="Smith" style={inputStyle} readOnly />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            placeholder="jane@example.com"
            style={inputStyle}
            readOnly
          />
        </div>
        <div>
          <label style={labelStyle}>Address</label>
          <input
            type="text"
            placeholder="123 Main St"
            style={inputStyle}
            readOnly
          />
        </div>
        <div>
          <label style={labelStyle}>Card Number</label>
          <input
            type="text"
            placeholder="4242 4242 4242 4242"
            style={inputStyle}
            readOnly
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <label style={labelStyle}>Expiry</label>
            <input type="text" placeholder="MM/YY" style={inputStyle} readOnly />
          </div>
          <div>
            <label style={labelStyle}>CVC</label>
            <input type="text" placeholder="123" style={inputStyle} readOnly />
          </div>
        </div>
        <button
          type="button"
          style={{
            background: "var(--sr-primary)",
            color: "#fff",
            padding: "0.625rem 1.5rem",
            borderRadius: "var(--sr-radius, 0.3rem)",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};

CraftCheckout.craft = {
  displayName: "Checkout",
  props: {
    title: "Checkout",
    submitLabel: "Place Order",
  },
  related: {},
};
