"use client";

import { useCallback, useState } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { updateSite } from "@/lib/spacetimedb/actions";
import {
  COLOR_TOKENS,
  SPACE_TOKENS,
  TEXT_TOKENS,
  RADIUS_TOKENS,
  type DesignToken,
  type TokenCategory,
  resolveTokenValue,
  isOverridden,
  customTokensFor,
  makeCustomCssVar,
} from "@/lib/builder/design-tokens";
import { ColorPicker } from "./color-picker";
import type { Site } from "@/lib/types";

// Site-level design token editor. Lets the user override the 27 predefined
// tokens (declared in globals.css + design-tokens.ts). Overrides persist to
// site.features._tokens; non-overridden tokens fall back to the globals.css
// defaults at render time.
//
// Mirrors the shape of ValuePanel — a collapsible group inside the left
// panel that writes through updateSite() and lets the SpacetimeDB
// subscription stream the result back into the editor + storefront.

interface TokenPanelProps {
  site: Site;
}

export function TokenPanel({ site }: TokenPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const overrides = site.tokens ?? {};

  const persist = useCallback(
    (next: Record<string, string>) => {
      // Drop empty strings — treat as "use default".
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(next)) {
        if (v && v.trim()) clean[k] = v.trim();
      }
      const featuresWithTokens = {
        ...site.features,
        _tokens: Object.keys(clean).length > 0 ? clean : undefined,
      };
      updateSite(site.id, { features: JSON.stringify(featuresWithTokens) }).catch(
        console.error,
      );
    },
    [site.id, site.features],
  );

  const handleChange = useCallback(
    (token: DesignToken, value: string) => {
      const next = { ...overrides, [token.cssVar]: value };
      persist(next);
    },
    [overrides, persist],
  );

  const handleReset = useCallback(
    (token: DesignToken) => {
      const next = { ...overrides };
      delete next[token.cssVar];
      persist(next);
    },
    [overrides, persist],
  );

  const overrideCount = Object.keys(overrides).length;

  return (
    <div>
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Eyebrow as="span">{t("builder.tokenPanel.title")}</Eyebrow>
        <span className="flex items-center gap-1.5">
          {overrideCount > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {overrideCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="pb-2">
          <TokenGroup
            category="color"
            label={t("builder.tokenPanel.colors")}
            predefined={COLOR_TOKENS}
            overrides={overrides}
            onChange={handleChange}
            onReset={handleReset}
          />
          <Separator className="my-1" />
          <TokenGroup
            category="space"
            label={t("builder.tokenPanel.spacing")}
            predefined={SPACE_TOKENS}
            overrides={overrides}
            onChange={handleChange}
            onReset={handleReset}
          />
          <Separator className="my-1" />
          <TokenGroup
            category="text"
            label={t("builder.tokenPanel.textSizes")}
            predefined={TEXT_TOKENS}
            overrides={overrides}
            onChange={handleChange}
            onReset={handleReset}
          />
          <Separator className="my-1" />
          <TokenGroup
            category="radius"
            label={t("builder.tokenPanel.radius")}
            predefined={RADIUS_TOKENS}
            overrides={overrides}
            onChange={handleChange}
            onReset={handleReset}
          />
        </div>
      )}
    </div>
  );
}

function TokenGroup({
  category,
  label,
  predefined,
  overrides,
  onChange,
  onReset,
}: {
  category: TokenCategory;
  label: string;
  predefined: DesignToken[];
  overrides: Record<string, string>;
  onChange: (token: DesignToken, value: string) => void;
  onReset: (token: DesignToken) => void;
}) {
  const t = useT();
  const custom = customTokensFor(category, overrides);
  const [adding, setAdding] = useState(false);

  return (
    <div className="px-2 pt-1.5">
      <div className="flex items-center justify-between px-1">
        <Eyebrow size="xs">{label}</Eyebrow>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          title={t("builder.tokenPanel.addCustom")}
          className="h-4 w-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>
      <div className="mt-0.5 space-y-0.5">
        {predefined.map((tok) => (
          <TokenRow
            key={tok.cssVar}
            token={tok}
            value={resolveTokenValue(tok, overrides)}
            overridden={isOverridden(tok, overrides)}
            onChange={(v) => onChange(tok, v)}
            onReset={() => onReset(tok)}
          />
        ))}
        {custom.map((tok) => (
          <TokenRow
            key={tok.cssVar}
            token={tok}
            value={tok.sample}
            overridden
            custom
            onChange={(v) => onChange(tok, v)}
            onReset={() => onReset(tok)}
          />
        ))}
        {adding && (
          <AddCustomRow
            category={category}
            existing={overrides}
            onAdd={(cssVar, value) => {
              // Synthesize a DesignToken matching the new cssVar so the
              // shared onChange handler writes the right key.
              onChange(
                { id: cssVar, label: cssVar, cssVar, sample: value, category },
                value,
              );
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function AddCustomRow({
  category,
  existing,
  onAdd,
  onCancel,
}: {
  category: TokenCategory;
  existing: Record<string, string>;
  onAdd: (cssVar: string, value: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [value, setValue] = useState(category === "color" ? "#000000" : "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const made = makeCustomCssVar(category, name, existing);
    if (!made) {
      setError(t("builder.tokenPanel.invalidName"));
      return;
    }
    if (!value.trim()) {
      setError(t("builder.tokenPanel.valueRequired"));
      return;
    }
    onAdd(made.cssVar, value.trim());
  };

  return (
    <div className="flex flex-col gap-1 rounded border border-dashed border-border bg-accent/20 p-1.5">
      <Input
        value={name}
        onChange={(e) => { setName(e.target.value); setError(null); }}
        placeholder={t("builder.tokenPanel.namePlaceholder")}
        className="h-6 px-1.5 text-[10.5px] font-mono"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      {category === "color" ? (
        <div className="flex items-center gap-1.5">
          <ColorPicker value={value} onChange={setValue} showAlpha={false} className="h-5 w-5" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="#000000"
            className="h-5 flex-1 px-1.5 text-[10px] font-mono"
          />
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={category === "space" ? "16px" : category === "text" ? "16px" : "8px"}
          className="h-5 px-1.5 text-[10px] font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
      {error && <p className="text-[9.5px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCancel}
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
        >
          {t("builder.tokenPanel.cancel")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={submit}
          className="h-5 px-1.5 text-[10px]"
        >
          {t("builder.tokenPanel.add")}
        </Button>
      </div>
    </div>
  );
}

function TokenRow({
  token,
  value,
  overridden,
  custom,
  onChange,
  onReset,
}: {
  token: DesignToken;
  value: string;
  overridden: boolean;
  /** Custom rows render the action as a destructive delete instead of a
   *  reset (since "default" is undefined for a user-added token). */
  custom?: boolean;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);

  // Keep local input in sync when subscription pushes a new value
  // (e.g. AI changed a token from chat). React's controlled-input pattern
  // would re-render correctly but feels twitchy while the user types, so
  // we sync on blur only.
  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  return (
    <div className="group flex items-center gap-1.5 px-1 py-0.5 hover:bg-accent/40 rounded">
      <span className="flex-1 min-w-0 text-[11px] truncate" title={token.cssVar}>
        {token.label}
      </span>
      {token.category === "color" ? (
        <ColorPicker
          value={value}
          onChange={(v) => onChange(v)}
          showAlpha={false}
          className="h-5 w-5"
        />
      ) : (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(value);
          }}
          className="h-5 w-16 px-1.5 text-[10px] font-mono"
        />
      )}
      <button
        type="button"
        title={custom ? t("builder.tokenPanel.delete") : t("builder.tokenPanel.reset")}
        onClick={onReset}
        disabled={!overridden}
        className={cn(
          "h-4 w-4 shrink-0 transition-opacity",
          overridden
            ? "opacity-60 hover:opacity-100 text-muted-foreground hover:text-foreground"
            : "opacity-0",
        )}
      >
        {custom ? <Trash2 className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
      </button>
    </div>
  );
}

// Keep an unused-param-friendly export so future code can reuse this type.
export type { TokenCategory };
