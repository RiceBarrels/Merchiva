"use client";

import { PermissionGuard } from "@/components/permission-guard";
import { ChannelWorkspace } from "@/components/channel";

export default function ChannelPage() {
  return (
    <PermissionGuard section="staffing">
      <ChannelWorkspace />
    </PermissionGuard>
  );
}
