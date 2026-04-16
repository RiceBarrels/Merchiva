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
      <div>
        <Label className="text-xs text-muted-foreground">Name</Label>
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
      </div>

      {/* Viewport Width */}
      <div>
        <Label className="text-xs text-muted-foreground">Width</Label>
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
          <div className="flex gap-1">
            {[
              { label: "D", value: 1280, title: "Desktop" },
              { label: "T", value: 800, title: "Tablet" },
              { label: "M", value: 375, title: "Mobile" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                title={preset.title}
                onClick={() =>
                  setProp((p: Record<string, unknown>) => {
                    p.viewportWidth = preset.value;
                  })
                }
                className={`h-7 w-7 rounded-[0.3rem] border border-border text-[10px] font-medium transition-colors ${
                  props.viewportWidth === preset.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      {/* Direction */}
      <div>
        <Label className="text-xs text-muted-foreground">Direction</Label>
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
      </div>

      {/* Spacing */}
      <div>
        <Label className="text-xs text-muted-foreground">Spacing</Label>
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
      </div>

      {/* Align */}
      <div>
        <Label className="text-xs text-muted-foreground">Align</Label>
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
      </div>

      <Separator />

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

      {/* Background Color */}
      <div>
        <Label className="text-xs text-muted-foreground">Background</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={props.backgroundColor || "#ffffff"}
            onChange={(e) =>
              setProp((p: Record<string, unknown>) => {
                p.backgroundColor = e.target.value;
              })
            }
            className="h-7 w-7 rounded border border-border cursor-pointer"
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
      </div>
    </div>
  );
}
