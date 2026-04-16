"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftBookingFormProps {
  title: string;
  submitLabel: string;
}

export const CraftBookingForm: UserComponent<CraftBookingFormProps> = ({
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

  const fields: [string, string, string][] = [
    ["Name", "text", "Jane Smith"],
    ["Email", "email", "jane@example.com"],
    ["Date", "date", ""],
    ["Time", "time", ""],
  ];

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "var(--sr-radius, 0.3rem)",
        padding: "2rem",
        maxWidth: "480px",
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
        {fields.map(([l, t, p]) => (
          <div key={l}>
            <label style={labelStyle}>{l}</label>
            <input type={t} placeholder={p} style={inputStyle} readOnly />
          </div>
        ))}
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

CraftBookingForm.craft = {
  displayName: "Booking Form",
  props: {
    title: "Book an Appointment",
    submitLabel: "Book Now",
  },
  related: {},
};
