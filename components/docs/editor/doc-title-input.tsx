"use client";

/**
 * Inline document title (docs-editor-ui spec §4.5). Autosizes to its text, keeps a local draft while focused and
 * commits on blur, Enter, or 600 ms after the last keystroke. Escape reverts. Unfocused it shows the live title
 * (last write wins between collaborators).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDocEditor } from "./doc-editor-context";

const TITLE_MAX = 200;
const COMMIT_DELAY_MS = 600;

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

export function DocTitleInput({ className }: { className?: string }) {
  const t = useT();
  const { doc, canEditNow, actions, titleInputRef, editor, editable } = useDocEditor();
  const [draft, setDraft] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);
  const skipCommit = useRef(false);
  const value = draft ?? doc.title;
  const placeholder = t("docs.untitled");
  const renameTo = actions.renameTo;
  const docTitle = doc.title;

  const commit = useCallback(
    (next: string) => {
      const clean = cleanTitle(next);
      if (clean === cleanTitle(docTitle)) return;
      renameTo(clean).catch(() => {
        // renameTo already reported the error.
      });
    },
    [docTitle, renameTo],
  );

  useEffect(() => {
    if (draft === null) return;
    const timer = window.setTimeout(() => commit(draft), COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);

  useEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    const observer = new ResizeObserver(() => setWidth(Math.ceil(mirror.getBoundingClientRect().width)));
    observer.observe(mirror);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative min-w-0 max-w-[48ch]", className)}>
      <span
        ref={mirrorRef}
        aria-hidden
        className="invisible absolute start-0 top-0 whitespace-pre px-1.5 text-[16px] font-medium"
      >
        {value || placeholder}
      </span>
      <input
        ref={titleInputRef}
        value={value}
        maxLength={TITLE_MAX}
        placeholder={placeholder}
        readOnly={!canEditNow}
        aria-label={t("docs.rename.label")}
        autoComplete="off"
        spellCheck={false}
        style={width ? { width: width + 4 } : undefined}
        className="h-7 min-w-16 max-w-full truncate rounded border border-transparent bg-transparent px-1.5 text-[16px] font-medium text-foreground outline-none placeholder:text-muted-foreground hover:border-border focus:border-ring read-only:hover:border-transparent"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          if (canEditNow) event.currentTarget.select();
        }}
        onBlur={() => {
          if (skipCommit.current) {
            skipCommit.current = false;
            return;
          }
          if (draft !== null) commit(draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
            if (editor && !editor.isDestroyed && editable) editor.commands.focus();
          } else if (event.key === "Escape") {
            event.preventDefault();
            skipCommit.current = true;
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
