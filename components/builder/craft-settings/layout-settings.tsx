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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ColorPicker } from "@/components/builder/color-picker";

export function LayoutSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  const direction = props.direction || "stack";

  return (
    <div className="space-y-3 p-3">
      {/* Direction */}
      <Field label="Direction">
        <Select
          value={direction}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.direction = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stack">Stack (vertical)</SelectItem>
            <SelectItem value="row">Row (horizontal)</SelectItem>
            <SelectItem value="grid">Grid</SelectItem>
            <SelectItem value="free">Free position</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* Columns (only for grid) */}
      {direction === "grid" && (
        <Field label="Columns">
          <Input
            type="number"
            min={1}
            max={12}
            value={props.columns ?? 2}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.columns = parseInt(e.target.value, 10) || 2;
              })
            }
            className="h-7 text-xs"
          />
        </Field>
      )}

      {/* Spacing */}
      <Field label="Spacing">
        <div className="flex items-center gap-1.5">
          <Input
            value={props.spacing || ""}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.spacing = e.target.value;
              })
            }
            placeholder="1rem"
            className="h-7 text-xs flex-1"
          />
          <SegmentedControl
            size="sm"
            options={[
              { value: "0.5rem", label: "S" },
              { value: "1rem", label: "M" },
              { value: "2rem", label: "L" },
            ] as { value: string; label: React.ReactNode }[]}
            value={props.spacing ?? ""}
            onChange={(v) =>
              setProp((p: Record<string, unknown>) => {
                p.spacing = v;
              })
            }
          />
        </div>
      </Field>

      {/* Align */}
      <Field label="Align">
        <Select
          value={props.align || "stretch"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.align = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stretch">Stretch</SelectItem>
            <SelectItem value="flex-start">Start</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="flex-end">End</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Separator />

      {/* Padding */}
      <Field label="Padding">
        <Input
          value={props.padding || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.padding = e.target.value;
            })
          }
          placeholder="0"
          className="h-7 text-xs"
        />
      </Field>

      {/* Background Color */}
      <Field label="Background">
        <div className="flex items-center gap-2">
          <ColorPicker
            value={props.backgroundColor || "#ffffff"}
            onChange={(val) =>
              setProp((p: Record<string, unknown>) => {
                p.backgroundColor = val;
              })
            }
          />
          <Input
            value={props.backgroundColor || ""}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.backgroundColor = e.target.value;
              })
            }
            placeholder="#ffffff"
            className="h-7 text-xs font-mono flex-1"
          />
        </div>
      </Field>

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
