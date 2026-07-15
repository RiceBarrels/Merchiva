"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { prettyPrintHtml } from "@/lib/builder/html-format";
import { Spinner } from "@/components/ui/loaders/geometric";
import { useT } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";

// One conversation turn shown in the chat. `applied` is set true once the
// returned action has been dispatched to the canvas — used to dim the bubble
// if the user has since changed the HTML by hand.
export interface DesignChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  applied?: boolean;
  /** Action returned by the server, useful for showing a "what changed" hint. */
  action?: { action: string; selector?: string } | null;
  /** Filled in when the request fails so we can render an error bubble. */
  error?: string;
}

interface DesignMerchivaChatProps {
  designId: string;
  designName: string;
  width: number;
  height: number;
  /** Current canvas HTML — passed to the server each turn so the AI sees latest. */
  getHtml: () => string;
  /** Apply a server-returned action to the canvas. */
  onApply: (action: { action: string; html?: string; selector?: string }) => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Permission gate: mirrors the main chat — members with `merchiva.view`
 *  disabled can't use the design assistant either. Owners always pass. */
export function DesignMerchivaChat(props: DesignMerchivaChatProps) {
  const { isOwner, can } = usePermissions();
  const t = useT();
  if (!(isOwner || can("merchiva", "view"))) {
    return (
      <div className="flex-1 h-full flex items-center justify-center p-6 text-center bg-background">
        <p className="text-[12.5px] text-muted-foreground max-w-[280px] leading-relaxed">
          {t("merchiva.noAccess")}
        </p>
      </div>
    );
  }
  return <DesignMerchivaChatInner {...props} />;
}

function DesignMerchivaChatInner({
  designId,
  designName,
  width,
  height,
  getHtml,
  onApply,
}: DesignMerchivaChatProps) {
  const t = useT();
  const { organizationId } = usePermissions();
  const storageKey = `merchiva_design_chat_${designId}`;

  const [messages, setMessages] = useState<DesignChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restore from localStorage on mount / when design switches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
      else setMessages([]);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  // Persist on change (capped at 50 turns to keep storage small).
  useEffect(() => {
    try {
      const trimmed = messages.slice(-50);
      localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {}
  }, [messages, storageKey]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;
    const userMsg: DesignChatMessage = { id: uid(), role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/design/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send only role/content to the server. Strip ids and metadata.
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          organizationId,
          width,
          height,
          designName,
          currentHtml: getHtml(),
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = typeof data.reply === "string" ? data.reply : "";
      const action = data.action && typeof data.action === "object" ? data.action : null;

      // Apply the action to the canvas before recording the message so the
      // "applied" flag reflects what actually happened.
      let applied = false;
      if (action?.action && typeof action.action === "string") {
        try {
          // Pretty-print HTML in actions before dispatching so the
          // canvas stays consistently formatted.
          const safeAction: { action: string; html?: string; selector?: string } = {
            action: action.action,
          };
          if (typeof action.selector === "string") safeAction.selector = action.selector;
          if (typeof action.html === "string") safeAction.html = prettyPrintHtml(action.html);
          onApply(safeAction);
          applied = true;
        } catch (err) {
          console.error("[design chat] onApply failed:", err);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: reply,
          action: action ? { action: action.action, selector: action.selector } : null,
          applied,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: "", error: msg },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, sending, messages, width, height, designName, getHtml, onApply]);

  const clearConversation = useCallback(() => {
    if (messages.length === 0) return;
    if (!confirm(t("design.chat.confirmClear"))) return;
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [messages.length, storageKey, t]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <div className="h-6 w-6 rounded-[0.3rem] bg-foreground text-background flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate">Mr. Merchiva</div>
          <div className="text-[10.5px] text-muted-foreground font-mono truncate">
            {width} × {height}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearConversation}
            title={t("design.chat.clearTitle")}
            className="h-6 w-6 rounded-[0.3rem] text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center justify-center"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !sending && (
          <div className="text-[11.5px] text-muted-foreground italic px-1 leading-relaxed">
            {t("design.chat.intro")}
            <ul className="mt-1.5 ml-3 list-disc text-muted-foreground/80 space-y-0.5">
              <li>{t("design.chat.example1")}</li>
              <li>{t("design.chat.example2")}</li>
              <li>{t("design.chat.example3")}</li>
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {sending && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
            <Spinner size={12} />
            <span>{t("design.chat.thinking")}</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-2 shrink-0">
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !sending && draft.trim()) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("design.chat.placeholder")}
            rows={2}
            disabled={sending}
            className="flex-1 resize-none rounded-[0.3rem] border border-border bg-background px-2 py-1.5 text-[12.5px] outline-none focus:ring-1 focus:ring-ring min-h-[44px] max-h-[120px]"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="h-[44px] w-9 rounded-[0.3rem] bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 inline-flex items-center justify-center shrink-0"
            title={t("design.chat.sendTitle")}
          >
            {sending ? <Spinner size={16} /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 ml-1">
          {t("design.chat.sendHint")}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: DesignChatMessage }) {
  const t = useT();
  const canvasUpdatedLabel = t("design.chat.canvasUpdated");
  const emptyReplyLabel = t("design.chat.emptyReply");
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[0.3rem] bg-foreground text-background px-2.5 py-1.5 text-[12px] whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.error) {
    return (
      <div className="rounded-[0.3rem] border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] text-destructive">
        {msg.error}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "max-w-[92%] rounded-[0.3rem] border border-border bg-muted/30 px-2.5 py-1.5 text-[12px] whitespace-pre-wrap break-words",
          !msg.applied && msg.action && "opacity-60",
        )}
      >
        {msg.content || (msg.action ? canvasUpdatedLabel : emptyReplyLabel)}
      </div>
      {msg.action && (
        <div className="text-[10px] font-mono text-muted-foreground ml-1">
          {msg.applied ? "✓" : "•"} {msg.action.action}
          {msg.action.selector ? ` · ${msg.action.selector}` : ""}
        </div>
      )}
    </div>
  );
}
