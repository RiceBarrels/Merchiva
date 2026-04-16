"use client";

import { useState } from "react";
import { useNode, type UserComponent } from "@craftjs/core";

interface FaqItem {
  question: string;
  answer: string;
}

interface CraftFaqProps {
  items: FaqItem[];
}

export const CraftFaq: UserComponent<CraftFaqProps> = ({ items }) => {
  const {
    connectors: { connect, drag },
  } = useNode();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{ display: "flex", flexDirection: "column", gap: "0" }}
    >
      {items.map((item, i) => (
        <div key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "1rem 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 600,
              fontSize: "0.9375rem",
            }}
          >
            {item.question}
            <span
              style={{
                flexShrink: 0,
                fontSize: "1.25rem",
                lineHeight: 1,
                transition: "transform 0.2s",
                transform: openIdx === i ? "rotate(45deg)" : "none",
              }}
            >
              +
            </span>
          </button>
          {openIdx === i && (
            <div
              style={{
                paddingBottom: "1rem",
                color: "var(--sr-secondary)",
                fontSize: "0.9rem",
                lineHeight: 1.7,
              }}
            >
              {item.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

CraftFaq.craft = {
  displayName: "FAQ",
  props: {
    items: [
      {
        question: "What is your return policy?",
        answer: "We offer a 30-day return policy on all items.",
      },
      {
        question: "How do I contact support?",
        answer: "Email us at hello@example.com anytime.",
      },
    ],
  },
  related: {},
};
