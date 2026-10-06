"use client";

import { useMemo } from "react";
import { channelPageContext } from "@/lib/merchiva/workspace-page-context";
import { useMerchivaPageContext } from "@/lib/merchiva/page-context";

/** Tells Mr. Merchiva what Channel shows: how many conversations and the one that is open. */
export function useChannelPageContext(s: {
  conversations: number;
  open: { id: string; type: "direct" | "group"; members: number } | null;
  /** The open conversation's name as the page shows it (a group's name, or the other person's). */
  openName: string | null;
}): void {
  const { conversations, open } = s;
  const id = open?.id ?? null;
  const type = open?.type ?? null;
  const members = open?.members ?? 0;
  const name = s.openName ?? "";
  const context = useMemo(
    () => channelPageContext({ conversations, open: id && type ? { id, name, type, members } : null }),
    [conversations, id, name, type, members],
  );
  useMerchivaPageContext(context);
}
