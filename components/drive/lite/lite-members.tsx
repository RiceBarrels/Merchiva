"use client";

// The Team tab of the Drive lite app (drive-ui §10, §14.3), for people with the "everyone's files" power: one
// row per member with how many files they keep, then a row per former member whose files are still here. A tap
// opens that member's files (read-only without the edit power). The person's own files are the Mine tab.

import { useMemo } from "react";
import { UserRound, Users } from "lucide-react";
import { LiteEmpty, LiteRow } from "@/components/device/apps/lite";
import { summarizeMembers } from "@/components/drive/model/listing";
import { countKey } from "@/components/drive/model/plural";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useLiteDriveContext } from "./lite-context";
import { homeScreen } from "./lite-state";

export function LiteMembers() {
  const t = useT();
  const { drive, nav } = useLiteDriveContext();
  const { tree, members, actor } = drive.data;
  const rows = useMemo(
    () => summarizeMembers(tree, members).filter((row) => row.memberId !== actor.memberId),
    [tree, members, actor.memberId],
  );

  if (rows.length === 0) return <LiteEmpty icon={Users} title={t("drive.list.empty.memberTitle")} />;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-snug text-muted-foreground">{t("drive.members.adminNote")}</p>
      {rows.map((row) => (
        <LiteRow
          key={row.memberId}
          icon={UserRound}
          iconTone={row.active ? "muted" : "warning"}
          title={<span dir="auto">{row.name ?? t("drive.list.formerMember")}</span>}
          sub={fmt(t(countKey("device.lite.drive.fileCount", row.fileCount)), { count: row.fileCount })}
          chevron
          onClick={() => nav.push(homeScreen("team", "", row.memberId))}
        />
      ))}
    </div>
  );
}
