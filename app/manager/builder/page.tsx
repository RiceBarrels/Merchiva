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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DialogActions } from "@/components/ui/dialog-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function BuilderPage() {
  const t = useT();
  const { organizationId, shareGroupOrgIds } = usePermissions();
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

  // Sites are shared across the share group — every sibling/parent site is
  // visible from any store in the group.
  const groupKey = shareGroupOrgIds.join("|");
  useEffect(() => {
    if (!organizationId) return;
    const ids = shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId];
    getSites(ids)
      .then(setSites)
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, groupKey]);

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
          <Button size="sm" onClick={() => { setShowCreate(true); setCreateError(null); }}>
            <Plus className="h-3.5 w-3.5" /> {t("builder.list.newSite")}
          </Button>
        }
      />

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-background border border-border rounded-lg p-5 w-full max-w-sm z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">{t("builder.list.createNewSite")}</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label={t("builder.list.siteName")} htmlFor="new-site-name">
                <Input
                  id="new-site-name"
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("builder.list.sitePlaceholder")}
                  required
                />
              </Field>
              <Field label={t("builder.list.urlSlug")} htmlFor="new-site-slug">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">/s/</span>
                  <Input
                    id="new-site-slug"
                    type="text"
                    value={newSlug}
                    onChange={(e) => { setNewSlug(e.target.value); setSlugTouched(true); }}
                    placeholder={t("builder.list.slugPlaceholder")}
                    className="flex-1 font-mono"
                    required
                    pattern="[a-z0-9\-]+"
                    title={t("builder.list.slugHint")}
                  />
                </div>
              </Field>
              {createError && <p className="text-destructive text-sm">{createError}</p>}
              <DialogActions
                className="pt-1"
                divider={false}
                confirmType="submit"
                onCancel={() => setShowCreate(false)}
                saving={creating}
                disabled={!newName.trim() || !newSlug.trim()}
                cancelLabel={t("builder.list.cancel")}
                confirmLabel={t("builder.list.create")}
              />
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
        <EmptyState
          className="rounded-lg border border-border"
          icon={Globe}
          title={t("builder.list.noSites")}
          description={t("builder.list.noSitesHint")}
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> {t("builder.list.createSite")}
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {sites.map((site) => (
            <div key={site.id} className="flex items-center gap-4 px-4 py-3 bg-background hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{site.name}</span>
                  <StatusBadge size="xs" tone={site.published ? "success" : "neutral"}>
                    {site.published ? t("builder.list.published") : t("builder.list.draft")}
                  </StatusBadge>
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleTogglePublish(site)}
                  disabled={togglingId === site.id}
                  title={site.published ? t("builder.list.unpublish") : t("builder.list.publish")}
                  className="text-muted-foreground"
                >
                  {togglingId === site.id
                    ? <Spinner size={14} />
                    : site.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Link
                  href={`/manager/builder/${site.id}`}
                  title={t("builder.list.edit")}
                  className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(site.id)}
                  disabled={deletingId === site.id}
                  title={t("builder.list.delete")}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  {deletingId === site.id
                    ? <Spinner size={14} />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
