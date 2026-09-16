"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActiveTab, useBookmarks, useTabPresentation } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDesktopChrome, useOverlayBackHandler } from "./chrome-context";

/*
 * Bookmark star at the end of the omnibox (desktop spec §4.6). Clicking bookmarks the tab if
 * needed (titled from the tab) and opens the editor: name (Enter saves), Remove, Done.
 * Hidden on the New Tab page. Bookmarks are core data (per user + org).
 */

const MAX_BOOKMARK_TITLE = 200;

export function BookmarkEditForm({
  heading,
  initialName,
  onSave,
  onRemove,
  onDone,
}: {
  heading: string;
  initialName: string;
  onSave(name: string): void;
  onRemove?(): void;
  onDone(): void;
}) {
  const t = useT();
  const headingId = useId();
  const inputId = useId();
  const [name, setName] = useState(initialName);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== initialName) onSave(trimmed);
    onDone();
  };

  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="space-y-2.5">
      <p id={headingId} className="text-[13px] font-medium text-foreground">
        {heading}
      </p>
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-[11px] text-muted-foreground">
          {t("browserDesktop.bookmarks.name")}
        </label>
        <Input
          id={inputId}
          autoFocus
          value={name}
          maxLength={MAX_BOOKMARK_TITLE}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="h-7 text-[13px] md:text-[13px]"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="me-auto text-destructive hover:text-destructive"
            onClick={() => {
              onRemove();
              onDone();
            }}
          >
            {t("browserDesktop.bookmarks.remove")}
          </Button>
        ) : null}
        <Button type="submit" size="sm">
          {t("browserDesktop.bookmarks.done")}
        </Button>
      </div>
    </form>
  );
}

export function BookmarkStar() {
  const t = useT();
  const chrome = useDesktopChrome();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const bookmarks = useBookmarks();
  const bookmark = presentation.isNewTab ? undefined : bookmarks.find(presentation.url);
  const { bookmarkStarOpen, bookmarkStarBookmarkId, closeBookmarkStar } = chrome;
  const open = bookmarkStarOpen && bookmark !== undefined && bookmark.id === bookmarkStarBookmarkId;

  useOverlayBackHandler(open, closeBookmarkStar);

  // The popover can hide without onOpenChange: a controlled `open` that turns false (tab switch
  // from the name input via Mod+W / Ctrl+Tab, navigation, the bookmark removed elsewhere) is not
  // reported by Base UI. Clear the flag then, or it lingers and the editor pops open by itself
  // (stealing focus) on a later page.
  useEffect(() => {
    if (bookmarkStarOpen && !open) closeBookmarkStar();
  }, [bookmarkStarOpen, open, closeBookmarkStar]);

  if (presentation.isNewTab) return null;

  const label = bookmark ? t("browserDesktop.bookmarks.edit") : t("browserDesktop.actions.bookmarkPage");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeBookmarkStar();
          return;
        }
        if (bookmark) {
          chrome.openBookmarkStar(false, bookmark.id);
          return;
        }
        const added = bookmarks.add(presentation.url, presentation.title);
        chrome.openBookmarkStar(true, added.id);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            title={label}
            className="flex size-[22px] shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[density=coarse]/frame:size-7"
          />
        }
      >
        <Star aria-hidden className={cn("h-3.5 w-3.5", bookmark && "fill-current text-foreground")} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[280px]">
        {bookmark ? (
          <BookmarkEditForm
            key={bookmark.id}
            heading={chrome.bookmarkStarJustAdded ? t("browserDesktop.bookmarks.added") : t("browserDesktop.bookmarks.edit")}
            initialName={bookmark.title}
            onSave={(name) => bookmarks.update(bookmark.id, { title: name })}
            onRemove={() => bookmarks.remove(bookmark.id)}
            onDone={closeBookmarkStar}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
