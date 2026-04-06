"use client";

import type { SiteTheme, TestimonialData } from "@/lib/types";

const PLACEHOLDER: TestimonialData[] = [
  {
    id: "1",
    authorName: "Sarah M.",
    rating: 5,
    content: "The best coffee in town. I come here every morning before work — the staff always remembers my order!",
    date: "2026-03-15",
  },
  {
    id: "2",
    authorName: "James T.",
    rating: 5,
    content: "Incredible atmosphere and even better food. The avocado toast is a must-try.",
    date: "2026-03-20",
  },
  {
    id: "3",
    authorName: "Priya K.",
    rating: 4,
    content: "Great place to work remotely. Fast wifi, great espresso, friendly team.",
    date: "2026-04-01",
  },
];

interface Props {
  theme: SiteTheme;
  testimonials?: TestimonialData[];
  title?: string;
}

function TestimonialCard({ theme, t }: { theme: SiteTheme; t: TestimonialData }) {
  const r = theme.borderRadius;
  const initial = t.authorName[0]?.toUpperCase() ?? "?";

  return (
    <div
      style={{
        background: theme.background,
        border: `1px solid ${theme.secondary}25`,
        borderRadius: r,
        padding: "16px",
        fontFamily: theme.bodyFont,
        color: theme.text,
      }}
    >
      {/* Stars */}
      <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            style={{ fontSize: 13, color: i < t.rating ? "#f59e0b" : `${theme.secondary}40` }}
          >
            ★
          </span>
        ))}
      </div>

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: theme.text,
          margin: "0 0 14px",
          fontStyle: "italic",
        }}
      >
        &ldquo;{t.content}&rdquo;
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: `${theme.accent}20`,
            color: theme.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: theme.text }}>{t.authorName}</p>
          {t.date && (
            <p style={{ fontSize: 11, color: theme.secondary, margin: 0 }}>
              {new Date(t.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Testimonial({ theme, testimonials = PLACEHOLDER, title = "What Customers Say" }: Props) {
  return (
    <div>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {testimonials.map((t) => (
          <TestimonialCard key={t.id} theme={theme} t={t} />
        ))}
      </div>
    </div>
  );
}
