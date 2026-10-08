"use client";

// /manager/channel: a team chat laid out like Slack. Sidebar of starred,
// channel and direct-message sections with unread / mention badges; the open
// conversation with threads, reactions, edits and pins; a right-hand column
// for a thread, the members, the pins or search. On the phone the sidebar is
// the screen and a conversation opens as a full-screen sheet over it.
//
// Group channels are invite-only: owners and managers create them and add
// people (the module enforces it — spacetimedb/src/chat/reducers.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { usePermissions } from "@/lib/context/permissions";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useCurrentOperator } from "@/lib/store-device-lock";
import { useChatWorkspace } from "@/lib/spacetimedb/hooks/useChatWorkspace";
import { addMembersToConversation, deleteMessage, sendMessage } from "@/lib/spacetimedb/actions";
import {
  createChannel, leaveConversation, markChatRead, openDirectConversation, setChannelTopic,
} from "@/lib/spacetimedb/actions/chat";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { useChannelPageContext } from "@/app/manager/channel/use-channel-page-context";
import { ChannelWorkspaceProvider, type ChannelWorkspaceValue, type SidePanel } from "@/components/channel/context";
import { ChannelSidebar } from "@/components/channel/sidebar";
import { ChannelHeader } from "@/components/channel/header";
import { MessageList } from "@/components/channel/message-list";
import { Composer, type ComposerHandle } from "@/components/channel/composer";
import { ThreadPanel } from "@/components/channel/thread-panel";
import { MembersPanel, PinsPanel, SearchPanel } from "@/components/channel/info-panels";
import { AddPeopleDialog, NewChannelDialog, NewDmDialog, TopicDialog } from "@/components/channel/dialogs";
import { ConfirmDialog } from "@/components/channel/confirm-dialog";

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

interface Me {
  /** Whose chat this is. */
  hex: string | null;
  /** The connection's own identity (the store machine's account). */
  accountHex: string | null;
  /** A store-machine PIN operator who is not the machine's own account. */
  operatorRole: string | null;
}

/**
 * Whose chat this is: the signed-in identity, or on a shared store machine
 * the punched-in operator's (their org_member.userId), so each person sees
 * their own conversations. Every write still runs as the machine's account:
 * the operator only narrows what the page shows and offers.
 */
function useMe(): Me {
  const stdb = useSpacetimeDB();
  const [storeMachine] = useStoreMachineMode();
  const operator = useCurrentOperator();
  const [memberRows] = useTable(tables.orgMember);
  const operatorMemberId = operator?.memberId ?? null;
  const identity = stdb?.identity ?? null;
  return useMemo(() => {
    const own = identity ? identity.toHexString() : null;
    if (storeMachine && operatorMemberId) {
      const row = (memberRows as unknown as Array<{ id: { toString(): string }; userId: { toHexString(): string }; role: string }>)
        .find((m) => m.id.toString() === operatorMemberId);
      const hex = row?.userId.toHexString();
      if (row && hex && hex !== own) return { hex, accountHex: own, operatorRole: row.role };
    }
    return { hex: own, accountHex: own, operatorRole: null };
  }, [storeMachine, operatorMemberId, memberRows, identity]);
}

type Confirm =
  | { kind: "delete"; conversationId: string; messageId: string }
  | { kind: "leave"; conversationId: string; name: string; last: boolean };

export function ChannelWorkspace() {
  const t = useT();
  const { organizationId, role } = usePermissions();
  const me = useMe();
  const meHex = me.hex;
  const isMobile = useIsMobile();
  const isManagerRole = (r: string | null) => r === "owner" || r === "manager";
  // The lower of the machine account's and the operator's rights: a staff
  // operator on an owner's store machine gets a staff member's chat.
  const canManage = isManagerRole(role) && (me.operatorRole == null || isManagerRole(me.operatorRole));
  // A direct message started here would include the shared machine's account
  // as a third member, readable by whoever uses the machine next.
  const canStartDm = me.operatorRole == null;
  const { model, people, ready } = useChatWorkspace(organizationId ?? null, meHex);

  const [activeId, setActiveId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c"));
  const [panel, setPanel] = useState<SidePanel | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [newSince, setNewSince] = useState<number | null>(null);
  // The payload outlives `confirmOpen`, so the dialog's text holds still while it fades out.
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const askConfirm = useCallback((c: Confirm) => { setConfirm(c); setConfirmOpen(true); }, []);
  const [dialog, setDialog] = useState<{ kind: "dm" | "channel" | "add" | "topic"; key: number } | null>(null);

  const channelComposer = useRef<ComposerHandle>(null);
  const threadComposer = useRef<ComposerHandle>(null);
  const lastComposer = useRef<"channel" | "thread">("channel");

  const active = activeId ? model.channelById.get(activeId) ?? null : null;
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
      setActiveId(null);
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
    setActiveId(id);
    setPanel((p) => (p?.kind === "search" && p.scope === "all" && focus ? p : null));
    setFocusMessageId(focus ?? null);
    lastComposer.current = "channel";
  }, [model]);

  // Reading the open conversation marks it read (only when something is unread, and only while visible).
  const unreadHere = active ? active.unread + active.mentions : 0;
  useEffect(() => {
    if (!activeId || unreadHere === 0 || document.visibilityState !== "visible") return;
    markChatRead(activeId).catch((err) => console.warn("markChatRead failed:", err));
  }, [activeId, unreadHere]);

  const value = useMemo<ChannelWorkspaceValue>(() => ({
    model, people, meHex: meHex ?? "", accountHex: me.accountHex ?? "", canManage, isMobile, nameOf, avatarOf, openChannel,
    openPanel: (p) => { setPanel(p); if (p?.kind === "thread") lastComposer.current = "thread"; },
    mention: (name) => {
      const target = lastComposer.current === "thread" && panel?.kind === "thread" ? threadComposer.current : channelComposer.current;
      target?.insert(`@${name} `);
    },
    run,
    confirmDelete: (conversationId, messageId) => askConfirm({ kind: "delete", conversationId, messageId }),
    focusMessageId,
  }), [model, people, meHex, me.accountHex, canManage, isMobile, nameOf, avatarOf, openChannel, run, focusMessageId, panel, askConfirm]);

  useChannelPageContext({
    conversations: model.channels.length,
    open: active ? { id: active.id, type: active.type, members: active.memberHexes.length } : null,
    openName: active?.name ?? null,
  });

  const openDialog = (kind: "dm" | "channel" | "add" | "topic") => setDialog({ kind, key: Date.now() });
  // What the empty states suggest: only what this viewer can actually start.
  const startPrompt = canStartDm
    ? (canManage ? t("chat.startDMPrompt") : t("chat.ws.inviteOnlyNote"))
    : (canManage ? t("chat.ws.createChannelPrompt") : t("chat.ws.inviteOnlyNote"));
  const closeDialog = (open: boolean) => { if (!open) setDialog(null); };

  if (!ready || !organizationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={32} className="text-muted-foreground" />
      </div>
    );
  }

  const conversation = active && (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChannelHeader
          channel={active}
          panel={panel}
          onBack={isMobile ? () => { setActiveId(null); setPanel(null); } : undefined}
          onEditTopic={() => openDialog("topic")}
          onAddPeople={() => openDialog("add")}
          // Writes run as the machine's account: "leave" would remove the machine, not the operator.
          onLeave={me.operatorRole == null
            ? () => askConfirm({ kind: "leave", conversationId: active.id, name: active.name, last: active.memberHexes.length <= 1 })
            : undefined}
        />
        <MessageList
          channel={active}
          entries={model.messagesOf(active.id)}
          newSince={newSince}
          onAddPeople={canManage && active.type === "group" ? () => openDialog("add") : undefined}
          onEditTopic={canManage && active.type === "group" ? () => openDialog("topic") : undefined}
        />
        <Composer
          ref={channelComposer}
          key={active.id}
          autoFocus={!isMobile}
          placeholder={fmt(t("chat.ws.messagePlaceholder"), { name: active.type === "group" ? `#${active.name}` : active.name })}
          memberHexes={active.memberHexes}
          everyone={active.type === "group"}
          onFocus={() => { lastComposer.current = "channel"; }}
          onSubmit={(text, attachment) => run(() => sendMessage(active.id, text, undefined, attachment))}
        />
      </div>
      {panel?.kind === "thread" && (
        <ThreadPanel ref={threadComposer} channel={active} parentId={panel.parentId} onComposerFocus={() => { lastComposer.current = "thread"; }} />
      )}
      {panel?.kind === "members" && <MembersPanel channel={active} onAddPeople={() => openDialog("add")} onEditTopic={() => openDialog("topic")} />}
      {panel?.kind === "pins" && <PinsPanel channel={active} />}
      {panel?.kind === "search" && (
        <SearchPanel channel={active} query={panel.query} scope={panel.scope} onChange={(query, scope) => setPanel({ kind: "search", query, scope })} />
      )}
    </div>
  );
  const searchWithoutChannel = !active && panel?.kind === "search" && (
    <div className="relative flex min-h-0 flex-1">
      <SearchPanel channel={null} query={panel.query} scope="all" onChange={(query) => setPanel({ kind: "search", query, scope: "all" })} />
    </div>
  );

  return (
    <ChannelWorkspaceProvider value={value}>
      <div className="flex h-full min-h-0">
        <div className="flex w-full min-h-0 shrink-0 flex-col border-border sm:w-64 sm:border-e">
          <ChannelSidebar
            activeId={active?.id ?? null}
            onNewChannel={() => openDialog("channel")}
            onNewDm={canStartDm ? () => openDialog("dm") : undefined}
            onSearchAll={() => setPanel({ kind: "search", query: "", scope: "all" })}
          />
        </div>
        {!isMobile && (
          conversation || searchWithoutChannel || (
            <EmptyState className="flex-1" icon={MessageSquare} title={t("chat.selectConversation")} description={startPrompt} />
          )
        )}
      </div>

      {isMobile && (
        <DynamicUIElement
          open={!!active || panel?.kind === "search"}
          onOpenChange={(open) => { if (!open) { setActiveId(null); setPanel(null); } }}
        >
          <DynamicUIElementContent showCloseButton={false} noPadding>
            <DynamicUIElementTitle mobileTitle={active?.name ?? t("chat.ws.search")} className="hidden">
              {active?.name ?? t("chat.ws.search")}
            </DynamicUIElementTitle>
            <div className="flex h-full min-h-0 flex-col">{conversation || searchWithoutChannel}</div>
          </DynamicUIElementContent>
        </DynamicUIElement>
      )}

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
          void run(() => deleteMessage(conversationId, messageId));
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
            setActiveId(null);
            setPanel(null);
          });
        }}
      />
    </ChannelWorkspaceProvider>
  );
}
