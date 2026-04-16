"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftTestimonialProps {
  quote: string;
  author: string;
  role: string;
  avatar: string;
  rating: number;
}

export const CraftTestimonial: UserComponent<CraftTestimonialProps> = ({
  quote,
  author,
  role,
  avatar,
  rating,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        padding: "2rem",
        borderLeft: "4px solid var(--sr-accent)",
        background: "rgba(0,0,0,0.02)",
        borderRadius: "0 var(--sr-radius) var(--sr-radius) 0",
      }}
    >
      <div style={{ color: "#f59e0b", fontSize: "1.25rem", marginBottom: "0.75rem" }}>
        {"★".repeat(Math.min(5, rating))}
      </div>
      <blockquote
        style={{
          fontSize: "1.0625rem",
          lineHeight: 1.7,
          marginBottom: "1rem",
          fontStyle: "italic",
          margin: "0 0 1rem",
        }}
      >
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={author}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "var(--sr-primary)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {author[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>{author}</p>
          <p style={{ color: "var(--sr-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            {role}
          </p>
        </div>
      </div>
    </div>
  );
};

CraftTestimonial.craft = {
  displayName: "Testimonial",
  props: {
    quote: "This product is amazing!",
    author: "Jane D.",
    role: "Happy Customer",
    avatar: "",
    rating: 5,
  },
  related: {},
};
