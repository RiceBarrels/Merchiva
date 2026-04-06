"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  Image as ImageIcon,
  MousePointer,
  LayoutTemplate,
  Minus,
  Space,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProductById, updateProduct } from "@/lib/db/products";
import type { Product, SiteElement, SiteTheme } from "@/lib/types";
import { PermissionGuard } from "@/components/permission-guard";
import { SiteRenderer } from "@/components/site-renderer";

// ─── Default theme for preview ────────────────────────────────────────────────

const PREVIEW_THEME: SiteTheme = {
  primary: "#18181b",
  secondary: "#71717a",
  accent: "#3b82f6",
  background: "#ffffff",
  text: "#18181b",
  headingFont: "Inter, sans-serif",
  bodyFont: "Inter, sans-serif",
  borderRadius: 4,
};

// ─── Default template generator ───────────────────────────────────────────────

function buildDefaultTemplate(product: Product): SiteElement[] {
  const base = Date.now();
  return [
    {
      id: `pt-hero-${base}`,
      type: "hero",
      props: {
        title: product.name,
        subtitle: product.category,
        backgroundColor: "#f8fafc",
        height: "320px",
        align: "center",
      },
    },
    {
      id: `pt-price-${base}`,
      type: "text",
      props: {
        content: `$${product.price.toFixed(2)}`,
        tag: "p",
        fontSize: "2rem",
        fontWeight: "800",
        color: "#3b82f6",
        align: "center",
        padding: "1rem 2rem 0",
      },
    },
    {
      id: `pt-desc-${base}`,
      type: "text",
      props: {
        content: product.description || "No description available.",
        tag: "p",
        align: "center",
        padding: "0.5rem 2rem",
        color: "#71717a",
      },
    },
    {
      id: `pt-btn-${base}`,
      type: "button",
      props: {
        label: "Add to Cart",
        href: "#",
        variant: "primary",
        size: "lg",
      },
    },
  ];
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE_ITEMS = [
  { type: "hero" as const, label: "Hero", icon: LayoutTemplate },
  { type: "text" as const, label: "Text", icon: Type },
  { type: "image" as const, label: "Image", icon: ImageIcon },
  { type: "button" as const, label: "Button", icon: MousePointer },
  { type: "divider" as const, label: "Divider", icon: Minus },
  { type: "spacer" as const, label: "Spacer", icon: Space },
];

function defaultPropsFor(type: string): Record<string, unknown> {
  switch (type) {
    case "hero":    return { title: "Section Title", subtitle: "", backgroundColor: "#f8fafc", height: "320px", align: "center" };
    case "text":    return { content: "Text block", tag: "p", align: "left", padding: "0.5rem 2rem" };
    case "image":   return { src: "", alt: "Image", width: "100%", height: "300px", objectFit: "cover" };
    case "button":  return { label: "Button", href: "#", variant: "primary", size: "md" };
    case "divider": return { color: "#e5e7eb", thickness: "1px", margin: "1rem 2rem" };
    case "spacer":  return { height: "48px" };
    default:        return {};
  }
}

// ─── Element label ─────────────────────────────────────────────────────────────

function elementLabel(el: SiteElement): string {
  const p = el.props;
  switch (el.type) {
    case "hero":   return `Hero: ${(p.title as string) || "—"}`;
    case "text":   return `${(p.tag as string)?.toUpperCase() || "P"}: ${String(p.content || "").slice(0, 40)}`;
    case "image":  return `Image: ${(p.src as string) ? "has src" : "no src"}`;
    case "button": return `Button: ${(p.label as string) || "—"}`;
    case "divider":return "Divider";
    case "spacer": return `Spacer (${(p.height as string) || "48px"})`;
    default:       return el.type;
  }
}

// ─── Properties panel ─────────────────────────────────────────────────────────

function PropertiesPanel({
  element,
  onChange,
}: {
  element: SiteElement;
  onChange: (id: string, props: Record<string, unknown>) => void;
}) {
  const p = element.props;
  const set = (key: string, value: unknown) => onChange(element.id, { ...p, [key]: value });

  const inputCls = "h-8 text-sm";
  const labelCls = "text-xs text-muted-foreground font-medium";

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 border-b pb-2 mb-3">
        {element.type.toUpperCase()} PROPERTIES
      </p>

      {element.type === "hero" && (
        <>
          <div className="space-y-1">
            <Label className={labelCls}>Title</Label>
            <Input className={inputCls} value={(p.title as string) || ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Subtitle</Label>
            <Input className={inputCls} value={(p.subtitle as string) || ""} onChange={(e) => set("subtitle", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>CTA Label</Label>
            <Input className={inputCls} value={(p.ctaLabel as string) || ""} onChange={(e) => set("ctaLabel", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>CTA Link</Label>
            <Input className={inputCls} value={(p.ctaHref as string) || ""} onChange={(e) => set("ctaHref", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Height</Label>
            <Input className={inputCls} value={(p.height as string) || "320px"} onChange={(e) => set("height", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Background Color</Label>
            <Input className={inputCls} value={(p.backgroundColor as string) || "#f8fafc"} onChange={(e) => set("backgroundColor", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Align</Label>
            <Select value={(p.align as string) || "center"} onValueChange={(v) => set("align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {element.type === "text" && (
        <>
          <div className="space-y-1">
            <Label className={labelCls}>Content</Label>
            <Textarea
              className="text-sm min-h-[80px] resize-none"
              value={(p.content as string) || ""}
              onChange={(e) => set("content", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Tag</Label>
            <Select value={(p.tag as string) || "p"} onValueChange={(v) => set("tag", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">Heading 1</SelectItem>
                <SelectItem value="h2">Heading 2</SelectItem>
                <SelectItem value="h3">Heading 3</SelectItem>
                <SelectItem value="p">Paragraph</SelectItem>
                <SelectItem value="small">Small</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Align</Label>
            <Select value={(p.align as string) || "left"} onValueChange={(v) => set("align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Color</Label>
            <Input className={inputCls} value={(p.color as string) || ""} onChange={(e) => set("color", e.target.value)} placeholder="#333333" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Font Size</Label>
            <Input className={inputCls} value={(p.fontSize as string) || ""} onChange={(e) => set("fontSize", e.target.value)} placeholder="1rem" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Font Weight</Label>
            <Select value={String(p.fontWeight || "")} onValueChange={(v) => set("fontWeight", v)}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="Normal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Normal</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
                <SelectItem value="800">Extrabold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Padding</Label>
            <Input className={inputCls} value={(p.padding as string) || ""} onChange={(e) => set("padding", e.target.value)} placeholder="0.5rem 2rem" />
          </div>
        </>
      )}

      {element.type === "image" && (
        <>
          <div className="space-y-1">
            <Label className={labelCls}>Image URL</Label>
            <Input className={inputCls} value={(p.src as string) || ""} onChange={(e) => set("src", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Alt Text</Label>
            <Input className={inputCls} value={(p.alt as string) || ""} onChange={(e) => set("alt", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Height</Label>
            <Input className={inputCls} value={(p.height as string) || "300px"} onChange={(e) => set("height", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Object Fit</Label>
            <Select value={(p.objectFit as string) || "cover"} onValueChange={(v) => set("objectFit", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="fill">Fill</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {element.type === "button" && (
        <>
          <div className="space-y-1">
            <Label className={labelCls}>Label</Label>
            <Input className={inputCls} value={(p.label as string) || ""} onChange={(e) => set("label", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Link (href)</Label>
            <Input className={inputCls} value={(p.href as string) || "#"} onChange={(e) => set("href", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Variant</Label>
            <Select value={(p.variant as string) || "primary"} onValueChange={(v) => set("variant", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="outline">Outline</SelectItem>
                <SelectItem value="accent">Accent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Size</Label>
            <Select value={(p.size as string) || "md"} onValueChange={(v) => set("size", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fullWidth"
              checked={p.fullWidth === true}
              onChange={(e) => set("fullWidth", e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="fullWidth" className={labelCls}>Full Width</Label>
          </div>
        </>
      )}

      {element.type === "divider" && (
        <>
          <div className="space-y-1">
            <Label className={labelCls}>Color</Label>
            <Input className={inputCls} value={(p.color as string) || "#e5e7eb"} onChange={(e) => set("color", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Thickness</Label>
            <Input className={inputCls} value={(p.thickness as string) || "1px"} onChange={(e) => set("thickness", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Margin</Label>
            <Input className={inputCls} value={(p.margin as string) || "1rem 0"} onChange={(e) => set("margin", e.target.value)} />
          </div>
        </>
      )}

      {element.type === "spacer" && (
        <div className="space-y-1">
          <Label className={labelCls}>Height</Label>
          <Input className={inputCls} value={(p.height as string) || "48px"} onChange={(e) => set("height", e.target.value)} />
        </div>
      )}
    </div>
  );
}

// ─── Details form ─────────────────────────────────────────────────────────────

function DetailsTab({
  product,
  onSave,
}: {
  product: Product;
  onSave: (updates: Partial<Product>) => Promise<void>;
}) {
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(product.price);
  const [cost, setCost] = useState(product.cost);
  const [description, setDescription] = useState(product.description ?? "");
  const [imageUrl, setImageUrl] = useState((product.images ?? [])[0] ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const images = imageUrl.trim() ? [imageUrl.trim()] : [];
      await onSave({ name, category, price, cost, description: description || undefined, images: images.length ? images : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Product Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Price ($)</Label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Cost ($)</Label>
          <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe this product for customers on your website…"
          className="min-h-[100px] resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Image URL</Label>
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/image.jpg"
        />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Preview" className="mt-2 h-32 w-32 object-cover rounded border" />
        )}
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Details
        </Button>
      </div>
    </div>
  );
}

// ─── Template tab ─────────────────────────────────────────────────────────────

function TemplateTab({
  product,
  onSave,
}: {
  product: Product;
  onSave: (updates: Partial<Product>) => Promise<void>;
}) {
  const [elements, setElements] = useState<SiteElement[]>(
    product.pageTemplate?.length ? product.pageTemplate : buildDefaultTemplate(product)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const addElement = useCallback((type: string) => {
    const newEl: SiteElement = {
      id: `pt-${type}-${Date.now()}`,
      type: type as SiteElement["type"],
      props: defaultPropsFor(type),
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(newEl.id);
  }, []);

  const removeElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const moveElement = useCallback((id: string, dir: -1 | 1) => {
    setElements((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  const updateProps = useCallback((id: string, props: Record<string, unknown>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, props } : e)));
  }, []);

  const resetToDefault = () => {
    const tmpl = buildDefaultTemplate(product);
    setElements(tmpl);
    setSelectedId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ pageTemplate: elements });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden border rounded-lg">
      {/* Left: Palette */}
      <div className="w-36 shrink-0 border-r bg-stone-50 flex flex-col">
        <div className="px-3 pt-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Elements</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {PALETTE_ITEMS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => addElement(type)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium rounded hover:bg-stone-200 text-stone-700 transition-colors"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
              {label}
            </button>
          ))}
        </div>
        <div className="border-t p-2 space-y-1">
          <button
            onClick={resetToDefault}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded hover:bg-stone-200 text-stone-600 transition-colors"
          >
            <Sparkles className="h-3 w-3 shrink-0" /> Auto-generate
          </button>
        </div>
      </div>

      {/* Center: Canvas + save bar */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Save bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
          <p className="text-xs text-muted-foreground">{elements.length} element{elements.length !== 1 ? "s" : ""}</p>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Template
          </Button>
        </div>

        {/* Split: element list + live preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Element list */}
          <div className="w-52 shrink-0 border-r overflow-y-auto bg-white">
            {elements.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Plus className="h-6 w-6 text-muted-foreground mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">Add elements from the panel</p>
              </div>
            )}
            {elements.map((el, idx) => (
              <div
                key={el.id}
                onClick={() => setSelectedId(el.id)}
                className={`group flex items-center gap-2 px-3 py-2 border-b cursor-pointer text-xs transition-colors ${
                  selectedId === el.id
                    ? "bg-stone-100 border-l-2 border-l-stone-800"
                    : "hover:bg-stone-50"
                }`}
              >
                <span className="flex-1 truncate font-medium text-stone-700">{elementLabel(el)}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveElement(el.id, -1); }}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-stone-200 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveElement(el.id, 1); }}
                    disabled={idx === elements.length - 1}
                    className="p-0.5 rounded hover:bg-stone-200 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                    className="p-0.5 rounded hover:bg-red-100 text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div className="flex-1 overflow-y-auto bg-stone-100 p-4">
            <div className="bg-white shadow-sm mx-auto max-w-xl min-h-full">
              {elements.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                  Add elements to preview the page
                </div>
              ) : (
                <SiteRenderer elements={elements} theme={PREVIEW_THEME} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Properties */}
      <div className="w-52 shrink-0 border-l bg-white overflow-y-auto">
        {selectedEl ? (
          <PropertiesPanel element={selectedEl} onChange={updateProps} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-xs text-muted-foreground">Select an element to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "template">("details");

  useEffect(() => {
    getProductById(productId)
      .then((p) => setProduct(p))
      .catch((err) => console.error("Failed to load product:", err))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSave = async (updates: Partial<Product>) => {
    await updateProduct(productId, updates);
    setProduct((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">Product not found.</p>
      </div>
    );
  }

  return (
    <PermissionGuard section="products">
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b bg-background shrink-0">
          <button
            onClick={() => router.push("/products")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Products
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold truncate">{product.name}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 sm:px-6 pt-3 pb-0 border-b shrink-0">
          {(["details", "template"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "template" ? "Page Template" : "Details"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={`flex-1 overflow-hidden ${activeTab === "details" ? "overflow-y-auto px-4 sm:px-6" : "px-4 sm:px-6 py-3"}`}>
          {activeTab === "details" ? (
            <DetailsTab product={product} onSave={handleSave} />
          ) : (
            <TemplateTab product={product} onSave={handleSave} />
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
