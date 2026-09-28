// Subscription SQL owned by Sheets. The live set of an open spreadsheet is sheetLiveQueries in
// lib/docs/queries.ts (docLiveQueries + its edit lease); this file only adds the publish probe.

import { docScopedSql, docsProbeQueries } from "@/lib/docs/queries";

/**
 * Zero-row query set over every Docs table plus the two sheet tables. It applies only when the module
 * on the server has them all, so it doubles as the "are spreadsheets published?" probe
 * (lib/spacetimedb/hooks/useSheets.ts useSheetsBackendStatus).
 */
export function sheetsProbeQueries(): string[] {
  return [
    ...docsProbeQueries(),
    docScopedSql("document_edit_lease", "document_id", ""),
    docScopedSql("document_version_state", "version_id", ""),
  ];
}
