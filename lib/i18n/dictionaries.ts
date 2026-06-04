import type { Locale } from "./config";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-cn.json";
import zhTW from "@/messages/zh-tw.json";
import zhHK from "@/messages/zh-hk.json";
import fr from "@/messages/fr.json";
import es from "@/messages/es.json";
import hi from "@/messages/hi.json";
import ar from "@/messages/ar.json";

export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  "zh-cn": zhCN as Dictionary,
  "zh-tw": zhTW as Dictionary,
  "zh-hk": zhHK as Dictionary,
  fr: fr as Dictionary,
  es: es as Dictionary,
  hi: hi as Dictionary,
  ar: ar as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

// Resolve a dotted path against a single dictionary. Returns the string value,
// or null if the path is missing / not a leaf string.
function resolve(dict: Dictionary, path: string): string | null {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return null;
    }
  }
  return typeof cur === "string" ? cur : null;
}

export function lookup(dict: Dictionary, path: string): string {
  // Try the requested locale first, then fall back to English so a key that's
  // missing in a translation still renders real text instead of the raw path.
  // Only as a last resort do we surface the path itself (genuinely unknown key).
  return resolve(dict, path) ?? resolve(dictionaries.en, path) ?? path;
}
