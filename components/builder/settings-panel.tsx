"use client";

import React from "react";
import { useEditor } from "@craftjs/core";
import { Trash2 } from "lucide-react";
import { hapticLight } from "@/lib/haptics";

export function SettingsPanel() {
  const { selected, selectedDisplayName, selectedSettings, actions } =
    useEditor((state) => {
      const [currentNodeId] = state.events.selected;
      if (currentNodeId) {
        const node = state.nodes[currentNodeId];
        return {
          selected: currentNodeId,
          selectedDisplayName:
            node.data.displayName ||
            (typeof node.data.type === "object" &&
            node.data.type !== null &&
            "resolvedName" in node.data.type
              ? (node.data.type as { resolvedName: string }).resolvedName
              : "Element"),
          selectedSettings: node.related?.settings,
        };
      }
      return {
        selected: null,
        selectedDisplayName: null,
        selectedSettings: null,
      };
    });

  return (
    <div>
      {selected ? (
        <div className="p-3">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold">{selectedDisplayName}</p>
            <button
              onClick={() => {
                hapticLight();
                actions.delete(selected);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-[0.3rem] text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Settings component from the Craft node */}
          {selectedSettings ? (
            React.createElement(selectedSettings)
          ) : (
            <p className="text-xs text-muted-foreground">
              No settings available for this element.
            </p>
          )}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-center text-xs text-muted-foreground">
            Select an element to edit its properties.
          </p>
        </div>
      )}
    </div>
  );
}
