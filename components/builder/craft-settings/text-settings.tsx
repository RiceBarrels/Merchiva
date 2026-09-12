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
import { ColorPicker } from "@/components/builder/color-picker";
import { Textarea } from "@/components/ui/textarea";

export function TextSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  return (
    <div className="space-y-3 p-3">
      {/* Content */}
      <Field label="Content">
        <Textarea
          value={props.content || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.content = e.target.value;
            })
          }
          rows={3}
          className="min-h-0 resize-y text-xs md:text-xs"
        />
      </Field>

      {/* Tag */}
      <Field label="Tag">
        <Select
          value={props.tag || "p"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.tag = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="p">p</SelectItem>
            <SelectItem value="h1">h1</SelectItem>
            <SelectItem value="h2">h2</SelectItem>
            <SelectItem value="h3">h3</SelectItem>
            <SelectItem value="h4">h4</SelectItem>
            <SelectItem value="span">span</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* Alignment */}
      <Field label="Align">
        <Select
          value={props.align || "left"}
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
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Separator />

      {/* Font Size */}
      <Field label="Font Size">
        <Input
          value={props.fontSize || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.fontSize = e.target.value;
            })
          }
          placeholder="1rem"
          className="h-7 text-xs"
        />
      </Field>

      {/* Font Weight */}
      <Field label="Font Weight">
        <Select
          value={props.fontWeight || "normal"}
          onValueChange={(val) => {
            if (val == null) return;
            setProp((p: Record<string, unknown>) => {
              p.fontWeight = val;
            });
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="600">600</SelectItem>
            <SelectItem value="700">700</SelectItem>
            <SelectItem value="800">800</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Separator />

      {/* Color */}
      <Field label="Color">
        <div className="flex items-center gap-2">
          <ColorPicker
            value={props.color || "#000000"}
            onChange={(val) =>
              setProp((p: Record<string, unknown>) => {
                p.color = val;
              })
            }
          />
          <Input
            value={props.color || ""}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.color = e.target.value;
              })
            }
            placeholder="#000000"
            className="h-7 text-xs font-mono flex-1"
          />
        </div>
      </Field>

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
    </div>
  );
}
