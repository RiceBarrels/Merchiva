"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor } from "@craftjs/core";
import { Type, Image, LayoutDashboard, Sparkles, Send, X, Loader2 } from "lucide-react";
import { CraftText } from "./craft-components/craft-text";
import { CraftImage } from "./craft-components/craft-image";
import { CraftLayout } from "./craft-components/craft-layout";
import React from "react";

export function ToolBar() {
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

  const handleAiSubmit = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
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

      {/* Divider */}
      <div className="mx-0.5 h-6 w-px bg-border" />

      {/* AI Generate */}
      {aiOpen ? (
        <div className="flex items-center gap-1 rounded-[0.3rem] bg-accent/50 px-2 py-1">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
          <input
            ref={inputRef}
            className="w-48 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Describe what to generate..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAiSubmit();
              if (e.key === "Escape") { setAiOpen(false); setAiPrompt(""); }
            }}
            disabled={aiLoading}
          />
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-violet-500 hover:bg-violet-500/10 disabled:opacity-30"
                onClick={handleAiSubmit}
                disabled={!aiPrompt.trim()}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onClick={() => { setAiOpen(false); setAiPrompt(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={() => setAiOpen(true)}
          className="flex items-center gap-1.5 rounded-[0.3rem] px-3 py-1.5 text-violet-500 transition-colors hover:bg-violet-500/10"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-medium">AI</span>
        </button>
      )}
    </div>
  );
}
