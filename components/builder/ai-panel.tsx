"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "@craftjs/core";
import { Check, Send, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/context/permissions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function serializePageElements(query: ReturnType<typeof useEditor>["query"]): string {
  try {
    const nodes = query.getSerializedNodes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: { name: string; type: string; props: any }[] = [];
    for (const [id, node] of Object.entries(nodes)) {
      if (id === "ROOT") continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = node as any;
      const name = String(n.custom?.displayName || n.displayName || (n.type?.resolvedName ? n.type.resolvedName.replace("Craft", "") : "Element"));
      const type = n.type?.resolvedName ? n.type.resolvedName.replace("Craft", "").toLowerCase() : "unknown";
      elements.push({ name, type, props: n.props || {} });
    }
    return JSON.stringify(elements, null, 2);
  } catch {
    return "[]";
  }
}

interface AiPanelProps {
  siteName?: string;
  siteId?: string;
  siteTheme?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string; headingFont?: string; bodyFont?: string };
}

export function AiPanel({ siteName, siteId, siteTheme }: AiPanelProps = {}) {
  const { query } = useEditor();
  const { organizationId } = usePermissions();
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!siteId || typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(`flowfn:chat:${siteId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist chat to localStorage (keyed by siteId)
  useEffect(() => {
    if (siteId && messages.length > 0) {
      localStorage.setItem(`flowfn:chat:${siteId}`, JSON.stringify(messages.slice(-50)));
    }
  }, [messages, siteId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const pageElements = serializePageElements(query);
      const siteContext = [
        siteName ? `Store/Site name: "${siteName}"` : null,
        siteTheme ? `Theme: ${JSON.stringify(siteTheme)}` : null,
        `Current page elements:\n${pageElements}`,
      ].filter(Boolean).join("\n");

      const contextMsg: Message = {
        role: "user",
        content: `[Site context]\n${siteContext}`,
      };
      const messagesWithContext = [contextMsg, ...newMessages];

      const res = await fetch("/api/builder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesWithContext, siteName, siteTheme, organizationId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessages([...newMessages, { role: "assistant", content: `Error: ${data.error || res.statusText}` }]);
        return;
      }

      const content = data.content || "(No response)";
      setMessages([...newMessages, { role: "assistant", content }]);
      // Auto-apply any action in the response
      if (content.includes("```json")) {
        applyAction(content);
      }
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function applyAction(content: string) {
    const match = content.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (!match) return;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.action === "add" && parsed.elements) {
        window.dispatchEvent(new CustomEvent("flowfn:ai-generate", { detail: parsed.elements }));
      } else if (parsed.action === "delete" && parsed.targets) {
        window.dispatchEvent(new CustomEvent("flowfn:ai-delete", { detail: parsed.targets }));
      } else if (parsed.action === "add-function" && parsed.function) {
        window.dispatchEvent(new CustomEvent("flowfn:ai-add-function", { detail: parsed.function }));
      } else if (parsed.elements) {
        window.dispatchEvent(new CustomEvent("flowfn:ai-generate", { detail: parsed.elements }));
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-foreground" />
          <span className="text-xs font-medium">AI Assistant</span>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => { setMessages([]); if (siteId) localStorage.removeItem(`flowfn:chat:${siteId}`); }}
            title="Clear chat"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 && (
          <EmptyState
            compact
            icon={Sparkles}
            className="h-full"
            description="Ask me to generate sections, suggest designs, or explain features."
          >
            <div className="flex flex-wrap justify-center gap-1">
              {["Add a hero section", "Create a pricing table", "Make a contact form"].map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="xs"
                  className="text-[10px] text-muted-foreground"
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                >
                  {q}
                </Button>
              ))}
            </div>
          </EmptyState>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              <div className="whitespace-pre-wrap break-words">
                {msg.content.includes("```json")
                  ? msg.content.replace(/```json\s*\n?[\s\S]*?\n?\s*```/g, "").trim() || msg.content
                  : msg.content
                }
              </div>
              {msg.role === "assistant" && msg.content.includes("```json") && (
                <div className="mt-1 flex items-center gap-1 text-[10px]">
                  <StatusBadge tone="success" size="xs">
                    <Check className="h-2.5 w-2.5" />
                    Applied
                  </StatusBadge>
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto p-0 text-[10px] text-muted-foreground underline hover:text-foreground"
                    onClick={() => applyAction(msg.content)}
                  >
                    redo
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-2.5 py-1.5">
              <Spinner size={12} className="text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5">
          <Textarea
            ref={inputRef}
            className="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-0 text-[11px] text-foreground focus-visible:ring-0 md:text-[11px] dark:bg-transparent"
            placeholder="Ask AI..."
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            disabled={loading}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
