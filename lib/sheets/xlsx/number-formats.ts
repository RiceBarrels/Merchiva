// Number format codes (sheets.md §11.1). Univer's formatter reads Excel format codes as they are, so a code
// crosses in both directions unchanged; only "General" (Univer: no pattern) and codes Excel would refuse are
// normalized away.

/** The format an imported date cell gets when the file gave it none. */
export const DEFAULT_DATE_FORMAT = "yyyy-mm-dd";
/** Excel refuses longer format codes. */
export const NUM_FMT_MAX_CHARS = 255;

/** A format code as both sides store it: trimmed; "" for none, "General" or an over-long code. */
export function normalizeNumFmt(fmt: string | null | undefined): string {
  if (typeof fmt !== "string") return "";
  const value = fmt.trim();
  if (value === "" || value.toLowerCase() === "general" || value.length > NUM_FMT_MAX_CHARS) return "";
  return value;
}

/**
 * True when the code formats a number as a date or time: its first section holds a d, m, y, h or s token
 * once quoted text, escapes, padding and [colour / condition / locale] brackets are removed. Elapsed-time
 * brackets ([h], [mm], [ss]) count as time.
 */
export function isDateFormat(fmt: string | null | undefined): boolean {
  const code = normalizeNumFmt(fmt);
  if (code === "") return false;
  const stripped = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/[_*]./g, "")
    .replace(/\[(?:h+|m+|s+)\]/gi, "h")
    .replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(stripped.split(";")[0]);
}
