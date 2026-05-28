"use client";

import { uuid } from "@/lib/utils";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, ExternalLink, Pencil, Trash2, Eye, EyeOff, X } from "lucide-react";
import { usePermissions } from "@/lib/context/permissions";
import { PageHeader } from "@/components/page-header";
import { createSite, updateSite, deleteSite } from "@/lib/spacetimedb/actions";
import { getSites } from "@/lib/db/sites";
import type { Site } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function BuilderPage() {
  const t = useT();
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
      const siteId = uuid();
      await createSite(organizationId, newName.trim(), newSlug.trim());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const site: Site = { id: siteId, organizationId, name: newName.trim(), slug: newSlug.trim(), isPublished: false, features: {} } as any;
      setSites((prev) => [site, ...prev]);
      setShowCreate(false);
      setNewName("");
      setNewSlug("");
      setSlugTouched(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("builder.list.failedToCreate"));
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
    if (!confirm(t("builder.list.confirmDelete"))) return;
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
      <PageHeader
        title={t("builder.list.title")}
        subtitle={t("builder.list.subtitle")}
        right={
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); }}
            className="flex items-center gap-1.5 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("builder.list.newSite")}
          </button>
        }
      />

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-background border border-border rounded-[0.3rem] p-5 w-full max-w-sm z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">{t("builder.list.createNewSite")}</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("builder.list.siteName")}</label>
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("builder.list.sitePlaceholder")}
                  className="mt-1 w-full rounded-[0.3rem] border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("builder.list.urlSlug")}</label>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">/s/</span>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => { setNewSlug(e.target.value); setSlugTouched(true); }}
                    placeholder={t("builder.list.slugPlaceholder")}
                    className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
                    required
                    pattern="[a-z0-9\-]+"
                    title={t("builder.list.slugHint")}
                  />
                </div>
              </div>
              {createError && <p className="text-xs text-destructive rounded-[0.3rem] bg-destructive/10 px-2 py-1.5">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-[0.3rem] border border-border px-3 py-1.5 text-sm hover:bg-muted">{t("builder.list.cancel")}</button>
                <button type="submit" disabled={creating || !newName.trim() || !newSlug.trim()} className="flex-1 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {creating ? <Spinner size={14} /> : t("builder.list.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sites list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Spinner size={16} /> {t("builder.list.loadingSites")}
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-[0.3rem] border border-dashed border-border px-6 py-12 text-center">
          <Globe className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">{t("builder.list.noSites")}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">{t("builder.list.noSitesHint")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-[0.3rem] bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("builder.list.createSite")}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-[0.3rem] overflow-hidden">
          {sites.map((site) => (
            <div key={site.id} className="flex items-center gap-4 px-4 py-3 bg-background hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{site.name}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-[0.3rem] ${site.published ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground border border-border"}`}>
                    {site.published ? t("builder.list.published") : t("builder.list.draft")}
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
                  title={site.published ? t("builder.list.unpublish") : t("builder.list.publish")}
                  className="p-1.5 rounded-[0.3rem] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {togglingId === site.id
                    ? <Spinner size={14} />
                    : site.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <Link
                  href={`/~/builder/${site.id}`}
                  title={t("builder.list.edit")}
                  className="p-1.5 rounded-[0.3rem] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={() => handleDelete(site.id)}
                  disabled={deletingId === site.id}
                  title={t("builder.list.delete")}
                  className="p-1.5 rounded-[0.3rem] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  {deletingId === site.id
                    ? <Spinner size={14} />
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
