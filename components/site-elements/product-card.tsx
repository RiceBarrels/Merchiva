"use client";

import type { SiteTheme, Product } from "@/lib/types";

interface Props {
  theme: SiteTheme;
  product?: Partial<Product>;
}

const PLACEHOLDER: Partial<Product> = {
  name: "Signature Espresso",
  category: "Beverages",
  price: 4.5,
  rating: 4.8,
  trend: "up",
};

export function ProductCard({ theme, product = PLACEHOLDER }: Props) {
  const p = { ...PLACEHOLDER, ...product };
  const r = theme.borderRadius;

  return (
    <div
      style={{
        background: theme.background,
        border: `1px solid ${theme.secondary}30`,
        borderRadius: r,
        padding: "16px",
        fontFamily: theme.bodyFont,
        color: theme.text,
      }}
    >
      {/* Image placeholder */}
      <div
        style={{
          background: `${theme.accent}15`,
          borderRadius: Math.max(0, r - 2),
          height: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          fontSize: 32,
        }}
      >
        ☕
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: theme.headingFont, fontWeight: 600, fontSize: 15, margin: 0, color: theme.text }}>
            {p.name}
          </p>
          <p style={{ fontSize: 12, color: theme.secondary, margin: "2px 0 0" }}>{p.category}</p>
        </div>
        <span
          style={{
            fontFamily: theme.headingFont,
            fontWeight: 700,
            fontSize: 15,
            color: theme.accent,
            whiteSpace: "nowrap",
          }}
        >
          ${p.price?.toFixed(2)}
        </span>
      </div>

      {/* Stars */}
      <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{ fontSize: 11, color: i < Math.round(p.rating ?? 0) ? theme.accent : `${theme.secondary}50` }}
          >
            ★
          </span>
        ))}
        <span style={{ fontSize: 11, color: theme.secondary, marginLeft: 4 }}>
          {p.rating?.toFixed(1)}
        </span>
      </div>

      <button
        style={{
          marginTop: 12,
          width: "100%",
          background: theme.accent,
          color: "#fff",
          border: "none",
          borderRadius: r,
          padding: "8px 0",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: theme.bodyFont,
          cursor: "pointer",
        }}
      >
        Add to order
      </button>
    </div>
  );
}
