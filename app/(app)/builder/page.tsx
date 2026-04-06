"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, Plus, ExternalLink, Pencil, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/context/permissions";
import { getSites, createSite, deleteSite, publishSite, unpublishSite } from "@/lib/db/sites";
import type { Site } from "@/lib/types";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BuilderPage() {
  const router = useRouter();
  const { organizationId } = usePermissions();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    getSites(organizationId)
      .then(setSites)
      .catch((e) => console.error("Failed to load sites:", e))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const handleCreate = async () => {
    if (!organizationId || !newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const slug = newSlug.trim() || slugify(newName);
      const site = await createSite({ organizationId, userId: user.id, name: newName.trim(), slug });
      router.push(`/builder/${site.id}`);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create site");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this site? This cannot be undone.")) return;
    setActionLoading(id);
    deleteSite(id)
      .then(() => setSites((s) => s.filter((x) => x.id !== id)))
      .catch((e) => console.error(e))
      .finally(() => setActionLoading(null));
  };

  const handleTogglePublish = async (site: Site) => {
    setActionLoading(site.id);
    const fn = site.status === "published" ? unpublishSite : publishSite;
    fn(site.id)
      .then(() => setSites((s) => s.map((x) => x.id === site.id ? { ...x, status: site.status === "published" ? "draft" : "published" } as Site : x)))
      .catch((e) => console.error(e))
      .finally(() => setActionLoading(null));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Website Builder</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-foreground text-background text-sm font-medium px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Site
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-center">
            <Globe className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-sm mb-1">No sites yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first customer-facing website</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-foreground text-background text-sm font-medium px-4 py-2 rounded hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Create Site
            </button>
          </div>
        ) : (
          <div className="grid gap-3 max-w-3xl">
            {sites.map((site) => (
              <div key={site.id} className="border border-border rounded bg-card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm truncate">{site.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        site.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {site.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">/{site.slug}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {site.status === "published" && (
                    <a
                      href={`/s/${site.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                  <button
                    onClick={() => handleTogglePublish(site)}
                    disabled={actionLoading === site.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                    title={site.status === "published" ? "Unpublish" : "Publish"}
                  >
                    {actionLoading === site.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : site.status === "published" ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {site.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <Link
                    href={`/builder/${site.id}`}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(site.id)}
                    disabled={actionLoading === site.id}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded w-full max-w-sm p-5">
            <h2 className="font-semibold text-sm mb-4">Create New Site</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Site Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewSlug(slugify(e.target.value));
                  }}
                  placeholder="My Awesome Business"
                  className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">URL Slug</label>
                <div className="flex items-center border border-border rounded overflow-hidden">
                  <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted border-r border-border">/s/</span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(slugify(e.target.value))}
                    placeholder="my-business"
                    className="flex-1 px-3 py-1.5 text-sm bg-background focus:outline-none font-mono"
                  />
                </div>
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewSlug(""); setCreateError(null); }}
                className="text-sm px-3 py-1.5 rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-1.5 bg-foreground text-background text-sm font-medium px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create Site
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
