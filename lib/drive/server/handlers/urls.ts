// POST /api/drive/url — short-lived signed GET URLs for private Drive blobs.
//
// Request  { items: [{ id, variant: "original" | "thumb", purpose: "view" | "stream" | "download" }], actingMemberId? }
//          1..DRIVE_URL_BATCH_MAX items, lowercase uuid ids.
// Response { results: [{ id, url, expiresAt }] } in request order, `private, no-store`.
//
// "May the caller read these bytes" is the RLS decision: the rows come from a
// SELECT run with the CALLER's token, so only what their rules show exists
// (owner, ready Store items, Drive admins; an ex-member sees nothing ready).
// HTTP /sql repeats a row once per matching rule, so rows are de-duplicated by
// id. Only ready files are signed; a thumbnail only once one is attached.
//
// `actingMemberId` (the PIN operator on a store tablet) can only NARROW that
// set, never widen it, so no operator-session check is needed: the member row
// is read with the caller's token (it must be visible and active, else 403
// `operator`) and a row is signed only if it is in the operator's organization
// and is a Store item, the operator's own, or the operator holds the Drive
// "everyone's files" view power (the module's docMemberGate && driveAccessOf).
//
// Types a browser would execute or render as a document (isActiveDriveMime) are
// always signed as downloads, whatever the requested purpose.

import { driveAdminAccess, type DriveGatePermissions } from "@/lib/drive/access";
import { DRIVE_URL_BATCH_MAX, isActiveDriveMime } from "@/lib/drive/rules";
import { isDocumentId } from "@/lib/docs/ids";
import { driveHttpError, errorResponse, isRecord, readJson, reducerFailure, requireCaller } from "@/lib/drive/server/http";
import { dedupeRowsBy, sqlString, type SqlRow } from "@/lib/drive/server/sql-rows";
import type { OrgRole } from "@/lib/types";
import { DRIVE_GET_TTL_MS } from "./config";
import type { DriveRouteHandler, DriveServerDeps } from "./types";

type UrlVariant = "original" | "thumb";
type UrlPurpose = "view" | "stream" | "download";
interface UrlRequestItem { id: string; variant: UrlVariant; purpose: UrlPurpose }
interface UrlResult { id: string; url: string | null; expiresAt: number | null }
/** Whose view narrows the signed set; null = the caller's own RLS view only. */
interface OperatorScope { memberId: string; organizationId: string; adminView: boolean }

const URL_BODY_MAX_BYTES = 16 * 1024;
const SAFE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VARIANTS: ReadonlySet<string> = new Set<UrlVariant>(["original", "thumb"]);
const PURPOSES: ReadonlySet<string> = new Set<UrlPurpose>(["view", "stream", "download"]);
const ORG_ROLES: ReadonlySet<string> = new Set<OrgRole>(["owner", "manager", "staff"]);

/** `SELECT … FROM drive_item WHERE id = 'a' OR id = 'b' …` over the unique ids (the dialect has no IN). */
export function driveItemsQuery(ids: readonly string[]): string {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.some((id) => !SAFE_ID_RE.test(id))) throw new Error("driveItemsQuery needs lowercase uuids");
  return "SELECT id, kind, status, blob_key, thumb_key, mime_type, space, owner_member_id, organization_id FROM drive_item WHERE "
    + unique.map((id) => `id = '${id}'`).join(" OR ");
}

function parseUrlBody(body: unknown): { items: UrlRequestItem[]; actingMemberId: string } | null {
  if (!isRecord(body) || !Array.isArray(body.items)) return null;
  if (body.items.length < 1 || body.items.length > DRIVE_URL_BATCH_MAX) return null;
  const items: UrlRequestItem[] = [];
  for (const entry of body.items) {
    if (!isRecord(entry)) return null;
    const { id, variant, purpose } = entry;
    if (typeof id !== "string" || id !== id.toLowerCase() || !isDocumentId(id)) return null;
    if (typeof variant !== "string" || !VARIANTS.has(variant)) return null;
    if (typeof purpose !== "string" || !PURPOSES.has(purpose)) return null;
    items.push({ id, variant: variant as UrlVariant, purpose: purpose as UrlPurpose });
  }
  const acting = body.actingMemberId ?? "";
  if (typeof acting !== "string") return null;
  const actingMemberId = acting.toLowerCase();
  if (actingMemberId !== "" && !SAFE_ID_RE.test(actingMemberId)) return null;
  return { items, actingMemberId };
}

/**
 * The member's raw `permissions` JSON read the way the module reads it. The Docs gate is
 * docMemberGate (spacetimedb/src/index.ts): unreadable JSON or no `dashboard` key passes (the role
 * defaults grant it), otherwise `dashboard.view` must be true. The drive flags are driveAccessOf
 * (spacetimedb/src/drive/logic.ts): unreadable JSON grants none. Owners pass in driveAdminAccess.
 */
function gatePermissions(raw: string): DriveGatePermissions {
  let stored: unknown;
  try {
    stored = JSON.parse(raw || "{}");
  } catch {
    return { dashboard: { view: true }, drive: { view: false, edit: false } };
  }
  const object = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : null;
  const flag = (section: unknown, key: string) => isRecord(section) && section[key] === true;
  return {
    dashboard: { view: !object || !("dashboard" in object) || flag(object.dashboard, "view") },
    drive: { view: flag(object?.drive, "view"), edit: flag(object?.drive, "edit") },
  };
}

export function createUrlsRouteHandler(deps: DriveServerDeps): DriveRouteHandler {
  async function select(query: string, token: string): Promise<SqlRow[]> {
    try {
      return await deps.sql(query, token);
    } catch (err) {
      throw reducerFailure(err);
    }
  }

  /** The acting operator as the caller can see them; 403 `operator` when not visible or not active. */
  async function operatorScope(actingMemberId: string, token: string): Promise<OperatorScope | null> {
    if (actingMemberId === "") return null;
    const rows = await select(
      `SELECT id, organization_id, role, permissions, status FROM org_member WHERE id = '${actingMemberId}'`,
      token,
    );
    const member = rows[0];
    if (!member || sqlString(member, "status") !== "active") throw driveHttpError("operator", "Enter your PIN again to continue");
    const role = sqlString(member, "role");
    const access = driveAdminAccess(ORG_ROLES.has(role) ? (role as OrgRole) : null, gatePermissions(sqlString(member, "permissions")));
    return { memberId: actingMemberId, organizationId: sqlString(member, "organization_id"), adminView: access.view };
  }

  function operatorMaySee(row: SqlRow, scope: OperatorScope | null): boolean {
    if (!scope) return true;
    if (scope.organizationId === "" || sqlString(row, "organization_id") !== scope.organizationId) return false;
    return sqlString(row, "space") === "store" || sqlString(row, "owner_member_id") === scope.memberId || scope.adminView;
  }

  return async (req) => {
    try {
      const caller = await requireCaller(deps, req);
      if (!deps.config()) throw driveHttpError("not_configured", "File storage is not configured");
      const input = parseUrlBody(await readJson<unknown>(req, URL_BODY_MAX_BYTES));
      if (!input) throw driveHttpError("invalid", "Invalid URL request");

      const scope = await operatorScope(input.actingMemberId, caller.token);
      const rows = dedupeRowsBy(await select(driveItemsQuery(input.items.map((item) => item.id)), caller.token), "id");
      const byId = new Map(rows.map((row) => [sqlString(row, "id"), row] as const));
      const now = deps.now();

      const results = await Promise.all(input.items.map(async (item): Promise<UrlResult> => {
        const row = byId.get(item.id);
        const thumb = item.variant === "thumb";
        const unsigned: UrlResult = { id: item.id, url: null, expiresAt: null };
        if (!row || sqlString(row, "kind") !== "file" || sqlString(row, "status") !== "ready") return unsigned;
        const key = sqlString(row, thumb ? "thumb_key" : "blob_key");
        if (key === "" || !operatorMaySee(row, scope)) return unsigned;
        const active = isActiveDriveMime(sqlString(row, "mime_type"));
        const download = active || item.purpose === "download";
        const ttl = thumb ? DRIVE_GET_TTL_MS.thumb : active ? DRIVE_GET_TTL_MS.download : DRIVE_GET_TTL_MS[item.purpose];
        const expiresAt = now + ttl;
        const url = await deps.blob.presignGet(key, { validUntil: expiresAt, download });
        return { id: item.id, url, expiresAt };
      }));
      return deps.json(req, { results }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
