"use client";

/**
 * Desktop document header (docs-editor-ui spec §4.5): home tile · title, star, save status · menu bar |
 * last edit · collaborators · comments toggle · Share.
 */
import Link from "next/link";
import { FileText, Lock, MessageSquare, Users } from "lucide-react";

import { DocMenuBar } from "@/components/docs/menubar/doc-menubar";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOCS_HOME_HREF } from "@/lib/docs/hrefs";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDocEditor } from "./doc-editor-context";
import { DocTitleInput } from "./doc-title-input";
import { LastEditInfo } from "./last-edit-info";
import { PresenceAvatars } from "./presence-avatars";
import { SaveStatus } from "./save-status";
import { StarButton } from "./star-button";

export function DocHeader() {
  const t = useT();
  const { doc, ui, threads, actions } = useDocEditor();
  const commentsOpen = ui.rightPanel === "comments";
  const openCount = threads.openCount;

  return (
    <header className="flex shrink-0 items-start gap-2 border-b border-border bg-background px-3 pt-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={DOCS_HOME_HREF}
              aria-label={t("docs.homeTooltip")}
              className="mt-1 shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <IconTile icon={FileText} size="md" />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("docs.homeTooltip")}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <div className="flex h-8 min-w-0 items-center gap-1">
          <DocTitleInput />
          <StarButton />
          <SaveStatus />
        </div>
        <DocMenuBar />
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center pb-1.5">
        <LastEditInfo />
        <PresenceAvatars max={4} />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-pressed={commentsOpen}
                className={cn("relative", commentsOpen && "bg-muted text-foreground")}
                onClick={actions.toggleComments}
              />
            }
          >
            <MessageSquare className="h-4 w-4" />
            <span className="sr-only">
              {t("docs.view.comments")}
              {openCount > 0 ? ` (${openCount})` : ""}
            </span>
            {openCount > 0 && (
              <span
                aria-hidden
                className="absolute -end-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9.5px] font-semibold tabular-nums text-background"
              >
                {openCount > 99 ? "99+" : openCount}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("docs.comments.title")}</TooltipContent>
        </Tooltip>
        <Button type="button" size="sm" onClick={actions.openShare}>
          {doc.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {t("docs.share.title")}
        </Button>
      </div>
    </header>
  );
}
