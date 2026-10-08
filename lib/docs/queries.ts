// Raw SQL for docs subscriptions. Same shape the SDK query builder renders
// (`tables.x.where(r => r.col.eq(v)).toSql()`): quoted identifiers,
// snake_case columns, single quotes doubled — so these work before
// `spacetime generate` too. scripts/tests/docs/queries.test.ts checks parity.

import { isDocumentId } from "./ids";

const SQL_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

/** Every docs table and the column that scopes it to one document. */
export const DOC_TABLE_SCOPE_COLUMNS = [
  ["document", "id"],
  ["document_update", "document_id"],
  ["document_snapshot", "document_id"],
  ["document_presence", "document_id"],
  ["document_comment", "document_id"],
  ["document_version", "document_id"],
  ["document_star", "document_id"],
  ["document_access", "document_id"],
  // A document's type and folder (useDocs.ts reads them with the document rows).
  ["document_file", "document_id"],
] as const;

/** Tables the Yjs provider subscribes to as ONE query set per open document. */
export const DOC_LIVE_TABLES = ["document_snapshot", "document_update", "document_presence"] as const;

export function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `SELECT * FROM "<table>" WHERE "<table>"."<column>" = '<value>'` */
export function docScopedSql(table: string, column: string, value: string): string {
  if (!SQL_IDENTIFIER_RE.test(table) || !SQL_IDENTIFIER_RE.test(column)) {
    throw new Error(`Invalid SQL identifier: ${table}.${column}`);
  }
  return `SELECT * FROM "${table}" WHERE "${table}"."${column}" = ${sqlStringLiteral(value)}`;
}

/** Snapshot + update log + presence for one document, applied atomically. */
export function docLiveQueries(documentId: string): string[] {
  if (!isDocumentId(documentId)) throw new Error("Invalid document id");
  const id = documentId.toLowerCase();
  return DOC_LIVE_TABLES.map((table) => docScopedSql(table, "document_id", id));
}

/** A spreadsheet's live set: docLiveQueries plus its edit lease, applied atomically. */
export function sheetLiveQueries(documentId: string): string[] {
  const queries = docLiveQueries(documentId);
  queries.push(docScopedSql("document_edit_lease", "document_id", documentId.toLowerCase()));
  return queries;
}

/**
 * Zero-row query set touching every docs table. It applies only when the
 * module on the server has all of them, so it doubles as the "is Docs
 * published?" probe (lib/spacetimedb/hooks/useDocs.ts).
 */
export function docsProbeQueries(): string[] {
  return DOC_TABLE_SCOPE_COLUMNS.map(([table, column]) => docScopedSql(table, column, ""));
}
