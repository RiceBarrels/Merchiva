import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

// Auth is handled via SpacetimeDB on the client.
// UploadThing middleware is open — token validation happens client-side.
async function auth() {
  return { userId: "stdb" };
}

export const ourFileRouter = {
  siteImage: f({ image: { maxFileSize: "4MB", maxFileCount: 10 } })
    .middleware(async () => auth())
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  avatar: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => auth())
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),

  generalFile: f({
    image: { maxFileSize: "8MB" },
    video: { maxFileSize: "64MB" },
    pdf: { maxFileSize: "16MB" },
  })
    .middleware(async () => auth())
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
