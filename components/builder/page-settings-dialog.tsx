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
      setError("Name and URL slug are required.");
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
      setError(err instanceof Error ? err.message : "Failed to save page settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="sm:max-w-md">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle className="text-sm">Page Settings</DynamicUIElementTitle>
        </DynamicUIElementHeader>

        <div className="space-y-4">
          {/* Basics */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Home"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="home"
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
              SEO & Metadata
            </p>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={metadata.title ?? ""}
                onChange={(e) => updateMeta("title", e.target.value)}
                placeholder="Page title shown in browser tab"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={metadata.description ?? ""}
                onChange={(e) => updateMeta("description", e.target.value)}
                placeholder="Short summary for search engines"
                rows={2}
                className="text-sm resize-y"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Keywords</Label>
              <Input
                value={metadata.keywords ?? ""}
                onChange={(e) => updateMeta("keywords", e.target.value)}
                placeholder="comma, separated, keywords"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">OG Image URL</Label>
              <Input
                value={metadata.ogImage ?? ""}
                onChange={(e) => updateMeta("ogImage", e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Canonical URL</Label>
              <Input
                value={metadata.canonicalUrl ?? ""}
                onChange={(e) => updateMeta("canonicalUrl", e.target.value)}
                placeholder="https://example.com/page"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Robots</Label>
              <Input
                value={metadata.robots ?? ""}
                onChange={(e) => updateMeta("robots", e.target.value)}
                placeholder="index, follow"
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
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
