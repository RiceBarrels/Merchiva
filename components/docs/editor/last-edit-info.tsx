"use client";

/** "Last edit by {name} {time}" (docs-editor-ui spec §4.5); refreshes every minute, opens version history. */
import { useSyncExternalStore } from "react";

import { formatRelativeTime } from "@/lib/docs/format";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDocEditor } from "./doc-editor-context";

const MINUTE = 60_000;

function subscribeMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, MINUTE / 2);
  return () => window.clearInterval(id);
}
const getMinute = () => Math.floor(Date.now() / MINUTE);
const getServerMinute = () => 0;

export function LastEditInfo() {
  const t = useT();
  const { doc, memberName, memberId, actions, locale } = useDocEditor();
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute);
  if (!minute) return null;

  const time = formatRelativeTime(doc.updatedAt, locale, minute * MINUTE);
  const editorId = doc.lastEditorMemberId;
  const name = editorId && editorId !== memberId ? memberName(editorId) : null;
  const text = name ? fmt(t("docs.status.lastEditBy"), { name, time }) : fmt(t("docs.status.lastEdit"), { time });

  return (
    <button
      type="button"
      onClick={actions.showVersionHistory}
      className="hidden max-w-[26ch] truncate rounded text-[11.5px] text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 xl:block"
    >
      {text}
    </button>
  );
}
