"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { createDesign, deleteDesign } from "@/lib/spacetimedb/actions";
import { getDesigns } from "@/lib/db/designs";
import { DESIGN_PRESETS, findPreset, type DesignPreset } from "@/lib/design/presets";
import type { Design } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { DialogActions } from "@/components/ui/dialog-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";

function blankHtmlFor(name: string, w: number, h: number): string {
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fafaf9;color:#1c1917;font-family:Inter,sans-serif">
  <div style="text-align:center;padding:48px">
    <h1 style="font-size:48px;font-weight:700;margin:0 0 12px">${name.replace(/</g, "&lt;")}</h1>
    <p style="color:#78716c;margin:0">${w} × ${h}</p>
  </div>
</div>`;
}

export default function DesignListPage() {
  const t = useT();
  const router = useRouter();
  const { organizationId, shareGroupOrgIds } = usePermissions();

  // Subscribe so updates land live.
  const [, designReady] = useTable(tables.design);

  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [presetId, setPresetId] = useState<string>("instagram-square");
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Designs are shared across the parent/child share group — pull from every
  // org in the group so child stores see parent's design library and vice versa.
  const groupKey = shareGroupOrgIds.join("|");
  useEffect(() => {
    if (!organizationId || !designReady) return;
    const ids = shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId];
    getDesigns(ids)
      .then(setDesigns)
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, designReady, groupKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const preset = presetId === "custom" ? null : findPreset(presetId);
      const width = preset ? preset.width : customW;
      const height = preset ? preset.height : customH;
      await createDesign({
        name: newName.trim(),
        width,
        height,
        html: blankHtmlFor(newName.trim(), width, height),
        preset: preset?.id ?? null,
      });
      setShowCreate(false);
      setNewName("");
      // Refresh list — subscription will catch up too.
      const next = await getDesigns(shareGroupOrgIds.length ? shareGroupOrgIds : [organizationId]);
      setDesigns(next);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create design");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("design.list.confirmDelete"))) return;
    setDeletingId(id);
    try {
      await deleteDesign(id);
      setDesigns((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete design:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const groupedPresets = {
    social: DESIGN_PRESETS.filter((p) => p.category === "social"),
    print: DESIGN_PRESETS.filter((p) => p.category === "print"),
    signage: DESIGN_PRESETS.filter((p) => p.category === "signage"),
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">
      <PageHeader
        title={t("design.list.title")}
        subtitle={t("design.list.subtitle")}
        right={
          <Button size="sm" onClick={() => { setShowCreate(true); setCreateError(null); }}>
            <Plus className="h-3.5 w-3.5" /> {t("design.list.newDesign")}
          </Button>
        }
      />

      <DynamicUIElement open={showCreate} onOpenChange={(o) => { if (!o && !creating) setShowCreate(false); }}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("design.list.newDesign")}>{t("design.list.createTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("design.list.subtitle")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label={t("design.list.designName")} htmlFor="new-design-name">
              <Input
                id="new-design-name"
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("design.list.namePlaceholder")}
                required
              />
            </Field>
            <Field label={t("design.list.size")}>
              <div className="grid grid-cols-1 gap-1 max-h-[260px] overflow-y-auto rounded-lg border border-border p-1">
                <PresetSection label={t("design.preset.groupSocial")} presets={groupedPresets.social} value={presetId} onChange={setPresetId} t={t} />
                <PresetSection label={t("design.preset.groupPrint")} presets={groupedPresets.print} value={presetId} onChange={setPresetId} t={t} />
                <PresetSection label={t("design.preset.groupSignage")} presets={groupedPresets.signage} value={presetId} onChange={setPresetId} t={t} />
                <Eyebrow size="xs" className="px-1 pt-1 pb-1">{t("design.preset.groupCustom")}</Eyebrow>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPresetId("custom")}
                  className={cn("w-full justify-start font-normal", presetId === "custom" && "bg-muted")}
                >
                  <span>{t("design.preset.custom")}</span>
                </Button>
                {presetId === "custom" && (
                  <div className="px-2 py-2 flex items-center gap-1.5">
                    <Input type="number" min={50} max={8000} value={customW} onChange={(e) => setCustomW(Number(e.target.value))}
                      className="w-20 font-mono tabular-nums" />
                    <span className="text-[10px] text-muted-foreground">×</span>
                    <Input type="number" min={50} max={8000} value={customH} onChange={(e) => setCustomH(Number(e.target.value))}
                      className="w-20 font-mono tabular-nums" />
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                )}
              </div>
            </Field>
            {createError && <p className="text-destructive text-sm">{createError}</p>}
            <DialogActions
              className="pt-1"
              divider={false}
              confirmType="submit"
              onCancel={() => !creating && setShowCreate(false)}
              saving={creating}
              disabled={!newName.trim()}
              cancelLabel={t("design.list.cancel")}
              confirmLabel={t("design.list.create")}
            />
          </form>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Spinner size={16} /> {t("design.list.loading")}
        </div>
      ) : designs.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-border"
          icon={ImageIcon}
          title={t("design.list.empty")}
          description={t("design.list.emptyHint")}
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> {t("design.list.newDesign")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              onDelete={() => handleDelete(d.id)}
              deleting={deletingId === d.id}
              onOpen={() => router.push(`/manager/design/${d.id}`)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PresetSection({
  label,
  presets,
  value,
  onChange,
  t,
}: {
  label: string;
  presets: DesignPreset[];
  value: string;
  onChange: (id: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div>
      <Eyebrow size="xs" className="px-1 pt-1 pb-1">{label}</Eyebrow>
      {presets.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(p.id)}
          className={cn("w-full justify-between gap-2 font-normal", value === p.id && "bg-muted")}
        >
          <span className="truncate">{t(`design.preset.${p.labelKey}`)}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground shrink-0">{p.width}×{p.height}</span>
        </Button>
      ))}
    </div>
  );
}

function DesignCard({
  design,
  onDelete,
  deleting,
  onOpen,
  t,
}: {
  design: Design;
  onDelete: () => void;
  deleting: boolean;
  onOpen: () => void;
  t: (k: string) => string;
}) {
  const preset = findPreset(design.preset);
  // Thumbnail aspect ratio matches the design dimensions.
  const aspect = `${design.width} / ${design.height}`;
  return (
    <div className="group border border-border rounded-lg overflow-hidden bg-background hover:border-foreground/30 transition-colors">
      <button onClick={onOpen} className="block w-full text-left" title={t("design.list.open")}>
        <div className="bg-muted relative" style={{ aspectRatio: aspect }}>
          {/* Lightweight srcdoc preview (sandboxed, no scripts, smaller than full HtmlCanvas) */}
          <iframe
            sandbox=""
            srcDoc={`<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;width:${design.width}px;height:${design.height}px;font-family:Inter,sans-serif}body{transform-origin:top left}</style></head><body>${design.html}</body></html>`}
            className="absolute inset-0 w-full h-full pointer-events-none border-0"
            title={design.name}
          />
        </div>
      </button>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{design.name}</div>
          <div className="text-[10.5px] text-muted-foreground font-mono tabular-nums">
            {preset ? t(`design.preset.${preset.labelKey}`) : `${design.width}×${design.height}`}
          </div>
        </div>
        <Link
          href={`/manager/design/${design.id}`}
          title={t("design.list.edit")}
          className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" })}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          disabled={deleting}
          title={t("design.list.delete")}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          {deleting ? <Spinner size={14} /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
