// Where an app file was uploaded from: app_file.source. Mirrors APP_FILE_SOURCES
// and APP_UPLOAD_MAX_FILES in spacetimedb/src/drive/ (parity test in
// scripts/tests/storage/uploadthing-key.test.ts). Pure.

export const APP_FILE_SOURCES = [
  "chat", "tasks", "inventory", "training", "products", "bugs", "logo", "avatar",
  "doc_image", "sheet_image", "slides_image", "other",
] as const;

export type AppFileSource = (typeof APP_FILE_SOURCES)[number];

/** Files in one beginAppUpload (the module refuses 0 or more). */
export const APP_UPLOAD_MAX_FILES = 20;

const SOURCES: ReadonlySet<string> = new Set(APP_FILE_SOURCES);

export function isAppFileSource(value: unknown): value is AppFileSource {
  return typeof value === "string" && SOURCES.has(value);
}
