"use client";

// The picture on top of a Drive grid card (entry-card.tsx). A document shows its first words on a
// paper sheet, a spreadsheet or a presentation its kind on a sketch of one. An uploaded image or
// video shows a signed URL (useDriveUrl) of its attached thumbnail, else a small image its
// original; an image another app stores shows its public link. Every picture falls back to the
// kind icon when it fails to load, and nothing uploaded is ever rendered as HTML.

import { useState } from "react";
import { Presentation, Sheet } from "lucide-react";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import type { DocEntry, DriveEntry, FileEntry, VirtualEntry } from "@/components/drive/model/types";
import { isThumbable } from "@/lib/drive/file-kinds";
import { invalidateSharedDriveUrls } from "@/lib/drive/url-loader";
import { useDriveUrl } from "@/lib/drive/use-drive-url";
import { cn } from "@/lib/utils";

/** A document's first words on an always-light "paper" sheet, at double size scaled to half (as doc-card.tsx). */
function DocPaper({ title, excerpt }: { title: string; excerpt: string }) {
  const text = excerpt.trim();
  return (
    <div className="h-full px-3 pt-3">
      <div className="h-full overflow-hidden border border-b-0 border-neutral-200 bg-white px-2 py-1.5">
        <span className="block w-[200%] origin-top-left scale-50 rtl:origin-top-right">
          <span dir="auto" className="block truncate text-[15px] leading-[1.3] font-semibold text-neutral-700">
            {title}
          </span>
          {text && (
            <span dir="auto" className="mt-1.5 block text-[12px] leading-[1.45] text-neutral-500 [overflow-wrap:anywhere]">
              {text}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function IconThumb({ entry }: { entry: DriveEntry }) {
  return (
    <div className="flex h-full items-center justify-center">
      <EntryIcon entry={entry} className="h-8 w-8" />
    </div>
  );
}

const GRID_PATTERN =
  "bg-background bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[22px_14px]";

/** A thumbnail picture; a failed load calls onError (the caller then falls back to the icon). */
function ThumbImage({ src, onError, noReferrer = false }: { src: string; onError(): void; noReferrer?: boolean }) {
  // Signed URLs of private blobs and links other apps stored: next/image can't optimize either.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy={noReferrer ? "no-referrer" : undefined} onError={onError} className="h-full w-full object-cover" />;
}

function SignedImage({ itemId, variant, onError, fallback }: { itemId: string; variant: "original" | "thumb"; onError(): void; fallback: React.ReactNode }) {
  const { url } = useDriveUrl(itemId, variant, "view");
  return url ? <ThumbImage src={url} onError={onError} /> : <>{fallback}</>;
}

/** A signed thumbnail; a failed load drops the cached URL and tries once more (a fresh instance), then shows the icon. */
function SignedThumb({ entry, variant }: { entry: FileEntry; variant: "original" | "thumb" }) {
  const [attempt, setAttempt] = useState(0);
  const fallback = <IconThumb entry={entry} />;
  if (attempt > 1) return fallback;
  const onError = () => {
    if (attempt === 0) invalidateSharedDriveUrls([entry.id]);
    setAttempt((value) => value + 1);
  };
  return <SignedImage key={attempt} itemId={entry.id} variant={variant} fallback={fallback} onError={onError} />;
}

/** An image another app stores as a public link. */
function LinkedThumb({ entry }: { entry: VirtualEntry }) {
  const [failed, setFailed] = useState(false);
  return failed ? <IconThumb entry={entry} /> : <ThumbImage src={entry.url} noReferrer onError={() => setFailed(true)} />;
}

function fileThumbVariant(entry: FileEntry): "original" | "thumb" | null {
  if (entry.uploading !== null || entry.item.status !== "ready") return null;
  if ((entry.fileKind === "image" || entry.fileKind === "video") && entry.item.thumbKey !== "") return "thumb";
  if (entry.fileKind === "image" && isThumbable({ mimeType: entry.mimeType, name: entry.name, sizeBytes: entry.sizeBytes })) return "original";
  return null;
}

/** The card's picture; `name` is the display name (a document's paper shows it as its title). */
export function EntryThumb({ entry, name }: { entry: FileEntry | DocEntry | VirtualEntry; name: string }) {
  switch (entry.type) {
    case "doc":
      return <DocPaper title={name} excerpt={entry.doc.excerpt} />;
    case "sheet":
      return (
        <div className={cn("flex h-full items-center justify-center", GRID_PATTERN)}>
          <Sheet aria-hidden className="h-8 w-8 text-muted-foreground" />
        </div>
      );
    case "slides":
      return (
        <div className="flex h-full items-center justify-center p-4">
          <div className="flex aspect-video w-3/4 items-center justify-center border border-border bg-background">
            <Presentation aria-hidden className="h-7 w-7 text-muted-foreground" />
          </div>
        </div>
      );
    case "file": {
      const variant = fileThumbVariant(entry);
      return variant ? <SignedThumb entry={entry} variant={variant} /> : <IconThumb entry={entry} />;
    }
    case "virtual":
      return entry.fileKind === "image" ? <LinkedThumb entry={entry} /> : <IconThumb entry={entry} />;
  }
}
