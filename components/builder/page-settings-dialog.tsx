"use client";

import { useState, useEffect } from "react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementFooter,
} from "@/components/ui/dynamic-ui-element";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { updatePage } from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import type { SitePage, PageMetadata } from "@/lib/types";

interface PageSettingsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  page: SitePage;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function PageSettingsDialog({ open, onOpenChange, page }: PageSettingsDialogProps) {
  const t = useT();
  const [name, setName] = useState(page.name);
  const [slug, setSlug] = useState(page.slug);
  const [metadata, setMetadata] = useState<PageMetadata>(page.metadata ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when switching page
  useEffect(() => {
    setName(page.name);
    setSlug(page.slug);
    setMetadata(page.metadata ?? {});
    setError(null);
  }, [page.id, page.name, page.slug, page.metadata]);

  const updateMeta = <K extends keyof PageMetadata>(key: K, value: PageMetadata[K]) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSave() {
    if (!name.trim() || !slug.trim()) {
      setError(t("builder.pageSettingsDialog.errorRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Strip empty metadata fields before saving
      const cleanMeta: PageMetadata = {};
      for (const [k, v] of Object.entries(metadata)) {
        if (v && String(v).trim()) (cleanMeta as Record<string, string>)[k] = String(v).trim();
      }
      const hasMeta = Object.keys(cleanMeta).length > 0;

      await updatePage(page.id, {
        name: name.trim(),
        slug: slugify(slug),
        elements: JSON.stringify(page.elements ?? []),
        sortOrder: page.sortOrder,
        html: page.html,
        metadata: hasMeta ? JSON.stringify(cleanMeta) : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Update page failed:", err);
      setError(err instanceof Error ? err.message : t("builder.pageSettingsDialog.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="sm:max-w-md">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle className="text-sm">{t("builder.pageSettingsDialog.title")}</DynamicUIElementTitle>
        </DynamicUIElementHeader>

        <div className="space-y-4">
          {/* Basics */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("builder.pageSettingsDialog.namePlaceholder")}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.urlSlug")}</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t("builder.pageSettingsDialog.slugPlaceholder")}
                className="h-8 text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                /{slugify(slug) || "—"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Metadata */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("builder.pageSettingsDialog.seoMetadata")}
            </p>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.metaTitle")}</Label>
              <Input
                value={metadata.title ?? ""}
                onChange={(e) => updateMeta("title", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.metaTitlePlaceholder")}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.metaDescription")}</Label>
              <Textarea
                value={metadata.description ?? ""}
                onChange={(e) => updateMeta("description", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.metaDescriptionPlaceholder")}
                rows={2}
                className="text-sm resize-y"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.keywords")}</Label>
              <Input
                value={metadata.keywords ?? ""}
                onChange={(e) => updateMeta("keywords", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.keywordsPlaceholder")}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.ogImage")}</Label>
              <Input
                value={metadata.ogImage ?? ""}
                onChange={(e) => updateMeta("ogImage", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.ogImagePlaceholder")}
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.canonical")}</Label>
              <Input
                value={metadata.canonicalUrl ?? ""}
                onChange={(e) => updateMeta("canonicalUrl", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.canonicalPlaceholder")}
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builder.pageSettingsDialog.robots")}</Label>
              <Input
                value={metadata.robots ?? ""}
                onChange={(e) => updateMeta("robots", e.target.value)}
                placeholder={t("builder.pageSettingsDialog.robotsPlaceholder")}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DynamicUIElementFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            {t("builder.pageSettingsDialog.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs"
          >
            {saving ? t("builder.pageSettingsDialog.saving") : t("builder.pageSettingsDialog.save")}
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
