"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Google Fonts API ───────────────────────────────────────────────────────

interface GoogleFont {
  family: string;
  category: string;
}

let fontsCache: GoogleFont[] | null = null;
let fetchPromise: Promise<GoogleFont[]> | null = null;
const loadedFonts = new Set<string>();
const SYSTEM_FONTS = new Set(["system-ui", "Georgia", "Arial", "Courier New", "Helvetica", "Times New Roman", "Verdana"]);

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_FONTS_API_KEY || "";

async function fetchAllFonts(): Promise<GoogleFont[]> {
  if (fontsCache) return fontsCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const url = API_KEY
        ? `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${API_KEY}`
        : null;

      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const fonts: GoogleFont[] = (data.items || []).map(
            (item: { family: string; category: string }) => ({
              family: item.family,
              category: item.category,
            })
          );
          fontsCache = fonts;
          return fonts;
        }
      }
    } catch {}

    // Fallback
    const fallback: GoogleFont[] = [
      "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
      "Nunito", "Raleway", "Work Sans", "DM Sans", "Playfair Display",
      "Merriweather", "Lora", "Fira Code", "JetBrains Mono",
    ].map((f) => ({ family: f, category: "sans-serif" }));
    fontsCache = fallback;
    return fallback;
  })();

  return fetchPromise;
}

function loadFontCSS(family: string, previewOnly?: boolean) {
  if (SYSTEM_FONTS.has(family) || loadedFonts.has(family + (previewOnly ? "-preview" : "-full"))) return;
  loadedFonts.add(family + (previewOnly ? "-preview" : "-full"));
  const link = document.createElement("link");
  link.rel = "stylesheet";
  const weights = previewOnly ? "wght@400" : "wght@100;200;300;400;500;600;700;800;900";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${weights}&display=swap`;
  document.head.appendChild(link);
}

// ─── Font Picker ────────────────────────────────────────────────────────────

interface FontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
}

export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<GoogleFont[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentFamily = value ? value.split(",")[0].trim().replace(/['"]/g, "") : "";

  // Fetch on first open
  useEffect(() => {
    if (!open || fonts.length > 0) return;
    setLoading(true);
    fetchAllFonts().then((f) => { setFonts(f); setLoading(false); });
  }, [open, fonts.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Filter and limit
  const filtered = query
    ? fonts.filter((f) => f.family.toLowerCase().includes(query.toLowerCase()))
    : fonts;
  const visible = filtered.slice(0, 80);

  // Lazy load previews
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!open) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const family = (entry.target as HTMLElement).dataset.fontFamily;
            if (family) loadFontCSS(family, true);
          }
        });
      },
      { root: listRef.current, threshold: 0 }
    );
    return () => observerRef.current?.disconnect();
  }, [open]);

  const observeRef = useCallback((el: HTMLButtonElement | null) => {
    if (el && observerRef.current) observerRef.current.observe(el);
  }, []);

  const handleSelect = (font: GoogleFont) => {
    const fallback = font.category === "monospace" ? "monospace"
      : font.category === "serif" ? "serif" : "sans-serif";
    loadFontCSS(font.family);
    onChange(`${font.family}, ${fallback}`);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 text-xs transition-colors hover:bg-accent"
        style={currentFamily && !SYSTEM_FONTS.has(currentFamily) ? { fontFamily: `${currentFamily}, sans-serif` } : undefined}
      >
        <span className="truncate">{currentFamily || "Select font..."}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-[9999] mt-1 rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              className="h-5 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              placeholder="Search 1500+ fonts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading fonts...</p>
            ) : visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No fonts found.</p>
            ) : (
              visible.map((font) => (
                <button
                  key={font.family}
                  ref={observeRef}
                  data-font-family={font.family}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                    currentFamily === font.family && "bg-accent"
                  )}
                  onClick={() => handleSelect(font)}
                  style={{ fontFamily: `${font.family}, ${font.category}` }}
                >
                  {currentFamily === font.family ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{font.family}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{font.category}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
