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
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); }}
            className="flex items-center gap-1.5 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("design.list.newDesign")}
          </button>
        }
      />

      <DynamicUIElement open={showCreate} onOpenChange={(o) => { if (!o && !creating) setShowCreate(false); }}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("design.list.newDesign")}>{t("design.list.createTitle")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("design.list.subtitle")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("design.list.designName")}</label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("design.list.namePlaceholder")}
                className="w-full rounded-[0.3rem] border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("design.list.size")}</label>
              <div className="grid grid-cols-1 gap-1 max-h-[260px] overflow-y-auto rounded-[0.3rem] border border-border p-1">
                <PresetSection label={t("design.preset.groupSocial")} presets={groupedPresets.social} value={presetId} onChange={setPresetId} t={t} />
                <PresetSection label={t("design.preset.groupPrint")} presets={groupedPresets.print} value={presetId} onChange={setPresetId} t={t} />
                <PresetSection label={t("design.preset.groupSignage")} presets={groupedPresets.signage} value={presetId} onChange={setPresetId} t={t} />
                <div className="px-1 pt-1 pb-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{t("design.preset.groupCustom")}</div>
                <button
                  type="button"
                  onClick={() => setPresetId("custom")}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-[0.3rem] text-xs hover:bg-muted text-left",
                    presetId === "custom" && "bg-muted",
                  )}
                >
                  <span>{t("design.preset.custom")}</span>
                </button>
                {presetId === "custom" && (
                  <div className="px-2 py-2 flex items-center gap-1.5">
                    <input type="number" min={50} max={8000} value={customW} onChange={(e) => setCustomW(Number(e.target.value))}
                      className="w-20 rounded-[0.3rem] border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring" />
                    <span className="text-[10px] text-muted-foreground">×</span>
                    <input type="number" min={50} max={8000} value={customH} onChange={(e) => setCustomH(Number(e.target.value))}
                      className="w-20 rounded-[0.3rem] border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring" />
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                )}
              </div>
            </div>
            {createError && <p className="text-xs text-destructive rounded-[0.3rem] bg-destructive/10 px-2 py-1.5">{createError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => !creating && setShowCreate(false)} className="flex-1 rounded-[0.3rem] border border-border px-3 py-1.5 text-sm hover:bg-muted">
                {t("design.list.cancel")}
              </button>
              <button type="submit" disabled={creating || !newName.trim()} className="flex-1 rounded-[0.3rem] bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {creating ? <Spinner size={14} /> : t("design.list.create")}
              </button>
            </div>
          </form>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Spinner size={16} /> {t("design.list.loading")}
        </div>
      ) : designs.length === 0 ? (
        <div className="rounded-[0.3rem] border border-dashed border-border px-6 py-12 text-center">
          <ImageIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">{t("design.list.empty")}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">{t("design.list.emptyHint")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-[0.3rem] bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="h-3.5 w-3.5" /> {t("design.list.newDesign")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              onDelete={() => handleDelete(d.id)}
              deleting={deletingId === d.id}
              onOpen={() => router.push(`/~/design/${d.id}`)}
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
      <div className="px-1 pt-1 pb-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">{label}</div>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={cn(
            "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[0.3rem] text-xs hover:bg-muted text-left",
            value === p.id && "bg-muted",
          )}
        >
          <span className="truncate">{t(`design.preset.${p.labelKey}`)}</span>
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{p.width}×{p.height}</span>
        </button>
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
    <div className="group border border-border rounded-[0.3rem] overflow-hidden bg-background hover:border-foreground/30 transition-colors">
      <button onClick={onOpen} className="block w-full text-left" title={t("design.list.open")}>
        <div className="bg-stone-100 relative" style={{ aspectRatio: aspect }}>
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
          <div className="text-[10.5px] text-muted-foreground font-mono">
            {preset ? t(`design.preset.${preset.labelKey}`) : `${design.width}×${design.height}`}
          </div>
        </div>
        <Link
          href={`/~/design/${design.id}`}
          title={t("design.list.edit")}
          className="p-1.5 rounded-[0.3rem] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={onDelete}
          disabled={deleting}
          title={t("design.list.delete")}
          className="p-1.5 rounded-[0.3rem] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          {deleting ? <Spinner size={14} /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
