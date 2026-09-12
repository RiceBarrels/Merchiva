"use client";

import { useNode } from "@craftjs/core";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Field } from "@/components/ui/field";

export function ImageSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  return (
    <div className="space-y-3 p-3">
      {/* Source URL */}
      <Field label="Source URL">
        <Input
          value={props.src || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.src = e.target.value;
            })
          }
          placeholder="https://..."
          className="h-7 text-xs"
        />
      </Field>

      {/* Alt Text */}
      <Field label="Alt Text">
        <Input
          value={props.alt || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.alt = e.target.value;
            })
          }
          placeholder="Image description"
          className="h-7 text-xs"
        />
      </Field>

      <Separator />

      {/* Width */}
      <Field label="Width">
        <Input
          value={props.width || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.width = e.target.value;
            })
          }
          placeholder="100%"
          className="h-7 text-xs"
        />
      </Field>

      {/* Height */}
      <Field label="Height">
        <Input
          value={props.height || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.height = e.target.value;
            })
          }
          placeholder="auto"
          className="h-7 text-xs"
        />
      </Field>

      {/* Object Fit */}
      <Field label="Object Fit">
        <Select
          value={props.objectFit || "cover"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.objectFit = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="fill">Fill</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Separator />

      {/* Border Radius */}
      <Field label="Border Radius">
        <Input
          value={props.borderRadius || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.borderRadius = e.target.value;
            })
          }
          placeholder="0"
          className="h-7 text-xs"
        />
      </Field>
    </div>
  );
}
