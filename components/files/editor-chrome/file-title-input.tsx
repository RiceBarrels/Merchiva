"use client";

/**
 * Inline file title shared by the Sheets and Slides editors (slides spec §7.3). Props-based twin of the Docs
 * `DocTitleInput`: autosizes to its text, keeps a local draft while focused and commits on blur, Enter, or 600 ms
 * after the last keystroke. Escape reverts. Unfocused it shows the live title (last write wins between
 * collaborators).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";

import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { createTitleCommitter, TITLE_MAX } from "./title-commit";

const COMMIT_DELAY_MS = 600;

export interface FileTitleInputProps {
  title: string;
  placeholder: string;
  readOnly: boolean;
  /** Renames the file. The caller reports failures; the input only swallows the rejection. */
  onCommit(title: string): Promise<void>;
  /** Called after Enter commits and blurs the input, e.g. to move focus into the canvas. */
  onEnter?(): void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function FileTitleInput({
  title,
  placeholder,
  readOnly,
  onCommit,
  onEnter,
  inputRef,
  className,
}: FileTitleInputProps) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);
  const skipCommit = useRef(false);
  // Callers usually pass an inline `onCommit`; reading it through a ref keeps the debounce timer from restarting on
  // every parent render.
  const onCommitRef = useRef(onCommit);
  // Keeps the debounce and the blur that follows it from renaming twice while the new title is on its way back.
  const [committer] = useState(createTitleCommitter);
  const value = draft ?? title;

  useLayoutEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    committer.titleChanged(title);
  }, [committer, title]);

  const commit = useCallback(
    (next: string) => committer.commit(next, title, (clean) => onCommitRef.current(clean)),
    [committer, title],
  );

  useEffect(() => {
    if (draft === null) return;
    const timer = window.setTimeout(() => commit(draft), COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);

  useEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror || typeof ResizeObserver === "undefined") return;
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
        ref={inputRef}
        value={value}
        maxLength={TITLE_MAX}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-label={t("docs.rename.label")}
        autoComplete="off"
        spellCheck={false}
        style={width ? { width: width + 4 } : undefined}
        className="h-7 min-w-16 max-w-full truncate rounded border border-transparent bg-transparent px-1.5 text-[16px] font-medium text-foreground outline-none placeholder:text-muted-foreground hover:border-border focus:border-ring read-only:hover:border-transparent"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          if (!readOnly) event.currentTarget.select();
        }}
        onBlur={() => {
          const skip = skipCommit.current;
          skipCommit.current = false;
          if (!skip && draft !== null) commit(draft);
          committer.endSession();
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
            onEnter?.();
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
