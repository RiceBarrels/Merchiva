import type { Metadata } from "next";
import { LOCALES, LOCALE_BCP47, type Locale } from "./config";

const BASE_URL = "https://project-management-phi-red.vercel.app";

// Build canonical + hreflang alternates for a locale-prefixed marketing page.
// `path` is the locale-independent tail (e.g. "/pricing", or "" for home).
// Emits one <link rel="alternate" hreflang="…"> per locale plus x-default → en.
export function buildAlternates(path: string, currentLocale: Locale): Metadata["alternates"] {
  const tail = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[LOCALE_BCP47[loc]] = `${BASE_URL}/${loc}${tail}`;
  }
  languages["x-default"] = `${BASE_URL}/en${tail}`;
  return {
    canonical: `${BASE_URL}/${currentLocale}${tail}`,
    languages,
  };
}
