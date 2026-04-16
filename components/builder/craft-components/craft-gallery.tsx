"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface GalleryImage {
  src: string;
  alt: string;
}

interface CraftGalleryProps {
  images: GalleryImage[];
  columns: number;
  gap: string;
}

export const CraftGallery: UserComponent<CraftGalleryProps> = ({
  images,
  columns,
  gap,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  if (!images.length) {
    return (
      <div
        ref={(r: HTMLDivElement | null) => {
          if (r) connect(drag(r));
        }}
        style={{
          padding: "3rem",
          textAlign: "center",
          border: "1px dashed #e5e7eb",
          color: "#9ca3af",
          borderRadius: "var(--sr-radius)",
        }}
      >
        Add images in the properties panel
      </div>
    );
  }

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap,
      }}
    >
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={img.src}
          alt={img.alt || `Image ${i + 1}`}
          style={{
            width: "100%",
            aspectRatio: "1",
            objectFit: "cover",
            borderRadius: "var(--sr-radius)",
          }}
        />
      ))}
    </div>
  );
};

CraftGallery.craft = {
  displayName: "Gallery",
  props: {
    images: [],
    columns: 3,
    gap: "0.5rem",
  },
  related: {},
};
