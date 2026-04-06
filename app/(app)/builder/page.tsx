"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSites, createSite, deleteSite } from "@/lib/db/sites";
import { usePermissions } from "@/lib/context/permissions";
import type { Site } from "@/lib/types";

export default function BuilderPage() {
  const router = useRouter();
  const { currentOrg } = usePermissions();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    getSites(currentOrg.id)
      .then(setSites)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg) return;
    setCreating(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const site = await createSite(user.id, currentOrg.id, newName.trim(), newSlug.trim());
      setSites(prev => [...prev, site]);
      setShowCreate(false);
      setNewName("");
      setNewSlug("");
      router.push(`/builder/${site.id}`);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to create site");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this site? This cannot be undone.")) return;
    await deleteSite(id).catch(console.error);
    setSites(prev => prev.filter(s => s.id !== id));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Website Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage your websites</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New Site
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Create New Site</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Site Name</label>
              <input
                autoFocus
                value={newName}
                onChange={e => {
                  setNewName(e.target.value);
                  setNewSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }}
                placeholder="My Store"
                className="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">URL Slug</label>
              <input
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                placeholder="my-store"
                className="mt-1 w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newName.trim() || !newSlug.trim()}
                className="flex items-center gap-1.5 rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create & Edit"}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setError(null); }}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {sites.length === 0 ? (
        <div className="rounded border border-dashed border-border p-12 text-center">
          <Globe className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No websites yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first website to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map(site => (
            <div key={site.id} className="rounded border border-border bg-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{site.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">/{site.slug}</p>
                </div>
                <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  site.published
                    ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {site.published ? "Live" : "Draft"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/builder/${site.id}`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(site.id)}
                  className="rounded border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
