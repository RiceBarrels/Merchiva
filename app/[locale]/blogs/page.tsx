import type { Metadata } from "next";
import { formatDate as formatDateIn } from "@/lib/i18n/dates";
import Link from "next/link";
import Image from "next/image";
import { SiteShell } from "@/components/landing/site-shell";
import { fetchPublishedBlogPosts } from "@/lib/spacetimedb/sql";
import { BlogHero, BlogCard } from "./_animations";
import { buildAlternates } from "@/lib/i18n/alternates";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    title: "Blog — Merchiva | Stories from the floor",
    description:
      "Field notes, deep dives, and operator wisdom from the Merchiva team and the small businesses we work with.",
    alternates: buildAlternates("/blogs", loc),
    openGraph: {
      title: "Merchiva Blog",
      description: "Field notes, deep dives, and operator wisdom.",
      url: `${BASE_URL}/${loc}/blogs`,
      siteName: "Merchiva",
      type: "website",
    },
  };
}

export const dynamic = "force-dynamic";

function formatDate(unixMs: number | null, fallback: number, locale: string): string {
  const ms = unixMs ?? fallback;
  if (!ms) return "";
  return formatDateIn(ms, locale, { year: "numeric", month: "short", day: "numeric" });
}

export default async function BlogsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const posts = await fetchPublishedBlogPosts();

  return (
    <SiteShell active="blog">
      <BlogHero>
        <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500 mb-3">
          / blog
        </div>
        <h1 className="font-sans text-[44px] sm:text-[56px] font-semibold tracking-tight leading-[1.05] text-stone-950">
          Field notes
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">
          Deep dives, operator wisdom, and updates from the team. Written for the people running the floor.
        </p>
      </BlogHero>

      <section className="mx-auto max-w-5xl px-5 pb-24">
        {posts.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white px-6 py-16 text-center">
            <p className="font-mono text-[12px] text-stone-500">No posts published yet.</p>
            <p className="mt-2 text-[14px] text-stone-700">Check back soon.</p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {posts.map((p, i) => (
              <BlogCard key={p.id} index={i}>
                <Link
                  href={`/${locale}/blogs/${p.slug}`}
                  className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5 py-7 transition-opacity hover:opacity-80"
                >
                  {p.coverImage ? (
                    <div className="relative aspect-[16/10] w-full sm:w-[160px] overflow-hidden rounded border border-stone-200 bg-stone-100">
                      <Image
                        src={p.coverImage}
                        alt={p.title}
                        fill
                        sizes="160px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/10] w-full sm:w-[160px] rounded border border-stone-200 bg-stone-100" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
                      {formatDate(p.publishedAt, p.createdAt, locale)}
                      {p.authorName ? ` · ${p.authorName}` : ""}
                    </div>
                    <h2 className="mt-2 font-sans text-[22px] font-semibold tracking-tight text-stone-950 leading-tight">
                      {p.title}
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-stone-600 line-clamp-2">
                      {p.excerpt}
                    </p>
                    <div className="mt-3 font-mono text-[11px] text-stone-500">
                      Read article <span className="text-stone-700">→</span>
                    </div>
                  </div>
                </Link>
              </BlogCard>
            ))}
          </ul>
        )}
      </section>
    </SiteShell>
  );
}
