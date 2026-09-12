"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor } from "@craftjs/core";
import { Type, Image, LayoutDashboard, Sparkles, Send, X } from "lucide-react";
import { CraftText } from "./craft-components/craft-text";
import { CraftImage } from "./craft-components/craft-image";
import { CraftLayout } from "./craft-components/craft-layout";
import React from "react";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/context/permissions";

export function ToolBar() {
  const t = useT();
  const { organizationId } = usePermissions();
  const { connectors } = useEditor();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aiOpen) inputRef.current?.focus();
  }, [aiOpen]);

  const tools = [
    {
      label: t("builder.floatingTools.layout"),
      icon: LayoutDashboard,
      element: React.createElement(CraftLayout),
    },
    {
      label: t("builder.floatingTools.image"),
      icon: Image,
      element: React.createElement(CraftImage),
    },
    {
      label: t("builder.floatingTools.text"),
      icon: Type,
      element: React.createElement(CraftText),
    },
  ];

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim(), organizationId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.elements) {
          // Elements will be handled by the parent via a custom event
          window.dispatchEvent(new CustomEvent("flowfn:ai-generate", { detail: data.elements }));
        }
      }
    } catch (err) {
      console.error("[AI Generate]", err);
    } finally {
      setAiLoading(false);
      setAiPrompt("");
      setAiOpen(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-background px-1 py-1">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <div
            key={tool.label}
            ref={(ref: HTMLElement | null) => {
              if (ref) connectors.create(ref, tool.element);
            }}
            className="flex cursor-grab items-center gap-1.5 rounded px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{tool.label}</span>
          </div>
        );
      })}

      {/* Divider */}
      <div className="mx-0.5 h-6 w-px bg-border" />

      {/* AI Generate */}
      {aiOpen ? (
        <div className="flex items-center gap-1 rounded bg-muted px-2 py-1">
          <Sparkles className="h-4 w-4 shrink-0 text-foreground" />
          <input
            ref={inputRef}
            className="w-48 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={t("builder.floatingTools.aiPlaceholder")}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAiSubmit();
              if (e.key === "Escape") { setAiOpen(false); setAiPrompt(""); }
            }}
            disabled={aiLoading}
          />
          {aiLoading ? (
            <Spinner size={16} className="text-muted-foreground" />
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleAiSubmit}
                disabled={!aiPrompt.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => { setAiOpen(false); setAiPrompt(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAiOpen(true)}
          className="gap-1.5 px-3 text-muted-foreground"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-medium">{t("builder.floatingTools.ai")}</span>
        </Button>
      )}
    </div>
  );
}
