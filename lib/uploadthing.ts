import {
  generateUploadButton,
  generateUploadDropzone,
  generateReactHelpers,
} from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";
import { apiUrl } from "@/lib/api-client";

// apiUrl: the static Capacitor build posts to the hosted API, not capacitor://…/api/uploadthing.
// Store uploads go through lib/storage/app-upload.ts, which adds the auth header and `{ organizationId, source }`.
const url = apiUrl("/api/uploadthing");

export const UploadButton = generateUploadButton<OurFileRouter>({ url });
export const UploadDropzone = generateUploadDropzone<OurFileRouter>({ url });
export const { useUploadThing, uploadFiles } =
  generateReactHelpers<OurFileRouter>({ url });
