"use client";

import { useState } from "react";
import type { SiteTheme } from "@/lib/types";

interface GalleryImage {
  url: string;
  alt?: string;
}

interface Props {
  theme: SiteTheme;
  images?: GalleryImage[];
  title?: string;
  columns?: number;
}

const EMOJI_PLACEHOLDERS = ["☕", "🥐", "🍵", "🥗", "🍰", "🫖", "🥑", "🍳"];

export function Gallery({ theme, images, title = "Gallery", columns = 3 }: Props) {
  const r = theme.borderRadius;
  const [lightbox, setLightbox] = useState<string | null>(null);

  const hasImages = images && images.length > 0;

  return (
    <div style={{ fontFamily: theme.bodyFont, color: theme.text }}>
      <h3
        style={{
          fontFamily: theme.headingFont,
          fontWeight: 700,
          fontSize: 20,
          margin: "0 0 14px",
          color: theme.text,
        }}
      >
        {title}
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 8,
        }}
      >
        {hasImages
          ? images.map((img, i) => (
              <button
                key={i}
                onClick={() => setLightbox(img.url)}
                style={{
                  aspectRatio: "1",
                  borderRadius: r,
                  overflow: "hidden",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  background: `${theme.secondary}15`,
                  display: "block",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt ?? ""}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
            ))
          : EMOJI_PLACEHOLDERS.map((emoji, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: "1",
                  borderRadius: r,
                  background: `${theme.accent}10`,
                  border: `1px solid ${theme.secondary}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {emoji}
              </div>
            ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 500,
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            style={{
              maxWidth: "90vw",
              maxHeight: "85vh",
              objectFit: "contain",
              borderRadius: r,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              fontSize: 20,
              width: 36,
              height: 36,
              borderRadius: 999,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
