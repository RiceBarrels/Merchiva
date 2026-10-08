/**
 * Read-only health check for the two things that decide whether a store is
 * sent to /manager/setup (app/manager/layout.tsx):
 *
 *   1. Every ACTIVE org_member has its org_membership_index row (and no index
 *      row is left for a member that is gone or inactive). The member's own
 *      org_member row is readable through `userId = :sender`, but the store's
 *      settings row is readable only through a join on org_membership_index —
 *      a missing index row makes the store look "not set up" for that member.
 *   2. Every organization has a settings row, and which ones have never moved
 *      updatedAt past createdAt (the wizard's updateSettings never landed).
 *
 *   bun run check:setup
 *
 * Runs as the identity `spacetime login` holds (the database owner sees every
 * row; any other identity sees only its own stores and the report says less).
 * It only SELECTs. Fixing a gap is a separate, explicitly approved step.
 */
import { execFileSync } from "node:child_process";

export interface MemberRow { id: string; organizationId: string; userId: string; status: string }
export interface IndexRow { memberId: string; organizationId: string; userId: string }
export interface SettingsRow { organizationId: string; createdMs: number | null; updatedMs: number | null }
export interface OrgRow { id: string; name: string }

export interface SetupReport {
  activeMembers: number;
  indexRows: number;
  missingIndex: MemberRow[];
  mismatchedIndex: Array<{ member: MemberRow; index: IndexRow }>;
  staleIndex: IndexRow[];
  orgsWithoutSettings: OrgRow[];
  orgsNeverSetUp: OrgRow[];
}

/** Same 1-second tolerance as setupComplete in app/manager/layout.tsx. */
const SETUP_TOLERANCE_MS = 1000;

export function analyzeSetupState(
  members: MemberRow[],
  index: IndexRow[],
  settings: SettingsRow[],
  orgs: OrgRow[],
): SetupReport {
  const active = members.filter((m) => m.status === "active");
  const indexById = new Map(index.map((r) => [r.memberId, r]));
  const activeIds = new Set(active.map((m) => m.id));
  const settingsByOrg = new Map(settings.map((s) => [s.organizationId, s]));

  const missingIndex: MemberRow[] = [];
  const mismatchedIndex: SetupReport["mismatchedIndex"] = [];
  for (const m of active) {
    const row = indexById.get(m.id);
    if (!row) missingIndex.push(m);
    else if (row.organizationId !== m.organizationId || row.userId !== m.userId) mismatchedIndex.push({ member: m, index: row });
  }

  return {
    activeMembers: active.length,
    indexRows: index.length,
    missingIndex,
    mismatchedIndex,
    staleIndex: index.filter((r) => !activeIds.has(r.memberId)),
    orgsWithoutSettings: orgs.filter((o) => !settingsByOrg.has(o.id)),
    orgsNeverSetUp: orgs.filter((o) => {
      const s = settingsByOrg.get(o.id);
      return !!s && s.createdMs !== null && s.updatedMs !== null && s.updatedMs - s.createdMs <= SETUP_TOLERANCE_MS;
    }),
  };
}

// ── Live run ────────────────────────────────────────────────────────────────

function cliToken(): string {
  const out = execFileSync("spacetime", ["login", "show", "--token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const match = out.match(/auth token.*?\b(eyJ[\w.-]+)/i);
  if (!match) throw new Error("No token from `spacetime login show --token`; run `spacetime login` first.");
  return match[1];
}

/**
 * Uuid columns arrive as `[<u128>]` and identities as `["0x…"]`. A u128 does
 * not fit a JS number, so the raw body is read with every long integer quoted
 * first (JSON.parse would round it), then formatted back into uuid text.
 */
function idText(v: unknown): string {
  if (Array.isArray(v) && v.length === 1) return idText(v[0]);
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const hex = BigInt(v).toString(16).padStart(32, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (typeof v === "string") return v.replace(/^0x/, "").toLowerCase();
  return String(v);
}

async function rows(query: string, token: string): Promise<unknown[][]> {
  const base = (process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com").replace(/^ws/, "http").replace(/\/$/, "");
  const database = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "merchiva";
  const res = await fetch(`${base}/v1/database/${database}/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: query,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text.slice(0, 300)}`);
  const results = JSON.parse(text.replace(/([[,:])(\d{16,})(?=[\],}])/g, '$1"$2"')) as Array<{ rows: unknown[][] }>;
  return results[0]?.rows ?? [];
}

/** Milliseconds from a timestamp column (`[<micros>]`, quoted when long). */
function micros(v: unknown): number | null {
  const raw = Array.isArray(v) ? v[0] : null;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n / 1000 : null;
}

async function main() {
  const token = cliToken();
  const [members, index, settings, orgs] = await Promise.all([
    rows("SELECT id, organization_id, user_id, status FROM org_member", token),
    rows("SELECT member_id, organization_id, user_id FROM org_membership_index", token),
    rows("SELECT organization_id, created_at, updated_at FROM settings", token),
    rows("SELECT org_id_text, name FROM organization", token),
  ]);

  const report = analyzeSetupState(
    members.map(([id, org, user, status]) => ({ id: idText(id), organizationId: String(org), userId: idText(user), status: String(status) })),
    index.map(([memberId, org, user]) => ({ memberId: String(memberId), organizationId: String(org), userId: idText(user) })),
    settings.map(([org, created, updated]) => ({
      organizationId: String(org),
      createdMs: micros(created),
      updatedMs: micros(updated),
    })),
    orgs.map(([id, name]) => ({ id: String(id), name: String(name) })),
  );

  const orgName = new Map(orgs.map(([id, name]) => [String(id), String(name)]));
  const label = (orgId: string) => `${orgName.get(orgId) ?? "?"} (${orgId})`;

  console.log(`Active members: ${report.activeMembers}   org_membership_index rows: ${report.indexRows}`);
  console.log(`\nActive members with NO index row (store looks "not set up" to them): ${report.missingIndex.length}`);
  for (const m of report.missingIndex) console.log(`  member ${m.id} in ${label(m.organizationId)}`);
  console.log(`\nIndex rows that disagree with their member: ${report.mismatchedIndex.length}`);
  for (const { member } of report.mismatchedIndex) console.log(`  member ${member.id} in ${label(member.organizationId)}`);
  console.log(`\nIndex rows with no active member (stale access): ${report.staleIndex.length}`);
  for (const r of report.staleIndex) console.log(`  member ${r.memberId} in ${label(r.organizationId)}`);
  console.log(`\nStores with no settings row: ${report.orgsWithoutSettings.length}`);
  for (const o of report.orgsWithoutSettings) console.log(`  ${label(o.id)}`);
  console.log(`\nStores whose setup save never landed (updatedAt == createdAt): ${report.orgsNeverSetUp.length}`);
  for (const o of report.orgsNeverSetUp) console.log(`  ${label(o.id)}`);

  const broken = report.missingIndex.length + report.mismatchedIndex.length + report.staleIndex.length + report.orgsWithoutSettings.length;
  process.exitCode = broken > 0 ? 1 : 0;
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  });
}
