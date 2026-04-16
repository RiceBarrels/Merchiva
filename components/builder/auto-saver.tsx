"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor } from "@craftjs/core";
import { updatePage } from "@/lib/spacetimedb/actions";
import { craftStateToSiteElements } from "@/lib/builder/craft-bridge";
import type { SitePage } from "@/lib/types";

interface AutoSaverProps {
  activePageId: string;
  pages: SitePage[];
  setSaving: (v: boolean) => void;
  setSavedAt: (v: number | null) => void;
}

export function AutoSaver({
  activePageId,
  pages,
  setSaving,
  setSavedAt,
}: AutoSaverProps) {
  const { query } = useEditor();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  const save = useCallback(async () => {
    const page = pages.find((p) => p.id === activePageId);
    if (!page) return;

    try {
      const json = query.serialize();
      // Skip if nothing changed since last save
      if (json === lastSavedRef.current) return;

      setSaving(true);
      const elements = craftStateToSiteElements(json);
      await updatePage(activePageId, {
        name: page.name,
        slug: page.slug,
        elements: JSON.stringify(elements),
        sortOrder: page.sortOrder,
      });
      lastSavedRef.current = json;
      setSavedAt(Date.now());
    } catch (err) {
      console.error("Auto-save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [activePageId, pages, query, setSaving, setSavedAt]);

  // Watch ALL editor state changes (nodes, props, events) via serialization snapshot
  const { serialized } = useEditor((state) => ({
    serialized: JSON.stringify(
      Object.fromEntries(
        Object.entries(state.nodes).map(([id, node]) => [id, node.data.props])
      )
    ),
  }));

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [serialized, save]);

  return null;
}
