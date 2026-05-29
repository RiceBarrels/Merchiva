"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useBlogPosts } from "@/lib/spacetimedb/hooks";
import { createBlogPost, updateBlogPost, deleteBlogPost } from "@/lib/spacetimedb/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/loaders/geometric";
import { UploadButton } from "@/lib/uploadthing";
import { toast } from "sonner";
import TurndownService from "turndown";
import { markdownToQuillHtml } from "@/lib/blog/markdown";
import "react-quill-new/dist/quill.snow.css";

// react-quill-new touches the DOM during module init — must be client-only.
// The wrapper component handles its own loading skeleton.
const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-stone-50 text-stone-500">
      <Spinner size={16} />
    </div>
  ),
});

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }, "blockquote", "code-block"],
    ["link", "image"],
    ["clean"],
  ],
};

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

interface BlogPostRow {
  id: { toString(): string };
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImage: string | null;
  status: string;
  authorName: string | null;
  publishedAt: { __timestamp_micros_since_unix_epoch__: number | bigint } | null;
  createdAt: { __timestamp_micros_since_unix_epoch__: number | bigint };
  updatedAt: { __timestamp_micros_since_unix_epoch__: number | bigint };
}

interface EditorState {
  id: string | null;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;       // Quill works in HTML — we convert to Markdown on save
  coverImage: string | null;
  status: "draft" | "published";
  authorName: string;
}

const EMPTY: EditorState = {
  id: null,
  slug: "",
  title: "",
  excerpt: "",
  contentHtml: "<h1>New post</h1><p>Write something worth reading.</p>",
  coverImage: null,
  status: "draft",
  authorName: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function tsToDate(ts: { __timestamp_micros_since_unix_epoch__: number | bigint } | null): string {
  if (!ts) return "";
  const micros = Number(ts.__timestamp_micros_since_unix_epoch__);
  return new Date(Math.floor(micros / 1000)).toLocaleDateString();
}

export default function AdminsBlogsPage() {
  const t = useT();
  const [rows] = useBlogPosts();
  const posts = rows as unknown as BlogPostRow[];

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const filtered = useMemo(() => {
    return [...posts]
      .filter((p) => (filter === "all" ? true : p.status === filter))
      .sort((a, b) => {
        const ax = Number(a.updatedAt.__timestamp_micros_since_unix_epoch__);
        const bx = Number(b.updatedAt.__timestamp_micros_since_unix_epoch__);
        return bx - ax;
      });
  }, [posts, filter]);

  function startNew() {
    setEditor({ ...EMPTY });
  }

  function startEdit(p: BlogPostRow) {
    setEditor({
      id: p.id.toString(),
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      contentHtml: markdownToQuillHtml(p.contentMd),
      coverImage: p.coverImage,
      status: (p.status as "draft" | "published") ?? "draft",
      authorName: p.authorName ?? "",
    });
  }

  async function handleSave() {
    if (!editor) return;
    if (!editor.title.trim() || !editor.slug.trim()) {
      toast.error(t("admins.blogs.toast.missingFields"));
      return;
    }
    setSaving(true);
    try {
      const contentMd = turndown.turndown(editor.contentHtml).trim();
      if (editor.id) {
        await updateBlogPost(editor.id, {
          slug: editor.slug.trim(),
          title: editor.title.trim(),
          excerpt: editor.excerpt.trim(),
          contentMd,
          coverImage: editor.coverImage,
          status: editor.status,
        });
        toast.success(t("admins.blogs.toast.updated"));
      } else {
        await createBlogPost({
          slug: editor.slug.trim(),
          title: editor.title.trim(),
          excerpt: editor.excerpt.trim(),
          contentMd,
          coverImage: editor.coverImage,
          status: editor.status,
          authorName: editor.authorName.trim() || null,
        });
        toast.success(t("admins.blogs.toast.created"));
      }
      setEditor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: BlogPostRow) {
    if (!confirm(t("admins.blogs.confirmDelete").replace("{title}", p.title))) return;
    try {
      await deleteBlogPost(p.id.toString());
      toast.success(t("admins.blogs.toast.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  if (editor) {
    return (
      <BlogEditor
        state={editor}
        saving={saving}
        onChange={setEditor}
        onSave={handleSave}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            / {t("admins.shellTag")} / blogs
          </div>
          <h1 className="mt-2 font-sans text-[28px] font-semibold tracking-tight text-stone-950">
            {t("admins.blogs.title")}
          </h1>
          <p className="mt-1 text-[13px] text-stone-600">{t("admins.blogs.subtitle")}</p>
        </div>
        <Button onClick={startNew}>{t("admins.blogs.newPost")}</Button>
      </div>

      <div className="flex gap-2">
        {(["all", "published", "draft"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded border px-3 py-1 text-[12px] font-medium " +
              (filter === f
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
            }
          >
            {t(`admins.blogs.filter.${f}`)}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-stone-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center font-mono text-[12px] text-stone-500">
            {t("admins.blogs.empty")}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-stone-200 text-[13px]">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                  {t("admins.blogs.col.title")}
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                  {t("admins.blogs.col.slug")}
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                  {t("admins.blogs.col.status")}
                </th>
                <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                  {t("admins.blogs.col.updated")}
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((p) => (
                <tr key={p.id.toString()} className="hover:bg-stone-50">
                  <td className="px-3 py-2 text-stone-900">{p.title}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-stone-600">{p.slug}</td>
                  <td className="px-3 py-2">
                    <Badge variant={p.status === "published" ? "default" : "secondary"}>
                      {t(`admins.blogs.filter.${p.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-stone-500">
                    {tsToDate(p.updatedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>
                      {t("admins.blogs.edit")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>
                      {t("admins.blogs.delete")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BlogEditor({
  state,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  state: EditorState;
  saving: boolean;
  onChange: (s: EditorState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            / {t("admins.shellTag")} / {state.id ? "edit" : "new"}
          </div>
          <h1 className="mt-1 font-sans text-[24px] font-semibold tracking-tight text-stone-950">
            {state.id ? t("admins.blogs.editTitle") : t("admins.blogs.newTitle")}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {t("admins.blogs.cancel")}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? t("admins.blogs.saving") : t("admins.blogs.save")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.title")}
            </label>
            <Input
              value={state.title}
              onChange={(e) => {
                const next = { ...state, title: e.target.value };
                if (!state.id && !state.slug) next.slug = slugify(e.target.value);
                onChange(next);
              }}
              className="mt-1 text-[15px]"
              placeholder="A post worth reading"
            />
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.excerpt")}
            </label>
            <Textarea
              value={state.excerpt}
              onChange={(e) => onChange({ ...state, excerpt: e.target.value })}
              className="mt-1"
              rows={2}
              placeholder="One or two sentences shown on the list view."
            />
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.content")}
            </label>
            <div className="mt-2 overflow-hidden rounded border border-stone-300 quill-merchiva">
              <ReactQuill
                theme="snow"
                value={state.contentHtml}
                onChange={(html) => onChange({ ...state, contentHtml: html })}
                modules={QUILL_MODULES}
                placeholder={t("admins.blogs.field.contentPlaceholder")}
              />
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-stone-500">
              {t("admins.blogs.field.contentHint")}
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.slug")}
            </label>
            <Input
              value={state.slug}
              onChange={(e) => onChange({ ...state, slug: slugify(e.target.value) })}
              className="mt-1 font-mono text-[13px]"
              placeholder="my-post"
            />
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.status")}
            </label>
            <div className="mt-2 flex gap-2">
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...state, status: s })}
                  className={
                    "flex-1 rounded border px-3 py-1.5 text-[13px] font-medium " +
                    (state.status === s
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
                  }
                >
                  {t(`admins.blogs.filter.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {!state.id ? (
            <div className="rounded border border-stone-200 bg-white p-4">
              <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
                {t("admins.blogs.field.author")}
              </label>
              <Input
                value={state.authorName}
                onChange={(e) => onChange({ ...state, authorName: e.target.value })}
                className="mt-1"
                placeholder="Anonymous"
              />
            </div>
          ) : null}
          <div className="rounded border border-stone-200 bg-white p-4">
            <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              {t("admins.blogs.field.cover")}
            </label>
            {state.coverImage ? (
              <div className="mt-2 space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.coverImage}
                  alt="cover"
                  className="aspect-[16/9] w-full rounded border border-stone-200 object-cover"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...state, coverImage: null })}
                >
                  {t("admins.blogs.removeCover")}
                </Button>
              </div>
            ) : (
              <div className="mt-2">
                <UploadButton
                  endpoint="siteImage"
                  onClientUploadComplete={(res) => {
                    const url = res?.[0]?.url ?? res?.[0]?.serverData?.url;
                    if (url) onChange({ ...state, coverImage: url });
                  }}
                  onUploadError={(err) => {
                    toast.error(err.message);
                  }}
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
