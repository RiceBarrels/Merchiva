import { NextResponse } from "next/server";
import { ALL_SEED_POSTS } from "@/lib/blog/seed-posts";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";

export async function POST(req: Request) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { slug: string; ok: boolean; error?: string }[] = [];

  for (const post of ALL_SEED_POSTS) {
    try {
      const id = crypto.randomUUID();
      // Use the SpacetimeDB SQL HTTP endpoint to insert directly
      const uri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI?.replace("wss://", "https://").replace("ws://", "http://") || "https://maincloud.spacetimedb.com";
      const module = process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE || "merchiva";
      const token = process.env.SPACETIMEDB_SERVICE_TOKEN;

      if (!token) {
        results.push({ slug: post.slug, ok: false, error: "No service token" });
        continue;
      }

      const res = await fetch(`${uri}/database/sql/${module}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "Authorization": `Bearer ${token}`,
        },
        body: `INSERT INTO blog_post (id, title, slug, content, excerpt, cover_image, status, author_id, published_at, created_at, updated_at) VALUES ('${id}', '${post.title.replace(/'/g, "''")}', '${post.slug}', '${post.content.replace(/'/g, "''")}', '${post.excerpt.replace(/'/g, "''")}', '${post.coverImage}', '${post.status}', 'system', '${post.publishedAt}', '${post.publishedAt}', '${post.publishedAt}')`,
      });

      if (res.ok) {
        results.push({ slug: post.slug, ok: true });
      } else {
        const text = await res.text();
        results.push({ slug: post.slug, ok: false, error: text.slice(0, 200) });
      }
    } catch (e) {
      results.push({ slug: post.slug, ok: false, error: String(e).slice(0, 200) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  return NextResponse.json({ total: ALL_SEED_POSTS.length, succeeded, results });
}
