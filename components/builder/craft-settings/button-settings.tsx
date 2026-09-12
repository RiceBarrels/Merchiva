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
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

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
      <Field label="Label">
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
      </Field>

      {/* Href */}
      <Field label="Link URL">
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
      </Field>

      <Separator />

      {/* Variant */}
      <Field label="Variant">
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
      </Field>

      {/* Size */}
      <Field label="Size">
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
      </Field>

      <Separator />

      {/* Full Width */}
      <div className="flex items-center justify-between">
        <Label>Full Width</Label>
        <Switch
          size="sm"
          checked={!!props.fullWidth}
          onCheckedChange={(checked) =>
            setProp((p: Record<string, unknown>) => {
              p.fullWidth = checked;
            })
          }
        />
      </div>
    </div>
  );
}
