import type { Locale } from "./config";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import es from "@/messages/es.json";
import hi from "@/messages/hi.json";
import ar from "@/messages/ar.json";
import fr from "@/messages/fr.json";

export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  zh: zh as Dictionary,
  es: es as Dictionary,
  hi: hi as Dictionary,
  ar: ar as Dictionary,
  fr: fr as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export function lookup(dict: Dictionary, path: string): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}
