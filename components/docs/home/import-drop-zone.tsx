"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface ImportDropZoneProps {
  /** Import unavailable: file drops are swallowed (so the browser doesn't navigate to the file) and no overlay shows. */
  disabled?: boolean;
  /** A dropped file is being imported. */
  busy: boolean;
  onFile(file: File): void;
  className?: string;
  children: React.ReactNode;
}

function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Wraps the docs home page: dropping a file anywhere on it imports it as a new document. */
export function ImportDropZone({ disabled = false, busy, onFile, className, children }: ImportDropZoneProps) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child element; count them to know when the pointer really left.
  const depthRef = useRef(0);

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        if (disabled || busy) return;
        depthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled || busy ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event) || disabled || busy) return;
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depthRef.current = 0;
        setDragging(false);
        if (disabled || busy) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      {children}
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-30 rounded-lg border border-dashed border-foreground bg-background/80"
        >
          <div className="sticky top-[30vh] flex flex-col items-center gap-2 px-4 py-10 text-center text-sm font-medium text-foreground">
            <FileUp className="h-6 w-6" />
            {t("docs.home.dropToImport")}
          </div>
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 z-30 bg-background/70">
          <div className="sticky top-[30vh] flex justify-center px-4 py-10">
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {t("docs.import.importing")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
