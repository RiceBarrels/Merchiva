"use client";

import { useState } from "react";
import { hapticLight } from "@/lib/haptics";
import type { SiteTheme } from "@/lib/types";

interface Props {
  theme: SiteTheme;
  code?: string;
  headline?: string;
  subline?: string;
  expires?: string; // ISO date
}

export function CouponBanner({
  theme,
  code = "WELCOME10",
  headline = "Get 10% Off Your First Order",
  subline = "Use code at checkout. Valid for new customers.",
  expires,
}: Props) {
  const [copied, setCopied] = useState(false);
  const r = theme.borderRadius;

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    hapticLight();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiryLabel = expires
    ? `Expires ${new Date(expires + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : null;

  return (
    <div
      style={{
        background: `${theme.accent}12`,
        border: `1.5px dashed ${theme.accent}70`,
        borderRadius: r,
        padding: "16px 20px",
        fontFamily: theme.bodyFont,
        color: theme.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontFamily: theme.headingFont,
            fontWeight: 700,
            fontSize: 16,
            margin: "0 0 2px",
            color: theme.accent,
          }}
        >
          {headline}
        </p>
        <p style={{ fontSize: 13, color: theme.secondary, margin: 0 }}>{subline}</p>
        {expiryLabel && (
          <p style={{ fontSize: 11, color: `${theme.secondary}90`, margin: "4px 0 0" }}>
            {expiryLabel}
          </p>
        )}
      </div>

      <button
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: copied ? theme.accent : theme.background,
          color: copied ? "#fff" : theme.accent,
          border: `1.5px solid ${theme.accent}`,
          borderRadius: r,
          padding: "8px 16px",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "monospace",
          cursor: "pointer",
          letterSpacing: "0.08em",
          transition: "background 0.15s, color 0.15s",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {copied ? "✓ Copied!" : code}
      </button>
    </div>
  );
}
