"use client";

import { useRef, useState, DragEvent } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB (siteImage endpoint limit)

interface ImageUploadProps {
  value: string;          // current URL (or empty string)
  orgId: string;
  onChange: (url: string) => void;
  className?: string;
}

export function ImageUpload({ value, onChange, className }: ImageUploadProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const { startUpload, isUploading } = useUploadThing("siteImage", {
    onClientUploadComplete: (res) => {
      if (res?.[0]) {
        onChange(res[0].ufsUrl);
        if (navigator.vibrate) navigator.vibrate(30);
      }
    },
    onUploadError: (err) => setError(err.message),
  });

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError(t("components.imageUpload.unsupportedType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("components.imageUpload.fileTooLarge"));
      return;
    }
    await startUpload([file]);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Drop zone / preview */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "relative rounded border border-dashed border-border transition-colors",
          dragging && "border-blue-400 bg-blue-50/40",
          value ? "h-24" : "h-16 flex items-center justify-center"
        )}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={t("components.imageUpload.preview")}
              className="h-full w-full object-contain rounded"
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
              title={t("components.imageUpload.removeImage")}
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageIcon className="h-5 w-5 opacity-40" />
            <span className="text-[10px]">{t("components.imageUpload.dropHere")}</span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-background/70">
            <Spinner size={16} className="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Upload button */}
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
      >
        {isUploading ? (
          <><Spinner size={12} /> {t("components.imageUpload.uploading")}</>
        ) : (
          <><Upload className="h-3 w-3" /> {t("components.imageUpload.uploadImage")}</>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={onInputChange}
      />

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
