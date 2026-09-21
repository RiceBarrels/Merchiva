import type { Metadata } from "next";
import { formatDate as formatDateIn } from "@/lib/i18n/dates";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteShell } from "@/components/landing/site-shell";
import { fetchBlogPostBySlug } from "@/lib/spacetimedb/sql";
import {
  BlogArticle,
  BlogArticleHeader,
  BlogArticleCover,
  BlogArticleBody,
} from "../_animations";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) return { title: "Post not found — Merchiva" };
  return {
    title: `${post.title} — Merchiva Blog`,
    description: post.excerpt,
    alternates: { canonical: `${BASE_URL}/${locale}/blogs/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `${BASE_URL}/${locale}/blogs/${post.slug}`,
      siteName: "Merchiva",
      type: "article",
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
  };
}

function formatDate(unixMs: number | null, fallback: number, locale: string): string {
  const ms = unixMs ?? fallback;
  if (!ms) return "";
  return formatDateIn(ms, locale, { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <SiteShell active="blog">
      <BlogArticle>
        <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500 mb-4">
          <Link href={`/${locale}/blogs`} className="hover:text-foreground transition-colors">
            ← back to blog
          </Link>
        </div>
        <BlogArticleHeader>
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            {formatDate(post.publishedAt, post.createdAt, locale)}
            {post.authorName ? ` · ${post.authorName}` : ""}
          </div>
          <h1 className="mt-3 font-sans text-[40px] sm:text-[48px] font-semibold tracking-tight leading-[1.1] text-stone-950">
            {post.title}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-stone-700">
            {post.excerpt}
          </p>
        </BlogArticleHeader>

        {post.coverImage ? (
          <BlogArticleCover>
            <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden rounded border border-stone-200 bg-stone-100">
              <Image
                src={post.coverImage}
                alt={post.title}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                priority
                unoptimized
              />
            </div>
          </BlogArticleCover>
        ) : null}

        <BlogArticleBody>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => <h1 className="mt-10 mb-4 font-sans text-[30px] font-semibold tracking-tight text-stone-950" {...props} />,
              h2: (props) => <h2 className="mt-10 mb-3 font-sans text-[24px] font-semibold tracking-tight text-stone-950" {...props} />,
              h3: (props) => <h3 className="mt-8 mb-2 font-sans text-[19px] font-semibold tracking-tight text-stone-950" {...props} />,
              p: (props) => <p className="my-4 text-[16px] leading-[1.75] text-stone-800" {...props} />,
              a: (props) => <a className="text-stone-950 underline underline-offset-2 hover:text-stone-700" {...props} />,
              ul: (props) => <ul className="my-4 ml-5 list-disc text-[16px] leading-[1.75] text-stone-800" {...props} />,
              ol: (props) => <ol className="my-4 ml-5 list-decimal text-[16px] leading-[1.75] text-stone-800" {...props} />,
              li: (props) => <li className="my-1" {...props} />,
              blockquote: (props) => <blockquote className="my-6 border-l-2 border-stone-400 pl-4 italic text-stone-700" {...props} />,
              code: (props) => <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[14px] text-foreground" {...props} />,
              pre: (props) => <pre className="my-6 overflow-x-auto rounded border border-stone-200 bg-stone-50 p-4 font-mono text-[13px] text-foreground" {...props} />,
              hr: () => <hr className="my-10 border-stone-200" />,
              img: (props) => (
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                <img className="my-6 w-full rounded border border-stone-200" {...props} />
              ),
              table: (props) => <table className="my-6 w-full border-collapse text-[14px]" {...props} />,
              th: (props) => <th className="border border-stone-200 bg-stone-50 px-3 py-2 text-left font-semibold" {...props} />,
              td: (props) => <td className="border border-stone-200 px-3 py-2" {...props} />,
            }}
          >
            {post.contentMd}
          </ReactMarkdown>
        </BlogArticleBody>
      </BlogArticle>
    </SiteShell>
  );
}
