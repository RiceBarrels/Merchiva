"use client";

// Dropping files or folders from the computer anywhere on a Drive view uploads them to the
// view's folder. Drags that start inside Drive (moving entries, marked DRIVE_DND_MIME) are left
// to the entry drop targets; anything that carries no files is ignored. Folders are read with
// readDroppedFiles, which must run inside the drop handler itself. While uploads can't work at
// all (the file store is unavailable), the drag shows why and is refused (dropEffect "none");
// a drop the browser delivers anyway says it again.
//
// dragenter/dragleave fire for every child element, so a depth counter tells when the pointer
// really left.

import { useRef, useState } from "react";
import { Ban, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import type { DriveMoveTarget } from "@/components/drive/model/types";
import type { DroppedFile } from "@/components/drive/model/upload-plan";
import { readDroppedFiles } from "@/components/drive/upload/read-drop";

/** The drag payload type of entries dragged inside Drive (list/use-entry-dnd.ts puts the dragged keys under it). */
export const DRIVE_DND_MIME = "application/x-merchiva-drive";

function dragTypes(event: React.DragEvent): readonly string[] {
  return Array.from(event.dataTransfer?.types ?? []);
}

/** Files from outside the page, not an entry being moved inside Drive. */
function carriesExternalFiles(event: React.DragEvent): boolean {
  const types = dragTypes(event);
  return !types.includes(DRIVE_DND_MIME) && types.includes("Files");
}

export interface DriveDropZoneProps {
  /** Where dropped files go; null = this view takes no uploads (the overlay says so). */
  target: DriveMoveTarget | null;
  /** The target folder's name for the overlay; default: the space's root name. */
  targetLabel?: string;
  /** Uploads are off (offline, notice not acknowledged): drops are swallowed and no overlay shows. */
  disabled?: boolean;
  /** Why uploads can't work here right now (already translated): the overlay shows it instead of the target. */
  unavailableReason?: string | null;
  /** The dropped files with their paths; called only with at least one file. */
  onFiles(files: DroppedFile[], target: DriveMoveTarget): void;
  /** Reading the drop failed; default: an error toast. */
  onError?(err: unknown): void;
  className?: string;
  children: React.ReactNode;
}

export function DriveDropZone({
  target, targetLabel, disabled = false, unavailableReason = null, onFiles, onError, className, children,
}: DriveDropZoneProps) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const depthRef = useRef(0);
  // A view that takes files, but not right now: say why instead of taking the drop.
  const refusal = !disabled && target !== null ? unavailableReason : null;
  const accepts = !disabled && target !== null && refusal === null;
  const label = targetLabel ?? (target?.space === "store" ? t("drive.nav.store") : t("drive.nav.my"));

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (!carriesExternalFiles(event)) return;
        event.preventDefault();
        if (disabled) return;
        depthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesExternalFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = accepts ? "copy" : "none";
      }}
      onDragLeave={(event) => {
        if (!carriesExternalFiles(event) || disabled) return;
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesExternalFiles(event)) return;
        // Always: otherwise the browser opens the dropped file in place of the app.
        event.preventDefault();
        depthRef.current = 0;
        setDragging(false);
        if (refusal !== null) toast.error(refusal);
        if (!accepts || target === null) return;
        const dropTarget = target;
        readDroppedFiles(event.dataTransfer)
          .then((files) => {
            if (files.length > 0) onFiles(files, dropTarget);
          })
          .catch((err: unknown) => {
            console.error("[drive] reading a drop failed", err);
            if (onError) onError(err);
            else toast.error(t(driveErrorToastKey(err, "drive.upload.readFailed")));
          });
      }}
    >
      {children}
      {dragging && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-2 z-30 rounded-lg border border-dashed bg-background/80",
            accepts ? "border-foreground" : "border-border",
          )}
        >
          <div
            className={cn(
              "sticky top-[30vh] flex flex-col items-center gap-2 px-4 py-10 text-center text-sm font-medium",
              accepts ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {accepts ? <FileUp className="h-6 w-6" /> : <Ban className="h-6 w-6" />}
            <span dir="auto" className={cn("max-w-full", accepts && "truncate")}>
              {accepts ? fmt(t("drive.upload.dropHere"), { folder: label }) : (refusal ?? t("drive.upload.dropNotAllowed"))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
