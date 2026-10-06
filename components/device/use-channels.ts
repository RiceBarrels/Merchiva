"use client";

// Live chat data for the walkie-talkie surfaces, scoped to one user
// (the signed-in account, or the store-device operator's userId).

import { useCallback, useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { sendMessage } from "@/lib/spacetimedb/actions";
import { uploadChatFile } from "@/lib/db/chat";
import { useT } from "@/lib/i18n/context";
import { initialsOf } from "./time";
import type { Channel, ChannelMessage, PttResult } from "./types";

export interface UseChannelsOptions {
  organizationId: string;
  /** Identity hex string of the user acting on this device (signed-in user,
   *  or the store-device operator's userId). null → nothing loads. */
  meUserId: string | null;
  /** BCP-47-ish locale for STT (en, zh-cn, ...). */
  locale: string;
}

export interface UseChannelsResult {
  channels: Channel[];
  activeIndex: number;
  activeChannel: Channel | null;
  setActiveIndex: (i: number) => void;
  next: () => void;
  prev: () => void;
  messages: ChannelMessage[];    // active channel, oldest → newest
  ready: boolean;
  /** Transcribe (+ AI summary) or upload the original, then send to the
   *  active channel. Resolves with a short status string for a toast. */
  sendVoice: (result: PttResult) => Promise<string>;
  sendText: (text: string) => Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function idHex(v: any): string {
  if (!v) return "";
  if (typeof v.toHexString === "function") return v.toHexString();
  return v.toString();
}

function toDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.microsSinceUnixEpoch === "bigint") return new Date(Number(v.microsSinceUnixEpoch / 1000n));
  return new Date(v);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface TranscribeResponse {
  transcript?: string;
  summary?: string;
  error?: string;
}

export function useChannels(opts: UseChannelsOptions): UseChannelsResult {
  const { organizationId, meUserId, locale } = opts;
  const t = useT();
  const [convRows, convReady] = useTable(tables.chatConversation);
  const [memberRows, membersReady] = useTable(tables.chatMember);
  const [messageRows, messagesReady] = useTable(tables.chatMessage);
  const [orgMemberRows, orgReady] = useTable(tables.orgMember);
  // Thread replies and deleted thread parents (spacetimedb/src/chat/tables.ts)
  // belong to the full channel page; the walkie list shows the main flow only.
  const [extRows] = useTable(tables.chatMessageExt);
  const [activeIndexState, setActiveIndexState] = useState(0);

  const hiddenIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of extRows) if (e.threadParentId || e.deletedAt != null) set.add(e.messageId);
    return set;
  }, [extRows]);

  // userId hex → display name within this org.
  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of orgMemberRows) {
      if (m.organizationId !== organizationId) continue;
      map.set(idHex(m.userId), m.displayName);
    }
    return map;
  }, [orgMemberRows, organizationId]);

  const lastMsgAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of messageRows) {
      const ms = toDate(r.createdAt).getTime();
      const cur = map.get(r.conversationId) ?? 0;
      if (ms > cur) map.set(r.conversationId, ms);
    }
    return map;
  }, [messageRows]);

  const channels = useMemo<Channel[]>(() => {
    if (!meUserId) return [];
    const membersByConv = new Map<string, string[]>();
    for (const m of memberRows) {
      const list = membersByConv.get(m.conversationId) ?? [];
      list.push(idHex(m.userId));
      membersByConv.set(m.conversationId, list);
    }
    const out: Channel[] = [];
    for (const c of convRows) {
      if (c.organizationId !== organizationId) continue;
      const id = c.id.toString();
      const members = membersByConv.get(id) ?? [];
      if (!members.includes(meUserId)) continue;
      const type: Channel["type"] = c.type === "direct" ? "direct" : "group";
      let name = c.name ?? "";
      if (type === "direct" || !name) {
        const other = members.find((u) => u !== meUserId);
        name = (other && nameByUser.get(other)) || name || t("device.channelFallback");
      }
      out.push({ id, name, type, memberCount: members.length });
    }
    out.sort((a, b) => {
      const ta = lastMsgAt.get(a.id) ?? 0;
      const tb = lastMsgAt.get(b.id) ?? 0;
      return tb - ta;
    });
    return out;
  }, [convRows, memberRows, organizationId, meUserId, nameByUser, lastMsgAt, t]);

  // Clamp instead of syncing state: the stored index may be stale after the
  // channel list shrinks.
  const activeIndex = channels.length ? Math.min(activeIndexState, channels.length - 1) : 0;
  const activeChannel = channels[activeIndex] ?? null;

  const messages = useMemo<ChannelMessage[]>(() => {
    if (!activeChannel) return [];
    const rows = messageRows.filter((r) => r.conversationId === activeChannel.id && !hiddenIds.has(r.id.toString()));
    const mapped = rows.map<ChannelMessage>((r) => {
      const senderId = idHex(r.senderId);
      const isMerchiva = r.isMerchiva === true;
      const senderName = isMerchiva
        ? t("device.merchivaName")
        : nameByUser.get(senderId) ?? t("device.unknownSender");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = ((r as any).voiceTranscript as string | null | undefined) ?? null;
      return {
        id: r.id.toString(),
        conversationId: r.conversationId,
        senderId,
        senderName,
        senderInitials: isMerchiva ? "M" : initialsOf(senderName),
        isMe: !!meUserId && senderId === meUserId,
        isMerchiva,
        content: r.content,
        voiceTranscript: transcript,
        attachmentUrl: r.attachmentUrl ?? null,
        attachmentType: r.attachmentType ?? null,
        attachmentName: r.attachmentName ?? null,
        createdAt: toDate(r.createdAt),
      };
    });
    mapped.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return mapped;
  }, [messageRows, activeChannel, nameByUser, meUserId, t, hiddenIds]);

  const setActiveIndex = useCallback((i: number) => {
    setActiveIndexState((prev) => {
      if (channels.length === 0) return 0;
      const n = ((i % channels.length) + channels.length) % channels.length;
      return n === prev ? prev : n;
    });
  }, [channels.length]);

  const next = useCallback(() => setActiveIndex(activeIndex + 1), [activeIndex, setActiveIndex]);
  const prev = useCallback(() => setActiveIndex(activeIndex - 1), [activeIndex, setActiveIndex]);

  const uploadVoice = useCallback(async (blob: Blob) => {
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
    const res = await uploadChatFile(file);
    return { url: res.url, type: "audio", name: res.name };
  }, []);

  const sendVoice = useCallback(async (result: PttResult): Promise<string> => {
    if (result.mode === "delete" || !result.blob) return t("device.toastDeleted");
    if (!activeChannel) return t("device.toastNoChannel");
    const channelName = activeChannel.name;

    if (result.mode === "original") {
      const attachment = await uploadVoice(result.blob);
      await sendMessage(activeChannel.id, "", undefined, attachment, null);
      return t("device.toastOriginalSent");
    }

    // "summary": transcribe + summarize, upload the original in parallel.
    const fd = new FormData();
    fd.append("audio", result.blob, "voice.webm");
    fd.append("lang", locale);
    const uploadPromise = uploadVoice(result.blob).catch(() => null);
    const res = await fetch("/api/walkie/transcribe", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as TranscribeResponse;
    if (!res.ok) throw new Error(data.error || t("device.toastTranscribeFailed"));
    const transcript = (data.transcript ?? "").trim();
    const summary = (data.summary ?? "").trim() || transcript;
    if (!transcript) return t("device.toastNothingHeard");
    const attachment = await uploadPromise;
    await sendMessage(activeChannel.id, summary, undefined, attachment, transcript);
    return `${t("device.toastSummarySent")} ${channelName}`;
  }, [activeChannel, locale, t, uploadVoice]);

  const sendText = useCallback(async (text: string) => {
    if (!activeChannel || !text.trim()) return;
    await sendMessage(activeChannel.id, text.trim());
  }, [activeChannel]);

  return {
    channels,
    activeIndex,
    activeChannel,
    setActiveIndex,
    next,
    prev,
    messages,
    ready: convReady && membersReady && messagesReady && orgReady,
    sendVoice,
    sendText,
  };
}
