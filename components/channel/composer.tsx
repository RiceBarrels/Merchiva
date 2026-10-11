"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUp, AtSign, Paperclip, Smile, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/loaders/geometric";
import { uploadChatFile } from "@/lib/chat/upload";
import { usePermissions } from "@/lib/context/permissions";
import { appUploadErrorKeyOr } from "@/lib/storage/app-upload";
import { useChannelWorkspace } from "@/components/channel/context";
import { EmojiGrid } from "@/components/channel/message-actions";

export interface ComposerHandle {
  insert: (text: string) => void;
  focus: () => void;
}

export type Attachment = { url: string; type: string; name: string };

interface ComposerProps {
  placeholder: string;
  /** Identity hexes offered in the @ picker. */
  memberHexes: string[];
  /** Offer @everyone (group channels). */
  everyone: boolean;
  /** Resolves true once sent; the text is cleared only then. */
  onSubmit: (text: string, attachment: Attachment | null) => Promise<boolean>;
  onFocus?: () => void;
  autoFocus?: boolean;
  /** An emoji button that inserts at the caret (where the phone keyboard is the only other way in). */
  emoji?: boolean;
  className?: string;
}

/** The `@query` being typed at the caret, if the caret sits right after one. */
function mentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > 30 || /\n/.test(query) || /\s\s/.test(query)) return null;
  return { start: at, query };
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { placeholder, memberHexes, everyone, onSubmit, onFocus, autoFocus, emoji = false, className },
  ref,
) {
  const t = useT();
  const { people, meHex, isMobile, nameOf, avatarOf } = useChannelWorkspace();
  const { organizationId } = usePermissions();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const insertAt = (start: number, end: number, value: string) => {
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  useImperativeHandle(ref, () => ({
    insert: (value) => {
      const el = input.current;
      const caret = el?.selectionStart ?? text.length;
      const pad = caret > 0 && !/\s/.test(text[caret - 1] ?? " ") ? " " : "";
      insertAt(caret, caret, `${pad}${value}`);
    },
    focus: () => input.current?.focus(),
  }));

  const options = useMemo(() => {
    if (!picker) return [];
    const q = picker.query.toLowerCase();
    const list: { key: string; label: string; hex: string | null }[] = [];
    if (everyone && ("everyone".includes(q) || t("chat.everyone").toLowerCase().includes(q))) list.push({ key: "everyone", label: "everyone", hex: null });
    for (const hex of memberHexes) {
      if (hex === meHex) continue;
      const name = people.get(hex)?.name;
      if (name && name.toLowerCase().includes(q)) list.push({ key: hex, label: name, hex });
    }
    return list.slice(0, 8);
  }, [picker, memberHexes, meHex, people, everyone, t]);

  const choose = (label: string) => {
    if (!picker) return;
    const caret = input.current?.selectionStart ?? text.length;
    insertAt(picker.start, caret, `@${label} `);
    setPicker(null);
  };

  const submit = async (attachment: Attachment | null = null) => {
    const value = text.trim();
    if ((!value && !attachment) || busy) return;
    setBusy(true);
    try {
      const fallback = attachment
        ? attachment.type === "image" ? t("chat.sentPhoto") : attachment.type === "video" ? t("chat.sentVideo") : t("chat.sentFile")
        : "";
      if (await onSubmit(value || fallback, attachment)) setText("");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !organizationId) return;
    setBusy(true);
    let attachment: Attachment | null = null;
    try {
      attachment = await uploadChatFile(file, organizationId);
    } catch (err) {
      console.error("Chat upload failed:", err);
      toast.error(t(appUploadErrorKeyOr(err, "chat.ws.uploadFailed")));
    } finally {
      setBusy(false);
    }
    if (attachment) await submit(attachment);
  };

  return (
    <div className={cn("px-4 pb-[max(env(safe-area-inset-bottom,0px),12px)] pt-1", className)}>
      <div ref={wrap} className="rounded-lg border border-border bg-background transition-colors focus-within:border-ring">
        <textarea
          ref={input}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          placeholder={placeholder}
          onFocus={onFocus}
          onChange={(e) => {
            setText(e.target.value);
            const q = mentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
            setPicker(q);
            setPick(0);
          }}
          onKeyDown={(e) => {
            if (picker && options.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % options.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + options.length) % options.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[Math.min(pick, options.length - 1)].label); return; }
            }
            if (e.key === "Escape" && picker) { e.preventDefault(); setPicker(null); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile) {
              e.preventDefault();
              void submit();
            }
          }}
          className="block max-h-48 min-h-10 w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-[1.5] outline-none [field-sizing:content] placeholder:text-muted-foreground/70"
          autoComplete="off"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted" title={t("chat.attach")} aria-label={t("chat.attach")}>
            <Paperclip className="h-4 w-4" />
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={onFile} disabled={busy} />
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title={t("chat.mention")}
            aria-label={t("chat.mention")}
            onClick={() => {
              const caret = input.current?.selectionStart ?? text.length;
              const pad = caret > 0 && !/\s/.test(text[caret - 1] ?? " ") ? " " : "";
              insertAt(caret, caret, `${pad}@`);
              setPicker({ start: caret + pad.length, query: "" });
            }}
          >
            <AtSign />
          </Button>
          {emoji && (
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" title={t("chat.emoji")} aria-label={t("chat.emoji")} />}
              >
                <Smile />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-auto p-1.5" initialFocus={false}>
                <EmojiGrid
                  onPick={(e) => {
                    setEmojiOpen(false);
                    const caret = input.current?.selectionStart ?? text.length;
                    const end = input.current?.selectionEnd ?? caret;
                    insertAt(caret, end, e);
                  }}
                />
              </PopoverContent>
            </Popover>
          )}
          {!isMobile && <span className="ms-auto me-2 hidden text-[11px] text-muted-foreground md:inline">{t("chat.ws.sendHint")}</span>}
          <Button
            size="icon-sm"
            className={cn(isMobile && "ms-auto")}
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            aria-label={t("chat.send")}
            title={t("chat.send")}
          >
            {busy ? <Spinner size={14} /> : <ArrowUp />}
          </Button>
        </div>
      </div>

      <Popover open={!!picker && options.length > 0} onOpenChange={(o) => { if (!o) setPicker(null); }}>
        <PopoverContent anchor={wrap} side="top" align="start" sideOffset={6} className="w-72 p-1" initialFocus={false}>
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-muted-foreground">{t("chat.selectMention")}</p>
          {options.map((o, i) => (
            <button
              key={o.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.label)}
              onMouseEnter={() => setPick(i)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm", i === pick ? "bg-muted" : "hover:bg-muted")}
            >
              {o.hex
                ? <Avatar name={nameOf(o.hex)} src={avatarOf(o.hex)} size="sm" shape="square" />
                : <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-muted"><Users className="h-3.5 w-3.5 text-muted-foreground" /></span>}
              <span className="min-w-0 flex-1 truncate font-medium">{o.hex ? o.label : `@${t("chat.everyone")}`}</span>
              {!o.hex && <span className="text-[11px] text-muted-foreground">{t("chat.notifyAll")}</span>}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
});
