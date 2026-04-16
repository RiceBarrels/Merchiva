"use client";

import { useState, useCallback } from "react";
import { useNode, type UserComponent } from "@craftjs/core";
import { ImageSettings } from "../craft-settings/image-settings";
import { Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";

interface CraftImageProps {
  src: string;
  alt: string;
  width: string;
  height: string;
  objectFit: string;
  borderRadius: string;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const MAX_BYTES = 4 * 1024 * 1024;

export const CraftImage: UserComponent<CraftImageProps> = ({
  src,
  alt,
  width,
  height,
  objectFit,
  borderRadius,
}) => {
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();

  const [draggingFile, setDraggingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload, isUploading } = useUploadThing("siteImage", {
    onClientUploadComplete: (res) => {
      if (res?.[0]) {
        setProp((p: Record<string, unknown>) => { p.src = res[0].ufsUrl; });
      }
    },
    onUploadError: (err) => setError(err.message),
  });

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) { setError("Unsupported file type."); return; }
    if (file.size > MAX_BYTES) { setError("File exceeds 4 MB."); return; }
    await startUpload([file]);
  }, [startUpload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingFile(true);
  }, []);

  const onDragLeave = useCallback(() => setDraggingFile(false), []);

  if (!src) {
    return (
      <div
        ref={(ref: HTMLElement | null) => { if (ref) connect(drag(ref)); }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          width,
          height: height === "auto" ? "200px" : height,
          borderRadius,
          backgroundColor: draggingFile ? "#dbeafe" : "#f3f4f6",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          color: "#9ca3af",
          fontSize: "0.75rem",
          border: draggingFile ? "2px dashed #3b82f6" : "2px dashed #d1d5db",
          transition: "all 0.15s",
          cursor: "pointer",
        }}
      >
        {isUploading ? (
          <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite" }} />
        ) : (
          <>
            <ImageIcon style={{ width: 24, height: 24, opacity: 0.4 }} />
            <span>Drop image or click to upload</span>
          </>
        )}
        {error && <span style={{ color: "#ef4444", fontSize: "0.65rem" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div
      ref={(ref: HTMLElement | null) => { if (ref) connect(drag(ref)); }}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{ position: "relative", display: "inline-block", width }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height,
          objectFit: objectFit as React.CSSProperties["objectFit"],
          borderRadius,
          display: "block",
        }}
      />
      {isUploading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.7)", borderRadius,
        }}>
          <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
        </div>
      )}
      {draggingFile && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(59,130,246,0.1)", border: "2px dashed #3b82f6", borderRadius,
        }}>
          <Upload style={{ width: 20, height: 20, color: "#3b82f6" }} />
        </div>
      )}
    </div>
  );
};

CraftImage.craft = {
  displayName: "Image",
  props: {
    src: "",
    alt: "Image",
    width: "100%",
    height: "auto",
    objectFit: "cover",
    borderRadius: "0",
  },
  related: { settings: ImageSettings },
};
