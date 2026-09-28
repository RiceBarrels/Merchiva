"use client";

// Video and audio with the browser's own controls. Only the metadata loads until someone
// presses play; `playsInline` keeps an iPhone from jumping to full screen. Uploaded files play
// from a signed `stream` URL (the longer TTL). The first URL is kept, so a background refresh
// never restarts playback; an expiry mid-playback surfaces as an error, which the preview body
// answers with one fresh URL (a new MediaPreview).

import { useState } from "react";
import { FileAudio } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";
import { cn } from "@/lib/utils";

export interface MediaPreviewProps {
  kind: "video" | "audio";
  /** Read once, on mount: give each file its own element (a `key`), as PreviewBody does. */
  url: string;
  /** The file's name, shown above an audio player and as the player's label. */
  name: string;
  onError(): void;
  className?: string;
}

export function MediaPreview({ kind, url, name, onError, className }: MediaPreviewProps) {
  const [src] = useState(url);
  if (kind === "video") {
    return (
      <div className={cn("flex h-full w-full items-center justify-center p-3", className)}>
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={name}
          onError={onError}
          className="max-h-full max-w-full rounded-md bg-muted"
        />
      </div>
    );
  }
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-3 p-6", className)}>
      <IconTile icon={FileAudio} size="lg" />
      <p dir="auto" className="max-w-full truncate text-sm font-medium">{name}</p>
      <audio src={src} controls preload="metadata" aria-label={name} onError={onError} className="w-full max-w-md" />
    </div>
  );
}
