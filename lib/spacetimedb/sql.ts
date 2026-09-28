// Server-side helper for read-only SpacetimeDB SQL queries against public
// tables. Used by SSR pages (blogs, etc.) where we need to render content
// without holding a WebSocket connection on the server. Without a token the
// query runs as an anonymous identity, so row-level security lets it see only
// world-readable rows; with `opts.token` it runs as that identity and sees what
// its RLS rules allow (the Drive routes forward the caller's token).

const WS_BASE =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const HTTP_BASE = WS_BASE.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ??
  "merchiva";

interface SqlColumn {
  name: { some?: string };
  algebraic_type: unknown;
}

export interface SqlResult {
  schema: { elements: SqlColumn[] };
  rows: unknown[][];
}

// Run a read-only SQL query against the deployed module. Returns parsed rows
// as arrays of column values (same order as `schema.elements`). Throws on HTTP
// failure so callers can decide how to fall back.
export async function spacetimeSql(query: string, opts?: { token?: string | null }): Promise<SqlResult[]> {
  const url = `${HTTP_BASE.replace(/\/$/, "")}/v1/database/${MODULE_NAME}/sql`;
  const headers: Record<string, string> = { "Content-Type": "text/plain" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: query,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SpacetimeDB SQL failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as SqlResult[];
}

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImage: string | null;
  status: string;
  authorName: string | null;
  publishedAt: number | null;   // unix millis
  createdAt: number;
  updatedAt: number;
}

// Decode the SpacetimeDB JSON value for an `option<string>` column — comes as
// either `{ some: "..." }` or `{ none: [] }` / `[]` depending on representation.
function decodeOption<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("some" in obj) return obj.some as T;
    if ("none" in obj) return null;
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw[0] as T;
  }
  return raw as T;
}

function decodeTimestamp(raw: unknown): number {
  if (typeof raw === "object" && raw && "__timestamp_micros_since_unix_epoch__" in raw) {
    const micros = Number((raw as { __timestamp_micros_since_unix_epoch__: number | string }).__timestamp_micros_since_unix_epoch__);
    return Math.floor(micros / 1000);
  }
  if (typeof raw === "number") return Math.floor(raw / 1000);
  return 0;
}

function decodeOptionTimestamp(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("some" in obj) return decodeTimestamp(obj.some);
    if ("none" in obj) return null;
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return decodeTimestamp(raw[0]);
  }
  return null;
}

function decodeUuid(raw: unknown): string {
  if (typeof raw === "object" && raw && "__uuid__" in raw) {
    const v = (raw as { __uuid__: number | string | bigint }).__uuid__;
    return BigInt(v as string).toString(16).padStart(32, "0");
  }
  if (typeof raw === "string") return raw;
  return String(raw);
}

function rowToBlogPost(cols: SqlColumn[], values: unknown[]): BlogPostRow {
  const lookup: Record<string, unknown> = {};
  cols.forEach((col, i) => {
    const name = col.name?.some;
    if (name) lookup[name] = values[i];
  });
  return {
    id: decodeUuid(lookup.id),
    slug: String(lookup.slug ?? ""),
    title: String(lookup.title ?? ""),
    excerpt: String(lookup.excerpt ?? ""),
    contentMd: String(lookup.content_md ?? ""),
    coverImage: decodeOption<string>(lookup.cover_image),
    status: String(lookup.status ?? "draft"),
    authorName: decodeOption<string>(lookup.author_name),
    publishedAt: decodeOptionTimestamp(lookup.published_at),
    createdAt: decodeTimestamp(lookup.created_at),
    updatedAt: decodeTimestamp(lookup.updated_at),
  };
}

// Fetch all published blog posts, newest published first. Returns [] on error
// so the page can still render an empty state during outages.
export async function fetchPublishedBlogPosts(): Promise<BlogPostRow[]> {
  try {
    const result = await spacetimeSql("SELECT * FROM blog_post");
    const first = result[0];
    if (!first) return [];
    const cols = first.schema.elements;
    const all = first.rows.map((r) => rowToBlogPost(cols, r));
    return all
      .filter((p) => p.status === "published")
      .sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
  } catch (err) {
    console.error("[blog] fetchPublishedBlogPosts failed:", err);
    return [];
  }
}

export async function fetchBlogPostBySlug(slug: string): Promise<BlogPostRow | null> {
  try {
    const safe = slug.replace(/'/g, "''");
    const result = await spacetimeSql(`SELECT * FROM blog_post WHERE slug = '${safe}'`);
    const first = result[0];
    if (!first || first.rows.length === 0) return null;
    const post = rowToBlogPost(first.schema.elements, first.rows[0]);
    if (post.status !== "published") return null;
    return post;
  } catch (err) {
    console.error("[blog] fetchBlogPostBySlug failed:", err);
    return null;
  }
}
