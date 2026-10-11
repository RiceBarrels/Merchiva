"use client";

// Special follow (特别关注): when someone you follow posts in a channel you are in,
// you get an email and an alert, even in a muted channel (spacetimedb/src/chat/logic.ts
// chatDelivery). The toggle sits on the channel's members list and DM header, and
// on the /personal directory; never on a shared store screen.

import { useCallback, useMemo, useState } from "react";
import { BellPlus, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { setChatFollow } from "@/lib/spacetimedb/actions/notifications";
import { useChatFollowSet } from "@/lib/spacetimedb/hooks/useNotificationSettings";
import { Button } from "@/components/ui/button";
import { useChannelWorkspace } from "@/components/channel/context";
import { followHex, followToggleFor, type FollowToggle } from "@/components/channel/follow-rules";

export interface FollowControl {
  /** Follows can be set here (see FollowToggleInput.enabled). */
  readonly available: boolean;
  /** What `targetHex`'s row offers. */
  readonly toggleFor: (targetHex: string, activeMember: boolean, selfHexes: readonly (string | null | undefined)[]) => FollowToggle;
  /** A write for this person is in flight. */
  readonly busy: (targetHex: string) => boolean;
  /** Follows or unfollows, then says what it means in a toast. */
  readonly toggle: (targetHex: string, name: string) => void;
}

/**
 * The viewer's follows in `organizationId`. `enabled` is false where follow writes
 * would be someone else's (a store machine's PIN operator): nothing is offered then.
 */
export function useFollowControl(organizationId: string | null, enabled: boolean): FollowControl {
  const t = useT();
  const follows = useChatFollowSet(organizationId);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const available = enabled && follows.available && !!organizationId;

  const toggle = useCallback((targetHex: string, name: string) => {
    const hex = followHex(targetHex);
    if (!available || !organizationId || !hex || pending.has(hex)) return;
    const followed = !follows.isFollowing(hex);
    setPending((prev) => new Set(prev).add(hex));
    setChatFollow(hex, followed, organizationId)
      .then(() => {
        toast.success(fmt(t(followed ? "notify.follow.added" : "notify.follow.removed"), { name }));
      })
      .catch((err: unknown) => {
        console.warn("setChatFollow failed:", err);
        toast.error(t("notify.follow.failed"));
      })
      .finally(() => {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(hex);
          return next;
        });
      });
  }, [available, organizationId, pending, follows, t]);

  return useMemo<FollowControl>(() => ({
    available,
    toggleFor: (targetHex, activeMember, selfHexes) => followToggleFor({
      targetHex,
      selfHexes,
      activeMember,
      following: follows.isFollowing(targetHex),
      enabled: available,
    }),
    busy: (targetHex) => pending.has(followHex(targetHex)),
    toggle,
  }), [available, follows, pending, toggle]);
}

/** The manager channel's toggle for one person (members list rows, the DM header). */
export function FollowButton({ hex, name, size = "icon-sm", className, idleClassName }: {
  hex: string;
  name: string;
  size?: "icon-xs" | "icon-sm";
  className?: string;
  /** Extra classes while not following (a list row reveals it on hover). */
  idleClassName?: string;
}) {
  const t = useT();
  const { follow, people, meHex, accountHex } = useChannelWorkspace();
  const mode = follow ? follow.toggleFor(hex, people.has(hex), [meHex, accountHex]) : "hidden";
  if (!follow || mode === "hidden") return null;
  const following = mode === "unfollow";
  const Icon = following ? BellRing : BellPlus;
  const title = following ? t("notify.follow.turnOff") : fmt(t("notify.follow.hint"), { name });
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={() => follow.toggle(hex, name)}
      disabled={follow.busy(hex)}
      aria-pressed={following}
      aria-label={t("notify.follow.label")}
      title={title}
      className={cn("text-muted-foreground", following ? "text-foreground" : idleClassName, className)}
    >
      <Icon className={cn(following && "fill-current")} />
    </Button>
  );
}
