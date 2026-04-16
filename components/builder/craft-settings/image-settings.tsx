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
      <div>
        <Label className="text-xs text-muted-foreground">Source URL</Label>
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
      </div>

      {/* Alt Text */}
      <div>
        <Label className="text-xs text-muted-foreground">Alt Text</Label>
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
      </div>

      <Separator />

      {/* Width */}
      <div>
        <Label className="text-xs text-muted-foreground">Width</Label>
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
      </div>

      {/* Height */}
      <div>
        <Label className="text-xs text-muted-foreground">Height</Label>
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
      </div>

      {/* Object Fit */}
      <div>
        <Label className="text-xs text-muted-foreground">Object Fit</Label>
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
      </div>

      <Separator />

      {/* Border Radius */}
      <div>
        <Label className="text-xs text-muted-foreground">Border Radius</Label>
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
      </div>
    </div>
  );
}
