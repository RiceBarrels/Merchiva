import { uploadFiles } from "@/lib/uploadthing";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

type UploadEndpoint = keyof OurFileRouter;

export async function uploadFile(
  file: File,
  endpoint: UploadEndpoint = "siteImage"
): Promise<string> {
  const [res] = await uploadFiles(endpoint, { files: [file] });
  return res.ufsUrl;
}

// Kept for backward-compat call sites that used the old Supabase URL.
// UploadThing manages deletion via the dashboard; no-op here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteSiteImage(_url: string): Promise<void> {
  // Deletion is managed through the UploadThing dashboard or API.
}
