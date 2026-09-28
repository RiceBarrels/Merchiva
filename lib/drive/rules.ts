/**
 * Drive storage rules: limits, blob-key grammar, name and MIME cleaning, blocked types.
 *
 * Client mirror of `spacetimedb/src/drive/logic.ts`. Same names and semantics on both sides; the server keeps sizes
 * in `bigint` bytes and durations in µs (`_MICROS`), this file uses `number` bytes and ms (`_MS`).
 * `scripts/tests/drive/rules-parity.test.ts` compares the two, so change both files together.
 *
 * Pure: no imports, no DOM, safe in route handlers, workers and tests.
 */

const KIB = 1024;
const MIB = 1024 * KIB;
const GIB = 1024 * MIB;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DRIVE_SPACES = ["my", "store"] as const;
export const DRIVE_KINDS = ["folder", "file"] as const;
export const DRIVE_SURFACES = ["manager", "store", "personal"] as const;

export const DRIVE_NAME_MAX = 255;
export const DRIVE_MIME_MAX = 127;

/** Largest single upload. */
export const DRIVE_MAX_FILE_BYTES = 1 * GIB;
export const DRIVE_THUMB_MAX_BYTES = 256 * KIB;
export const DRIVE_THUMB_TYPES = ["image/webp", "image/jpeg"] as const;
export const DRIVE_THUMB_LEAF = "_thumb";
/** Per-org quota unless support set `drive_usage.quotaBytesOverride`. */
export const DRIVE_DEFAULT_QUOTA_BYTES = 10 * GIB;

/** A pending upload expires this long after its latest authorize. */
export const DRIVE_UPLOAD_TTL_MS = 3 * HOUR_MS;
export const DRIVE_UPLOAD_MAX_ATTEMPTS = 8;
/** Pending uploads per uploader identity. */
export const DRIVE_MAX_PENDING_PER_UPLOADER = 20;
/** Bytes one uploader identity may hold in pending uploads (`too_many_pending` beyond it). */
export const DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES = 2 * DRIVE_MAX_FILE_BYTES;

export const DRIVE_MAX_ITEMS_PER_ORG = 100_000;
/** Ids per move / trash / restore / delete call. */
export const DRIVE_MAX_BATCH = 200;
/** Rows one cascade may touch. */
export const DRIVE_MAX_SUBTREE = 5_000;
export const DRIVE_MAX_DEPTH = 32;
/** Uploaded files in the trash are deleted after this. Docs, sheets and decks never auto-delete. */
export const DRIVE_TRASH_RETENTION_MS = 30 * DAY_MS;
export const DRIVE_SERVICE_SCOPE = "service";

/** Executables and installers. Refused on upload and on rename; this is not a malware scanner. */
export const DRIVE_BLOCKED_EXTENSIONS: readonly string[] = [
  "exe", "msi", "msix", "msp", "bat", "cmd", "com", "scr", "pif", "cpl", "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh",
  "hta", "reg", "lnk", "jar", "apk", "aab", "xapk", "ipa", "dmg", "pkg", "mpkg", "app", "command", "sh", "deb", "rpm",
  "appimage", "xpi", "crx", "gadget", "msc", "dll", "sys", "drv", "ocx", "inf", "iso", "img",
];
export const DRIVE_BLOCKED_MIME_TYPES: readonly string[] = [
  "application/x-msdownload", "application/x-msdos-program", "application/x-ms-installer",
  "application/x-msi", "application/vnd.microsoft.portable-executable", "application/x-sh",
  "application/x-shellscript", "application/java-archive", "application/vnd.android.package-archive",
  "application/x-apple-diskimage", "application/x-executable", "application/x-mach-binary",
  "application/x-iso9660-image",
];
/**
 * Types a browser would execute or render as a document. Stored as is, but only ever signed as downloads.
 * `isActiveDriveMime` also counts every `+xml` type, which a browser renders as an XML document that runs XHTML script.
 */
export const DRIVE_ACTIVE_MIME_TYPES: readonly string[] = [
  "text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml",
  "text/javascript", "application/javascript", "application/x-javascript", "text/ecmascript",
  "application/ecmascript", "application/x-shockwave-flash",
];

const UUID_ANY = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
/** `org/<orgId>/<itemId>/<blobId>/<asciiLeaf | _thumb>`: lowercase ids, v4 item and blob ids, ASCII leaf. */
export const DRIVE_BLOB_KEY_RE = new RegExp(
  `^org/(${UUID_ANY})/(${UUID_V4})/(${UUID_V4})/([A-Za-z0-9][A-Za-z0-9._-]{0,99}|${DRIVE_THUMB_LEAF})$`,
);

// Client only (no server twin).
/** Uploads at or above this size use the SDK's multipart PUT. */
export const DRIVE_MULTIPART_THRESHOLD_BYTES = 32 * MIB;
/** Longest edge of a generated thumbnail. */
export const DRIVE_THUMB_EDGE_PX = 480;
/** Ids per `POST /api/drive/url` call. */
export const DRIVE_URL_BATCH_MAX = 50;

const OCTET_STREAM = "application/octet-stream";
const BLOCKED_EXTENSIONS = new Set(DRIVE_BLOCKED_EXTENSIONS);
const BLOCKED_MIME_TYPES = new Set(DRIVE_BLOCKED_MIME_TYPES);
const ACTIVE_MIME_TYPES = new Set(DRIVE_ACTIVE_MIME_TYPES);

/** C0 and C1 controls (incl. DEL) and the Unicode bidi controls that can disguise an extension. */
function isStrippedCodePoint(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x061c ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

/**
 * NFC → strip C0/C1 and bidi controls → NFC again → trim. `null` when the result is '', '.', '..', contains '/' or
 * '\\', or is longer than `DRIVE_NAME_MAX` UTF-16 code units. Never truncates.
 *
 * The second NFC composes what a stripped control kept apart (`e` U+200E U+0301 → `é`), so the result is always
 * NFC and cleaning is idempotent: the module re-cleans the name the client sends and must reach the same leaf.
 */
export function cleanDriveName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (const ch of raw.normalize("NFC")) {
    if (!isStrippedCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  }
  const name = out.normalize("NFC").trim();
  if (name === "" || name === "." || name === "..") return null;
  if (name.includes("/") || name.includes("\\")) return null;
  if (name.length > DRIVE_NAME_MAX) return null;
  return name;
}

const MIME_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;

/**
 * Lowercased `type/subtype` without parameters (RFC 6838 name characters, at most `DRIVE_MIME_MAX` long);
 * '' when missing or malformed. Checked before lowercasing, so no non-ASCII input can fold into a valid type.
 */
export function normalizeDriveMime(raw: string): string {
  if (typeof raw !== "string") return "";
  const base = raw.split(";", 1)[0].trim();
  if (base.length === 0 || base.length > DRIVE_MIME_MAX || !MIME_RE.test(base)) return "";
  return base.toLowerCase();
}

/**
 * Lowercased text after the last '.', without the dot; '' when there is none. Trailing dots and spaces are ignored
 * first, as Windows drops them (`setup.exe.` → `exe`). A leading-dot name counts too (`.apk` → `apk`).
 */
export function driveExtension(name: string): string {
  if (typeof name !== "string") return "";
  const base = name.replace(/[.\s]+$/u, "");
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/**
 * True for a blocked MIME type, or a blocked extension on the name or on its blob-key leaf. The leaf counts because a
 * direct download saves under it, and `asciiFileName` can expose an extension the name hides (`setup.exe~` →
 * `setup.exe`). Callers pass the cleaned name.
 */
export function isBlockedDriveFile(name: string, mimeType: string): boolean {
  if (typeof name === "string") {
    for (const ext of [driveExtension(name), driveExtension(asciiFileName(name))]) {
      if (ext !== "" && BLOCKED_EXTENSIONS.has(ext)) return true;
    }
  }
  return BLOCKED_MIME_TYPES.has(normalizeDriveMime(mimeType));
}

/** True when the type must only ever be served as a download (never viewed or embedded): the list, or any `+xml`. */
export function isActiveDriveMime(mimeType: string): boolean {
  const mime = normalizeDriveMime(mimeType);
  return ACTIVE_MIME_TYPES.has(mime) || mime.endsWith("+xml");
}

export function isDriveSpace(v: string): v is (typeof DRIVE_SPACES)[number] {
  return v === "my" || v === "store";
}

const LEAF_EXTENSION_RE = /^[A-Za-z0-9]{1,10}$/;
const LEAF_STEM_MAX = 80;

/**
 * The ASCII leaf of a blob key, from an already cleaned display name. ASCII operations only (no Unicode folding),
 * so the module computes the same leaf: `Q3 report.xlsx` → `Q3-report.xlsx`, `报告.pdf` → `file.pdf`,
 * `Café menu.JPG` → `Caf-menu.jpg`, `.env` → `env`, `_thumb` → `thumb`. Always starts with `[A-Za-z0-9]`, ≤ 91 chars.
 */
export function asciiFileName(cleanName: string): string {
  let stem = cleanName;
  let ext = "";
  const dot = cleanName.lastIndexOf(".");
  if (dot > 0) {
    const rest = cleanName.slice(dot + 1);
    if (LEAF_EXTENSION_RE.test(rest)) {
      ext = rest.toLowerCase();
      stem = cleanName.slice(0, dot);
    }
  }
  let leaf = stem
    .replace(/[^A-Za-z0-9._-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
  leaf = leaf.slice(0, LEAF_STEM_MAX).replace(/[._-]+$/, "");
  if (leaf === "") leaf = "file";
  return ext ? `${leaf}.${ext}` : leaf;
}

export interface DriveBlobKeyParts {
  organizationId: string;
  itemId: string;
  blobId: string;
  leaf: string;
  isThumb: boolean;
}

/** `org/<organizationId>/<itemId>/<blobId>/<asciiFileName(cleanName)>`. Ids must already be lowercase uuids. */
export function driveBlobKey(organizationId: string, itemId: string, blobId: string, cleanName: string): string {
  return `org/${organizationId}/${itemId}/${blobId}/${asciiFileName(cleanName)}`;
}

/** The parts of a key matching `DRIVE_BLOB_KEY_RE`, else `null`. */
export function parseDriveBlobKey(key: string): DriveBlobKeyParts | null {
  if (typeof key !== "string") return null;
  const m = DRIVE_BLOB_KEY_RE.exec(key);
  if (!m) return null;
  return { organizationId: m[1], itemId: m[2], blobId: m[3], leaf: m[4], isThumb: m[4] === DRIVE_THUMB_LEAF };
}

/** Same prefix with the `_thumb` leaf; '' when `blobKey` is not a valid key. */
export function driveThumbKeyFor(blobKey: string): string {
  const parts = parseDriveBlobKey(blobKey);
  if (!parts) return "";
  return `org/${parts.organizationId}/${parts.itemId}/${parts.blobId}/${DRIVE_THUMB_LEAF}`;
}

/** Quota in bytes: the support override when set, else `DRIVE_DEFAULT_QUOTA_BYTES`. Never 0. */
export function effectiveQuotaBytes(usage: { quotaBytesOverride: number } | null): number {
  const override = usage?.quotaBytesOverride ?? 0;
  return Number.isFinite(override) && override > 0 ? override : DRIVE_DEFAULT_QUOTA_BYTES;
}

const OOXML = "application/vnd.openxmlformats-officedocument";
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  // Images
  png: "image/png", apng: "image/apng", jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", jfif: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon",
  heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", psd: "image/vnd.adobe.photoshop",
  // Video
  mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm", mov: "video/quicktime", qt: "video/quicktime", ogv: "video/ogg",
  // Audio
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg",
  opus: "audio/opus", flac: "audio/flac", weba: "audio/webm",
  // Text and data
  pdf: "application/pdf", txt: "text/plain", text: "text/plain", log: "text/plain", md: "text/markdown",
  markdown: "text/markdown", json: "application/json", xml: "application/xml", html: "text/html", htm: "text/html",
  csv: "text/csv", tsv: "text/tab-separated-values", rtf: "application/rtf", ics: "text/calendar", vcf: "text/vcard",
  // Office
  doc: "application/msword", docx: `${OOXML}.wordprocessingml.document`,
  xls: "application/vnd.ms-excel", xlsx: `${OOXML}.spreadsheetml.sheet`,
  ppt: "application/vnd.ms-powerpoint", pptx: `${OOXML}.presentationml.presentation`,
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation", pages: "application/vnd.apple.pages",
  numbers: "application/vnd.apple.numbers", key: "application/vnd.apple.keynote",
  // Archives
  zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
};

/** MIME type for a file name's extension; `application/octet-stream` when unknown. */
export function mimeFromExtension(name: string): string {
  const ext = driveExtension(name);
  return Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, ext) ? MIME_BY_EXTENSION[ext] : OCTET_STREAM;
}

/** The type to store for an upload: the browser's type when it is specific, else one from the extension. */
export function resolveDriveMime(file: { type?: string }, name: string): string {
  const given = normalizeDriveMime(file?.type ?? "");
  if (given !== "" && given !== OCTET_STREAM) return given;
  return mimeFromExtension(name);
}
