"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InventoryItem, ProductInventoryUsage } from "@/lib/types";
import { sanitizeProductInventoryUsage } from "@/lib/inventory-units";
import { useT } from "@/lib/i18n/context";

export function ProductInventoryUsageEditor({
  inventoryItems,
  value,
  onChange,
}: {
  inventoryItems: InventoryItem[];
  value: ProductInventoryUsage[] | undefined;
  onChange: (value: ProductInventoryUsage[]) => void;
}) {
  const t = useT();
  const usage = sanitizeProductInventoryUsage(value ?? []);

  const addLine = () => {
    const first = inventoryItems[0];
    if (!first) return;
    onChange([
      ...usage,
      {
        inventoryItemId: first.id,
        inventoryItemName: first.name,
        quantity: 1,
        unit: first.unit,
      },
    ]);
  };

  const updateLine = (index: number, next: ProductInventoryUsage) => {
    onChange(usage.map((line, i) => (i === index ? next : line)));
  };

  const removeLine = (index: number) => {
    onChange(usage.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 rounded-[0.3rem] border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <div>
          <Label>{t("products.inventoryUsage.title")}</Label>
          <p className="text-[11px] text-muted-foreground">
            {t("products.inventoryUsage.description")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1.5"
          onClick={addLine}
          disabled={inventoryItems.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("products.inventoryUsage.add")}
        </Button>
      </div>

      {inventoryItems.length === 0 ? (
        <div className="rounded-[0.3rem] border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          {t("products.inventoryUsage.noInventory")}
        </div>
      ) : usage.length === 0 ? (
        <div className="rounded-[0.3rem] border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
          {t("products.inventoryUsage.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {usage.map((line, index) => (
            <div
              key={`${line.inventoryItemId}-${index}`}
              className="grid gap-2 rounded-[0.3rem] border border-border bg-background p-2 sm:grid-cols-[1fr_120px_34px]"
            >
              <Select
                value={line.inventoryItemId}
                onValueChange={(itemId) => {
                  const item = inventoryItems.find((i) => i.id === itemId);
                  if (!item) return;
                  updateLine(index, {
                    inventoryItemId: item.id,
                    inventoryItemName: item.name,
                    quantity: line.quantity,
                    unit: item.unit,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-[0.3rem] border border-input bg-background">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, {
                      ...line,
                      quantity: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  className="border-0 shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 pr-2 text-[11px] text-muted-foreground">
                  {line.unit || t("products.inventoryUsage.unitFallback")}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                onClick={() => removeLine(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
