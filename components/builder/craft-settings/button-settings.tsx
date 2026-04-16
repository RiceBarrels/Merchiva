"use client";

import { useNode } from "@craftjs/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function ButtonSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  return (
    <div className="space-y-3 p-3">
      {/* Label */}
      <div>
        <Label className="text-xs text-muted-foreground">Label</Label>
        <Input
          value={props.label || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.label = e.target.value;
            })
          }
          placeholder="Click me"
          className="h-7 text-xs"
        />
      </div>

      {/* Href */}
      <div>
        <Label className="text-xs text-muted-foreground">Link URL</Label>
        <Input
          value={props.href || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.href = e.target.value;
            })
          }
          placeholder="https://..."
          className="h-7 text-xs"
        />
      </div>

      <Separator />

      {/* Variant */}
      <div>
        <Label className="text-xs text-muted-foreground">Variant</Label>
        <Select
          value={props.variant || "primary"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.variant = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">Primary</SelectItem>
            <SelectItem value="secondary">Secondary</SelectItem>
            <SelectItem value="outline">Outline</SelectItem>
            <SelectItem value="ghost">Ghost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Size */}
      <div>
        <Label className="text-xs text-muted-foreground">Size</Label>
        <Select
          value={props.size || "md"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.size = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Full Width */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Full Width</Label>
        <button
          type="button"
          role="switch"
          aria-checked={!!props.fullWidth}
          onClick={() =>
            setProp((p: Record<string, unknown>) => {
              p.fullWidth = !p.fullWidth;
            })
          }
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-border transition-colors ${
            props.fullWidth ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
              props.fullWidth ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
