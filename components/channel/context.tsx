"use client";

// Shared state for the channel workspace's parts (sidebar, message list,
// thread panel, …), so each one reads people and actions without a prop chain.

import { createContext, useContext } from "react";
import type { ChatModel, Person } from "@/lib/chat/model";

export type SidePanel =
  | { kind: "thread"; parentId: string }
  | { kind: "members" }
  | { kind: "pins" }
  | { kind: "search"; query: string; scope: "channel" | "all" };

export interface ChannelWorkspaceValue {
  model: ChatModel;
  people: Map<string, Person>;
  meHex: string;
  /** The connection's own identity: on a store machine the machine's account, which every write runs as. */
  accountHex: string;
  /** Owner or manager: creates channels, invites, removes, sets topics. */
  canManage: boolean;
  isMobile: boolean;
  nameOf: (hex: string, isMerchiva?: boolean) => string;
  avatarOf: (hex: string) => string | null;
  openChannel: (id: string, focusMessageId?: string) => void;
  openPanel: (panel: SidePanel | null) => void;
  /** Inserts `@Name ` into the composer that has focus (the channel's by default). */
  mention: (name: string) => void;
  /** Runs a write and turns a rejection into a toast. */
  run: (write: () => Promise<unknown>) => Promise<boolean>;
  /** Asks before deleting one of your own messages. */
  confirmDelete: (conversationId: string, messageId: string) => void;
  /** The message to scroll to and flash once (search results, pins). */
  focusMessageId: string | null;
}

const ChannelWorkspaceContext = createContext<ChannelWorkspaceValue | null>(null);

export const ChannelWorkspaceProvider = ChannelWorkspaceContext.Provider;

export function useChannelWorkspace(): ChannelWorkspaceValue {
  const value = useContext(ChannelWorkspaceContext);
  if (!value) throw new Error("useChannelWorkspace outside ChannelWorkspaceProvider");
  return value;
}
