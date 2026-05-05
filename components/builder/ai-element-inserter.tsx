"use client";

import { useEffect } from "react";
import { useEditor } from "@craftjs/core";
import React from "react";
import { CraftText } from "./craft-components/craft-text";
import { CraftImage } from "./craft-components/craft-image";
import { CraftLayout } from "./craft-components/craft-layout";

interface AiElement {
  type: string;
  props?: Record<string, unknown>;
  content?: string;
  style?: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aiElementToCraft(el: AiElement, query: any): any {
  const style = el.style || (el.props?.style as Record<string, string>) || {};
  const content = el.content || (el.props?.content as string) || "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const craft = (comp: any, props: Record<string, unknown>) =>
    query.parseReactElement(React.createElement(comp, props));

  switch (el.type) {
    case "text":
      return craft(CraftText, { content: content || "Text", tag: (el.props?.tag as string) || "p", style });
    case "image":
      return craft(CraftImage, { src: (el.props?.src as string) || "", alt: (el.props?.alt as string) || "Image", style });
    case "layout":
    case "container":
      return craft(CraftLayout, { style });
    default:
      return null;
  }
}

export function AiElementInserter() {
  const { actions, query } = useEditor();

  useEffect(() => {
    function handleAiGenerate(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!Array.isArray(detail)) return;

      for (const el of detail as AiElement[]) {
        try {
          const parsed = aiElementToCraft(el, query);
          if (parsed) {
            const tree = parsed.toNodeTree();
            actions.addNodeTree(tree, "ROOT");
          }
        } catch (err) {
          console.error("[AI Insert] Failed to insert element:", err, el);
        }
      }
    }

    function handleAiDelete(e: Event) {
      const targets = (e as CustomEvent).detail as string[];
      if (!Array.isArray(targets)) return;

      // Find nodes by display name and delete them
      const serialized = query.getSerializedNodes();
      for (const [nodeId, node] of Object.entries(serialized)) {
        if (nodeId === "ROOT") continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const n = node as any;
        const name = String(
          n.custom?.displayName ||
          n.displayName ||
          (typeof n.type === "object" && n.type?.resolvedName
            ? n.type.resolvedName.replace("Craft", "")
            : "") ||
          ""
        );
        if (name && targets.some((t: string) => name.toLowerCase().includes(t.toLowerCase()))) {
          try { actions.delete(nodeId); } catch { /* skip locked */ }
        }
      }
    }

    function handleAiAddFunction(e: Event) {
      const fn = (e as CustomEvent).detail;
      if (!fn || !fn.name) return;
      try {
        const raw = localStorage.getItem("flowfn:fns");
        const fns = raw ? JSON.parse(raw) : [];
        // Ensure unique id
        if (!fn.id) fn.id = "fn_" + Math.random().toString(36).slice(2, 8);
        if (!fn.nodes) fn.nodes = [];
        if (!fn.edges) fn.edges = [];
        if (!fn.tests) fn.tests = [];
        // Remove existing with same name
        const updated = fns.filter((f: { name: string }) => f.name !== fn.name);
        updated.push(fn);
        localStorage.setItem("flowfn:fns", JSON.stringify(updated));
        // Notify FlowFn editor to reload
        window.dispatchEvent(new StorageEvent("storage", { key: "flowfn:fns", newValue: JSON.stringify(updated) }));
      } catch (err) {
        console.error("[AI] Failed to add function:", err);
      }
    }

    window.addEventListener("flowfn:ai-generate", handleAiGenerate);
    window.addEventListener("flowfn:ai-delete", handleAiDelete);
    window.addEventListener("flowfn:ai-add-function", handleAiAddFunction);
    return () => {
      window.removeEventListener("flowfn:ai-generate", handleAiGenerate);
      window.removeEventListener("flowfn:ai-delete", handleAiDelete);
      window.removeEventListener("flowfn:ai-add-function", handleAiAddFunction);
    };
  }, [actions, query]);

  return null;
}
