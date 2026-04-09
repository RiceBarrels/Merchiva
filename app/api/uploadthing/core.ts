import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createClient } from "@/lib/supabase/server";

const f = createUploadthing();

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { userId: user.id };
}

export const ourFileRouter = {
  siteImage: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(auth)
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  avatar: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(auth)
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  chatFile: f({
    image: { maxFileSize: "8MB", maxFileCount: 1 },
    video: { maxFileSize: "64MB", maxFileCount: 1 },
    blob: { maxFileSize: "32MB", maxFileCount: 1 },
  })
    .middleware(auth)
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
