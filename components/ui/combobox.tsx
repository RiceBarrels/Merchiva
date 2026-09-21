"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  // When true, the user can type a value that isn't in `options` and commit it
  // (Enter or the "Use …" row). Good for free-text fields backed by suggestions.
  allowCustom?: boolean;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  allowCustom = false,
}: ComboboxProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  // Custom (typed) value not present in the options list.
  const customValue = !selected && value ? value : "";

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  // Offer to commit the typed text when allowCustom and it isn't an exact match.
  const showCustomRow =
    allowCustom &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const showSearch = allowCustom || options.length > 6;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    // Escape closes only the list: capture phase on document, so an enclosing Base UI dialog's document listener
    // doesn't close too. Android back (lib/browser-shell/android-back.ts) closes it with a dispatched Escape.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.isComposing) return;
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function select(val: string) {
    onValueChange(val);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between rounded border border-border bg-background px-2 py-1 text-xs outline-none hover:bg-muted focus:ring-1 focus:ring-ring"
      >
        <span className={cn("truncate", !selected && !customValue && "text-muted-foreground")}>
          {selected ? selected.label : customValue || placeholder}
        </span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform ml-1", open && "rotate-180")} />
      </button>

      {open && (
        // data-slot + data-open: overlay detection (mobile chrome, Android back) sees the open list.
        <div data-slot="combobox-content" data-open="" className="absolute z-50 mt-1 w-full min-w-[140px] rounded border border-border bg-background shadow-md">
          {showSearch && (
            <div className="flex items-center border-b border-border px-2 py-1.5">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground mr-1.5" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && allowCustom && query.trim()) {
                    e.preventDefault();
                    select(query.trim());
                  }
                }}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <ul className="max-h-48 overflow-y-auto py-1">
            {showCustomRow && (
              <li>
                <button
                  type="button"
                  onClick={() => select(query.trim())}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <span className="truncate">Use &quot;{query.trim()}&quot;</span>
                </button>
              </li>
            )}
            {filtered.length === 0 && !showCustomRow ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">{t("components.combobox.noResults")}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => select(o.value)}
                    className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className="truncate">{o.label}</span>
                    {o.value === value && <Check className="h-3 w-3 shrink-0 text-foreground ml-1" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
