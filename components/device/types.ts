// Shared types for the store-device (/store) and personal-device (/personal)
// surfaces. Both UIs are built from the components in this folder.

import type { LucideIcon } from "lucide-react";

export interface Channel {
  id: string;            // chat_conversation id
  name: string;          // display name (group name or DM partner)
  type: "direct" | "group";
  memberCount: number;
}

export interface ChannelMessage {
  id: string;
  conversationId: string;
  senderId: string;      // identity hex string
  senderName: string;
  senderInitials: string;
  isMe: boolean;
  isMerchiva: boolean;
  content: string;       // text shown (AI summary / transcript / typed text)
  voiceTranscript: string | null; // raw transcript when content is an AI summary
  attachmentUrl: string | null;
  attachmentType: string | null;  // "audio" | "image" | "video" | "file"
  attachmentName: string | null;
  createdAt: Date;
}

/** Result of one push-to-talk recording. */
export interface PttResult {
  /** What the user chose on release. */
  mode: "summary" | "original" | "delete";
  blob: Blob | null;      // recorded audio (null when deleted)
  durationSec: number;
}

export interface DeviceApp {
  /** Catalog id (see components/device/app-catalog.tsx) or one of the
   *  built-in surface apps: "punch-in" | "requests" | "docs" | "directory" | "settings". */
  id: string;
  label: string;
  /** Tile icon; built-in ids fall back to the AppsGrid icon map. */
  icon?: LucideIcon;
  /** Rendered dark (primary) tile like the prototype's Punch In. */
  dark?: boolean;
  /** Also shown in the dock strip. */
  dock?: boolean;
}

export type PunchAction = "in" | "out" | "break-start" | "break-end";

export interface OnShiftEntry {
  memberId: string;
  name: string;
  initials: string;
  roleLabel: string;     // org role or staff role, e.g. "Manager" / "Staff"
  since: Date;           // open punch-in time
  onBreak: boolean;
}
