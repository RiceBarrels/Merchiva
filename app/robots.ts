import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/manager/", "/store", "/personal", "/api/", "/setup", "/auth-callback", "/invite/", "/preview/", "/s/"],
      },
    ],
    sitemap: "https://project-management-phi-red.vercel.app/sitemap.xml",
  };
}
