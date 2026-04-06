"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

interface GalleryImage {
  src: string;
  alt?: string;
  caption?: string;
}

interface GalleryProps {
  images?: GalleryImage[];
  columns?: 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  isEditor?: boolean;
}

const PLACEHOLDER_IMAGES: GalleryImage[] = [
  { src: "", alt: "Photo 1", caption: "Our space" },
  { src: "", alt: "Photo 2", caption: "The team" },
  { src: "", alt: "Photo 3", caption: "Our products" },
  { src: "", alt: "Photo 4", caption: "Customer favorites" },
  { src: "", alt: "Photo 5", caption: "Behind the scenes" },
  { src: "", alt: "Photo 6", caption: "Daily special" },
];

const GAP_MAP = { sm: "gap-1", md: "gap-2", lg: "gap-3" };

export function Gallery({
  images,
  columns = 3,
  gap = "md",
  isEditor = false,
}: GalleryProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const displayImages = isEditor ? PLACEHOLDER_IMAGES : (images ?? []);
  const gapClass = GAP_MAP[gap];

  function prev() {
    setLightbox((i) => (i !== null ? (i - 1 + displayImages.length) % displayImages.length : null));
  }
  function next() {
    setLightbox((i) => (i !== null ? (i + 1) % displayImages.length : null));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key === "Escape") setLightbox(null);
  }

  return (
    <>
      <div
        className={`grid ${gapClass}`}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {displayImages.map((img, i) => (
          <button
            key={i}
            onClick={() => !isEditor && img.src && setLightbox(i)}
            className="relative group overflow-hidden bg-stone-100 aspect-square"
            style={{ borderRadius: "0.3rem", cursor: img.src ? "pointer" : "default" }}
          >
            {img.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img.src}
                alt={img.alt ?? ""}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <ImageIcon className="h-6 w-6 text-stone-300" />
                {img.alt && <p className="text-xs text-stone-400">{img.alt}</p>}
              </div>
            )}
            {img.caption && img.src && (
              <div
                className="absolute bottom-0 inset-x-0 bg-black/50 px-2 py-1 translate-y-full group-hover:translate-y-0 transition-transform"
              >
                <p className="text-xs text-white truncate">{img.caption}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox !== null && !isEditor && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-modal
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
            onClick={(e) => { e.stopPropagation(); prev(); }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            className="absolute right-14 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2"
            onClick={(e) => { e.stopPropagation(); next(); }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div
            className="max-w-4xl max-h-[85vh] flex flex-col items-center gap-3 px-16"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImages[lightbox].src}
              alt={displayImages[lightbox].alt ?? ""}
              className="max-h-[75vh] max-w-full object-contain"
              style={{ borderRadius: "0.3rem" }}
            />
            {displayImages[lightbox].caption && (
              <p className="text-sm text-white/70">{displayImages[lightbox].caption}</p>
            )}
            <p className="text-xs text-white/40">{lightbox + 1} / {displayImages.length}</p>
          </div>
        </div>
      )}
    </>
  );
}
