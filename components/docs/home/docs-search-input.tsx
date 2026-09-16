"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface DocsSearchInputProps {
  /** Id for the input element (so other controls can move focus back to it). */
  id?: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  onKeyDown?(event: React.KeyboardEvent<HTMLInputElement>): void;
  /** Id of the results region this input filters. */
  controls?: string;
}

/** Search field with a leading icon and a clear button; Escape clears before it closes anything. */
export function DocsSearchInput({
  id,
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  autoFocus,
  onKeyDown,
  controls,
}: DocsSearchInputProps) {
  const t = useT();
  const label = placeholder ?? t("docs.home.searchPlaceholder");
  return (
    <div role="search" className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={label}
        aria-label={label}
        aria-controls={controls}
        autoComplete="off"
        enterKeyHint="search"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            // React dispatches from its listener on `document`, the same node Base UI's
            // dismiss handler (dialogs, popovers) listens on, and React's was added first.
            // Only stopImmediatePropagation keeps the enclosing dialog from closing too.
            event.nativeEvent.stopImmediatePropagation();
            onChange("");
            return;
          }
          onKeyDown?.(event);
        }}
        className={cn("ps-8 pe-8 [&::-webkit-search-cancel-button]:appearance-none", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("docs.home.clearSearch")}
          className="absolute end-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
