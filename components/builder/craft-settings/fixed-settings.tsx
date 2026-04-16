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

export function FixedSettings() {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  const direction = props.direction || "stack";

  return (
    <div className="space-y-3 p-3">
      {/* Position */}
      <div>
        <Label className="text-xs text-muted-foreground">X</Label>
        <Input
          type="number"
          value={props.x ?? 0}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.x = parseInt(e.target.value, 10) || 0;
            })
          }
          className="h-7 text-xs"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Y</Label>
        <Input
          type="number"
          value={props.y ?? 0}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.y = parseInt(e.target.value, 10) || 0;
            })
          }
          className="h-7 text-xs"
        />
      </div>

      <Separator />

      {/* Direction */}
      <div>
        <Label className="text-xs text-muted-foreground">Direction</Label>
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
          </SelectContent>
        </Select>
      </div>

      {/* Columns (only for grid) */}
      {direction === "grid" && (
        <div>
          <Label className="text-xs text-muted-foreground">Columns</Label>
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
        </div>
      )}

      {/* Spacing */}
      <div>
        <Label className="text-xs text-muted-foreground">Spacing</Label>
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
          <div className="flex gap-1">
            {[
              { label: "S", value: "0.5rem" },
              { label: "M", value: "1rem" },
              { label: "L", value: "2rem" },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  setProp((p: Record<string, unknown>) => {
                    p.spacing = preset.value;
                  })
                }
                className={`h-7 w-7 rounded-[0.3rem] border border-border text-[10px] font-medium transition-colors ${
                  props.spacing === preset.value
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

      {/* Z-Index */}
      <div>
        <Label className="text-xs text-muted-foreground">Z-Index</Label>
        <Input
          type="number"
          value={props.zIndex ?? 100}
          onChange={(e) =>
            setProp((p: Record<string, unknown>) => {
              p.zIndex = parseInt(e.target.value, 10) || 0;
            })
          }
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}
