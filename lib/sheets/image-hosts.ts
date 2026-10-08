// The only hosts a spreadsheet may load an image from: the upload service Docs and Sheets store images on
// (lib/docs/uploads.ts → UploadThing). Drawings, sheet backgrounds and the IMAGE() formula all go through
// isAllowedImageUrl, so opening a sheet never makes a viewer fetch a third-party URL (a tracking beacon or
// an exfiltration channel).

/** Exact hosts, or `*.` + a domain for any subdomain of it (not the domain itself). */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = ["utfs.io", "*.ufs.sh"];

const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";

function escapeHost(host: string): string {
  return host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALLOWED_HOST_RES: readonly RegExp[] = ALLOWED_IMAGE_HOSTS.map((pattern) =>
  pattern.startsWith("*.")
    ? new RegExp(`^(?:${HOST_LABEL}\\.)+${escapeHost(pattern.slice(2))}$`)
    : new RegExp(`^${escapeHost(pattern)}$`),
);

/** True for an https URL on an allowed host, with no credentials and no explicit port. */
export function isAllowedImageUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_RES.some((re) => re.test(host));
}
