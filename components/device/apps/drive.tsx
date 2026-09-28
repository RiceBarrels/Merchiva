"use client";

// "Drive" on /store + /personal: browse, upload (camera / photos / files),
// preview, and open Docs / Sheets / Slides. The list screens are a lite
// rewrite (one task per screen, big rows, no tables); only the three
// editors are the manager's own screens in their phone layout, which extends
// the Docs exception (see ./docs). The person is the PIN / QR operator on
// /store and the signed-in member on /personal (DriveActorProvider); nothing
// shows until they have acknowledged that management can see their files.

import type { LiteAppProps } from "./types";
import { DriveActorProvider } from "@/components/drive/drive-actor";
import { LiteNoticeGate } from "@/components/drive/notice/management-notice";
import { DriveLiteRouter } from "@/components/drive/lite/lite-router";

export function DriveLite({ surface, organizationId, member }: LiteAppProps) {
  return (
    <DriveActorProvider member={member} surface={surface}>
      <LiteNoticeGate>
        <DriveLiteRouter organizationId={organizationId} />
      </LiteNoticeGate>
    </DriveActorProvider>
  );
}
