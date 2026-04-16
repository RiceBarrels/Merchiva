"use client";

import { useEditor } from "@craftjs/core";
import { Type, Image, LayoutDashboard } from "lucide-react";
import { CraftText } from "./craft-components/craft-text";
import { CraftImage } from "./craft-components/craft-image";
import { CraftLayout } from "./craft-components/craft-layout";
import React from "react";

export function ToolBar() {
  const { connectors } = useEditor();

  const tools = [
    {
      label: "Layout",
      icon: LayoutDashboard,
      element: React.createElement(CraftLayout),
    },
    {
      label: "Image",
      icon: Image,
      element: React.createElement(CraftImage),
    },
    {
      label: "Text",
      icon: Type,
      element: React.createElement(CraftText),
    },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-background/95 px-1 py-1 shadow-xl backdrop-blur-sm">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <div
            key={tool.label}
            ref={(ref: HTMLElement | null) => {
              if (ref) connectors.create(ref, tool.element);
            }}
            className="flex cursor-grab items-center gap-1.5 rounded-[0.3rem] px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{tool.label}</span>
          </div>
        );
      })}
    </div>
  );
}
