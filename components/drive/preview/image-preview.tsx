"use client";

// An image drawn as it is: scaled down to fit, never cropped, not draggable (a drag would start
// Drive's own drop handling). SVGs go through <img>, where their scripts are inert. No referrer
// goes to the host, which for files kept by other apps is someone else's upload service.
//
// The first URL is kept: a signed URL refreshed in the background would only reload the same
// bytes. A failure is the caller's to answer (the preview body retries once with a fresh URL by
// mounting a new ImagePreview).

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PreviewLoading } from "./preview-loading";

export interface ImagePreviewProps {
  /** Read once, on mount: give each file its own element (a `key`), as PreviewBody does. */
  url: string;
  /** The file's name, as the image's text alternative. */
  name: string;
  /** The image did not load (an expired URL, a file the browser can't draw). */
  onError(): void;
  className?: string;
}

export function ImagePreview({ url, name, onError, className }: ImagePreviewProps) {
  const [src] = useState(url);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("relative flex h-full w-full items-center justify-center p-3", className)}>
      {!loaded && <PreviewLoading className="absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed or external URL, not a build asset */}
      <img
        src={src}
        alt={name}
        draggable={false}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={onError}
        className={cn("max-h-full max-w-full object-contain transition-opacity duration-200", !loaded && "opacity-0")}
      />
    </div>
  );
}
