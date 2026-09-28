// SPDX expression checks against the policy (scripts/licenses/policy.ts), and a sniffer for license texts that
// contradict a permissive declaration (spacetimedb says ISC but ships the Business Source License).
import { ALLOWED_EXCEPTIONS, ALLOWED_LICENSES, ELECTIONS, NEEDS_ELECTION_RE } from "./policy";

export type LicenseVerdict = { ok: true; elected?: string } | { ok: false; reason: string };

type Node =
  | { kind: "id"; id: string }
  | { kind: "with"; id: string; exception: string }
  | { kind: "and" | "or"; parts: Node[] };

const SEE_LICENSE_RE = /SEE LICENSE IN \S+/gi;

function tokenize(expression: string): string[] {
  // "SEE LICENSE IN <file>" is one term; protect it before splitting on spaces and parentheses.
  const seeTerms: string[] = [];
  const protectedExpr = expression.replace(SEE_LICENSE_RE, (m) => {
    seeTerms.push(m);
    return `\u0000${seeTerms.length - 1}\u0000`;
  });
  const raw = protectedExpr.replace(/([()])/g, " $1 ").split(/\s+/).filter(Boolean);
  return raw.map((tok) => tok.replace(/\u0000(\d+)\u0000/g, (_, i: string) => seeTerms[Number(i)] ?? tok));
}

function parse(expression: string): Node {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos];
  const upper = (t: string | undefined) => t?.toUpperCase();

  function primary(): Node {
    const tok = tokens[pos++];
    if (tok === undefined) throw new Error("unexpected end");
    if (tok === "(") {
      const inner = orExpr();
      if (tokens[pos++] !== ")") throw new Error("missing )");
      return inner;
    }
    if (tok === ")" || ["AND", "OR", "WITH"].includes(tok.toUpperCase())) throw new Error(`unexpected "${tok}"`);
    if (upper(peek()) === "WITH") {
      pos++;
      const exception = tokens[pos++];
      if (exception === undefined) throw new Error("WITH needs an exception");
      return { kind: "with", id: tok, exception };
    }
    return { kind: "id", id: tok };
  }
  function andExpr(): Node {
    const parts = [primary()];
    while (upper(peek()) === "AND") {
      pos++;
      parts.push(primary());
    }
    return parts.length === 1 ? parts[0] : { kind: "and", parts };
  }
  function orExpr(): Node {
    const parts = [andExpr()];
    while (upper(peek()) === "OR") {
      pos++;
      parts.push(andExpr());
    }
    return parts.length === 1 ? parts[0] : { kind: "or", parts };
  }
  const node = orExpr();
  if (pos !== tokens.length) throw new Error(`unexpected "${tokens[pos]}"`);
  return node;
}

const ALLOWED = new Map(ALLOWED_LICENSES.map((id, i) => [id.toLowerCase(), { id, rank: i }]));

function canonical(id: string): string | null {
  return ALLOWED.get(id.toLowerCase())?.id ?? null;
}

function render(node: Node): string {
  if (node.kind === "id") return node.id;
  if (node.kind === "with") return `${node.id} WITH ${node.exception}`;
  const inner = node.parts.map((p) => (p.kind === "and" || p.kind === "or" ? `(${render(p)})` : render(p)));
  return inner.join(node.kind === "and" ? " AND " : " OR ");
}

interface Resolved { ok: boolean; text: string; rank: number; reason?: string; choseAmong: boolean }

/** Resolves a node to the license terms Merchiva uses it under (OR → one alternative). */
function resolve(node: Node, name: string): Resolved {
  if (node.kind === "id") {
    const id = canonical(node.id);
    return id
      ? { ok: true, text: id, rank: ALLOWED.get(id.toLowerCase())?.rank ?? 99, choseAmong: false }
      : { ok: false, text: node.id, rank: 99, reason: `"${node.id}" is not an allowed license`, choseAmong: false };
  }
  if (node.kind === "with") {
    const id = canonical(node.id);
    const exceptionOk = (ALLOWED_EXCEPTIONS as readonly string[]).includes(node.exception);
    if (id && exceptionOk) return { ok: true, text: `${id} WITH ${node.exception}`, rank: ALLOWED.get(id.toLowerCase())?.rank ?? 99, choseAmong: false };
    return { ok: false, text: render(node), rank: 99, reason: `"${render(node)}" is not allowed`, choseAmong: false };
  }
  const parts = node.parts.map((p) => resolve(p, name));
  if (node.kind === "and") {
    const bad = parts.find((p) => !p.ok);
    if (bad) return { ok: false, text: render(node), rank: 99, reason: bad.reason, choseAmong: false };
    return {
      ok: true,
      text: parts.map((p, i) => (node.parts[i].kind === "or" ? `(${p.text})` : p.text)).join(" AND "),
      rank: Math.max(...parts.map((p) => p.rank)),
      choseAmong: parts.some((p) => p.choseAmong),
    };
  }
  // OR: a copyleft or "see file" alternative needs a recorded election, so a human made the choice.
  const election = ELECTIONS[name];
  const allowed = parts.filter((p) => p.ok);
  if (allowed.length === 0) return { ok: false, text: render(node), rank: 99, reason: `no allowed alternative in "${render(node)}"`, choseAmong: false };
  if (node.parts.some((p) => NEEDS_ELECTION_RE.test(render(p))) && !election) {
    return { ok: false, text: render(node), rank: 99, reason: `needs an ELECTIONS entry for "${render(node)}"`, choseAmong: false };
  }
  if (election) {
    const chosen = allowed.find((p) => p.text === election.elected);
    if (!chosen) return { ok: false, text: render(node), rank: 99, reason: `ELECTIONS names "${election.elected}", not an allowed alternative of "${render(node)}"`, choseAmong: false };
    return { ...chosen, choseAmong: true };
  }
  const best = [...allowed].sort((a, b) => a.rank - b.rank)[0];
  return { ...best, choseAmong: true };
}

/** Checks `expression` for package `name`. `elected` is set when an OR was resolved to one alternative. */
export function evaluateLicense(name: string, expression: string): LicenseVerdict {
  const expr = expression.trim();
  if (expr === "") return { ok: false, reason: "no license declared" };
  let node: Node;
  try {
    node = parse(expr);
  } catch (err) {
    return { ok: false, reason: `unparseable license expression "${expr}": ${err instanceof Error ? err.message : String(err)}` };
  }
  const r = resolve(node, name);
  if (!r.ok) return { ok: false, reason: r.reason ?? `"${expr}" is not allowed` };
  return r.choseAmong ? { ok: true, elected: r.text } : { ok: true };
}

/** True when a failed verdict is about a missing election rather than a disallowed license. */
export function needsElection(reason: string): boolean {
  return reason.startsWith("needs an ELECTIONS entry") || reason.startsWith("ELECTIONS names");
}

/** Detects the headings of source-available / copyleft license texts. */
export function sniffLicenseText(text: string): "BUSL" | "AGPL" | "LGPL" | "GPL" | null {
  if (/Business Source License/.test(text)) return "BUSL";
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/.test(text)) return "AGPL";
  if (/GNU (LESSER|LIBRARY) GENERAL PUBLIC LICENSE/.test(text)) return "LGPL";
  if (/GNU GENERAL PUBLIC LICENSE/.test(text)) return "GPL";
  return null;
}
