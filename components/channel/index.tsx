"use client";

// /manager/channel: a team chat laid out like Slack. Sidebar of starred,
// channel and direct-message sections with unread / mention badges; the open
// conversation with threads, reactions, edits and pins; a right-hand column
// for a thread, the members, the pins or search. On the phone the sidebar is
// the screen and a conversation opens as a full-screen sheet over it.
//
// Group channels are invite-only: owners and managers create them and add
// people (the module enforces it — spacetimedb/src/chat/reducers.ts).
//
// The state and the conversation itself live in ./workspace.tsx, which the
// /personal walkie shares.

import { useEffect, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { useT } from "@/lib/i18n/context";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useCurrentOperator } from "@/lib/store-device-lock";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/loaders/geometric";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { useChannelPageContext } from "@/app/manager/channel/use-channel-page-context";
import { ChannelWorkspaceProvider } from "@/components/channel/context";
import { ChannelSidebar } from "@/components/channel/sidebar";
import { SearchPanel } from "@/components/channel/info-panels";
import {
  ChannelConversation, ChannelOverlays, useChannelController, type WorkspaceIdentity,
} from "@/components/channel/workspace";

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

/**
 * Whose chat this is: the signed-in identity, or on a shared store machine
 * the punched-in operator's (their org_member.userId), so each person sees
 * their own conversations. Every write still runs as the machine's account:
 * the operator only narrows what the page shows and offers.
 */
function useMe(): WorkspaceIdentity {
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

export function ChannelWorkspace() {
  const t = useT();
  const me = useMe();
  const isMobile = useIsMobile();
  const [initialActiveId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c"));
  const ctl = useChannelController({ me, isMobile, initialActiveId });
  const { active, panel, setPanel, model, value, canStartDm, startPrompt, openDialog, closeConversation } = ctl;

  useChannelPageContext({
    conversations: model.channels.length,
    open: active ? { id: active.id, type: active.type, members: active.memberHexes.length } : null,
    openName: active?.name ?? null,
  });

  if (!ctl.ready || !ctl.organizationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={32} className="text-muted-foreground" />
      </div>
    );
  }

  const conversation = active && <ChannelConversation ctl={ctl} onBack={isMobile ? closeConversation : undefined} />;
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
          onOpenChange={(open) => { if (!open) closeConversation(); }}
        >
          <DynamicUIElementContent showCloseButton={false} noPadding>
            <DynamicUIElementTitle mobileTitle={active?.name ?? t("chat.ws.search")} className="hidden">
              {active?.name ?? t("chat.ws.search")}
            </DynamicUIElementTitle>
            <div className="flex h-full min-h-0 flex-col">{conversation || searchWithoutChannel}</div>
          </DynamicUIElementContent>
        </DynamicUIElement>
      )}

      <ChannelOverlays ctl={ctl} />
    </ChannelWorkspaceProvider>
  );
}
