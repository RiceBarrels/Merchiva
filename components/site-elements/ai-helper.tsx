"use client";

import { useState, useRef, useEffect } from "react";
import { hapticLight } from "@/lib/haptics";
import type { SiteTheme } from "@/lib/types";

const PROMPTS = [
  "Write a catchy tagline for my business",
  "Write a welcome message for the homepage",
  "Write an About Us paragraph",
  "Write a short product description",
  "Write a seasonal promotion announcement",
];

interface Props {
  theme: SiteTheme;
  businessName?: string;
}

export function AiHelper({ theme, businessName = "our business" }: Props) {
  const r = theme.borderRadius;
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const generate = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `${text}. Business name: ${businessName}. Keep it concise and professional, 1–3 sentences max.`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { reply?: string; message?: string };
      setResult(data.reply ?? data.message ?? "No response received.");
    } catch {
      setResult("Sorry, couldn't generate text right now. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).catch(() => {});
    hapticLight();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200 }} ref={panelRef}>
      {/* Panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 56,
            right: 0,
            width: 300,
            background: theme.background,
            border: `1px solid ${theme.secondary}30`,
            borderRadius: r,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            padding: "16px",
            fontFamily: theme.bodyFont,
            color: theme.text,
          }}
        >
          <p style={{ fontFamily: theme.headingFont, fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>
            ✨ AI Text Generator
          </p>

          {/* Quick prompts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => { setPrompt(p); generate(p); }}
                style={{
                  textAlign: "left",
                  background: `${theme.accent}10`,
                  border: `1px solid ${theme.accent}20`,
                  borderRadius: r,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: theme.text,
                  fontFamily: theme.bodyFont,
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate(prompt)}
              placeholder="Custom prompt…"
              style={{
                flex: 1,
                background: theme.background,
                border: `1px solid ${theme.secondary}40`,
                borderRadius: r,
                padding: "7px 9px",
                fontSize: 13,
                color: theme.text,
                fontFamily: theme.bodyFont,
                outline: "none",
              }}
            />
            <button
              onClick={() => generate(prompt)}
              disabled={loading || !prompt.trim()}
              style={{
                background: theme.accent,
                color: "#fff",
                border: "none",
                borderRadius: r,
                padding: "0 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "…" : "Go"}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  background: `${theme.accent}08`,
                  border: `1px solid ${theme.accent}25`,
                  borderRadius: r,
                  padding: "10px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: theme.text,
                }}
              >
                {result}
              </div>
              <button
                onClick={handleCopy}
                style={{
                  marginTop: 6,
                  background: "none",
                  border: "none",
                  color: copied ? theme.accent : theme.secondary,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: theme.bodyFont,
                  padding: 0,
                }}
              >
                {copied ? "✓ Copied!" : "Copy text"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => { hapticLight(); setOpen((o) => !o); }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: theme.accent,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        }}
        title="AI text helper"
      >
        ✨
      </button>
    </div>
  );
}
