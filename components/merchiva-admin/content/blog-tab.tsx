"use client";

import { useMemo, useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, DataTable, ErrorBanner, Notice, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "@/components/merchiva-admin/ui";
import { useAdminQuery } from "@/components/merchiva-admin/use-admin-query";
import { Field, Mono, useAction } from "./shared";

interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImage: string | null;
  status: string;
  authorIdentity: string;
  authorName: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Draft {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImage: string;
  status: string;
  authorName: string;
}

const EMPTY: Draft = { id: null, slug: "", title: "", excerpt: "", contentMd: "", coverImage: "", status: "draft", authorName: "" };

function statusTone(s: string): "ok" | "neutral" | "warn" {
  if (s === "published") return "ok";
  if (s === "archived") return "warn";
  return "neutral";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BlogTab() {
  const posts = useAdminQuery<BlogPostRow>("SELECT * FROM blog_post");
  const action = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(() => [...posts.rows].sort((a, b) => b.updatedAt - a.updatedAt), [posts.rows]);
  const published = sorted.filter((p) => p.status === "published").length;

  const openEdit = (p: BlogPostRow) => {
    setNotice(null);
    action.setError(null);
    setDraft({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      contentMd: p.contentMd,
      coverImage: p.coverImage ?? "",
      status: p.status,
      authorName: p.authorName ?? "",
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const base = {
      slug: draft.slug.trim(),
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      contentMd: draft.contentMd,
      coverImage: draft.coverImage.trim() || null,
      status: draft.status,
    };
    const ok = draft.id
      ? await action.run("updateBlogPost", { postId: draft.id, ...base })
      : await action.run("createBlogPost", { ...base, authorName: draft.authorName.trim() || null });
    if (ok) {
      setNotice(draft.id ? `Saved "${base.title}"` : `Created "${base.title}"`);
      setDraft(null);
      posts.reload();
    }
  };

  const setStatus = async (p: BlogPostRow, status: string) => {
    if (status !== "published" && !window.confirm(`Set "${p.title}" to ${status}? It will disappear from the public blog.`)) return;
    const ok = await action.run("updateBlogPost", {
      postId: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      contentMd: p.contentMd,
      coverImage: p.coverImage,
      status,
    });
    if (ok) {
      setNotice(`"${p.title}" is now ${status}`);
      posts.reload();
    }
  };

  const remove = async (p: BlogPostRow) => {
    if (!window.confirm(`Permanently delete blog post "${p.title}"? This cannot be undone.`)) return;
    const ok = await action.run("deleteBlogPost", { postId: p.id });
    if (ok) {
      setNotice(`Deleted "${p.title}"`);
      if (draft?.id === p.id) setDraft(null);
      posts.reload();
    }
  };

  const columns: Column<BlogPostRow>[] = [
    {
      key: "title",
      header: "Title / slug",
      render: (p) => (
        <div>
          <div className="font-medium">{p.title || <span className="text-stone-400">(untitled)</span>}</div>
          <div className="font-mono text-[11px] text-stone-500">/{p.slug}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    {
      key: "author",
      header: "Author",
      render: (p) => (
        <div>
          <div>{p.authorName ?? <span className="text-stone-300">—</span>}</div>
          <Mono value={p.authorIdentity} />
        </div>
      ),
    },
    { key: "size", header: "Body", className: "font-mono text-[11px] text-stone-600", render: (p) => `${p.contentMd.length.toLocaleString()} ch` },
    { key: "publishedAt", header: "Published", className: "whitespace-nowrap text-stone-600", render: (p) => formatTs(p.publishedAt) },
    { key: "updatedAt", header: "Updated", className: "whitespace-nowrap text-stone-600", render: (p) => formatTs(p.updatedAt) },
    { key: "id", header: "Id", render: (p) => <Mono value={p.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right whitespace-nowrap",
      render: (p) => (
        <span className="inline-flex gap-1.5">
          <button type="button" className={btnGhostCls} onClick={() => openEdit(p)} disabled={action.busy}>
            Edit
          </button>
          {p.status === "published" ? (
            <button type="button" className={btnGhostCls} onClick={() => setStatus(p, "draft")} disabled={action.busy}>
              Unpublish
            </button>
          ) : (
            <button type="button" className={btnGhostCls} onClick={() => setStatus(p, "published")} disabled={action.busy}>
              Publish
            </button>
          )}
          <button type="button" className={btnDangerCls} onClick={() => remove(p)} disabled={action.busy}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={`Blog posts (${sorted.length}, ${published} published)`}
        actions={
          <>
            <button type="button" className={btnGhostCls} onClick={() => posts.reload()}>
              Refresh
            </button>
            <button
              type="button"
              className={btnCls}
              onClick={() => {
                setNotice(null);
                action.setError(null);
                setDraft({ ...EMPTY });
              }}
            >
              New post
            </button>
          </>
        }
      >
        <ErrorBanner message={posts.error ?? action.error} />
        <Notice message={notice} />
        <DataTable columns={columns} rows={sorted} loading={posts.loading} empty="No blog posts yet" rowKey={(p) => p.id} />
      </Panel>

      {draft && (
        <Panel
          title={draft.id ? `Edit post — ${draft.title || draft.slug}` : "New post"}
          actions={
            <button type="button" className={btnGhostCls} onClick={() => setDraft(null)}>
              Close
            </button>
          }
        >
          <form onSubmit={save} className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setDraft((d) => (d ? { ...d, title, slug: d.id || d.slug ? d.slug : slugify(title) } : d));
                  }}
                  required
                />
              </Field>
              <Field label="Slug">
                <input
                  className={`${inputCls} font-mono`}
                  value={draft.slug}
                  onChange={(e) => setDraft((d) => (d ? { ...d, slug: e.target.value } : d))}
                  pattern="[a-z0-9-]+"
                  title="lowercase letters, digits and dashes"
                  required
                />
              </Field>
              <Field label="Status">
                <select className={inputCls} value={draft.status} onChange={(e) => setDraft((d) => (d ? { ...d, status: e.target.value } : d))}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </Field>
              <Field label="Cover image URL (optional)">
                <input className={`${inputCls} font-mono`} value={draft.coverImage} onChange={(e) => setDraft((d) => (d ? { ...d, coverImage: e.target.value } : d))} />
              </Field>
              {!draft.id && (
                <Field label="Author name (optional, create only)">
                  <input className={inputCls} value={draft.authorName} onChange={(e) => setDraft((d) => (d ? { ...d, authorName: e.target.value } : d))} />
                </Field>
              )}
            </div>
            <Field label="Excerpt">
              <textarea className={`${inputCls} min-h-[60px]`} value={draft.excerpt} onChange={(e) => setDraft((d) => (d ? { ...d, excerpt: e.target.value } : d))} />
            </Field>
            <Field label={`Content (Markdown, ${draft.contentMd.length.toLocaleString()} chars)`}>
              <textarea
                className={`${inputCls} min-h-[360px] font-mono text-[12px]`}
                value={draft.contentMd}
                onChange={(e) => setDraft((d) => (d ? { ...d, contentMd: e.target.value } : d))}
                spellCheck={false}
              />
            </Field>
            <div className="flex items-center gap-2">
              <button type="submit" className={btnCls} disabled={action.busy}>
                {action.busy ? "Saving…" : draft.id ? "Save changes" : "Create post"}
              </button>
              <button type="button" className={btnGhostCls} onClick={() => setDraft(null)}>
                Cancel
              </button>
              {action.error && <span className="text-[12px] text-red-700">{action.error}</span>}
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
