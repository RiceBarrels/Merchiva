import { uploadFiles } from "@/lib/uploadthing";

export async function uploadSiteImage(file: File): Promise<string> {
  const [res] = await uploadFiles("siteImage", { files: [file] });
  return res.ufsUrl;
}

// No-op: UploadThing file deletion is handled server-side via UTApi if needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteSiteImage(_url: string): Promise<void> {
  // Files are automatically managed by UploadThing
}
