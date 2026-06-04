import type { MetadataRoute } from "next";
import { LOCALES, LOCALE_BCP47 } from "@/lib/i18n/config";

export const dynamic = "force-static";

const BASE_URL = "https://project-management-phi-red.vercel.app";

// Locale-prefixed marketing routes (tail, "" = home) with crawl hints.
const LOCALIZED_PATHS: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "", changeFrequency: "weekly", priority: 1.0 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/features", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/blogs", changeFrequency: "weekly", priority: 0.6 },
  { path: "/download", changeFrequency: "monthly", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const { path, changeFrequency, priority } of LOCALIZED_PATHS) {
    // hreflang alternates shared by every locale variant of this path.
    const languages: Record<string, string> = {};
    for (const loc of LOCALES) languages[LOCALE_BCP47[loc]] = `${BASE_URL}/${loc}${path}`;
    languages["x-default"] = `${BASE_URL}/en${path}`;

    for (const loc of LOCALES) {
      entries.push({
        url: `${BASE_URL}/${loc}${path}`,
        lastModified: now,
        changeFrequency,
        priority,
        alternates: { languages },
      });
    }
  }

  // Auth routes are not localized.
  entries.push(
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  );

  return entries;
}
