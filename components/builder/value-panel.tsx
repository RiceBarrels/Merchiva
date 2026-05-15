"use client";

import { useState, useCallback } from "react";
import { Copy, Check, Plus, Trash2, Braces, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SYSTEM_VALUES, SYSTEM_VALUE_KEYS } from "@/lib/builder/site-values";
import { updateSite } from "@/lib/spacetimedb/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { Site } from "@/lib/types";

function CopyTag({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-[0.2rem] border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      onClick={() => {
        navigator.clipboard.writeText(`{${text}}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={`${t("builder.values.copyTag")} {${text}}`}
    >
      <span>{`{${text}}`}</span>
      {copied ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5" />}
    </button>
  );
}

interface ValuePanelProps {
  site: Site;
}

export function ValuePanel({ site }: ValuePanelProps) {
  const t = useT();
  const customValues = site.values ?? {};
  const [addingKey, setAddingKey] = useState("");
  const [addingValue, setAddingValue] = useState("");
  const [systemOpen, setSystemOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const persist = useCallback(
    (next: Record<string, string>) => {
      const featuresWithValues = { ...site.features, _values: next };
      updateSite(site.id, { features: JSON.stringify(featuresWithValues) }).catch(console.error);
    },
    [site.id, site.features],
  );

  const handleAdd = () => {
    const key = addingKey.trim().replace(/[^\w]/g, "");
    if (!key || SYSTEM_VALUE_KEYS.has(key) || key in customValues) return;
    const next = { ...customValues, [key]: addingValue };
    persist(next);
    setAddingKey("");
    setAddingValue("");
  };

  const handleDelete = (key: string) => {
    const next = { ...customValues };
    delete next[key];
    persist(next);
  };

  const handleEditCommit = (key: string) => {
    const next = { ...customValues, [key]: editValue };
    persist(next);
    setEditingKey(null);
  };

  const entries = Object.entries(customValues);

  return (
    <div className="flex flex-col gap-0">
      {/* Custom values */}
      <div className="px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("builder.values.custom")}
        </span>
      </div>

      <div className="space-y-1 px-2">
        {entries.length === 0 && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            {t("builder.values.noCustom")}
          </p>
        )}
        {entries.map(([key, val]) => (
          <div
            key={key}
            className="group flex items-center gap-1.5 rounded-[0.3rem] px-1.5 py-1 hover:bg-accent/50"
          >
            <CopyTag text={key} />
            {editingKey === key ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleEditCommit(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditCommit(key);
                  if (e.key === "Escape") setEditingKey(null);
                }}
                className="h-6 flex-1 text-[11px]"
                autoFocus
              />
            ) : (
              <span
                className="flex-1 truncate text-[11px] text-foreground cursor-text"
                onClick={() => {
                  setEditingKey(key);
                  setEditValue(val);
                }}
                title={val}
              >
                {val || <span className="text-muted-foreground italic">{t("builder.values.empty")}</span>}
              </span>
            )}
            <button
              type="button"
              className="h-4 w-4 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDelete(key)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add new value */}
        <div className="flex items-center gap-1 pt-1">
          <Input
            value={addingKey}
            onChange={(e) => setAddingKey(e.target.value.replace(/[^\w]/g, ""))}
            placeholder={t("builder.values.keyPlaceholder")}
            className="h-6 w-20 shrink-0 font-mono text-[10px]"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <Input
            value={addingValue}
            onChange={(e) => setAddingValue(e.target.value)}
            placeholder={t("builder.values.valuePlaceholder")}
            className="h-6 flex-1 text-[11px]"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleAdd}
            disabled={!addingKey.trim()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Separator className="my-2" />

      {/* System values */}
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-accent/50 transition-colors"
        onClick={() => setSystemOpen(!systemOpen)}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("builder.values.system")}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            systemOpen && "rotate-180",
          )}
        />
      </button>

      {systemOpen && (
        <div className="space-y-0.5 px-2 pb-2">
          {SYSTEM_VALUES.map((def) => (
            <div
              key={def.key}
              className="flex items-center gap-2 rounded-[0.3rem] px-1.5 py-1 hover:bg-accent/30"
            >
              <CopyTag text={def.key} />
              <span className="flex-1 truncate text-[10px] text-muted-foreground">
                {def.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
