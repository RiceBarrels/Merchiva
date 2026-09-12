"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Plus,
  Trash2,
  X,
  Link as LinkIcon,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, STATUS_TONE_CLASSES } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "./color-picker";
import type { HtmlSelectionInfo } from "./html-canvas";
import type { BuilderAnimation, EntryAnimationType } from "@/lib/builder/animation";
import { updatePage, updateSite } from "@/lib/spacetimedb/actions";
import type { Site, SitePage, PageMetadata, SiteFeatures } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import {
  SPACE_TOKENS,
  TEXT_TOKENS,
  RADIUS_TOKENS,
  type DesignToken,
  tokenRef,
  tokenFromValue,
  customTokensFor,
} from "@/lib/builder/design-tokens";
import { useBuilderSite } from "@/lib/builder/site-context";

interface HtmlPropertiesPanelProps {
  selected: HtmlSelectionInfo | null;
  html: string;
  onHtmlChange: (html: string) => void;
  // When selected==null and these are provided, the panel renders page/site
  // properties (name, slug, SEO metadata, plugins) instead of the empty state.
  site?: Site;
  activePage?: SitePage;
}

// ─── Style parsing/serialization ────────────────────────────────────────────

function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k && v) {
      const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = v;
    }
  }
  return expandShorthands(out);
}

function serializeInlineStyle(obj: Record<string, string>): string {
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const kebab = k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
      return `${kebab}: ${v}`;
    })
    .join("; ");
}

// padding: "10px 20px" → top/right/bottom/left
function parseSides(val: string): { top: string; right: string; bottom: string; left: string } {
  if (!val) return { top: "", right: "", bottom: "", left: "" };
  const parts = val.trim().split(/\s+/);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

// Expand `padding`/`margin` shorthand into longhand keys so the spacing UI
// can edit each side independently. Longhand-only properties pass through.
function expandShorthands(styles: Record<string, string>): Record<string, string> {
  const result = { ...styles };
  for (const prop of ["padding", "margin"] as const) {
    if (!result[prop]) continue;
    const sides = parseSides(result[prop]);
    const top = `${prop}Top`;
    const right = `${prop}Right`;
    const bottom = `${prop}Bottom`;
    const left = `${prop}Left`;
    if (!result[top]) result[top] = sides.top;
    if (!result[right]) result[right] = sides.right;
    if (!result[bottom]) result[bottom] = sides.bottom;
    if (!result[left]) result[left] = sides.left;
    delete result[prop];
  }
  return result;
}

// ─── HTML mutation (DOM round-trip) ─────────────────────────────────────────

// The iframe wraps user HTML in <div id="__merchiva_root"> and builds selectors
// rooted at that id (e.g. "#__merchiva_root > section > h1"). The host html
// state stores ONLY the inner content, so we have to re-wrap before parsing —
// otherwise querySelector returns null and the edit silently no-ops.
const ROOT_ID = "__merchiva_root";

function withRoot(html: string): { doc: Document; root: HTMLElement | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!DOCTYPE html><html><body><div id="${ROOT_ID}">${html}</div></body></html>`,
    "text/html",
  );
  return { doc, root: doc.getElementById(ROOT_ID) };
}

function unwrapRoot(doc: Document): string {
  const root = doc.getElementById(ROOT_ID);
  return root ? root.innerHTML : doc.body.innerHTML;
}

function patchSelectedStyles(html: string, selector: string, nextStyles: Record<string, string>): string {
  if (typeof window === "undefined" || !selector) return html;
  try {
    const { doc } = withRoot(html);
    const target = doc.querySelector(selector);
    if (!target) return html;
    const styleStr = serializeInlineStyle(nextStyles);
    if (styleStr) target.setAttribute("style", styleStr);
    else target.removeAttribute("style");
    return unwrapRoot(doc);
  } catch {
    return html;
  }
}

function patchSelectedAttrs(html: string, selector: string, nextAttrs: Record<string, string>): string {
  if (typeof window === "undefined" || !selector) return html;
  try {
    const { doc } = withRoot(html);
    const target = doc.querySelector(selector);
    if (!target) return html;
    for (const k of ["id", "class", "src", "alt", "href"]) {
      const v = nextAttrs[k];
      if (v != null && v !== "") target.setAttribute(k, v);
      else target.removeAttribute(k);
    }
    return unwrapRoot(doc);
  } catch {
    return html;
  }
}

function deleteSelected(html: string, selector: string): string {
  if (typeof window === "undefined" || !selector) return html;
  try {
    const { doc } = withRoot(html);
    const target = doc.querySelector(selector);
    if (!target) return html;
    target.remove();
    return unwrapRoot(doc);
  } catch {
    return html;
  }
}

export function patchSelectedAttribute(
  html: string,
  selector: string,
  name: string,
  value: string | null,
): string {
  if (typeof window === "undefined" || !selector) return html;
  try {
    const { doc } = withRoot(html);
    const target = doc.querySelector(selector);
    if (!target) return html;
    if (value == null || value === "") target.removeAttribute(name);
    else target.setAttribute(name, value);
    return unwrapRoot(doc);
  } catch {
    return html;
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const KNOWN_KEYS = new Set([
  "display",
  "flexDirection",
  "justifyContent",
  "alignItems",
  "gap",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "width",
  "height",
  "maxWidth",
  "maxHeight",
  "minWidth",
  "minHeight",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "color",
  "textAlign",
  "background",
  "backgroundColor",
  "backgroundImage",
  "borderWidth",
  "borderStyle",
  "borderColor",
  "borderRadius",
  "opacity",
  "boxShadow",
  "cursor",
]);

const SHADOW_PRESETS: Array<{ label: string; value: string }> = [
  { label: "None", value: "" },
  { label: "XS", value: "0 1px 2px rgba(0,0,0,0.05)" },
  { label: "SM", value: "0 1px 2px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04)" },
  { label: "MD", value: "0 4px 6px rgba(0,0,0,0.05), 0 10px 15px rgba(0,0,0,0.06)" },
  { label: "LG", value: "0 10px 15px rgba(0,0,0,0.08), 0 20px 25px rgba(0,0,0,0.08)" },
  { label: "XL", value: "0 25px 50px rgba(0,0,0,0.12)" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function HtmlPropertiesPanel({ selected, html, onHtmlChange, site, activePage }: HtmlPropertiesPanelProps) {
  if (!selected) {
    if (site && activePage) {
      // Key on page id so switching pages remounts the inspector and resets
      // local input state without an effect.
      return <PageInspector key={activePage.id} site={site} page={activePage} />;
    }
    return (
      <EmptyState compact className="h-full" description="Click any element in the preview to edit its properties." />
    );
  }
  // Keying on selector remounts the inspector for a fresh selection — that
  // re-initializes local state from the new attrs without needing an effect.
  return (
    <Inspector
      key={selected.selector}
      selected={selected}
      html={html}
      onHtmlChange={onHtmlChange}
    />
  );
}

function Inspector({ selected, html, onHtmlChange }: HtmlPropertiesPanelProps & { selected: HtmlSelectionInfo }) {
  const initialStyles = useMemo(() => parseInlineStyle(selected.attrs.style ?? ""), [selected]);
  const [styles, setStyles] = useState<Record<string, string>>(initialStyles);
  const [attrs, setAttrs] = useState<{ id: string; class: string; src: string; alt: string; href: string }>({
    id: selected.attrs.id ?? "",
    class: selected.attrs.class ?? "",
    src: selected.attrs.src ?? "",
    alt: selected.attrs.alt ?? "",
    href: selected.attrs.href ?? "",
  });
  const [paddingLinked, setPaddingLinked] = useState(true);
  const [marginLinked, setMarginLinked] = useState(true);
  const [newCustomKey, setNewCustomKey] = useState("");
  const [newCustomValue, setNewCustomValue] = useState("");

  const commit = useCallback(
    (next: Record<string, string>) => {
      setStyles(next);
      onHtmlChange(patchSelectedStyles(html, selected.selector, next));
    },
    [html, onHtmlChange, selected],
  );

  const commitOne = useCallback(
    (key: string, value: string) => {
      const next = { ...styles };
      if (value === "" || value == null) delete next[key];
      else next[key] = value;
      commit(next);
    },
    [styles, commit],
  );

  const commitMany = useCallback(
    (patch: Record<string, string>) => {
      const next = { ...styles };
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v == null) delete next[k];
        else next[k] = v;
      }
      commit(next);
    },
    [styles, commit],
  );

  const commitAttrs = (next: typeof attrs) => {
    setAttrs(next);
    onHtmlChange(patchSelectedAttrs(html, selected.selector, next));
  };

  const showSrc = selected.tag === "img" || selected.tag === "iframe" || selected.tag === "video";
  const showHref = selected.tag === "a";
  const showAlt = selected.tag === "img";

  const display = styles.display ?? "";
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  const customEntries = Object.entries(styles).filter(([k]) => !KNOWN_KEYS.has(k));

  function addCustomProperty() {
    const key = newCustomKey.trim();
    const value = newCustomValue.trim();
    if (!key || !value) return;
    // Normalize kebab-case input to camelCase to match our internal map
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    commitOne(camel, value);
    setNewCustomKey("");
    setNewCustomValue("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral" size="xs" className="h-5 font-mono normal-case tracking-normal">
            &lt;{selected.tag}&gt;
          </StatusBadge>
          {attrs.id && (
            <span className="font-mono text-[10px] text-muted-foreground truncate">
              #{attrs.id}
            </span>
          )}
          {attrs.class && (
            <span className="font-mono text-[10px] text-muted-foreground truncate" title={attrs.class}>
              .{attrs.class.split(/\s+/)[0]}
              {attrs.class.split(/\s+/).length > 1 && "…"}
            </span>
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onClick={() => onHtmlChange(deleteSelected(html, selected.selector))}
            title="Delete element"
            className="ml-auto h-5 w-5"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="font-mono text-[9.5px] text-muted-foreground truncate mt-1" title={selected.selector}>
          {selected.selector}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <Section label="Attributes" defaultOpen>
          <Row label="ID">
            <TextInput value={attrs.id} onChange={(v) => commitAttrs({ ...attrs, id: v })} placeholder="(none)" mono />
          </Row>
          <Row label="Class">
            <TextInput value={attrs.class} onChange={(v) => commitAttrs({ ...attrs, class: v })} placeholder="(none)" mono />
          </Row>
          {showSrc && (
            <Row label="Src">
              <TextInput value={attrs.src} onChange={(v) => commitAttrs({ ...attrs, src: v })} placeholder="https://…" mono />
            </Row>
          )}
          {showAlt && (
            <Row label="Alt">
              <TextInput value={attrs.alt} onChange={(v) => commitAttrs({ ...attrs, alt: v })} placeholder="alt text" />
            </Row>
          )}
          {showHref && (
            <Row label="Href">
              <TextInput value={attrs.href} onChange={(v) => commitAttrs({ ...attrs, href: v })} placeholder="/path or https://…" mono />
            </Row>
          )}
        </Section>

        <Section label="Layout" defaultOpen>
          <Row label="Display">
            <SegmentedControl
              value={display}
              onChange={(v) => commitOne("display", v)}
              options={[
                { value: "block", label: "Block" },
                { value: "flex", label: "Flex" },
                { value: "grid", label: "Grid" },
                { value: "inline-block", label: "Inline" },
                { value: "none", label: "None" },
              ]}
            />
          </Row>
          {isFlex && (
            <>
              <Row label="Direction">
                <SegmentedControl
                  value={styles.flexDirection ?? "row"}
                  onChange={(v) => commitOne("flexDirection", v)}
                  options={[
                    { value: "row", label: "Row" },
                    { value: "column", label: "Col" },
                    { value: "row-reverse", label: "Row⇋" },
                    { value: "column-reverse", label: "Col⇋" },
                  ]}
                />
              </Row>
              <Row label="Justify">
                <SegmentedControl
                  value={styles.justifyContent ?? ""}
                  onChange={(v) => commitOne("justifyContent", v)}
                  options={[
                    { value: "flex-start", label: "Start" },
                    { value: "center", label: "Center" },
                    { value: "flex-end", label: "End" },
                    { value: "space-between", label: "Between" },
                    { value: "space-around", label: "Around" },
                  ]}
                />
              </Row>
              <Row label="Align">
                <SegmentedControl
                  value={styles.alignItems ?? ""}
                  onChange={(v) => commitOne("alignItems", v)}
                  options={[
                    { value: "flex-start", label: "Start" },
                    { value: "center", label: "Center" },
                    { value: "flex-end", label: "End" },
                    { value: "stretch", label: "Stretch" },
                  ]}
                />
              </Row>
            </>
          )}
          {(isFlex || isGrid) && (
            <Row label="Gap">
              <TextInput value={styles.gap ?? ""} onChange={(v) => commitOne("gap", v)} placeholder="0" mono tokens={SPACE_TOKENS} />
            </Row>
          )}
        </Section>

        <Section label="Spacing" defaultOpen>
          <SpacingBox
            label="Padding"
            linked={paddingLinked}
            onLinkedChange={setPaddingLinked}
            values={{
              top: styles.paddingTop ?? "",
              right: styles.paddingRight ?? "",
              bottom: styles.paddingBottom ?? "",
              left: styles.paddingLeft ?? "",
            }}
            onChange={(side, value) => {
              if (paddingLinked) {
                commitMany({
                  paddingTop: value,
                  paddingRight: value,
                  paddingBottom: value,
                  paddingLeft: value,
                });
              } else {
                commitOne(`padding${capitalize(side)}`, value);
              }
            }}
          />
          <div className="h-2" />
          <SpacingBox
            label="Margin"
            linked={marginLinked}
            onLinkedChange={setMarginLinked}
            values={{
              top: styles.marginTop ?? "",
              right: styles.marginRight ?? "",
              bottom: styles.marginBottom ?? "",
              left: styles.marginLeft ?? "",
            }}
            onChange={(side, value) => {
              if (marginLinked) {
                commitMany({
                  marginTop: value,
                  marginRight: value,
                  marginBottom: value,
                  marginLeft: value,
                });
              } else {
                commitOne(`margin${capitalize(side)}`, value);
              }
            }}
          />
        </Section>

        <Section label="Sizing">
          <Row label="Width">
            <TextInput value={styles.width ?? ""} onChange={(v) => commitOne("width", v)} placeholder="auto" mono />
          </Row>
          <Row label="Height">
            <TextInput value={styles.height ?? ""} onChange={(v) => commitOne("height", v)} placeholder="auto" mono />
          </Row>
          <Row label="Max W">
            <TextInput value={styles.maxWidth ?? ""} onChange={(v) => commitOne("maxWidth", v)} placeholder="none" mono />
          </Row>
          <Row label="Max H">
            <TextInput value={styles.maxHeight ?? ""} onChange={(v) => commitOne("maxHeight", v)} placeholder="none" mono />
          </Row>
        </Section>

        <Section label="Typography" defaultOpen>
          <Row label="Size">
            <TextInput value={styles.fontSize ?? ""} onChange={(v) => commitOne("fontSize", v)} placeholder="16px" mono tokens={TEXT_TOKENS} />
          </Row>
          <Row label="Weight">
            <SegmentedControl
              value={styles.fontWeight ?? ""}
              onChange={(v) => commitOne("fontWeight", v)}
              options={[
                { value: "300", label: "300" },
                { value: "400", label: "400" },
                { value: "500", label: "500" },
                { value: "600", label: "600" },
                { value: "700", label: "700" },
                { value: "800", label: "800" },
              ]}
            />
          </Row>
          <Row label="Color">
            <ColorInput value={styles.color ?? ""} onChange={(v) => commitOne("color", v)} />
          </Row>
          <Row label="Align">
            <SegmentedControl
              value={styles.textAlign ?? ""}
              onChange={(v) => commitOne("textAlign", v)}
              options={[
                { value: "left", icon: <AlignLeft className="h-3 w-3" /> },
                { value: "center", icon: <AlignCenter className="h-3 w-3" /> },
                { value: "right", icon: <AlignRight className="h-3 w-3" /> },
                { value: "justify", icon: <AlignJustify className="h-3 w-3" /> },
              ]}
            />
          </Row>
          <Row label="Line H">
            <TextInput value={styles.lineHeight ?? ""} onChange={(v) => commitOne("lineHeight", v)} placeholder="1.5" mono />
          </Row>
          <Row label="Letter">
            <TextInput value={styles.letterSpacing ?? ""} onChange={(v) => commitOne("letterSpacing", v)} placeholder="normal" mono />
          </Row>
          <Row label="Family">
            <TextInput value={styles.fontFamily ?? ""} onChange={(v) => commitOne("fontFamily", v)} placeholder="inherit" mono />
          </Row>
        </Section>

        <Section label="Background">
          <Row label="Color">
            <ColorInput value={styles.backgroundColor ?? styles.background ?? ""} onChange={(v) => commitOne(styles.backgroundColor != null || !styles.background ? "backgroundColor" : "background", v)} />
          </Row>
          <Row label="Image">
            <TextInput value={styles.backgroundImage ?? ""} onChange={(v) => commitOne("backgroundImage", v)} placeholder="url(...) / gradient" mono />
          </Row>
        </Section>

        <Section label="Border">
          <Row label="Width">
            <TextInput value={styles.borderWidth ?? ""} onChange={(v) => commitOne("borderWidth", v)} placeholder="1px" mono />
          </Row>
          <Row label="Style">
            <SegmentedControl
              value={styles.borderStyle ?? ""}
              onChange={(v) => commitOne("borderStyle", v)}
              options={[
                { value: "none", label: "None" },
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dash" },
                { value: "dotted", label: "Dot" },
              ]}
            />
          </Row>
          <Row label="Color">
            <ColorInput value={styles.borderColor ?? ""} onChange={(v) => commitOne("borderColor", v)} />
          </Row>
          <Row label="Radius">
            <TextInput value={styles.borderRadius ?? ""} onChange={(v) => commitOne("borderRadius", v)} placeholder="0" mono tokens={RADIUS_TOKENS} />
          </Row>
        </Section>

        <Section label="Effects">
          <Row label="Opacity">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(parseFloat(styles.opacity ?? "1") * 100)}
                onChange={(e) => commitOne("opacity", String(Number(e.target.value) / 100))}
                className="flex-1 accent-foreground"
              />
              <span className="font-mono text-[10.5px] text-muted-foreground w-9 text-right tabular-nums">
                {Math.round(parseFloat(styles.opacity ?? "1") * 100)}%
              </span>
            </div>
          </Row>
          <Row label="Shadow">
            <div className="flex flex-wrap gap-1">
              {SHADOW_PRESETS.map((p) => {
                const active = (styles.boxShadow ?? "") === p.value;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => commitOne("boxShadow", p.value)}
                    className={cn(
                      "h-6 px-1.5 rounded border text-[10px] font-mono transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Cursor">
            <Select
              value={styles.cursor ?? ""}
              onValueChange={(v) => {
                if (v == null) return;
                commitOne("cursor", v);
              }}
            >
              <SelectTrigger size="sm" className="h-[26px] w-full px-1.5 text-[11.5px] font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="">default</SelectItem>
                  <SelectItem value="pointer">pointer</SelectItem>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="grab">grab</SelectItem>
                  <SelectItem value="not-allowed">not-allowed</SelectItem>
                  <SelectItem value="wait">wait</SelectItem>
                  <SelectItem value="crosshair">crosshair</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section label={`Custom CSS${customEntries.length ? ` · ${customEntries.length}` : ""}`} defaultOpen>
          <div className="space-y-1">
            {customEntries.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_1fr_22px] items-center gap-1">
                <TextInput
                  value={camelToKebab(key)}
                  onChange={(newKey) => {
                    const camel = newKey.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                    if (!camel || camel === key) return;
                    const next = { ...styles };
                    delete next[key];
                    next[camel] = value;
                    commit(next);
                  }}
                  placeholder="property"
                  mono
                />
                <TextInput value={value} onChange={(v) => commitOne(key, v)} placeholder="value" mono />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  onClick={() => commitOne(key, "")}
                  className="h-[26px] w-[22px]"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr_22px] items-center gap-1 pt-1">
              <TextInput
                value={newCustomKey}
                onChange={setNewCustomKey}
                onEnter={addCustomProperty}
                placeholder="z-index"
                mono
              />
              <TextInput
                value={newCustomValue}
                onChange={setNewCustomValue}
                onEnter={addCustomProperty}
                placeholder="10"
                mono
              />
              <button
                type="button"
                onClick={addCustomProperty}
                disabled={!newCustomKey.trim() || !newCustomValue.trim()}
                className="h-[26px] w-[22px] rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                title="Add property"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Page-level inspector (rendered when no element is selected) ────────────

const PLUGIN_LABELS: Array<{ key: keyof SiteFeatures; label: string; description: string }> = [
  { key: "auth", label: "Auth", description: "Sign-in & accounts" },
  { key: "cart", label: "Cart", description: "Shopping cart" },
  { key: "checkout", label: "Checkout", description: "Payment flow" },
  { key: "products", label: "Products", description: "Product catalog" },
  { key: "subscriptions", label: "Subscriptions", description: "Recurring plans" },
  { key: "rewards", label: "Rewards", description: "Loyalty points" },
  { key: "booking", label: "Booking", description: "Appointments" },
  { key: "account", label: "Account", description: "Customer profile page" },
];

function PageInspector({ site, page }: { site: Site; page: SitePage }) {
  const [pageName, setPageName] = useState(page.name);
  const [pageSlug, setPageSlug] = useState(page.slug);
  const [meta, setMeta] = useState<PageMetadata>(page.metadata ?? {});
  const [siteName, setSiteName] = useState(site.name);
  const [siteSlug, setSiteSlug] = useState(site.slug);
  const [customDomain, setCustomDomain] = useState(site.customDomain ?? "");

  // ── Persistence helpers ──
  const commitPage = useCallback(
    async (patch: { name?: string; slug?: string; metadata?: PageMetadata }) => {
      const next = {
        name: patch.name ?? pageName,
        slug: patch.slug ?? pageSlug,
        metadata: patch.metadata ?? meta,
      };
      const cleanMeta: Record<string, string> = {};
      for (const [k, v] of Object.entries(next.metadata)) {
        if (v && String(v).trim()) cleanMeta[k] = String(v).trim();
      }
      try {
        await updatePage(page.id, {
          name: next.name.trim() || page.name,
          slug: (next.slug.trim() || page.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          elements: JSON.stringify(page.elements ?? []),
          sortOrder: page.sortOrder,
          html: page.html,
          metadata: Object.keys(cleanMeta).length > 0 ? JSON.stringify(cleanMeta) : undefined,
        });
      } catch (err) {
        console.error("[page-inspector] updatePage failed:", err);
      }
    },
    [page, pageName, pageSlug, meta],
  );

  const commitMetaField = useCallback(
    (key: keyof PageMetadata, value: string) => {
      const next = { ...meta, [key]: value };
      setMeta(next);
      commitPage({ metadata: next });
    },
    [meta, commitPage],
  );

  // Site features are stored as JSON in `features`; we must preserve _values
  // (custom site values) on every write since the DB strips them on read.
  const commitSite = useCallback(
    async (patch: { name?: string; slug?: string; customDomain?: string | null; published?: boolean; features?: Partial<SiteFeatures> }) => {
      const nextFeatures = patch.features
        ? {
            ...site.features,
            ...(site.values ? { _values: site.values } : {}),
            ...patch.features,
          }
        : undefined;
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name.trim() || site.name;
      if (patch.slug !== undefined) data.slug = (patch.slug.trim() || site.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (patch.customDomain !== undefined) data.customDomain = patch.customDomain || null;
      if (patch.published !== undefined) data.published = patch.published;
      if (nextFeatures) data.features = JSON.stringify(nextFeatures);
      try {
        await updateSite(site.id, data);
      } catch (err) {
        console.error("[page-inspector] updateSite failed:", err);
      }
    },
    [site],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral" size="xs" className="h-5 font-mono">
            PAGE
          </StatusBadge>
          <span className="font-mono text-[10.5px] text-foreground truncate">{page.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground truncate">/{page.slug}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          No element selected — editing page &amp; site settings
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Section label="Page" defaultOpen>
          <Row label="Name">
            <CommitInput
              value={pageName}
              onChange={setPageName}
              onCommit={(v) => commitPage({ name: v })}
              placeholder="Home"
            />
          </Row>
          <Row label="Slug">
            <CommitInput
              value={pageSlug}
              onChange={setPageSlug}
              onCommit={(v) => commitPage({ slug: v })}
              placeholder="index"
              mono
            />
          </Row>
        </Section>

        <Section label="SEO / Metadata" defaultOpen>
          <Row label="Title">
            <CommitInput
              value={meta.title ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, title: v }))}
              onCommit={(v) => commitMetaField("title", v)}
              placeholder={page.name}
            />
          </Row>
          <Row label="Description">
            <CommitTextarea
              value={meta.description ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, description: v }))}
              onCommit={(v) => commitMetaField("description", v)}
              placeholder="One-sentence summary for search results"
            />
          </Row>
          <Row label="Keywords">
            <CommitInput
              value={meta.keywords ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, keywords: v }))}
              onCommit={(v) => commitMetaField("keywords", v)}
              placeholder="comma,separated"
              mono
            />
          </Row>
          <Row label="OG Image">
            <CommitInput
              value={meta.ogImage ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, ogImage: v }))}
              onCommit={(v) => commitMetaField("ogImage", v)}
              placeholder="https://…/preview.png"
              mono
            />
          </Row>
          <Row label="OG Title">
            <CommitInput
              value={meta.ogTitle ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, ogTitle: v }))}
              onCommit={(v) => commitMetaField("ogTitle", v)}
              placeholder={meta.title ?? page.name}
            />
          </Row>
          <Row label="OG Desc">
            <CommitInput
              value={meta.ogDescription ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, ogDescription: v }))}
              onCommit={(v) => commitMetaField("ogDescription", v)}
              placeholder={meta.description ?? ""}
            />
          </Row>
          <Row label="Canonical">
            <CommitInput
              value={meta.canonicalUrl ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, canonicalUrl: v }))}
              onCommit={(v) => commitMetaField("canonicalUrl", v)}
              placeholder="https://example.com/…"
              mono
            />
          </Row>
          <Row label="Robots">
            <CommitInput
              value={meta.robots ?? ""}
              onChange={(v) => setMeta((m) => ({ ...m, robots: v }))}
              onCommit={(v) => commitMetaField("robots", v)}
              placeholder="index,follow"
              mono
            />
          </Row>
        </Section>

        <Section label="Plugins" defaultOpen>
          <div className="space-y-1">
            {PLUGIN_LABELS.map((p) => {
              const enabled = Boolean(site.features?.[p.key]);
              return (
                <label
                  key={p.key}
                  className={cn(
                    "w-full flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-left transition-colors",
                    enabled
                      ? "border-foreground bg-muted/40"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium text-foreground">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>
                  </div>
                  <Switch
                    size="sm"
                    checked={enabled}
                    onCheckedChange={() => commitSite({ features: { [p.key]: !enabled } as Partial<SiteFeatures> })}
                  />
                </label>
              );
            })}
          </div>
        </Section>

        <Section label="Site">
          <Row label="Name">
            <CommitInput
              value={siteName}
              onChange={setSiteName}
              onCommit={(v) => commitSite({ name: v })}
              placeholder="Site name"
            />
          </Row>
          <Row label="Slug">
            <CommitInput
              value={siteSlug}
              onChange={setSiteSlug}
              onCommit={(v) => commitSite({ slug: v })}
              placeholder="site-slug"
              mono
            />
          </Row>
          <Row label="Domain">
            <CommitInput
              value={customDomain}
              onChange={setCustomDomain}
              onCommit={(v) => commitSite({ customDomain: v })}
              placeholder="www.example.com"
              mono
            />
          </Row>
          <Row label="Published">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => commitSite({ published: !site.published })}
              className={cn(
                "w-full text-[11px]",
                site.published ? STATUS_TONE_CLASSES.success : "text-muted-foreground",
              )}
            >
              {site.published ? "Published" : "Draft"}
            </Button>
          </Row>
        </Section>
      </div>
    </div>
  );
}

// Text input that keeps local draft state and only commits on blur or Enter.
function CommitInput({
  value,
  onChange,
  onCommit,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className={cn(
        "h-[26px] px-2 text-[11.5px] md:text-[11.5px]",
        mono && "font-mono",
      )}
    />
  );
}

function CommitTextarea({
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      rows={2}
      placeholder={placeholder}
      className="min-h-[44px] resize-y px-2 py-1.5 text-[11.5px] md:text-[11.5px]"
    />
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/60 transition-colors text-left"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <Eyebrow as="span" size="xs">{label}</Eyebrow>
      </button>
      {open && <div className="px-3 pb-2.5 space-y-1.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field layout="inline" label={label}>
      {children}
    </Field>
  );
}

function TextInput({
  value,
  onChange,
  onEnter,
  placeholder,
  mono,
  tokens,
}: {
  value: string;
  onChange: (next: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  mono?: boolean;
  /** When provided, render a token-picker button next to the input. Picking
   *  a token writes `var(--mv-…)` into the value. */
  tokens?: DesignToken[];
}) {
  const active = tokens ? tokenFromValue(value) : null;
  const input = (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      className={cn(
        "h-[26px] px-2 text-[11.5px] md:text-[11.5px]",
        mono && "font-mono",
        active && "font-mono text-[10.5px] md:text-[10.5px]",
      )}
    />
  );
  if (!tokens) return input;
  return (
    <div className="flex w-full items-center gap-1">
      <div className="flex-1 min-w-0">{input}</div>
      <TokenPickerButton
        tokens={tokens}
        active={active}
        onPick={(tok) => onChange(tokenRef(tok))}
      />
    </div>
  );
}

// Small "$" button next to a numeric/text input that opens a popover listing
// design tokens. Picking a token writes the corresponding `var(--mv-…)`
// expression into the value.
function TokenPickerButton({
  tokens,
  onPick,
  active,
}: {
  tokens: DesignToken[];
  onPick: (tok: DesignToken) => void;
  active: DesignToken | null;
}) {
  const t = useT();
  const site = useBuilderSite();
  // Append any custom tokens of this category from the site so they show
  // up in the dropdown alongside the predefined ones. Category is inferred
  // from the first item — all entries in `tokens` share a category.
  const merged = tokens.length > 0
    ? [...tokens, ...customTokensFor(tokens[0].category, site?.tokens)]
    : tokens;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active ? `${active.label} · var(${active.cssVar})` : t("builder.tokens.pickToken")}
        className={cn(
          "h-[26px] w-[26px] inline-flex items-center justify-center border rounded text-[11px] font-mono transition-colors",
          active
            ? "border-foreground bg-accent text-foreground"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        $
      </button>
      {open && (
        <div className="absolute right-0 top-[28px] z-[9999] min-w-[160px] rounded-lg border border-border bg-popover shadow-md py-1">
          {merged.map((tok) => {
            const isActive = active?.cssVar === tok.cssVar;
            return (
              <button
                key={tok.id}
                type="button"
                onClick={() => { onPick(tok); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-2 py-1 text-left text-[11px] transition-colors",
                  isActive ? "bg-accent text-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">{tok.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{tok.sample}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | "";
  onChange: (next: T) => void;
  options: Array<{ value: T; label?: string; icon?: React.ReactNode }>;
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border bg-background overflow-hidden">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(active ? ("" as T) : opt.value)}
            title={opt.label ?? opt.value}
            className={cn(
              "flex-1 h-[24px] inline-flex items-center justify-center text-[10.5px] font-medium border-r border-border last:border-r-0 transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {opt.icon ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <ColorPicker
        value={value}
        onChange={onChange}
        showAlpha
        className="h-[26px] w-[28px] rounded"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000 / rgb / gradient"
        className="h-[26px] flex-1 px-2 font-mono text-[11.5px] md:text-[11.5px]"
      />
    </div>
  );
}

function SpacingBox({
  label,
  values,
  onChange,
  linked,
  onLinkedChange,
}: {
  label: string;
  values: { top: string; right: string; bottom: string; left: string };
  onChange: (side: "top" | "right" | "bottom" | "left", value: string) => void;
  linked: boolean;
  onLinkedChange: (next: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => onLinkedChange(!linked)}
          title={linked ? "Linked — edits all sides at once" : "Independent sides"}
          className={cn(
            "h-[18px] px-1 rounded inline-flex items-center gap-1 text-[9.5px] font-medium transition-colors",
            linked
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {linked ? <LinkIcon className="h-2.5 w-2.5" /> : <Unlink className="h-2.5 w-2.5" />}
          {linked ? "Linked" : "Sides"}
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-1 items-center">
        <div />
        <SmallNumInput value={values.top} onChange={(v) => onChange("top", v)} placeholder="T" />
        <div />
        <SmallNumInput value={values.left} onChange={(v) => onChange("left", v)} placeholder="L" />
        <div className="h-[26px] rounded border border-dashed border-border bg-muted flex items-center justify-center font-mono text-[9px] text-muted-foreground uppercase">
          {label[0]}
        </div>
        <SmallNumInput value={values.right} onChange={(v) => onChange("right", v)} placeholder="R" />
        <div />
        <SmallNumInput value={values.bottom} onChange={(v) => onChange("bottom", v)} placeholder="B" />
        <div />
      </div>
    </div>
  );
}

function SmallNumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-[26px] px-1 text-center font-mono text-[11px] tabular-nums md:text-[11px]"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

// ─── Animation editor ──────────────────────────────────────────────────────

const ENTRY_TYPES: Array<{ value: EntryAnimationType; label: string }> = [
  { value: "none",       label: "None" },
  { value: "fade",       label: "Fade" },
  { value: "slideUp",    label: "Slide up" },
  { value: "slideDown",  label: "Slide down" },
  { value: "slideLeft",  label: "Slide left" },
  { value: "slideRight", label: "Slide right" },
  { value: "scale",      label: "Scale" },
];

function parseAnimation(raw: string): BuilderAnimation | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as BuilderAnimation;
  } catch {
    return undefined;
  }
}

function strip(a: BuilderAnimation | undefined): BuilderAnimation | undefined {
  if (!a) return undefined;
  const out: BuilderAnimation = {};
  if (a.entry && a.entry.type !== "none") out.entry = a.entry;
  if (a.hover && (a.hover.scale != null || a.hover.y != null)) out.hover = a.hover;
  if (a.tap && a.tap.scale != null) out.tap = a.tap;
  return Object.keys(out).length ? out : undefined;
}

export function AnimationEditor({
  initialRaw,
  onChange,
}: {
  initialRaw: string;
  onChange: (next: BuilderAnimation | undefined) => void;
}) {
  // Local state — initial value parsed from the selected element's attribute.
  // Parent re-mounts this component (via `key={selector}`) when selection
  // changes, so the initial read covers all element switches.
  const [current, setCurrent] = useState<BuilderAnimation | undefined>(
    () => parseAnimation(initialRaw),
  );
  const entry = current?.entry ?? { type: "none" as EntryAnimationType };
  const hoverCfg = current?.hover ?? {};
  const tapCfg = current?.tap ?? {};

  const update = (patch: Partial<BuilderAnimation>) => {
    setCurrent((prev) => {
      const next: BuilderAnimation = { ...prev, ...patch };
      const stripped = strip(next);
      onChange(stripped);
      return stripped;
    });
  };

  return (
    <div className="space-y-3">
      {/* Entry */}
      <div className="space-y-1.5">
        <Eyebrow size="xs">Entry</Eyebrow>
        <Row label="Type">
          <Select
            value={entry.type}
            onValueChange={(v) => {
              if (v == null) return;
              const type = v as EntryAnimationType;
              update({
                entry:
                  type === "none"
                    ? { type: "none" }
                    : {
                        type,
                        duration: entry.duration ?? 0.5,
                        delay: entry.delay ?? 0,
                        trigger: entry.trigger ?? "inView",
                      },
              });
            }}
          >
            <SelectTrigger size="sm" className="h-[26px] w-full px-1.5 text-[11.5px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTRY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {entry.type !== "none" && (
          <>
            <Row label="Trigger">
              <Select
                value={entry.trigger ?? "inView"}
                onValueChange={(v) => {
                  if (v == null) return;
                  update({ entry: { ...entry, trigger: v as "immediate" | "inView" } });
                }}
              >
                <SelectTrigger size="sm" className="h-[26px] w-full px-1.5 text-[11.5px] font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inView">On scroll into view</SelectItem>
                  <SelectItem value="immediate">On page load</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Duration">
              <TextInput
                value={String(entry.duration ?? 0.5)}
                onChange={(v) => {
                  const n = parseFloat(v);
                  if (!Number.isFinite(n)) return;
                  update({ entry: { ...entry, duration: Math.max(0, n) } });
                }}
                placeholder="0.5"
                mono
              />
            </Row>
            <Row label="Delay">
              <TextInput
                value={String(entry.delay ?? 0)}
                onChange={(v) => {
                  const n = parseFloat(v);
                  if (!Number.isFinite(n)) return;
                  update({ entry: { ...entry, delay: Math.max(0, n) } });
                }}
                placeholder="0"
                mono
              />
            </Row>
          </>
        )}
      </div>

      {/* Hover */}
      <div className="space-y-1.5">
        <Eyebrow size="xs">Hover</Eyebrow>
        <Row label="Scale">
          <TextInput
            value={hoverCfg.scale != null ? String(hoverCfg.scale) : ""}
            onChange={(v) => {
              if (v === "") {
                update({ hover: { ...hoverCfg, scale: undefined } });
                return;
              }
              const n = parseFloat(v);
              if (!Number.isFinite(n)) return;
              update({ hover: { ...hoverCfg, scale: n } });
            }}
            placeholder="1.05"
            mono
          />
        </Row>
        <Row label="Lift">
          <TextInput
            value={hoverCfg.y != null ? String(hoverCfg.y) : ""}
            onChange={(v) => {
              if (v === "") {
                update({ hover: { ...hoverCfg, y: undefined } });
                return;
              }
              const n = parseFloat(v);
              if (!Number.isFinite(n)) return;
              update({ hover: { ...hoverCfg, y: n } });
            }}
            placeholder="-4"
            mono
          />
        </Row>
      </div>

      {/* Tap */}
      <div className="space-y-1.5">
        <Eyebrow size="xs">Tap</Eyebrow>
        <Row label="Scale">
          <TextInput
            value={tapCfg.scale != null ? String(tapCfg.scale) : ""}
            onChange={(v) => {
              if (v === "") {
                update({ tap: { scale: undefined } });
                return;
              }
              const n = parseFloat(v);
              if (!Number.isFinite(n)) return;
              update({ tap: { scale: n } });
            }}
            placeholder="0.95"
            mono
          />
        </Row>
      </div>
    </div>
  );
}
