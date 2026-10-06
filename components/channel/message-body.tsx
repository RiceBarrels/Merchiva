"use client";

/* eslint-disable @next/next/no-img-element -- user attachments on arbitrary hosts */

import { Fragment, useMemo } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import type { ChatEntry } from "@/lib/chat/model";
import { useChannelWorkspace } from "@/components/channel/context";

const TASK_DONE = "[task:done] ";
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"])/g;

/** Text with clickable links and highlighted `@Name` / `@everyone` mentions. */
export function RichText({ text }: { text: string }) {
  const { people, meHex } = useChannelWorkspace();
  const names = useMemo(() => {
    const list = [...people.values()].map((p) => ({ name: p.name, me: p.hex === meHex })).filter((p) => p.name);
    list.push({ name: "everyone", me: true });
    // Longest first, so "@Ann Lee" wins over "@Ann".
    return list.sort((a, b) => b.name.length - a.name.length);
  }, [people, meHex]);

  const parts: React.ReactNode[] = [];
  text.split(URL_RE).forEach((chunk, i) => {
    if (i % 2 === 1) {
      parts.push(
        <a key={`u${i}`} href={chunk} target="_blank" rel="noopener noreferrer" className="break-all text-foreground underline underline-offset-2 hover:text-foreground/80">
          {chunk}
        </a>,
      );
      return;
    }
    let rest = chunk;
    let k = 0;
    while (rest) {
      const at = rest.indexOf("@");
      if (at < 0) { parts.push(<Fragment key={`t${i}-${k++}`}>{rest}</Fragment>); break; }
      const after = rest.slice(at + 1).toLowerCase();
      const hit = names.find((n) => after.startsWith(n.name.toLowerCase()) && !/[\p{L}\p{N}]/u.test(after.charAt(n.name.length)));
      if (!hit) { parts.push(<Fragment key={`t${i}-${k++}`}>{rest.slice(0, at + 1)}</Fragment>); rest = rest.slice(at + 1); continue; }
      if (at > 0) parts.push(<Fragment key={`t${i}-${k++}`}>{rest.slice(0, at)}</Fragment>);
      const label = rest.slice(at, at + 1 + hit.name.length);
      parts.push(
        <span key={`m${i}-${k++}`} className={cn("rounded-sm px-0.5 font-medium", hit.me ? "bg-foreground/15 text-foreground" : "bg-muted text-foreground")}>
          {label}
        </span>,
      );
      rest = rest.slice(at + 1 + hit.name.length);
    }
  });
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}

function TaskDoneCard({ content }: { content: string }) {
  const lines = content.split("\n");
  const [title, rolePart] = lines[0].slice(TASK_DONE.length).split(" | ");
  const media = lines.slice(1)
    .map((l) => /^\[(image|video)\]\((.+)\)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ type: m[1] as "image" | "video", url: m[2] }));
  return (
    <div className="mt-1 max-w-md rounded-lg border border-border bg-muted/40 p-2.5">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          {rolePart && <p className="mt-0.5 text-xs text-muted-foreground">{rolePart}</p>}
        </div>
      </div>
      {media.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {media.map((m, i) => (
            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block">
              {m.type === "image"
                ? <img src={m.url} alt="" className="h-24 w-24 rounded-lg object-cover hover:opacity-90" />
                : <video src={m.url} className="h-24 w-24 rounded-lg object-cover" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Attachment({ attachment }: { attachment: NonNullable<ChatEntry["attachment"]> }) {
  const t = useT();
  if (attachment.type === "image") {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="mt-1 block w-fit">
        <img src={attachment.url} alt={attachment.name} className="max-h-72 max-w-full rounded-lg border border-border object-cover hover:opacity-95 sm:max-w-sm" />
      </a>
    );
  }
  if (attachment.type === "video") {
    return <video src={attachment.url} controls className="mt-1 max-h-72 max-w-full rounded-lg border border-border sm:max-w-sm" />;
  }
  if (attachment.type === "audio") {
    return <audio src={attachment.url} controls className="mt-1 max-w-full" />;
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.name || t("chat.fileFallback")}</span>
    </a>
  );
}

/** The quoted message an older reply points at (replies are threads now). */
function Quote({ id }: { id: string }) {
  const { model, nameOf } = useChannelWorkspace();
  const quoted = model.entryById.get(id);
  if (!quoted) return null;
  return (
    <div className="mb-1 border-s-2 border-border ps-2">
      <p className="text-xs font-medium text-muted-foreground">{nameOf(quoted.senderHex, quoted.isMerchiva)}</p>
      <p className="truncate text-xs text-muted-foreground">{quoted.content}</p>
    </div>
  );
}

export function MessageBody({ entry }: { entry: ChatEntry }) {
  const t = useT();
  if (entry.deleted) {
    return <p className="text-sm italic text-muted-foreground">{t("chat.ws.deletedMessage")}</p>;
  }
  const isTask = entry.content.startsWith(TASK_DONE);
  return (
    <div className="text-sm leading-relaxed text-foreground">
      {entry.replyToId && <Quote id={entry.replyToId} />}
      {isTask ? <TaskDoneCard content={entry.content} /> : entry.content && (
        <>
          <RichText text={entry.content} />
          {entry.editedAt != null && <span className="ms-1 text-[11px] text-muted-foreground">{t("chat.ws.edited")}</span>}
        </>
      )}
      {entry.attachment && <Attachment attachment={entry.attachment} />}
    </div>
  );
}
