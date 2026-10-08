import { describe, expect, test } from "bun:test";
import { createDocConnection, wrapDocTable } from "@/lib/docs/connection";
import { DOC_ERROR_I18N_KEYS, docErrorCode, docErrorMessage } from "@/lib/docs/errors";
import { DOCS_HOME_HREF, documentHref } from "@/lib/docs/hrefs";
import { docsHomeRedirectHref, driveKindHref } from "@/lib/drive/hrefs";
import { DOC_UUID_RE, formatUuidV4, isDocumentId, newDocumentId } from "@/lib/docs/ids";
import {
  groupDocCommentThreads,
  idString,
  mapComment,
  mapDocument,
  mapDocumentFile,
  mapDocuments,
  mapGrant,
  mapUpdateRow,
  parseDocPageSetup,
  toBytes,
} from "@/lib/docs/mappers";
import { DOC_LIVE_TABLES, DOC_TABLE_SCOPE_COLUMNS, docLiveQueries, docScopedSql, docsProbeQueries, sheetLiveQueries } from "@/lib/docs/queries";
import type { DocUpdateRow } from "@/lib/docs/types";
import { tables } from "@/lib/spacetimedb/generated";

const DOC_ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";

/* eslint-disable @typescript-eslint/no-explicit-any */
const generated = tables as unknown as Record<string, any>;

describe("docLiveQueries", () => {
  test("renders snapshot + update + presence for one document", () => {
    expect(docLiveQueries(DOC_ID)).toEqual([
      `SELECT * FROM "document_snapshot" WHERE "document_snapshot"."document_id" = '${DOC_ID}'`,
      `SELECT * FROM "document_update" WHERE "document_update"."document_id" = '${DOC_ID}'`,
      `SELECT * FROM "document_presence" WHERE "document_presence"."document_id" = '${DOC_ID}'`,
    ]);
    expect(DOC_LIVE_TABLES).toEqual(["document_snapshot", "document_update", "document_presence"]);
  });

  test("lowercases the id", () => {
    expect(docLiveQueries(DOC_ID.toUpperCase())).toEqual(docLiveQueries(DOC_ID));
  });

  test("sheetLiveQueries adds the spreadsheet's edit lease to the same set", () => {
    expect(sheetLiveQueries(DOC_ID.toUpperCase())).toEqual([
      ...docLiveQueries(DOC_ID),
      `SELECT * FROM "document_edit_lease" WHERE "document_edit_lease"."document_id" = '${DOC_ID}'`,
    ]);
    expect(() => sheetLiveQueries("abc")).toThrow("Invalid document id");
  });

  test("rejects anything that isn't a v4 UUID", () => {
    for (const bad of ["", "abc", "1f0e4c52-8d1a-1b6e-9c3f-2a7b5d9e0c11", `${DOC_ID}' OR '1'='1`, `${DOC_ID} `]) {
      expect(() => docLiveQueries(bad)).toThrow("Invalid document id");
    }
  });
});

describe("docScopedSql matches the SDK query builder", () => {
  test("existing generated tables (quoted identifiers, snake_case, doubled quotes)", () => {
    const value = "o'rg-1";
    expect(docScopedSql("training_day", "organization_id", value)).toBe(
      generated.trainingDay.where((r: any) => r.organizationId.eq(value)).toSql(),
    );
    expect(docScopedSql("org_member", "organization_id", value)).toBe(
      generated.orgMember.where((r: any) => r.organizationId.eq(value)).toSql(),
    );
  });

  test("rejects unsafe identifiers", () => {
    expect(() => docScopedSql('document"; DROP', "id", "x")).toThrow("Invalid SQL identifier");
    expect(() => docScopedSql("document", "Id", "x")).toThrow("Invalid SQL identifier");
  });

  test("probe covers every docs table with a zero-row predicate", () => {
    const probe = docsProbeQueries();
    expect(probe).toHaveLength(9);
    expect(probe[8]).toBe(`SELECT * FROM "document_file" WHERE "document_file"."document_id" = ''`);
    expect(probe[0]).toBe(`SELECT * FROM "document" WHERE "document"."id" = ''`);
    for (const [i, [table, column]] of DOC_TABLE_SCOPE_COLUMNS.entries()) {
      expect(probe[i]).toBe(`SELECT * FROM "${table}" WHERE "${table}"."${column}" = ''`);
    }
  });
});

const hasDocBindings = Boolean(generated.documentUpdate && generated.documentSnapshot && generated.documentPresence);

describe.if(hasDocBindings)("docs bindings parity (after spacetime generate)", () => {
  test("live queries equal the generated builders", () => {
    const built = ["documentSnapshot", "documentUpdate", "documentPresence"].map((accessor) =>
      generated[accessor].where((r: any) => r.documentId.eq(DOC_ID)).toSql(),
    );
    expect(docLiveQueries(DOC_ID)).toEqual(built);
  });

  test("probe queries equal the generated builders", () => {
    const accessors = ["document", "documentUpdate", "documentSnapshot", "documentPresence", "documentComment", "documentVersion", "documentStar", "documentAccess", "documentFile"];
    const built = accessors.map((accessor) =>
      generated[accessor].where((r: any) => (accessor === "document" ? r.id : r.documentId).eq("")).toSql(),
    );
    expect(docsProbeQueries()).toEqual(built);
  });
});

describe("ids", () => {
  test("newDocumentId is a unique lowercase v4 UUID", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = newDocumentId();
      expect(DOC_UUID_RE.test(id)).toBe(true);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
  });

  test("formatUuidV4 sets version and variant bits", () => {
    expect(formatUuidV4(new Uint8Array(16).fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(formatUuidV4(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
    expect(() => formatUuidV4(new Uint8Array(15))).toThrow();
  });

  test("isDocumentId follows the server (lowercased before the regex)", () => {
    expect(isDocumentId(DOC_ID)).toBe(true);
    expect(isDocumentId(DOC_ID.toUpperCase())).toBe(true);
    expect(isDocumentId("1f0e4c52-8d1a-1b6e-9c3f-2a7b5d9e0c11")).toBe(false); // v1
    expect(isDocumentId("1f0e4c52-8d1a-4b6e-7c3f-2a7b5d9e0c11")).toBe(false); // bad variant
    expect(isDocumentId("")).toBe(false);
  });
});

describe("docsHomeRedirectHref", () => {
  test("an old /manager/docs link lands on Drive's documents view in the same space, with its search", () => {
    expect(docsHomeRedirectHref(null, null)).toBe("/manager/drive?space=recent&type=doc");
    expect(docsHomeRedirectHref("starred", "menu")).toBe("/manager/drive?space=starred&type=doc&q=menu");
    expect(docsHomeRedirectHref("trash", "")).toBe("/manager/drive?space=trash&type=doc");
    expect(docsHomeRedirectHref("mine", null)).toBe("/manager/drive?space=recent&type=doc");
  });
});

describe("documentHref", () => {
  test("builds editor links", () => {
    // The Docs home is Drive's documents view; links go straight there instead of through the /manager/docs redirect.
    expect(DOCS_HOME_HREF).toBe(driveKindHref("doc"));
    expect(documentHref(DOC_ID)).toBe(`/manager/docs/edit?id=${DOC_ID}`);
    expect(documentHref(DOC_ID.toUpperCase(), { isNew: true })).toBe(`/manager/docs/edit?id=${DOC_ID}&new=1`);
    expect(documentHref(DOC_ID, { comment: "c-1", version: "v 2", isNew: false })).toBe(
      `/manager/docs/edit?id=${DOC_ID}&comment=c-1&version=v%202`,
    );
  });
});

describe("docErrorCode", () => {
  class SenderError extends Error {}

  test("parses [doc.<code>] prefixes", () => {
    expect(docErrorCode(new SenderError("[doc.forbidden] You do not have access to this document"))).toBe("forbidden");
    expect(docErrorCode(new Error("[doc.not_found] Document not found"))).toBe("not_found");
    expect(docErrorCode("[doc.too_large] Edit is too large to sync")).toBe("too_large");
    expect(docErrorCode({ message: "[doc.trashed] Document is in the trash" })).toBe("trashed");
    expect(docErrorCode("SenderError: [doc.invalid] Unknown visibility")).toBe("invalid");
    expect(docErrorCode(new Error('[doc.not_published] Reducer "createDocument" is not available.'))).toBe("not_published");
  });

  test("maps findActiveMember failures to forbidden", () => {
    expect(docErrorCode(new SenderError("Not an active member of this organization"))).toBe("forbidden");
  });

  test("everything else is null", () => {
    expect(docErrorCode(new Error("[doc.unknown_code] x"))).toBeNull();
    expect(docErrorCode(new Error("Not connected"))).toBeNull();
    expect(docErrorCode(new Error("prefix [doc.forbidden] not at start"))).toBeNull();
    expect(docErrorCode(null)).toBeNull();
    expect(docErrorCode(42)).toBeNull();
  });

  test("message and i18n helpers", () => {
    expect(docErrorMessage(new Error("[doc.forbidden] You do not have access"))).toBe("You do not have access");
    expect(docErrorMessage("plain")).toBe("plain");
    expect(Object.keys(DOC_ERROR_I18N_KEYS).sort()).toEqual(
      ["forbidden", "invalid", "not_found", "not_published", "too_large", "trashed"],
    );
  });
});

describe("mappers", () => {
  const ts = (ms: number) => ({ toDate: () => new Date(ms) });

  test("mapDocument coerces rows defensively", () => {
    const doc = mapDocument({
      id: DOC_ID.toUpperCase(),
      organizationId: "org-1",
      ownerMemberId: "m-1",
      title: "Shift handover",
      excerpt: "Count the till",
      icon: undefined,
      visibility: "public",
      templateId: "",
      pageSetup: JSON.stringify({ size: "a4", orientation: "landscape", marginsIn: { top: 1, right: 1, bottom: 1, left: 0.5 } }),
      wordCount: 12,
      createdAt: ts(1000),
      updatedAt: ts(2000),
      lastEditorMemberId: "m-2",
      trashedAt: undefined,
      trashedByMemberId: undefined,
    });
    expect(doc.id).toBe(DOC_ID);
    expect(doc.visibility).toBe("private");
    expect(doc.icon).toBeNull();
    expect(doc.templateId).toBeNull();
    expect(doc.pageSetup).toEqual({ size: "a4", orientation: "landscape", marginsIn: { top: 1, right: 1, bottom: 1, left: 0.5 } });
    expect(doc.updatedAt.getTime()).toBe(2000);
    expect(doc.trashedAt).toBeNull();
    // No document_file row: a text document from before Drive, at the root of its space.
    expect(doc.fileType).toBe("doc");
    expect(doc.folderId).toBe("");
  });

  test("mapDocumentFile maps a document_file row ('' → doc, a newer client's type → unknown, ids lowercased)", () => {
    const row = { documentId: DOC_ID.toUpperCase(), organizationId: "org-1", fileType: "sheet", folderId: "", updatedAt: ts(5) };
    expect(mapDocumentFile(row)).toEqual({ documentId: DOC_ID, organizationId: "org-1", fileType: "sheet", folderId: "", updatedAt: new Date(5) });
    expect(mapDocumentFile({ ...row, fileType: "" }).fileType).toBe("doc");
    expect(mapDocumentFile({ ...row, fileType: undefined }).fileType).toBe("doc");
    expect(mapDocumentFile({ ...row, fileType: "doc" }).fileType).toBe("doc");
    expect(mapDocumentFile({ ...row, fileType: "slides" }).fileType).toBe("slides");
    expect(mapDocumentFile({ ...row, fileType: "form" }).fileType).toBe("unknown");
    expect(mapDocumentFile({ ...row, folderId: "7A2B9C4D-1E3F-4A5B-8C6D-9E0F1A2B3C4D" }).folderId).toBe("7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d");
  });

  test("mapDocument takes type and folder from the document_file row only, never from the document row", () => {
    const row = { id: DOC_ID, organizationId: "org-1", ownerMemberId: "m-1", visibility: "org_edit", createdAt: ts(1), updatedAt: ts(2) };
    expect(mapDocument(row, { fileType: "slides", folderId: "f-1" })).toMatchObject({ fileType: "slides", folderId: "f-1" });
    expect(mapDocument(row, null)).toMatchObject({ fileType: "doc", folderId: "" });
    // Columns a `document` row no longer has are ignored if present.
    expect(mapDocument({ ...row, fileType: "sheet", folderId: "f-2" })).toMatchObject({ fileType: "doc", folderId: "" });
  });

  test("mapDocuments pairs each document with its document_file row by id", () => {
    const doc = (id: string) => ({ id, organizationId: "org-1", ownerMemberId: "m-1", visibility: "org_edit", createdAt: ts(1), updatedAt: ts(2) });
    const other = "2f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c12";
    const legacy = "3f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c13";
    const docs = mapDocuments(
      [doc(DOC_ID.toUpperCase()), doc(other), doc(legacy)],
      [
        { documentId: DOC_ID, organizationId: "org-1", fileType: "sheet", folderId: "F-1", updatedAt: ts(3) },
        { documentId: other.toUpperCase(), organizationId: "org-1", fileType: "slides", folderId: "", updatedAt: ts(3) },
        { documentId: "4f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c14", organizationId: "org-1", fileType: "sheet", folderId: "", updatedAt: ts(3) },
      ],
    );
    expect(docs.map((d) => [d.id, d.fileType, d.folderId])).toEqual([
      [DOC_ID, "sheet", "f-1"],
      [other, "slides", ""],
      [legacy, "doc", ""],
    ]);
  });

  test("parseDocPageSetup rejects malformed JSON", () => {
    expect(parseDocPageSetup(undefined)).toBeNull();
    expect(parseDocPageSetup("{")).toBeNull();
    expect(parseDocPageSetup(JSON.stringify({ size: "a3", orientation: "portrait", marginsIn: { top: 1, right: 1, bottom: 1, left: 1 } }))).toBeNull();
    expect(parseDocPageSetup(JSON.stringify({ size: "letter", orientation: "portrait", marginsIn: { top: -1, right: 1, bottom: 1, left: 1 } }))).toBeNull();
  });

  test("bytes, bigint ids and identity strings", () => {
    const row = mapUpdateRow({ id: 7, documentId: DOC_ID, organizationId: "o", payload: [1, 2, 3], sessionId: "s", memberId: "m", createdAt: ts(5) });
    expect(row.id).toBe(BigInt(7));
    expect(row.payload).toBeInstanceOf(Uint8Array);
    expect(row.byteLength).toBe(3);
    expect(toBytes(undefined).byteLength).toBe(0);
    expect(idString({ toHexString: () => "c0ffee" })).toBe("c0ffee");
    expect(idString({ toString: () => DOC_ID })).toBe(DOC_ID);
  });

  test("mapComment parses mentions; mapGrant drops unknown roles", () => {
    const c = mapComment({ id: "c1", documentId: DOC_ID, threadId: "t", parentId: undefined, authorMemberId: "a", body: "hi", mentions: '["m1","m1",2,"m2"]', status: "weird", createdAt: ts(1) });
    expect(c.mentions).toEqual(["m1", "m2"]);
    expect(c.status).toBe("open");
    expect(c.parentId).toBeNull();
    expect(mapComment({ mentions: "not json", createdAt: ts(1) }).mentions).toEqual([]);
    expect(mapGrant({ id: "g", documentId: DOC_ID, memberId: "m", role: "manager", createdAt: ts(1), updatedAt: ts(1) })).toBeNull();
    expect(mapGrant({ id: "g", documentId: DOC_ID, memberId: "m", role: "commenter", createdAt: ts(1), updatedAt: ts(1) })?.role).toBe("commenter");
  });

  test("groupDocCommentThreads orders threads and replies, drops orphans", () => {
    const comment = (id: string, threadId: string, parentId: string | undefined, at: number) =>
      mapComment({ id, documentId: DOC_ID, threadId, parentId, authorMemberId: "a", body: id, createdAt: ts(at), status: "open" });
    const threads = groupDocCommentThreads([
      comment("r2", "t2", "root2", 50),
      comment("root2", "t2", undefined, 20),
      comment("root1", "t1", undefined, 10),
      comment("r1", "t2", "root2", 30),
      comment("orphan", "t3", "gone", 5),
    ]);
    expect(threads.map((t) => t.threadId)).toEqual(["t1", "t2"]);
    expect(threads[1].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("createDocConnection", () => {
  type Cb = (...args: any[]) => void;
  function fakeTable(rows: any[]) {
    const handlers = { insert: new Set<Cb>(), delete: new Set<Cb>(), update: new Set<Cb>() };
    return {
      handlers,
      iter: () => rows[Symbol.iterator](),
      onInsert: (cb: Cb) => handlers.insert.add(cb),
      removeOnInsert: (cb: Cb) => handlers.insert.delete(cb),
      onDelete: (cb: Cb) => handlers.delete.add(cb),
      removeOnDelete: (cb: Cb) => handlers.delete.delete(cb),
      onUpdate: (cb: Cb) => handlers.update.add(cb),
      removeOnUpdate: (cb: Cb) => handlers.update.delete(cb),
    };
  }

  test("returns null until the bindings exist", () => {
    expect(createDocConnection(null)).toBeNull();
    expect(createDocConnection({})).toBeNull();
    expect(createDocConnection({ db: { documentUpdate: {} }, subscriptionBuilder: () => ({}) })).toBeNull();
  });

  test("maps rows, keeps callback removal working, memoizes per raw connection", () => {
    const updateRow = { id: BigInt(3), documentId: DOC_ID, organizationId: "o", payload: new Uint8Array([9]), byteLength: 1, sessionId: "s", memberId: "m", createdAt: { toDate: () => new Date(1) } };
    const updates = fakeTable([updateRow]);
    const calls: { queries?: string[]; applied?: Cb; error?: Cb; unsubscribed: number } = { unsubscribed: 0 };
    let hex = "";
    const raw = {
      get connectionId() {
        return { toHexString: () => hex };
      },
      db: { documentUpdate: updates, documentSnapshot: fakeTable([]), documentPresence: fakeTable([]) },
      subscriptionBuilder: () => {
        const b = {
          onApplied: (cb: Cb) => ((calls.applied = cb), b),
          onError: (cb: Cb) => ((calls.error = cb), b),
          subscribe: (queries: string[]) => {
            calls.queries = queries;
            return { unsubscribe: () => void calls.unsubscribed++, isActive: () => true, isEnded: () => false };
          },
        };
        return b;
      },
    };

    const conn = createDocConnection(raw);
    expect(conn).not.toBeNull();
    if (!conn) return;
    expect(createDocConnection(raw)).toBe(conn);

    const [mapped] = [...conn.db.documentUpdate.iter()];
    expect(mapped.id).toBe(BigInt(3));
    expect(mapped.createdAt).toBeInstanceOf(Date);
    expect([...conn.db.documentUpdate.iter()][0]).toBe(mapped); // row mapping is cached

    const seen: DocUpdateRow[] = [];
    const onInsert = (_ctx: unknown, row: DocUpdateRow) => seen.push(row);
    conn.db.documentUpdate.onInsert(onInsert);
    expect(updates.handlers.insert.size).toBe(1);
    for (const cb of updates.handlers.insert) cb({}, updateRow);
    expect(seen).toEqual([mapped]);
    conn.db.documentUpdate.removeOnInsert(onInsert);
    expect(updates.handlers.insert.size).toBe(0);

    const updated: string[] = [];
    const onUpdate = (_ctx: unknown, oldRow: DocUpdateRow, newRow: DocUpdateRow) => updated.push(`${oldRow.id}->${newRow.id}`);
    conn.db.documentUpdate.onUpdate(onUpdate);
    for (const cb of updates.handlers.update) cb({}, updateRow, { ...updateRow, id: BigInt(4) });
    expect(updated).toEqual(["3->4"]);
    conn.db.documentUpdate.removeOnUpdate(onUpdate);
    expect(updates.handlers.update.size).toBe(0);

    expect(conn.connectionIdHex).toBe("");
    hex = "abc123";
    expect(conn.connectionIdHex).toBe("abc123");

    let applied = 0;
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => void applied++)
      .onError(() => {})
      .subscribe(docLiveQueries(DOC_ID));
    expect(calls.queries).toEqual(docLiveQueries(DOC_ID));
    calls.applied?.({ event: "applied" });
    expect(applied).toBe(1);
    expect(handle.isActive()).toBe(true);
    handle.unsubscribe();
    expect(calls.unsubscribed).toBe(1);
  });

  test("wrapDocTable maps any table (e.g. the Sheets lease) and caches each row's mapping", () => {
    const leaseRow = { documentId: DOC_ID, epoch: BigInt(2) };
    const table = fakeTable([leaseRow]);
    const wrapped = wrapDocTable(table, (row: any) => ({ id: String(row.documentId), epoch: Number(row.epoch) }));
    const [first] = [...wrapped.iter()];
    expect(first).toEqual({ id: DOC_ID, epoch: 2 });
    expect([...wrapped.iter()][0]).toBe(first);
    const deleted: string[] = [];
    const onDelete = (_ctx: unknown, row: { id: string }) => deleted.push(row.id);
    wrapped.onDelete(onDelete);
    for (const cb of table.handlers.delete) cb({}, leaseRow);
    expect(deleted).toEqual([DOC_ID]);
    wrapped.removeOnDelete(onDelete);
    expect(table.handlers.delete.size).toBe(0);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
