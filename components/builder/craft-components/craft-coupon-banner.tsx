"use client";

import { useState } from "react";
import { useNode, type UserComponent } from "@craftjs/core";

interface CraftCouponBannerProps {
  code: string;
  description: string;
  backgroundColor: string;
  textColor: string;
}

export const CraftCouponBanner: UserComponent<CraftCouponBannerProps> = ({
  code,
  description,
  backgroundColor,
  textColor,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div
      ref={(ref: HTMLDivElement | null) => {
        if (ref) connect(drag(ref));
      }}
      style={{
        background: backgroundColor,
        color: textColor,
        padding: "1.25rem 2rem",
        borderRadius: "var(--sr-radius, 0.3rem)",
        textAlign: "center",
      }}
    >
      <p style={{ marginBottom: "0.75rem", fontWeight: 600, fontSize: "1rem" }}>
        {description}
      </p>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.75rem",
          background: "rgba(255,255,255,0.6)",
          padding: "0.375rem 0.75rem",
          borderRadius: "4px",
          border: "1px dashed currentColor",
        }}
      >
        <code
          style={{
            fontFamily: "monospace",
            fontWeight: 700,
            letterSpacing: "0.1em",
            fontSize: "1rem",
          }}
        >
          {code}
        </code>
        <button
          onClick={handleCopy}
          style={{
            background: textColor,
            color: backgroundColor,
            border: "none",
            padding: "0.25rem 0.625rem",
            borderRadius: "3px",
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
};

CraftCouponBanner.craft = {
  displayName: "Coupon Banner",
  props: {
    code: "SAVE10",
    description: "Get 10% off your next order!",
    backgroundColor: "#fef3c7",
    textColor: "#92400e",
  },
  related: {},
};
