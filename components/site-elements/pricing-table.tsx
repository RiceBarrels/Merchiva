"use client";

import type { SiteTheme, PricingItem } from "@/lib/types";

const PLACEHOLDER_ITEMS: PricingItem[] = [
  { id: "1", name: "Espresso", description: "Single origin, double shot", price: 3.5, category: "Coffee" },
  { id: "2", name: "Cappuccino", description: "Espresso with steamed milk foam", price: 4.5, badge: "Popular", category: "Coffee" },
  { id: "3", name: "Avocado Toast", description: "Sourdough, smashed avo, chili flakes", price: 9.0, category: "Food" },
  { id: "4", name: "Açaí Bowl", description: "Granola, banana, honey", price: 11.0, badge: "New", category: "Food" },
  { id: "5", name: "Cold Brew", description: "12hr steep, oat milk option", price: 5.0, category: "Coffee" },
  { id: "6", name: "Banana Bread", description: "House-baked, served warm", price: 4.0, category: "Food" },
];

interface Props {
  theme: SiteTheme;
  items?: PricingItem[];
  title?: string;
}

export function PricingTable({ theme, items = PLACEHOLDER_ITEMS, title = "Our Menu" }: Props) {
  const r = theme.borderRadius;

  // Group by category
  const categories = [...new Set(items.map((i) => i.category ?? "Menu"))];

  return (
    <div style={{ fontFamily: theme.bodyFont, color: theme.text }}>
      <h3
        style={{
          fontFamily: theme.headingFont,
          fontWeight: 700,
          fontSize: 20,
          margin: "0 0 16px",
          color: theme.text,
        }}
      >
        {title}
      </h3>

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: theme.secondary,
              margin: "0 0 8px",
            }}
          >
            {cat}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {items.filter((i) => (i.category ?? "Menu") === cat).map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  background: theme.background,
                  border: `1px solid ${theme.secondary}20`,
                  borderRadius: r,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
                      {item.name}
                    </span>
                    {item.badge && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: theme.accent,
                          color: "#fff",
                          padding: "1px 6px",
                          borderRadius: 999,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p style={{ fontSize: 12, color: theme.secondary, margin: "2px 0 0" }}>
                      {item.description}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: theme.headingFont,
                    fontWeight: 700,
                    fontSize: 14,
                    color: theme.accent,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ${item.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
