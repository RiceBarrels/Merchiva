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

export function ViewportSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  return (
    <div className="space-y-3 p-3">
      {/* Viewport Name */}
      <Field label="Name">
        <Input
          value={props.viewportName || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.viewportName = e.target.value;
            })
          }
          placeholder="Desktop"
          className="h-7 text-xs"
        />
      </Field>

      {/* Viewport Width */}
      <Field label="Width">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={props.viewportWidth ?? ""}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.viewportWidth = parseInt(e.target.value, 10) || 0;
              })
            }
            placeholder="1280"
            className="h-7 text-xs flex-1"
          />
          <SegmentedControl
            size="sm"
            options={[
              { value: "1280", label: <span title="Desktop">D</span> },
              { value: "800", label: <span title="Tablet">T</span> },
              { value: "375", label: <span title="Mobile">M</span> },
            ] as { value: string; label: React.ReactNode }[]}
            value={String(props.viewportWidth ?? "")}
            onChange={(v) =>
              setProp((p: Record<string, unknown>) => {
                p.viewportWidth = parseInt(v, 10) || 0;
              })
            }
          />
        </div>
      </Field>

      <Separator />

      {/* Direction */}
      <Field label="Direction">
        <Select
          value={props.direction || "stack"}
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
          </SelectContent>
        </Select>
      </Field>

      {/* Spacing */}
      <Field label="Spacing">
        <Input
          value={props.spacing || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.spacing = e.target.value;
            })
          }
          placeholder="1rem"
          className="h-7 text-xs"
        />
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
    </div>
  );
}
