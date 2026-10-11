"use client";

// The channel workspace's state and its two big pieces, shared by every surface that shows a
// conversation: /manager/channel (./index.tsx) and the /personal walkie
// (components/personal-device/personal-channel.tsx). useChannelController owns what is open,
// the side panel, the dialogs and the confirms, and builds the ChannelWorkspaceValue the parts
// read; ChannelConversation draws the open conversation (header, messages, composer, side
// panel); ChannelOverlays draws the dialogs and confirms.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { usePermissions } from "@/lib/context/permissions";
import { useChatWorkspace } from "@/lib/spacetimedb/hooks/useChatWorkspace";
import { useConversationDot, useDocumentAttended, useMarkConversationRead } from "@/lib/notifications/dots-context";
import { addMembersToConversation } from "@/lib/spacetimedb/actions";
import {
  ACCOUNT_CHAT_WRITES, createChannel, leaveConversation, openDirectConversation, setChannelTopic, type ChatWrites,
} from "@/lib/spacetimedb/actions/chat";
import type { ChatChannel } from "@/lib/chat/model";
import type { ChannelWorkspaceValue, SidePanel } from "@/components/channel/context";
import { ChannelHeader } from "@/components/channel/header";
import { MessageList } from "@/components/channel/message-list";
import { Composer, type ComposerHandle } from "@/components/channel/composer";
import { ThreadPanel } from "@/components/channel/thread-panel";
import { MembersPanel, PinsPanel, SearchPanel } from "@/components/channel/info-panels";
import { AddPeopleDialog, NewChannelDialog, NewDmDialog, TopicDialog } from "@/components/channel/dialogs";
import { ConfirmDialog } from "@/components/channel/confirm-dialog";
import { useFollowControl } from "@/components/channel/follow";

export interface WorkspaceIdentity {
  /** Whose chat this is. */
  hex: string | null;
  /** The connection's own identity (the store machine's account). */
  accountHex: string | null;
  /** A store-machine PIN operator who is not the machine's own account. */
  operatorRole: string | null;
}

type Confirm =
  | { kind: "delete"; conversationId: string; messageId: string }
  | { kind: "leave"; conversationId: string; name: string; last: boolean };

type DialogKind = "dm" | "channel" | "add" | "topic";

export interface ChannelControllerOptions {
  me: WorkspaceIdentity;
  isMobile: boolean;
  /** The conversation open on arrival (the page's `?c=` deep link). */
  initialActiveId?: string | null;
  /** With nothing chosen, show the most recent conversation (the walkie always shows one). */
  openLatest?: boolean;
  /** Whether the open conversation is on screen to be read (false while something covers it). */
  readable?: boolean;
  /** Runs after a conversation is opened (the walkie closes its channel drawer). */
  onOpened?: () => void;
  /** How messages, replies, reactions, edits, deletes and pins are written (a store tablet: OPERATOR_CHAT_WRITES). */
  writes?: ChatWrites;
}

export function useChannelController({
  me, isMobile, initialActiveId = null, openLatest = false, readable = true, onOpened, writes = ACCOUNT_CHAT_WRITES,
}: ChannelControllerOptions) {
  const t = useT();
  const { organizationId, role } = usePermissions();
  const meHex = me.hex;
  const isManagerRole = (r: string | null) => r === "owner" || r === "manager";
  // The lower of the machine account's and the operator's rights: a staff
  // operator on an owner's store machine gets a staff member's chat.
  const canManage = isManagerRole(role) && (me.operatorRole == null || isManagerRole(me.operatorRole));
  // The module emails @everyone only from an owner or manager, never from a staff
  // operator on the store machine (spacetimedb/src/chat/notify.ts): don't offer it there.
  const canMentionEveryone = me.operatorRole == null || isManagerRole(me.operatorRole);
  // A direct message started here would include the shared machine's account
  // as a third member, readable by whoever uses the machine next.
  const canStartDm = me.operatorRole == null;
  // A follow written here would be the machine account's, emailed to its owner.
  const follow = useFollowControl(organizationId ?? null, me.operatorRole == null);
  const { model, people, ready } = useChatWorkspace(organizationId ?? null, meHex);

  const [chosenId, setChosenId] = useState<string | null>(initialActiveId);
  const [panel, setPanel] = useState<SidePanel | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [newSince, setNewSince] = useState<number | null>(null);
  // The payload outlives `confirmOpen`, so the dialog's text holds still while it fades out.
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const askConfirm = useCallback((c: Confirm) => { setConfirm(c); setConfirmOpen(true); }, []);
  const [dialog, setDialog] = useState<{ kind: DialogKind; key: number } | null>(null);

  const channelComposer = useRef<ComposerHandle>(null);
  const threadComposer = useRef<ComposerHandle>(null);
  const lastComposer = useRef<"channel" | "thread">("channel");
  const onOpenedRef = useRef(onOpened);
  useEffect(() => { onOpenedRef.current = onOpened; });

  const chosen = chosenId ? model.channelById.get(chosenId) ?? null : null;
  const active: ChatChannel | null = chosen ?? (openLatest ? model.channels[0] ?? null : null);
  // The store machine changes operator: never leave someone else's conversation open.
  // Keyed on the operator, not on meHex: meHex also changes while the page
  // loads (no identity yet, then store-machine mode and the operator are read),
  // and resetting then would drop a `?c=` deep link. Only a punched-in operator
  // ending or changing resets.
  const operatorKey = me.operatorRole == null ? null : meHex;
  const [lastOperator, setLastOperator] = useState(operatorKey);
  if (lastOperator !== operatorKey) {
    setLastOperator(operatorKey);
    if (lastOperator !== null) {
      setChosenId(null);
      setPanel(null);
      setConfirmOpen(false);
      setDialog(null);
    }
  }

  const nameOf = useCallback((hex: string, isMerchiva?: boolean) =>
    (isMerchiva ? t("chat.mrMerchiva") : people.get(hex)?.name) || t("chat.unknown"), [people, t]);
  const avatarOf = useCallback((hex: string) => people.get(hex)?.avatarUrl ?? null, [people]);

  const run = useCallback(async (write: () => Promise<unknown>) => {
    try {
      await write();
      return true;
    } catch (err) {
      console.error("Channel action failed:", err);
      toast.error(err instanceof Error && err.message ? err.message : t("chat.ws.actionFailed"));
      return false;
    }
  }, [t]);

  const openChannel = useCallback((id: string, focus?: string) => {
    const target = model.channelById.get(id);
    setNewSince(target && target.unread > 0 ? target.readUpTo : null);
    setChosenId(id);
    setPanel((p) => (p?.kind === "search" && p.scope === "all" && focus ? p : null));
    setFocusMessageId(focus ?? null);
    lastComposer.current = "channel";
    onOpenedRef.current?.();
  }, [model]);

  const closeConversation = useCallback(() => { setChosenId(null); setPanel(null); }, []);
  /** Which composer an @mention from a message goes into: the one last focused. */
  const noteComposer = useCallback((which: "channel" | "thread") => { lastComposer.current = which; }, []);
  // Callback refs, so the conversation can hand them to the composers without reading a ref in render.
  const setChannelComposer = useCallback((handle: ComposerHandle | null) => { channelComposer.current = handle; }, []);
  const setThreadComposer = useCallback((handle: ComposerHandle | null) => { threadComposer.current = handle; }, []);

  // Reading the open conversation marks it read (only when something is unread, and only while
  // someone is at the screen: lib/notifications/attention.ts). Its notification dot counts too: a pin or a thread
  // reply notifies without raising `unread`, and markChatRead is what reads those rows (the
  // module's notifyReadConversation). Never for a PIN operator: the write runs as the machine's
  // account and would clear the account's own rows, which the operator never saw.
  const activeId = active?.id ?? null;
  const unreadHere = active ? active.unread + active.mentions : 0;
  const dotHere = useConversationDot(activeId);
  const attended = useDocumentAttended();
  const markConversationRead = useMarkConversationRead();
  useEffect(() => {
    if (!activeId || !readable || me.operatorRole != null || (unreadHere === 0 && !dotHere) || !attended) return;
    markConversationRead(activeId);
  }, [activeId, readable, me.operatorRole, unreadHere, dotHere, attended, markConversationRead]);

  const value = useMemo<ChannelWorkspaceValue>(() => ({
    model, people, meHex: meHex ?? "", accountHex: me.accountHex ?? "", canManage, isMobile, nameOf, avatarOf, openChannel,
    openPanel: (p) => { setPanel(p); if (p?.kind === "thread") lastComposer.current = "thread"; },
    mention: (name) => {
      const target = lastComposer.current === "thread" && panel?.kind === "thread" ? threadComposer.current : channelComposer.current;
      target?.insert(`@${name} `);
    },
    run,
    writes,
    confirmDelete: (conversationId, messageId) => askConfirm({ kind: "delete", conversationId, messageId }),
    focusMessageId,
    follow: follow.available ? follow : null,
  }), [model, people, meHex, me.accountHex, canManage, isMobile, nameOf, avatarOf, openChannel, run, writes, focusMessageId, panel, askConfirm, follow]);

  const openDialog = useCallback((kind: DialogKind) => setDialog({ kind, key: Date.now() }), []);
  // What the empty states suggest: only what this viewer can actually start.
  const startPrompt = canStartDm
    ? (canManage ? t("chat.startDMPrompt") : t("chat.ws.inviteOnlyNote"))
    : (canManage ? t("chat.ws.createChannelPrompt") : t("chat.ws.inviteOnlyNote"));

  return {
    me, organizationId: organizationId ?? null, ready, model, value, active, panel, setPanel, newSince,
    canManage, canMentionEveryone, canStartDm, startPrompt, openChannel, closeConversation,
    openDialog, dialog, setDialog, askConfirm, confirm, confirmOpen, setConfirmOpen,
    setChannelComposer, setThreadComposer, noteComposer,
  };
}

export type ChannelController = ReturnType<typeof useChannelController>;

/**
 * The open conversation: header, messages, composer, and the side panel beside it (over it on
 * the phone). Null while nothing is open.
 */
export function ChannelConversation({ ctl, onBack, headerLeading, renderList, renderComposer, emojiPicker = false, composerClassName, className }: {
  ctl: ChannelController;
  onBack?: () => void;
  /** Leads the header (the walkie's channel-list button). */
  headerLeading?: ReactNode;
  /** Wraps the message list (the walkie's phone layout pages it beside the apps grid). */
  renderList?: (list: ReactNode) => ReactNode;
  /** Wraps the composer (the walkie sets it beside its push-to-talk bar). */
  renderComposer?: (composer: ReactNode) => ReactNode;
  /** An emoji button in the composer (the walkie, whose keyboard is its only text input). */
  emojiPicker?: boolean;
  composerClassName?: string;
  className?: string;
}) {
  const t = useT();
  const {
    active, panel, setPanel, newSince, canManage, canMentionEveryone, value, openDialog, askConfirm, me, model,
    setChannelComposer, setThreadComposer, noteComposer,
  } = ctl;
  if (!active) return null;
  const composer = (
    <Composer
      ref={setChannelComposer}
      key={active.id}
      autoFocus={!value.isMobile}
      emoji={emojiPicker}
      className={composerClassName}
      placeholder={fmt(t("chat.ws.messagePlaceholder"), { name: active.type === "group" ? `#${active.name}` : active.name })}
      memberHexes={active.memberHexes}
      everyone={active.type === "group" && canMentionEveryone}
      onFocus={() => noteComposer("channel")}
      onSubmit={(text, attachment) => value.run(() => value.writes.send(active.id, text, attachment))}
    />
  );
  const list = (
    <MessageList
      channel={active}
      entries={model.messagesOf(active.id)}
      newSince={newSince}
      onAddPeople={canManage && active.type === "group" ? () => openDialog("add") : undefined}
      onEditTopic={canManage && active.type === "group" ? () => openDialog("topic") : undefined}
    />
  );
  return (
    <div className={className ?? "relative flex min-h-0 min-w-0 flex-1"}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChannelHeader
          channel={active}
          panel={panel}
          onBack={onBack}
          leading={headerLeading}
          onEditTopic={() => openDialog("topic")}
          onAddPeople={() => openDialog("add")}
          // Only an owner or manager leaves a channel (staff are taken out by one: the module's
          // leaveConversation). Writes run as the machine's account: "leave" would remove the
          // machine, not the operator.
          onLeave={canManage && me.operatorRole == null
            ? () => askConfirm({ kind: "leave", conversationId: active.id, name: active.name, last: active.memberHexes.length <= 1 })
            : undefined}
        />
        {renderList ? renderList(list) : list}
        {renderComposer ? renderComposer(composer) : composer}
      </div>
      {panel?.kind === "thread" && (
        <ThreadPanel ref={setThreadComposer} channel={active} parentId={panel.parentId} onComposerFocus={() => noteComposer("thread")} />
      )}
      {panel?.kind === "members" && <MembersPanel channel={active} onAddPeople={() => openDialog("add")} onEditTopic={() => openDialog("topic")} />}
      {panel?.kind === "pins" && <PinsPanel channel={active} />}
      {panel?.kind === "search" && (
        <SearchPanel channel={active} query={panel.query} scope={panel.scope} onChange={(query, scope) => setPanel({ kind: "search", query, scope })} />
      )}
    </div>
  );
}

/** The new-DM / new-channel / add-people / topic dialogs and the delete / leave confirms. */
export function ChannelOverlays({ ctl }: { ctl: ChannelController }) {
  const t = useT();
  const { dialog, setDialog, active, organizationId, me, value, openChannel, confirm, confirmOpen, setConfirmOpen } = ctl;
  const { run } = value;
  const meHex = me.hex;
  const closeDialog = (open: boolean) => { if (!open) setDialog(null); };
  if (!organizationId) return null;
  return (
    <>
      {dialog?.kind === "dm" && (
        <NewDmDialog key={dialog.key} open onOpenChange={closeDialog} onPick={(peer) => {
          if (!meHex) return;
          void run(async () => {
            const id = await openDirectConversation(organizationId, meHex, peer);
            setDialog(null);
            if (id) openChannel(id);
          });
        }} />
      )}
      {dialog?.kind === "channel" && (
        <NewChannelDialog key={dialog.key} open onOpenChange={closeDialog} onCreate={async (name, members) => {
          let id: string | null = null;
          // The creator is always in: on a store machine that is the operator, beside the machine account.
          const ok = await run(async () => { id = await createChannel(organizationId, name, meHex ? [meHex, ...members] : members); });
          if (ok && id) openChannel(id);
          return ok;
        }} />
      )}
      {dialog?.kind === "add" && active && (
        <AddPeopleDialog key={dialog.key} open onOpenChange={closeDialog} existing={active.memberHexes}
          onAdd={(members) => run(() => addMembersToConversation(active.id, members))} />
      )}
      {dialog?.kind === "topic" && active && (
        <TopicDialog key={dialog.key} open onOpenChange={closeDialog} initial={active.topic}
          onSave={(topic) => run(() => setChannelTopic(active.id, topic))} />
      )}

      <ConfirmDialog
        open={confirmOpen && confirm?.kind === "delete"}
        onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}
        title={t("chat.ws.deleteConfirmTitle")}
        description={t("chat.ws.deleteConfirmBody")}
        action={t("chat.delete")}
        onConfirm={() => {
          if (confirm?.kind !== "delete") return;
          const { conversationId, messageId } = confirm;
          setConfirmOpen(false);
          void run(() => value.writes.remove(conversationId, messageId));
        }}
      />
      <ConfirmDialog
        open={confirmOpen && confirm?.kind === "leave"}
        onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}
        title={fmt(t("chat.ws.leaveConfirmTitle"), { name: confirm?.kind === "leave" ? confirm.name : "" })}
        description={confirm?.kind === "leave" && confirm.last ? t("chat.ws.leaveLastBody") : t("chat.ws.leaveConfirmBody")}
        action={t("chat.ws.leaveChannel")}
        onConfirm={() => {
          if (confirm?.kind !== "leave") return;
          const { conversationId } = confirm;
          setConfirmOpen(false);
          void run(async () => {
            await leaveConversation(conversationId);
            ctl.closeConversation();
          });
        }}
      />
    </>
  );
}
