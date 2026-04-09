import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createClient } from "@/lib/supabase/server";

const f = createUploadthing();

async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { userId: user.id };
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
