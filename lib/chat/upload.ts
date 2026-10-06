// Uploads a chat attachment (UploadThing) and classifies it for chat_message.attachmentType.

export async function uploadChatFile(file: File): Promise<{ url: string; type: string; name: string }> {
  const { uploadFiles } = await import("@/lib/uploadthing");
  const [res] = await uploadFiles("generalFile", { files: [file] });

  let type = "file";
  if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";

  return { url: res.ufsUrl, type, name: file.name };
}
