import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/~/", "/api/", "/setup", "/auth-callback", "/invite/", "/preview/", "/s/"],
      },
    ],
    sitemap: "https://project-management-phi-red.vercel.app/sitemap.xml",
  };
}
