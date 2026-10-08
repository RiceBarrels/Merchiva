// Every link to the docs home or editor is built here (plan D36).
//
// The editor is a static route that reads `?id=` (no dynamic segment — the
// Capacitor static export can't prerender runtime ids). Static builds add a
// trailing slash; Next and the browser shell canonicalize that, so links are
// always written without one — the same shape as the server's `docLink`.

// The Docs home is folded into Drive: its link is Drive's documents view (driveKindHref("doc")), written out here
// because lib/drive/hrefs.ts imports this file. /manager/docs still redirects there for old links.
export const DOCS_HOME_HREF = "/manager/drive?space=recent&type=doc";
export const DOCS_EDIT_PATH = "/manager/docs/edit";

export interface DocumentHrefOptions {
  /** Comment thread to focus (`&comment=`). */
  comment?: string;
  /** Version to preview (`&version=`). */
  version?: string;
  /** Freshly created document (`&new=1`) — the editor focuses the title. */
  isNew?: boolean;
}

/** "/manager/docs/edit?id=<id>[&comment=<threadId>][&version=<versionId>][&new=1]" */
export function documentHref(id: string, opts: DocumentHrefOptions = {}): string {
  const params = [`id=${encodeURIComponent(id.trim().toLowerCase())}`];
  if (opts.comment) params.push(`comment=${encodeURIComponent(opts.comment)}`);
  if (opts.version) params.push(`version=${encodeURIComponent(opts.version)}`);
  if (opts.isNew) params.push("new=1");
  return `${DOCS_EDIT_PATH}?${params.join("&")}`;
}
