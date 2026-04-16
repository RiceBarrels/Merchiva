"use client";

import { Frame, Element } from "@craftjs/core";
import { CraftCanvas } from "./craft-components/craft-canvas";
import { themeVars } from "@/components/site-renderer";
import type { Site } from "@/lib/types";

interface CanvasAreaProps {
  site: Site;
  initialState: string;
}

export function CanvasArea({ site, initialState }: CanvasAreaProps) {
  // If we have saved state, load it via the json prop.
  // Otherwise render default empty canvas as children.
  const hasState = initialState && initialState !== "{}" && initialState !== "{}";

  return (
    <div
      data-craft-canvas
      className="flex-1 overflow-auto bg-muted"
      style={site.theme ? themeVars(site.theme) : {}}
    >
      <div className="mx-auto p-8" style={{ maxWidth: 1400 }}>
        {hasState ? (
          <Frame json={initialState}>
            <Element canvas is={CraftCanvas}>
              {/* Loaded from JSON */}
            </Element>
          </Frame>
        ) : (
          <Frame>
            <Element canvas is={CraftCanvas}>
              {/* Empty canvas — drag elements here */}
            </Element>
          </Frame>
        )}
      </div>
    </div>
  );
}
