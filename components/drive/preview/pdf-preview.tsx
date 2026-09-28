"use client";

// A PDF framed inline, where the device's browser has its own viewer (entryPreviewMode decides:
// desktop web only, up to DRIVE_PDF_INLINE_MAX_BYTES). The bytes are fetched, checked to start
// with "%PDF-", and framed from a `blob:` URL typed application/pdf, so nothing the file's host
// says about its type is trusted and the frame never loads the host itself (the CSP frames only
// `blob:`). The URL is revoked when the preview goes. A failed fetch, a file that is not a PDF,
// or one past the cap shows the caller's fallback, which offers "Open".

import { useEffect, useState, type ReactNode } from "react";
import { DRIVE_PDF_INLINE_MAX_BYTES, isPdfMagic } from "@/lib/drive/preview";
import { fetchDriveItemBytes } from "@/lib/drive/download";
import type { DriveUrlLoader } from "@/lib/drive/url-loader";
import { cn } from "@/lib/utils";
import { PreviewLoading } from "./preview-loading";
import type { PreviewableEntry } from "./preview-mode";
import { readPrefix } from "./read-prefix";

export interface PdfPreviewProps {
  entry: PreviewableEntry;
  /** The loader of the person using Drive (usePreviewLoader). */
  loader: DriveUrlLoader;
  /** Rendered instead when the PDF can't be framed. */
  fallback: ReactNode;
  className?: string;
}

/** What to fetch: an uploaded file by id, or a link another app keeps. */
type PdfSource =
  | { type: "file"; id: string; name: string; sizeBytes: number; mimeType: string }
  | { type: "virtual"; url: string };

async function loadPdfBytes(source: PdfSource, loader: DriveUrlLoader, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (source.type === "file") {
    const target = { id: source.id, name: source.name, sizeBytes: source.sizeBytes, mimeType: source.mimeType };
    return new Uint8Array(await fetchDriveItemBytes(target, loader, { maxBytes: DRIVE_PDF_INLINE_MAX_BYTES, signal }));
  }
  // A link has no known size: one that declares more than the cap is given up before its body downloads.
  const read = await readPrefix(source.url, DRIVE_PDF_INLINE_MAX_BYTES, signal, { wholeOnly: true });
  if (read.truncated) throw new RangeError("The PDF is larger than the inline preview allows");
  return read.bytes;
}

interface Framed {
  key: string;
  /** null: the PDF can't be framed (the fallback shows). */
  src: string | null;
}

export function PdfPreview({ entry, loader, fallback, className }: PdfPreviewProps) {
  const [framed, setFramed] = useState<Framed | null>(null);
  // Primitive inputs only: the entry object is rebuilt whenever any Drive row changes.
  const isFile = entry.type === "file";
  const id = entry.id;
  const name = entry.name;
  const mimeType = entry.mimeType;
  const sizeBytes = entry.type === "file" ? entry.sizeBytes : 0;
  const url = entry.type === "virtual" ? entry.url : "";
  const key = `${entry.key}|${url}|${sizeBytes}`;

  useEffect(() => {
    const controller = new AbortController();
    const source: PdfSource = isFile ? { type: "file", id, name, sizeBytes, mimeType } : { type: "virtual", url };
    let src: string | null = null;
    loadPdfBytes(source, loader, controller.signal)
      .then((bytes) => {
        if (controller.signal.aborted || !isPdfMagic(bytes.subarray(0, 5))) return;
        src = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn("[drive] PDF preview failed", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFramed({ key, src });
      });
    return () => {
      controller.abort();
      if (src !== null) URL.revokeObjectURL(src);
    };
  }, [key, isFile, id, name, sizeBytes, mimeType, url, loader]);

  const current = framed?.key === key ? framed : null;
  if (current === null) return <PreviewLoading className="h-full w-full" />;
  if (current.src === null) return <>{fallback}</>;
  return <iframe title={name} src={current.src} className={cn("h-full w-full border-0 bg-background", className)} />;
}
