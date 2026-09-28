"use client";

// The four hidden file inputs behind Drive's upload buttons: files, a whole folder, photos and
// videos from the library, and the camera (the same `capture` input the lite Tasks app uses;
// @capacitor/camera is not installed). useDriveFilePickers owns them and hands every pick over
// as dropped files with paths, so a picked folder goes through the same folder planner as a
// dropped one. Camera shots arrive as "image.jpg"; they are renamed "Photo <date time>.jpg".
//
// Mount <DriveFileInputs {...pickers.inputs} /> once next to whatever calls the pickers.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isCapacitorNative } from "@/lib/capacitor";
import { extensionOf } from "@/lib/drive/file-kinds";
import { useT } from "@/lib/i18n/context";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import { photoFileName, type DroppedFile } from "@/components/drive/model/upload-plan";
import { droppedFromFiles } from "@/components/drive/upload/read-drop";

export type DrivePickSource = "files" | "folder" | "photos" | "camera";

export interface DriveFileInputsProps {
  /** Attaches (or, with null, detaches) the hidden input of one picker. */
  register(source: DrivePickSource, input: HTMLInputElement | null): void;
  /** What a picker returned. */
  onPicked(source: DrivePickSource, files: FileList | null): void;
}

export interface DriveFilePickers {
  pickFiles(): void;
  pickFolder(): void;
  pickPhotos(): void;
  takePhoto(): void;
  /** This device can pick a whole folder (desktop browsers; not touch devices or the native apps). */
  supportsFolder: boolean;
  /** Props for <DriveFileInputs />, which must be mounted for the pickers to open. */
  inputs: DriveFileInputsProps;
}

const COARSE_QUERY = "(pointer: coarse)";

function subscribePointer(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function folderPickerSupported(): boolean {
  if (typeof window === "undefined" || typeof HTMLInputElement === "undefined") return false;
  if (!("webkitdirectory" in HTMLInputElement.prototype) || isCapacitorNative()) return false;
  return typeof window.matchMedia !== "function" || !window.matchMedia(COARSE_QUERY).matches;
}

const noFolderPicker = () => false;

/** A camera shot's extension: its own, else its type's ("image/jpeg" → "jpg"). */
function photoExtension(file: File): string {
  const own = extensionOf(file.name);
  if (own !== "") return own;
  const subtype = (file.type.split("/")[1] ?? "").split(";")[0].trim().toLowerCase();
  if (subtype === "" || subtype === "jpeg") return "jpg";
  return subtype;
}

function cameraPhoto(file: File, template: string, now: Date): DroppedFile {
  const name = photoFileName(template, now, photoExtension(file));
  return { file: new File([file], name, { type: file.type, lastModified: file.lastModified }), path: name };
}

/** Opens the pickers and hands their files to `onFiles` (the latest one passed; a stable callback is not required). */
export function useDriveFilePickers(onFiles: (files: DroppedFile[], source: DrivePickSource) => void): DriveFilePickers {
  const t = useT();
  const inputsRef = useRef<Partial<Record<DrivePickSource, HTMLInputElement | null>>>({});
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  const supportsFolder = useSyncExternalStore(subscribePointer, folderPickerSupported, noFolderPicker);

  const register = useCallback((source: DrivePickSource, input: HTMLInputElement | null) => {
    inputsRef.current[source] = input;
    // `webkitdirectory` is not a React prop; the DOM property turns the input into a folder picker.
    if (source === "folder" && input) input.webkitdirectory = true;
  }, []);

  const open = useCallback((source: DrivePickSource) => {
    const input = inputsRef.current[source];
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  const onPicked = useCallback(
    (source: DrivePickSource, list: FileList | null) => {
      const files = list ? Array.from(list) : [];
      if (files.length === 0) return;
      let dropped: DroppedFile[];
      try {
        if (source === "camera") {
          const now = new Date();
          dropped = files.map((file) => cameraPhoto(file, t("drive.upload.photoName"), now));
        } else {
          dropped = droppedFromFiles(files);
        }
      } catch (err) {
        toast.error(t(driveErrorToastKey(err)));
        return;
      }
      onFilesRef.current(dropped, source);
    },
    [t],
  );

  return useMemo(
    () => ({
      pickFiles: () => open("files"),
      pickFolder: () => open("folder"),
      pickPhotos: () => open("photos"),
      takePhoto: () => open("camera"),
      supportsFolder,
      inputs: { register, onPicked },
    }),
    [open, register, onPicked, supportsFolder],
  );
}

const INPUTS: ReadonlyArray<{ source: DrivePickSource; multiple: boolean; accept?: string; capture?: "environment" }> = [
  { source: "files", multiple: true },
  { source: "folder", multiple: true },
  { source: "photos", multiple: true, accept: "image/*,video/*" },
  { source: "camera", multiple: false, accept: "image/*", capture: "environment" },
];

/** The hidden inputs; render once per useDriveFilePickers. */
export function DriveFileInputs({ register, onPicked }: DriveFileInputsProps) {
  return (
    <>
      {INPUTS.map(({ source, multiple, accept, capture }) => (
        <input
          key={source}
          ref={(input) => register(source, input)}
          type="file"
          multiple={multiple}
          accept={accept}
          capture={capture}
          tabIndex={-1}
          aria-hidden
          className="hidden"
          onChange={(event) => {
            const input = event.currentTarget;
            onPicked(source, input.files);
            input.value = "";
          }}
        />
      ))}
    </>
  );
}
