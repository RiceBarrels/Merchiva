"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
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
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import { resolver } from "@/components/builder/craft-components/resolver";
import { siteElementsToCraftState, craftStateToSiteElements } from "@/lib/builder/craft-bridge";
import { RenderNode } from "@/components/builder/render-node";
import { DesignPanel } from "@/components/builder/design-panel";
import { KeyboardShortcuts } from "@/components/builder/keyboard-shortcuts";
import { CraftCanvas } from "@/components/builder/craft-components/craft-canvas";
import { updateProduct } from "@/lib/spacetimedb/actions";
import { getProductById } from "@/lib/db/products";
import type { Product, SiteElement, SiteTheme } from "@/lib/types";
import { useInventory } from "@/lib/spacetimedb/hooks/useInventory";
import { PermissionGuard } from "@/components/permission-guard";
import { useT } from "@/lib/i18n/context";
import { useCurrency } from "@/lib/currency";
import { LOCALES } from "@/lib/i18n/config";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/loaders/geometric";
import { ProductInventoryUsageEditor } from "@/components/inventory/product-inventory-usage-editor";

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

function buildDefaultTemplate(
  product: Product,
  t: (path: string) => string,
  formatMoney: (amount: number | null | undefined) => string,
): SiteElement[] {
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
        content: formatMoney(product.price),
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
        content: product.description || t("products.detail.template.noDescription"),
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
        label: t("products.detail.template.addToCart"),
        href: "#",
        variant: "primary",
        size: "lg",
      },
    },
  ];
}

// (Palette, PropertiesPanel, old TemplateTab removed — using craft.js builder now)

// ─── Product Template Auto-Saver ──────────────────────────────────────────────

function ProductAutoSaver({ productId, onSave }: { productId: string; onSave: (elements: SiteElement[]) => Promise<void> }) {
  const { query } = useEditor();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRef = useRef("");

  const save = useCallback(async () => {
    try {
      const json = query.serialize();
      if (json === lastRef.current) return;
      const elements = craftStateToSiteElements(json);
      await onSave(elements);
      lastRef.current = json;
    } catch (err) {
      console.error("Product template auto-save failed:", err);
    }
  }, [query, onSave]);

  const { serialized } = useEditor((state) => ({
    serialized: JSON.stringify(
      Object.fromEntries(Object.entries(state.nodes).map(([id, node]) => [id, node.data.props]))
    ),
  }));

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [serialized, save]);

  return null;
}

// ─── Details form ─────────────────────────────────────────────────────────────

const LOCALE_LABELS: Record<string, string> = {
  en: "English", zh: "中文", es: "Español", fr: "Français", ar: "العربية", hi: "हिन्दी",
};

function DetailsTab({
  product,
  onSave,
}: {
  product: Product;
  onSave: (updates: Partial<Product>) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(product.price);
  const [cost, setCost] = useState(product.cost);
  const [description, setDescription] = useState(product.description ?? "");
  const [imageUrl, setImageUrl] = useState((product.images ?? [])[0] ?? "");
  const [inventoryUsage, setInventoryUsage] = useState(product.inventoryUsage ?? []);
  const [nameI18n, setNameI18n] = useState<Record<string, string>>(product.nameI18n ?? {});
  const [showI18n, setShowI18n] = useState(Object.keys(product.nameI18n ?? {}).length > 0);
  const [saving, setSaving] = useState(false);
  const { items: inventoryItems } = useInventory(null);

  const handleI18nChange = (locale: string, value: string) => {
    setNameI18n((prev) => {
      const next = { ...prev };
      if (value.trim()) {
        next[locale] = value;
      } else {
        delete next[locale];
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const images = imageUrl.trim() ? [imageUrl.trim()] : [];
      const i18n = Object.keys(nameI18n).length > 0 ? nameI18n : undefined;
      await onSave({
        name,
        category,
        price,
        cost,
        description: description || undefined,
        nameI18n: i18n,
        images: images.length ? images : undefined,
        inventoryUsage,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label>{t("products.detail.details.nameLabel")}</Label>
            <button
              type="button"
              onClick={() => setShowI18n((v) => !v)}
              className="text-[10px] px-1.5 py-0.5 rounded-[0.3rem] border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showI18n ? t("products.detail.details.hideTranslations") : t("products.detail.details.addTranslations")}
            </button>
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.detail.details.defaultName")} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.detail.details.categoryLabel")}</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
      </div>

      {showI18n && (
        <div className="space-y-2 rounded-[0.3rem] border border-border p-3 bg-muted/30">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("products.detail.details.translations")}</p>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((loc) => (
              <div key={loc} className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground w-6 shrink-0 uppercase">{loc}</span>
                <Input
                  value={nameI18n[loc] ?? ""}
                  onChange={(e) => handleI18nChange(loc, e.target.value)}
                  placeholder={LOCALE_LABELS[loc]}
                  className="h-8 text-[13px]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t("products.detail.details.priceLabel")}</Label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.detail.details.costLabel")}</Label>
          <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("products.detail.details.descriptionLabel")}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("products.detail.details.descriptionPlaceholder")}
          className="min-h-[100px] resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("products.detail.details.imageUrlLabel")}</Label>
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder={t("products.detail.details.imageUrlPlaceholder")}
        />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={t("products.detail.details.imageAlt")} className="mt-2 h-32 w-32 object-cover rounded border" />
        )}
      </div>
      <ProductInventoryUsageEditor
        inventoryItems={inventoryItems}
        value={inventoryUsage}
        onChange={setInventoryUsage}
      />
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Spinner size={16} /> : <Save className="h-4 w-4" />}
          {t("products.detail.details.save")}
        </Button>
      </div>
    </div>
  );
}

// ─── Template tab ─────────────────────────────────────────────────────────────

function TemplateTab({
  product,
  productId,
  onSave,
}: {
  product: Product;
  productId: string;
  onSave: (updates: Partial<Product>) => Promise<void>;
}) {
  const t = useT();
  const { format } = useCurrency();
  const elements = product.pageTemplate?.length ? product.pageTemplate : buildDefaultTemplate(product, t, format);
  const initialState = siteElementsToCraftState(elements);

  const handleAutoSave = useCallback(async (newElements: SiteElement[]) => {
    try {
      await onSave({ pageTemplate: newElements });
      toast.success(t("products.toasts.templateSaved"), { duration: 1500 });
    } catch (err) {
      console.error("Failed to save template:", err);
    }
  }, [onSave, t]);

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden border rounded-[0.3rem]">
      <Editor resolver={resolver} onRender={RenderNode}>
        <KeyboardShortcuts />
        <ProductAutoSaver productId={productId} onSave={handleAutoSave} />
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 overflow-y-auto bg-muted">
            <div className="mx-auto max-w-3xl min-h-full bg-background border-x border-border">
              <Frame data={initialState}>
                <Element is={CraftCanvas} canvas>
                  {/* Empty — populated from data */}
                </Element>
              </Frame>
            </div>
          </div>
          {/* Design panel */}
          <div className="w-64 shrink-0 border-l bg-background overflow-y-auto">
            <DesignPanel pages={[]} />
          </div>
        </div>
      </Editor>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const t = useT();
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
        <Spinner size={20} className="text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">{t("products.detail.notFound")}</p>
      </div>
    );
  }

  return (
    <PermissionGuard section="products">
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b bg-background shrink-0">
          <button
            onClick={() => router.push("/~/products")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("products.detail.breadcrumb")}
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
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "template" ? t("products.detail.tabs.template") : t("products.detail.tabs.details")}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={`flex-1 overflow-hidden ${activeTab === "details" ? "overflow-y-auto px-4 sm:px-6" : "px-4 sm:px-6 py-3"}`}>
          {activeTab === "details" ? (
            <DetailsTab product={product} onSave={handleSave} />
          ) : (
            <TemplateTab product={product} productId={productId} onSave={handleSave} />
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
