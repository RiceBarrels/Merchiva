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
      <div>
        <Label className="text-xs text-muted-foreground">Content</Label>
        <textarea
          value={props.content || ""}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.content = e.target.value;
            })
          }
          rows={3}
          className="flex w-full rounded-[0.3rem] border border-border bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        />
      </div>

      {/* Tag */}
      <div>
        <Label className="text-xs text-muted-foreground">Tag</Label>
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
      </div>

      {/* Alignment */}
      <div>
        <Label className="text-xs text-muted-foreground">Align</Label>
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
      </div>

      <Separator />

      {/* Font Size */}
      <div>
        <Label className="text-xs text-muted-foreground">Font Size</Label>
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
      </div>

      {/* Font Weight */}
      <div>
        <Label className="text-xs text-muted-foreground">Font Weight</Label>
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
      </div>

      <Separator />

      {/* Color */}
      <div>
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={props.color || "#000000"}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.color = e.target.value;
              })
            }
            className="h-7 w-7 rounded border border-border cursor-pointer"
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
      </div>

      {/* Padding */}
      <div>
        <Label className="text-xs text-muted-foreground">Padding</Label>
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
      </div>
    </div>
  );
}
