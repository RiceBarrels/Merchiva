import { createUploadthing, type FileRouter } from "uploadthing/next";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";
import {
  appUploadInputParser, authorizeAppUpload, authorizePlatformUpload, recordAppUpload,
  type AppUploadInput, type AppUploadMetadata,
} from "@/lib/storage/server/app-upload-auth";
import { appUploadServerDeps } from "@/lib/storage/server/deps";

const f = createUploadthing();

// Every store endpoint takes `{ organizationId, source }` and needs a signed-in member of that store with room
// in its storage quota (lib/storage/server/app-upload-auth.ts); each stored file is recorded with its real size
// (app_file) and counts toward the store's one quota. Clients go through lib/storage/app-upload.ts, which adds
// the WorkOS bearer token and the input.

function appMiddleware({ req, input, files }: { req: Request; input: AppUploadInput; files: ReadonlyArray<{ size: number }> }) {
  return authorizeAppUpload(appUploadServerDeps(), { authHeader: req.headers.get("authorization"), input, files });
}

function record(metadata: AppUploadMetadata, file: { key: string; size: number; type: string }): Promise<void> {
  return recordAppUpload(appUploadServerDeps(), metadata, file);
}

export const ourFileRouter = {
  // Product images (components/image-upload.tsx).
  siteImage: f({ image: { maxFileSize: "4MB", maxFileCount: 10 } })
    .input(appUploadInputParser)
    .middleware(appMiddleware)
    .onUploadComplete(async ({ file, metadata }) => {
      await record(metadata, file);
      return { url: file.ufsUrl };
    }),

  // Profile photo and store logo. 4MB to match the client-side checks + the components.imageUpload.fileTooLarge copy.
  avatar: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .input(appUploadInputParser)
    .middleware(appMiddleware)
    .onUploadComplete(async ({ file, metadata }) => {
      await record(metadata, file);
      return { url: file.ufsUrl };
    }),

  // Chat attachments and voice notes (lib/chat/upload.ts, push-to-talk records audio/webm or audio/mp4),
  // training media, bug screenshots.
  generalFile: f({
    image: { maxFileSize: "8MB" },
    video: { maxFileSize: "64MB" },
    audio: { maxFileSize: "16MB" },
    pdf: { maxFileSize: "16MB" },
  })
    .input(appUploadInputParser)
    .middleware(appMiddleware)
    .onUploadComplete(async ({ file, metadata }) => {
      await record(metadata, file);
      return { url: file.ufsUrl };
    }),

  // Task completion evidence — multiple images and/or videos per task.
  taskEvidence: f({
    image: { maxFileSize: "8MB", maxFileCount: 10 },
    video: { maxFileSize: "64MB", maxFileCount: 10 },
  })
    .input(appUploadInputParser)
    .middleware(appMiddleware)
    .onUploadComplete(async ({ file, metadata }) => {
      await record(metadata, file);
      return { url: file.ufsUrl, type: file.type };
    }),

  // The platform blog's cover image (app/admins/blogs): platform admins only, no store, nothing recorded.
  platformImage: f({ image: { maxFileSize: "4MB", maxFileCount: 10 } })
    .middleware(({ req }) => authorizePlatformUpload(verifyAdminFromAuthHeader, req.headers.get("authorization")))
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
