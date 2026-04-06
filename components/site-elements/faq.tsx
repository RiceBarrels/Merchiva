"use client";

import { useState } from "react";
import type { SiteTheme, FaqItem } from "@/lib/types";

const PLACEHOLDER_FAQS: FaqItem[] = [
  { id: "1", question: "What are your opening hours?", answer: "We're open Monday–Friday 7am–6pm, and weekends 8am–5pm. Hours may vary on public holidays." },
  { id: "2", question: "Do you take reservations?", answer: "Yes! You can book a table directly on this page using our reservation form." },
  { id: "3", question: "Do you offer catering?", answer: "We offer catering for groups of 10 or more. Contact us for a custom quote." },
  { id: "4", question: "Is there parking available?", answer: "Free street parking is available nearby, and a public car park is located one block east." },
  { id: "5", question: "Do you have a loyalty program?", answer: "Yes — every 10th coffee is on us. Pick up a loyalty card next time you visit." },
];

interface Props {
  theme: SiteTheme;
  items?: FaqItem[];
  title?: string;
}

export function Faq({ theme, items = PLACEHOLDER_FAQS, title = "Frequently Asked Questions" }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const r = theme.borderRadius;

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

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${isOpen ? theme.accent + "50" : theme.secondary + "25"}`,
                borderRadius: r,
                overflow: "hidden",
                transition: "border-color 0.15s",
              }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : item.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  background: isOpen ? `${theme.accent}08` : theme.background,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: theme.bodyFont,
                  color: theme.text,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.question}</span>
                <span
                  style={{
                    fontSize: 16,
                    color: theme.accent,
                    flexShrink: 0,
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}
                >
                  ↓
                </span>
              </button>

              {isOpen && (
                <div
                  style={{
                    padding: "0 14px 14px",
                    background: `${theme.accent}08`,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: theme.secondary,
                  }}
                >
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
