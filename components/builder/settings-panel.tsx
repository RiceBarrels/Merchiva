"use client";

import React from "react";
import { useEditor } from "@craftjs/core";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function SettingsPanel() {
  const t = useT();
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
            <Button
              variant="destructive"
              size="icon-xs"
              onClick={() => actions.delete(selected)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Settings component from the Craft node */}
          {selectedSettings ? (
            React.createElement(selectedSettings)
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("builder.settingsPanel.noSettings")}
            </p>
          )}
        </div>
      ) : (
        <EmptyState compact className="h-full" description={t("builder.settingsPanel.selectElement")} />
      )}
    </div>
  );
}
