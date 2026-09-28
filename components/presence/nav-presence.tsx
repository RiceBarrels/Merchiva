"use client";

import { useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { colorForMember } from "@/lib/presence/colors";
import { avatarStack, viewersForRow, type NavRowLevel, type NavViewer } from "@/lib/presence/rows";
import { useNavViewers } from "@/lib/presence/store";
import { cn } from "@/lib/utils";

export interface NavPresenceProps {
  /** The row's href (a section's href, or a sub-page's). */
  readonly href: string;
  readonly level: NavRowLevel;
  /** A section row whose sub-page rows are on screen: people on those sub-pages show there instead. */
  readonly childrenVisible?: boolean;
  /** The desktop icon rail: the same avatars and "n+", tucked into the row's corner. */
  readonly collapsed?: boolean;
  readonly className?: string;
}

// The size variants add `leading-none` after their font size: cn() drops a leading class that
// comes before a font-size class.
const CHIP =
  "inline-flex items-center justify-center rounded-full border border-border bg-muted font-mono tabular-nums text-muted-foreground";

function ViewerAvatar({ viewer, title, className }: { viewer: NavViewer; title: string; className?: string }) {
  return (
    <Avatar
      name={viewer.name}
      src={viewer.avatarUrl || null}
      size="xs"
      title={title}
      className={cn("h-4 w-4 text-[7px]", className)}
      style={{ outline: `2px solid ${colorForMember(viewer.memberId)}`, outlineOffset: 0 }}
    />
  );
}

/**
 * Who else is on a nav row's page: colleagues, this user's other windows and this user's other
 * tabs ("You (other tab)"), one avatar each with a ring in their presence colour — at most two,
 * then an "n+" chip. It sits inside the row at its top end (the nav list scrolls and clips, and
 * `end-*` keeps it right in RTL), so the row must be `relative`. The names are in the title; the
 * badge is aria-hidden so the link's accessible name stays the page name.
 */
export function NavPresence({ href, level, childrenVisible = false, collapsed = false, className }: NavPresenceProps) {
  const t = useT();
  const viewers = useNavViewers();
  const people = useMemo(
    () => viewersForRow(viewers, href, level, childrenVisible),
    [viewers, href, level, childrenVisible],
  );
  if (people.length === 0) return null;

  const title = fmt(t("presence.viewing"), {
    names: people.map((p) => (p.self ? t("presence.youOtherTab") : p.name)).join(", "),
  });
  return <NavPresenceBadge people={people} title={title} collapsed={collapsed} className={className} />;
}

/**
 * The badge itself, the same rule at every width: up to two avatars, then "n+" for the rest.
 * The icon rail row is only ~48 px wide around an 18 px icon, so there the avatars overlap more,
 * reach into the nav list's side padding, and the chip drops to a second line under them.
 */
export function NavPresenceBadge({
  people,
  title,
  collapsed = false,
  className,
}: {
  readonly people: readonly NavViewer[];
  readonly title: string;
  readonly collapsed?: boolean;
  readonly className?: string;
}) {
  if (people.length === 0) return null;
  const { shown, extra } = avatarStack(people, 2);
  const avatars = shown.map((viewer, i) => (
    <ViewerAvatar
      key={viewer.key}
      viewer={viewer}
      title={title}
      className={i > 0 ? (collapsed ? "-ms-2" : "-ms-1") : undefined}
    />
  ));
  const chip =
    extra > 0 ? (
      <span className={cn(CHIP, collapsed ? "-mt-1 h-3 min-w-3 px-0.5 text-[8px] leading-none" : "-ms-1 h-4 min-w-4 px-1 text-[9px] leading-none")}>
        {extra}+
      </span>
    ) : null;

  if (collapsed) {
    return (
      <span aria-hidden title={title} className={cn("absolute -end-1 top-0.5 flex flex-col items-end", className)}>
        <span className="flex">{avatars}</span>
        {chip}
      </span>
    );
  }
  return (
    <span aria-hidden title={title} className={cn("absolute end-1 top-1 flex items-center", className)}>
      {avatars}
      {chip}
    </span>
  );
}
