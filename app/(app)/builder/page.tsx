"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Plus,
  Loader2,
  ExternalLink,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { getSites, createSite, updateSite, deleteSite } from "@/lib/db/sites";
import type { Site } from "@/lib/types";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function BuilderPage() {
  const { organizationId } = usePermissions();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    getSites(organizationId)
      .then(setSites)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [organizationId]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugTouched) setNewSlug(slugify(newName));
  }, [newName, slugTouched]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const site = await createSite(organizationId, newName.trim(), newSlug.trim());
      setSites((prev) => [site, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewSlug("");
      setSlugTouched(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create site");
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePublish = async (site: Site) => {
    setTogglingId(site.id);
    try {
      await updateSite(site.id, { published: !site.published });
      setSites((prev) => prev.map((s) => s.id === site.id ? { ...s, published: !s.published } : s));
    } catch (err) {
      console.error("Failed to toggle publish:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this site? All pages will be lost.")) return;
    setDeletingId(id);
    try {
      await deleteSite(id);
      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete site:", err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-5 w-5" /> Website Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage public sites for your business</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="flex items-center gap-1.5 rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
        >
          <Plus className="h-3.5 w-3.5" /> New Site
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-background border border-border rounded-sm p-5 w-full max-w-sm shadow-lg z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">Create New Site</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Site Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Coffee Shop"
                  className="mt-1 w-full rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL Slug</label>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">/s/</span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => { setNewSlug(e.target.value); setSlugTouched(true); }}
                    placeholder="my-coffee-shop"
                    className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                    required
                    pattern="[a-z0-9\-]+"
                    title="Lowercase letters, numbers, and hyphens only"
                  />
                </div>
              </div>
              {createError && <p className="text-xs text-destructive rounded bg-destructive/10 px-2 py-1.5">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                <button type="submit" disabled={creating || !newName.trim() || !newSlug.trim()} className="flex-1 rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sites list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sites…
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded border border-dashed border-border px-6 py-12 text-center">
          <Globe className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">No sites yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Create your first site to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> Create Site
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-sm overflow-hidden">
          {sites.map((site) => (
            <div key={site.id} className="flex items-center gap-4 px-4 py-3 bg-background hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{site.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${site.published ? "bg-green-50 text-green-700 border border-green-200" : "bg-stone-100 text-stone-500 border border-stone-200"}`}>
                    {site.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-muted-foreground font-mono">/s/{site.slug}</span>
                  {site.published && (
                    <Link href={`/s/${site.slug}`} target="_blank" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleTogglePublish(site)}
                  disabled={togglingId === site.id}
                  title={site.published ? "Unpublish" : "Publish"}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {togglingId === site.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : site.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <Link
                  href={`/builder/${site.id}`}
                  title="Edit"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={() => handleDelete(site.id)}
                  disabled={deletingId === site.id}
                  title="Delete"
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  {deletingId === site.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
