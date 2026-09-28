// Raw SQL for the "is Drive published?" probe (lib/docs/backend-probe.ts with the
// `queries` option). Same shape as lib/docs/queries.ts, so it works before
// `spacetime generate` too.
//
// The client never subscribes to document_reader_index, drive_admin_index or
// drive_org_state: the first two are rule-free RLS join targets, the last is private.

import { docScopedSql } from "@/lib/docs/queries";

/**
 * Zero-row query set over every Drive table the client reads, plus `document_file`, where a document's type and
 * folder live (the `document` row keeps the columns clients from before Drive decode). It applies only when the
 * connected module has all of them; a missing table or column fails this handle alone, never the Docs probe or the
 * app's main subscriptions.
 */
export function driveProbeQueries(): string[] {
  return [
    docScopedSql("drive_item", "id", ""),
    docScopedSql("drive_usage", "organization_id", ""),
    docScopedSql("drive_star", "id", ""),
    docScopedSql("drive_notice_ack", "id", ""),
    docScopedSql("document_file", "document_id", ""),
  ];
}
