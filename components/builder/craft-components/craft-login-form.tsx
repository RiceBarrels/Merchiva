"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftLoginFormProps {
  title: string;
  redirectUrl: string;
}

export const CraftLoginForm: UserComponent<CraftLoginFormProps> = ({
  title,
  redirectUrl,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    border: "1px solid #d1d5db",
    borderRadius: "var(--sr-radius)",
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
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "var(--sr-radius)",
        padding: "2rem",
        maxWidth: "400px",
        margin: "0 auto",
      }}
      data-redirect-url={redirectUrl}
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
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" placeholder="you@example.com" style={inputStyle} readOnly />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            style={inputStyle}
            readOnly
          />
        </div>
        <button
          type="button"
          style={{
            background: "var(--sr-primary)",
            color: "#fff",
            padding: "0.625rem 1.5rem",
            borderRadius: "var(--sr-radius)",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
};

CraftLoginForm.craft = {
  displayName: "Login Form",
  props: {
    title: "Sign In",
    redirectUrl: "/~/",
  },
  related: {},
};
