// Uploads a chat attachment (UploadThing) and classifies it for chat_message.attachmentType.

/** `organizationId` is the store the chat belongs to; the upload counts toward its storage quota. */
export async function uploadChatFile(
  file: File,
  organizationId: string,
): Promise<{ url: string; type: string; name: string }> {
  const { uploadAppFiles } = await import("@/lib/storage/app-upload");
  const [res] = await uploadAppFiles("generalFile", { files: [file], organizationId, source: "chat" });

  let type = "file";
  if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";

  return { url: res.ufsUrl, type, name: file.name };
}
