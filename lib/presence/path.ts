import { resolveLegacyRedirect } from "@/lib/browser-shell/routes";
import { DOCS_EDIT_PATH } from "@/lib/docs/hrefs";
import { fnv1a } from "./hash";

/*
 * What a page_presence row says about where it is. The module validates every field
 * (spacetimedb/src/presence/validate.ts) and rejects — never repairs — anything outside its rules,
 * so the client normalises first: a rejected upsert is swallowed and the cursor would just vanish.
 */

/** The module's `pagePath` limit. */
export const PRESENCE_PATH_MAX = 200;
/** The module's limit for an agent slot and for an activity name. */
export const PRESENCE_TOKEN_MAX = 80;

const MANAGER = "/manager";
const SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;
const TOKEN_RE = /^[A-Za-z0-9_:-]+$/;
const NOT_TOKEN_RE = /[^A-Za-z0-9_:-]/g;

/**
 * The page a presence row is on: the /manager pathname of `url` after legacy redirects, never its
 * query or hash (doc ids live there). A segment the module would reject (percent-encoded text, a dot
 * segment) ends the path, so the row still names the page it sits under. null outside /manager.
 */
export function presencePathOf(url: string): string | null {
  const pathname = resolveLegacyRedirect(url).split(/[?#]/, 1)[0] ?? "";
  if (pathname !== MANAGER && !pathname.startsWith(`${MANAGER}/`)) return null;
  let out = MANAGER;
  for (const segment of pathname.slice(MANAGER.length).split("/")) {
    if (segment === "") continue;
    if (segment === "." || segment === ".." || !SEGMENT_RE.test(segment)) break;
    if (out.length + 1 + segment.length > PRESENCE_PATH_MAX) break;
    out += `/${segment}`;
  }
  return out;
}

/**
 * Routes that name their record in the query rather than the path (a static route the Capacitor
 * export can prerender): the parameter that holds it. People on the same route but different records
 * are on different pages — their cursors and clicks must not mix.
 */
const RECORD_PARAMS: ReadonlyMap<string, string> = new Map([[DOCS_EDIT_PATH, "id"]]);
/** The record segment `presencePageKeyOf` appends: "~" and a base-36 hash, never the id itself. */
const RECORD_SEGMENT_RE = /\/~[0-9a-z]+$/;

/**
 * The page a 'user' row is on, as cursors compare it: `presencePathOf`, plus `/~<hash>` of the
 * record id on routes that keep it in the query (`/manager/docs/edit?id=…`). Only a hash is
 * published (the row is org-readable); it is the same on every device, so two people in the same
 * document match and two in different documents do not. Nav placement uses `stripRecordKey`.
 */
export function presencePageKeyOf(url: string): string | null {
  const path = presencePathOf(url);
  if (path === null) return null;
  const param = RECORD_PARAMS.get(path);
  if (!param) return path;
  const resolved = resolveLegacyRedirect(url).split("#", 1)[0] ?? "";
  const q = resolved.indexOf("?");
  // Record ids are written trimmed and lower-cased (lib/docs/hrefs.ts): one document, one key.
  const record = q < 0 ? "" : (new URLSearchParams(resolved.slice(q + 1)).get(param) ?? "").trim().toLowerCase();
  if (!record) return path;
  const keyed = `${path}/~${fnv1a(record).toString(36)}`;
  return keyed.length <= PRESENCE_PATH_MAX ? keyed : path;
}

/** A page key without its record segment: the route the nav rows and Mr. Merchiva place it on. */
export function stripRecordKey(pageKey: string): string {
  return pageKey.replace(RECORD_SEGMENT_RE, "");
}

/** Whether a chat scope (browser-shell tab id or "__window__") can be an agent row's slot. */
export function isAgentSlot(scope: string): boolean {
  return scope.length > 0 && scope.length <= PRESENCE_TOKEN_MAX && TOKEN_RE.test(scope);
}

/**
 * A tool or action name as the module accepts it for `activity`. MCP tool keys can run past 80
 * characters (lib/merchiva/mcp/ai-tools.ts adds a dedupe suffix), so this also truncates.
 */
export function presenceActivity(tool: string): string {
  return tool.replace(NOT_TOKEN_RE, "_").slice(0, PRESENCE_TOKEN_MAX);
}
