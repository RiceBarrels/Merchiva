import type { Metadata } from "next";
import { formatDate } from "@/lib/i18n/dates";
import { SiteShell } from "@/components/landing/site-shell";
import { buildAlternates } from "@/lib/i18n/alternates";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";

const BASE_URL = "https://project-management-phi-red.vercel.app";
const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "RiceBarrels/Merchiva";

// Refetch from GitHub at most once an hour (ISR).
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    title: "Changelog — Merchiva | Product Updates and New Features",
    description:
      "Latest product updates, new features, and improvements to Merchiva. Currently in beta — transparent release notes published with every update.",
    alternates: buildAlternates("/changelog", loc),
    openGraph: {
      title: "Merchiva Changelog — What's New",
      description: "Beta release notes, new feature rollouts, and platform improvements.",
      url: `${BASE_URL}/${loc}/changelog`,
      siteName: "Merchiva",
      type: "website",
    },
  };
}

const C = {
  bg: "#f0eee9", paper: "#ffffff", surface: "#fafaf9", ink: "#0c0a09",
  text: "#1c1917", text2: "#44403c", text3: "#57534e", sec: "#78716c",
  ter: "#a8a29e", border: "#e0ddd6", borderD: "#cbc7bd", good: "#059669",
  accent: "oklch(0.55 0.09 55)",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
};

type Entry = {
  sha: string;
  date: string;
  title: string;
  items: string[];
  tag: string;
  url: string;
};

// Conventional-commit type → display tag.
const TAG_MAP: Record<string, string> = {
  feat: "feature", fix: "fix", perf: "perf", refactor: "refactor",
  docs: "docs", chore: "chore", style: "style", test: "test",
  build: "build", ci: "ci", revert: "revert",
};

function isNoiseLine(line: string) {
  return (
    /^co-authored-by:/i.test(line) ||
    line.startsWith("🤖") ||
    /^generated with/i.test(line) ||
    /^\s*$/.test(line)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCommit(c: any, locale: string): Entry {
  const message: string = c?.commit?.message ?? "";
  const [subject, ...rest] = message.split("\n");
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/);

  let tag = "update";
  let title = subject.trim();
  if (m) {
    const [, type, scope, breaking, desc] = m;
    title = scope ? `${desc} (${scope})` : desc;
    tag = breaking ? "major" : (TAG_MAP[type.toLowerCase()] ?? type.toLowerCase());
  }

  const items = rest
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l && !isNoiseLine(l));

  return {
    sha: String(c?.sha ?? "").slice(0, 7),
    date: c?.commit?.author?.date
      ? formatDate(c.commit.author.date, locale, { month: "short", day: "numeric", year: "numeric" })
      : "",
    title,
    items,
    tag,
    url: c?.html_url ?? `https://github.com/${REPO}`,
  };
}

function parseLastPage(link: string | null): number | null {
  const m = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}

async function fetchChangelog(locale: string): Promise<{ entries: Entry[]; total: number } | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // per_page=1 gives an exact total via the Link header's rel="last" page number.
    const [listRes, countRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${REPO}/commits?per_page=100`, { headers, next: { revalidate } }),
      fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`, { headers, next: { revalidate } }),
    ]);

    if (!listRes.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await listRes.json();
    const entries = raw
      .filter((c) => !String(c?.commit?.message ?? "").startsWith("Merge "))
      .map((c) => mapCommit(c, locale));

    if (entries.length) entries[0].tag = "latest";

    const total = parseLastPage(countRes.headers.get("link")) ?? entries.length;
    return { entries, total };
  } catch {
    return null;
  }
}

function tagStyle(tag: string) {
  if (tag === "latest") return { bg: C.good, label: "latest" };
  if (tag === "major") return { bg: C.ink, label: "major" };
  return { bg: C.accent, label: tag };
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const data = await fetchChangelog(locale);
  const entries = data?.entries ?? [];

  return (
    <SiteShell active="changelog" background={C.bg}>
      {/* Hero */}
      <section style={{ padding: "100px 32px 60px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4, textTransform: "uppercase" }}>changelog</span>
            <span style={{ fontFamily: C.mono, fontSize: 9.5, padding: "3px 8px", borderRadius: 99, background: C.accent, color: "#fff", letterSpacing: 0.4, fontWeight: 600 }}>BETA</span>
          </div>
          <h1 style={{ margin: "0 0 0", fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.96, color: C.ink }}>
            What&apos;s new.
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: 18, color: C.text2, lineHeight: 1.5 }}>
            Merchiva is in active beta development. This changelog is pulled straight from our commit history on GitHub. Expect frequent updates.
          </p>
          {data && (
            <div style={{ marginTop: 16, display: "flex", gap: 16, fontFamily: C.mono, fontSize: 11, color: C.sec, flexWrap: "wrap" }}>
              <span>{data.total} commits</span>
              {entries[0]?.date && (
                <>
                  <span>·</span>
                  <span>latest {entries[0].date}</span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Timeline */}
      <section style={{ padding: "0 32px 120px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {entries.length === 0 ? (
            <p style={{ fontFamily: C.mono, fontSize: 13, color: C.sec, lineHeight: 1.6 }}>
              Unable to load the changelog from GitHub right now. Please check back shortly.
            </p>
          ) : (
            entries.map((e, i) => {
              const ts = tagStyle(e.tag);
              return (
                <article key={e.sha + i} style={{ position: "relative", paddingLeft: 32, paddingBottom: i < entries.length - 1 ? 48 : 0, borderLeft: i < entries.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ position: "absolute", left: -5, top: 0, width: 10, height: 10, borderRadius: 99, background: ts.bg, border: `2px solid ${C.bg}` }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sec, letterSpacing: 0.4 }}>{e.date}</span>
                    <span style={{ fontFamily: C.mono, fontSize: 9.5, padding: "3px 7px", borderRadius: 3, background: ts.bg, color: "#fff", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{ts.label}</span>
                    <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: C.mono, fontSize: 10, color: C.ter, textDecoration: "none" }}>{e.sha}</a>
                  </div>
                  <h2 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600, letterSpacing: -0.6, color: C.ink }}>{e.title}</h2>
                  {e.items.length > 0 && (
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                      {e.items.map((item, j) => (
                        <li key={j} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, lineHeight: 1.5, color: C.text2 }}>
                          <span style={{ fontFamily: C.mono, color: C.ter, flexShrink: 0 }}>·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

    </SiteShell>
  );
}
