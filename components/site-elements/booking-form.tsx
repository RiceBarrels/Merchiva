"use client";

import { useState } from "react";
import type { SiteTheme } from "@/lib/types";

interface BookingFormData {
  name: string;
  phone: string;
  date: string;
  time: string;
  partySize: string;
}

interface Props {
  theme: SiteTheme;
  onSubmit?: (data: BookingFormData) => void | Promise<void>;
  title?: string;
}

export function BookingForm({ theme, onSubmit, title = "Make a Reservation" }: Props) {
  const r = theme.borderRadius;
  const [form, setForm] = useState<BookingFormData>({
    name: "",
    phone: "",
    date: "",
    time: "",
    partySize: "2",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const field = (key: keyof BookingFormData, label: string, type = "text", options?: string[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.secondary,
          fontFamily: theme.bodyFont,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>
      {options ? (
        <select
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          style={{
            background: theme.background,
            border: `1px solid ${theme.secondary}40`,
            borderRadius: r,
            padding: "8px 10px",
            fontSize: 14,
            color: theme.text,
            fontFamily: theme.bodyFont,
            outline: "none",
          }}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          style={{
            background: theme.background,
            border: `1px solid ${theme.secondary}40`,
            borderRadius: r,
            padding: "8px 10px",
            fontSize: 14,
            color: theme.text,
            fontFamily: theme.bodyFont,
            outline: "none",
          }}
        />
      )}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit?.(form);
      setSuccess(true);
      setForm({ name: "", phone: "", date: "", time: "", partySize: "2" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: theme.background,
        border: `1px solid ${theme.secondary}30`,
        borderRadius: r,
        padding: "20px",
        fontFamily: theme.bodyFont,
        color: theme.text,
      }}
    >
      <h3
        style={{
          fontFamily: theme.headingFont,
          fontWeight: 700,
          fontSize: 18,
          margin: "0 0 16px",
          color: theme.text,
        }}
      >
        {title}
      </h3>

      {success ? (
        <div
          style={{
            textAlign: "center",
            padding: "24px 0",
            color: theme.accent,
            fontWeight: 600,
          }}
        >
          ✓ Reservation confirmed! We&apos;ll see you soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {field("name", "Full Name")}
          {field("phone", "Phone Number", "tel")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field("date", "Date", "date")}
            {field("time", "Time", "time")}
          </div>
          {field(
            "partySize",
            "Party Size",
            "text",
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"]
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              background: theme.accent,
              color: "#fff",
              border: "none",
              borderRadius: r,
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: theme.bodyFont,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Booking…" : "Reserve a Table"}
          </button>
        </form>
      )}
    </div>
  );
}
