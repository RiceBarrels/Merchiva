"use client";

// "Members' files" for people with the "everyone's files" power (drive-ui §10): one row per
// store member with how many files are in their My files and how much space they take, then the
// disabled members and the people who left (their files stay reachable), under their own heading.
// A row opens that member's My files. A note says members are told management can see their
// files, and, without the edit power, that these files can be viewed but not changed.

import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SkeletonText } from "@/components/ui/skeleton-loaders";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DriveMemberSummary } from "@/components/drive/model/listing";
import { countKey } from "@/components/drive/model/plural";
import { formatDriveBytes } from "@/lib/drive/format";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

const ROLE_KEYS: Readonly<Record<string, string>> = {
  owner: "personnel.team.role.owner",
  manager: "personnel.team.role.manager",
  staff: "personnel.team.role.staff",
};

export interface MembersViewProps {
  /** summarizeMembers(...): active members first, then disabled ones, then former members. */
  summaries: readonly DriveMemberSummary[];
  /** The "everyone's files" edit power; without it the note says the files are view-only. */
  canEditAll: boolean;
  /** The member's My files (driveHref({ space: "members", member })). */
  hrefFor(memberId: string): string;
  /** Opens a member's files in place (a plain click); absent = the link navigates. */
  onPick?(memberId: string): void;
  /** The rows are still loading. */
  loading?: boolean;
  className?: string;
}

function MemberRows({ rows, hrefFor, onPick }: { rows: readonly DriveMemberSummary[]; hrefFor(id: string): string; onPick?(id: string): void }) {
  const { t, locale } = useI18n();
  return (
    <>
      {rows.map((row) => {
        const name = row.name ?? t("drive.list.formerMember");
        const href = hrefFor(row.memberId);
        const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
          if (!plain || !onPick) return;
          event.preventDefault();
          onPick(row.memberId);
        };
        return (
          <TableRow key={row.memberId} className="group">
            <TableCell className="w-full max-w-0 py-2 ps-3">
              <Link href={href} prefetch={false} onClick={onClick} className="flex min-w-0 items-center gap-2.5 rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Avatar name={name} size="sm" className={cn(row.former && "opacity-60")} />
                <span dir="auto" className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {name}
                </span>
                {ROLE_KEYS[row.role] && (
                  <StatusBadge size="xs" className="shrink-0 max-sm:hidden">
                    {t(ROLE_KEYS[row.role])}
                  </StatusBadge>
                )}
              </Link>
            </TableCell>
            <TableCell className="py-2 text-end text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
              {fmt(t(countKey("drive.members.files", row.fileCount)), { count: row.fileCount })}
            </TableCell>
            <TableCell className="hidden py-2 text-end font-mono text-[12px] whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
              {row.bytes === null ? "—" : formatDriveBytes(row.bytes, locale)}
            </TableCell>
            <TableCell className="w-0 py-2 pe-2">
              <Link href={href} prefetch={false} onClick={onClick} tabIndex={-1} aria-hidden className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground group-hover:text-foreground">
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

function MemberTable({ rows, hrefFor, onPick, label }: { rows: readonly DriveMemberSummary[]; hrefFor(id: string): string; onPick?(id: string): void; label: string }) {
  const { t } = useI18n();
  return (
    <div className="-mx-4 overflow-hidden border-y border-border sm:mx-0 sm:rounded-lg sm:border">
      <Table aria-label={label}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-3 text-[11px] font-semibold tracking-wide uppercase">{t("drive.members.col.member")}</TableHead>
            <TableHead className="text-end text-[11px] font-semibold tracking-wide uppercase">{t("drive.list.files")}</TableHead>
            <TableHead className="hidden text-end text-[11px] font-semibold tracking-wide uppercase sm:table-cell">{t("drive.list.col.size")}</TableHead>
            <TableHead className="w-0 pe-2">
              <span className="sr-only">{t("drive.list.col.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <MemberRows rows={rows} hrefFor={hrefFor} onPick={onPick} />
        </TableBody>
      </Table>
    </div>
  );
}

function MembersSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" className="-mx-4 overflow-hidden border-y border-border sm:mx-0 sm:rounded-lg sm:border">
      <span className="sr-only">{t("drive.home.loading")}</span>
      <ul aria-hidden className="divide-y divide-border">
        {["55%", "40%", "62%", "48%"].map((width) => (
          <li key={width} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
            <SkeletonText width={width} />
            <SkeletonText width="3.5rem" className="ms-auto" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MembersView({ summaries, canEditAll, hrefFor, onPick, loading = false, className }: MembersViewProps) {
  const { t } = useI18n();
  const current = summaries.filter((row) => row.active);
  const past = summaries.filter((row) => !row.active);

  return (
    <div className={cn("space-y-4", className)}>
      <Callout tone="info">
        {t("drive.members.adminNote")}
        {!canEditAll && <> {t("drive.members.viewOnly")}</>}
      </Callout>
      {loading ? (
        <MembersSkeleton />
      ) : summaries.length === 0 ? (
        <EmptyState icon={UsersRound} title={t("drive.members.title")} description={t("drive.list.empty.memberDescription")} />
      ) : (
        <>
          {current.length > 0 && <MemberTable rows={current} hrefFor={hrefFor} onPick={onPick} label={t("drive.members.title")} />}
          {past.length > 0 && (
            <section className="space-y-2">
              <Eyebrow as="h3">{t("drive.members.former")}</Eyebrow>
              <MemberTable rows={past} hrefFor={hrefFor} onPick={onPick} label={t("drive.members.former")} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
