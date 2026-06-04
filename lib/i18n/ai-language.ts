// Maps a UI locale code to the descriptive language name injected into AI
// system prompts ("Respond in …"). Tolerant of region variants so the three
// Chinese locales (zh-cn / zh-tw / zh-hk) and any en-US-style tags resolve.
export function languageNameFor(lang: string): string {
  const l = (lang || "").toLowerCase();
  if (l === "zh-tw" || l === "zh-hk") return "Chinese (繁體中文)";
  if (l.startsWith("zh")) return "Chinese (简体中文)";
  if (l.startsWith("es")) return "Spanish (Español)";
  if (l.startsWith("fr")) return "French (Français)";
  if (l.startsWith("ar")) return "Arabic (العربية)";
  if (l.startsWith("hi")) return "Hindi (हिन्दी)";
  return "English";
}
