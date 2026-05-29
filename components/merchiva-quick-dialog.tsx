"use client";

// ═══════════════════════════════════════════════════════════════════════════
// Mr. Merchiva — Quick Dialog (cursor-anchored AI command bar)
// Ported from the "Mr Merchiva Quick Dialog" design handoff (claude.ai/design).
//
// This file exposes the shared, presentational pieces and the in-app (browser)
// launcher. The true OS-global, anywhere-on-the-desktop version lives in a
// dedicated transparent Tauri overlay window — see app/quick-overlay/page.tsx,
// which reuses QuickDialogPanel / useQuickAsk / placeAt from here.
//
// Backdrop rule (per product decision): the app/desktop behind is NEVER blurred
// or dimmed — only the panel itself "blurs in" on entrance.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  Eye,
  ArrowRight,
  ListChecks,
  TrendingUp,
  Package,
  CalendarClock,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { usePermissions } from "@/lib/context/permissions";
import { useIsNativeShell } from "@/lib/native-shell";

// ─── Tunables ────────────────────────────────────────────────────────────────
export const SHORTCUT_KEY = "m"; // summon with (Cmd|Ctrl)+Shift+M
export const DIALOG_W = 380;
export const CURSOR_GAP = 14;
export const EDGE = 16;
export const EST_H = 460;
const HINT_STORAGE_KEY = "merchiva:qd-hint-seen";

// ─── Brand accent (warm-stone — the Mr. Merchiva material) ───────────────────
export const ACCENT = {
  acc: "oklch(0.55 0.09 55)",
  soft: "#faf5ec",
  bd: "#ecd9b8",
  glow: "rgba(168,120,60,0.25)",
};

export const FONT_SANS = "var(--font-sans, 'Inter', ui-sans-serif, system-ui, sans-serif)";
export const FONT_MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";

// ─── Self-contained keyframes (mqd- prefix avoids global collisions) ─────────
export const KEYFRAMES = `
@keyframes mqd-panel-in {
  0%   { opacity: 0; transform: scale(0.9) translateY(6px); filter: blur(14px); }
  60%  { opacity: 1; filter: blur(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}
@keyframes mqd-panel-out {
  0%   { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(0.96); filter: blur(8px); }
}
@keyframes mqd-dot-in  { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
@keyframes mqd-dot-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes mqd-think   { 0%,100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
@keyframes mqd-rise    { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mqd-hint    { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
`;

// ─── Route → i18n label key, for the "what you're viewing" context chip ──────
const PAGE_LABEL_KEYS: Record<string, string> = {
  dashboard: "nav.home",
  pos: "nav.pos",
  inventory: "nav.inventory",
  products: "nav.products",
  sales: "nav.sales",
  personnel: "nav.personnel",
  customers: "nav.customers",
  chat: "nav.chat",
  builder: "nav.website",
  design: "nav.design",
  "punch-in": "nav.punchIn",
};

function prettifySegment(seg: string): string {
  return seg
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/** Resolve the current /~/ route to a human page label (for the context chip). */
export function useCurrentPageLabel(): string | null {
  const { t } = useI18n();
  const pathname = usePathname();
  if (!pathname) return null;
  const seg = pathname.replace(/^\/~\//, "").split("/")[0];
  if (!seg || seg.startsWith("/")) return null;
  const key = PAGE_LABEL_KEYS[seg];
  if (key) {
    const resolved = t(key);
    if (resolved && resolved !== key) return resolved;
  }
  return prettifySegment(seg);
}

// ─── Starter commands (labels are the prompts sent to Mr. Merchiva) ──────────
type QuickCommand = { id: string; icon: LucideIcon; groupKey: string; labelKey: string };

const COMMANDS: QuickCommand[] = [
  { id: "attention", icon: ListChecks, groupKey: "quickDialog.groups.suggested", labelKey: "quickDialog.commands.attention" },
  { id: "sales", icon: TrendingUp, groupKey: "quickDialog.groups.suggested", labelKey: "quickDialog.commands.sales" },
  { id: "lowStock", icon: Package, groupKey: "quickDialog.groups.suggested", labelKey: "quickDialog.commands.lowStock" },
  { id: "whosOn", icon: CalendarClock, groupKey: "quickDialog.groups.staffing", labelKey: "quickDialog.commands.whosOn" },
  { id: "coverage", icon: Users, groupKey: "quickDialog.groups.staffing", labelKey: "quickDialog.commands.coverage" },
];

/** The Notch-M brand mark. */
export function NotchM({ size = 15, fill = "#fff" }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill={fill} />
    </svg>
  );
}

/** Edge-aware placement of a `w`×`h` panel around a cursor hotspot. */
export function placeAt(
  cx: number,
  cy: number,
  w: number = DIALOG_W,
  h: number = EST_H,
): { x: number; y: number; origin: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = cx + CURSOR_GAP;
  const flipX = right + w + EDGE > vw;
  const x = flipX ? Math.max(EDGE, cx - CURSOR_GAP - w) : right;
  const below = cy + CURSOR_GAP;
  const flipY = below + h + EDGE > vh;
  const y = flipY ? Math.max(EDGE, cy - CURSOR_GAP - h) : below;
  return { x, y, origin: `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}` };
}

// Strip machine-readable action blocks / slash-commands so only prose shows.
function stripActions(text: string): string {
  let out = text.replace(/```action[\s\S]*?```/g, "");
  out = out.replace(/```action[\s\S]*$/g, "");
  out = out.replace(
    /\/(?:tasks|roles)\s+(?:add|delete|list)\s+(?:'[^']*'?|"[^"]*"?|`[^`]*`?|\{[^}]*\}?)/g,
    "",
  );
  return out.trim();
}

// ─── Shared streaming "ask Mr. Merchiva" hook ────────────────────────────────
export function useQuickAsk() {
  const { locale } = useI18n();
  const perms = usePermissions();
  const pathname = usePathname();
  const [asking, setAsking] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [errored, setErrored] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAsking(null);
    setAnswer("");
    setErrored(false);
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setAsking(q);
      setAnswer("");
      setErrored(false);
      try {
        const sections: Record<string, { view?: boolean; edit?: boolean }> = {};
        const pmap = (perms.permissions ?? {}) as unknown as Record<string, { view?: boolean; edit?: boolean }>;
        for (const [key, val] of Object.entries(pmap)) sections[key] = { view: val?.view, edit: val?.edit };

        const res = await fetch("/api/store-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            message: q,
            history: [],
            context: { surface: "quick-dialog", path: pathname },
            lang: locale,
            stream: true,
            permissions: { isOwner: perms.isOwner, role: perms.role, sections },
          }),
        });
        if (!res.ok || !res.body) throw new Error("stream unavailable");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            full += chunk;
            const visible = stripActions(full);
            if (visible) setAnswer(visible);
          }
        }
        const finalText = stripActions(full);
        setAnswer(finalText);
        if (!finalText) setErrored(true);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.warn("[Mr. Merchiva] quick dialog ask failed:", err);
        setErrored(true);
      }
    },
    [perms.permissions, perms.isOwner, perms.role, pathname, locale],
  );

  return { asking, answer, errored, ask, reset };
}

const KBD: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 10,
  color: "#a8a29e",
  border: "1px solid #e7e5e4",
  borderRadius: 4,
  padding: "1px 5px",
  background: "#fff",
};

// ─── The panel card (header + input + list, or the streamed result) ──────────
export function QuickDialogPanel({
  pageLabel,
  onOpenAssistant,
}: {
  pageLabel: string | null;
  onOpenAssistant: () => void;
}) {
  const { t, dir } = useI18n();
  const { asking, answer, errored, ask, reset } = useQuickAsk();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The panel is remounted on every summon (via `key`), so fresh state +
  // a mount-time focus is all we need — no derived-state effects.
  useEffect(() => {
    const tmo = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(tmo);
  }, []);

  const resolved = COMMANDS.map((c) => ({ ...c, label: t(c.labelKey) }));
  const needle = query.trim().toLowerCase();
  const filtered = needle ? resolved.filter((c) => c.label.toLowerCase().includes(needle)) : resolved;

  const groups: { name: string; items: typeof filtered }[] = [];
  for (const c of filtered) {
    const name = t(c.groupKey);
    let g = groups.find((x) => x.name === name);
    if (!g) { g = { name, items: [] }; groups.push(g); }
    g.items.push(c);
  }

  const runSelection = () => {
    const pick = filtered[sel];
    if (pick) ask(pick.label);
    else if (query.trim()) ask(query.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, Math.max(filtered.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runSelection(); }
  };

  return (
    <div
      dir={dir}
      style={{
        borderRadius: 16,
        background: "#fdfcf9", // solid — nothing behind is blurred
        border: "1px solid #efe7d8",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 60px -14px rgba(28,20,10,0.38), 0 8px 22px -8px rgba(28,20,10,0.22), 0 0 0 1px rgba(120,90,55,0.08)",
        overflow: "hidden",
        fontFamily: FONT_SANS,
        width: DIALOG_W,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px 10px", borderBottom: "1px solid #f0eee9" }}>
        <span style={{ width: 26, height: 26, borderRadius: 6, background: "#1c1917", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <NotchM size={15} />
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1917", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{t("quickDialog.title")}</span>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: "#10b981" }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: "#10b981", letterSpacing: 0.5, textTransform: "uppercase" }}>{t("quickDialog.online")}</span>
        </div>
        <div style={{ flex: 1 }} />
        {pageLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 200, padding: "3px 8px", borderRadius: 99, background: ACCENT.soft, border: `1px solid ${ACCENT.bd}` }}>
            <Eye style={{ width: 11, height: 11, color: ACCENT.acc, flexShrink: 0 }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: ACCENT.acc, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pageLabel}</span>
          </span>
        )}
      </div>

      {asking ? (
        /* ── Result view ── */
        <div style={{ padding: "6px 6px 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px 4px" }}>
            <span style={{ fontSize: 13, color: "#a8a29e", fontFamily: FONT_MONO, marginTop: 2 }}>›</span>
            <div style={{ fontSize: 13.5, color: "#57534e", fontWeight: 500 }}>{asking}</div>
          </div>

          {!answer && !errored ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 16px" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: 99, background: ACCENT.acc, animation: `mqd-think 1s ${i * 0.16}s infinite ease-in-out` }} />
              ))}
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#a8a29e", letterSpacing: 0.5, marginLeft: 4 }}>{t("quickDialog.thinking")}</span>
            </div>
          ) : (
            <div style={{ animation: "mqd-rise 0.4s cubic-bezier(0.2,0.8,0.2,1) both", padding: "4px 14px 0" }}>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: errored ? "#b91c1c" : "#292524", margin: "4px 0 12px", whiteSpace: "pre-wrap", maxHeight: 280, overflowY: "auto" }}>
                {errored ? t("quickDialog.error") : answer}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 6px" }}>
                <button onClick={onOpenAssistant} style={{ flex: 1, height: 38, borderRadius: 8, border: "none", cursor: "pointer", background: ACCENT.acc, color: "#fff", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: FONT_SANS }}>
                  {t("quickDialog.openAssistant")}
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </button>
                <button onClick={reset} style={{ height: 38, padding: "0 14px", borderRadius: 8, cursor: "pointer", border: "1px solid #e7e5e4", background: "#fff", color: "#57534e", fontSize: 13, fontWeight: 500, fontFamily: FONT_SANS }}>
                  {t("quickDialog.askAgain")}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Input + command list ── */
        <div onKeyDown={onKeyDown}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 15px" }}>
            <Sparkles style={{ width: 17, height: 17, color: ACCENT.acc, flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSel(0); }}
              placeholder={t("quickDialog.placeholder")}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 16.5, color: "#1c1917", fontFamily: FONT_SANS, padding: 0 }}
            />
            <kbd style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#a8a29e", border: "1px solid #e7e5e4", borderRadius: 5, padding: "2px 6px" }}>esc</kbd>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", padding: "0 6px 6px", borderTop: "1px solid #f0eee9" }}>
            {groups.length === 0 && (
              <button onClick={() => query.trim() && ask(query.trim())} style={{ width: "100%", padding: "22px 16px", textAlign: "center", fontSize: 13, color: "#78716c", background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT_SANS }}>
                {t("quickDialog.askPrefix")} “{query.trim()}”
              </button>
            )}
            {groups.map((g) => (
              <div key={g.name}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: 0.7, textTransform: "uppercase", color: "#a8a29e", padding: "12px 10px 5px" }}>{g.name}</div>
                {g.items.map((c) => {
                  const idx = filtered.indexOf(c);
                  const active = idx === sel;
                  const CmdIcon = c.icon;
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => ask(c.label)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "start", background: active ? ACCENT.soft : "transparent", boxShadow: active ? `inset 0 0 0 1px ${ACCENT.bd}` : "none", transition: "background 0.12s", fontFamily: FONT_SANS }}
                    >
                      <span style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: active ? ACCENT.acc : "#f5f5f4", color: active ? "#fff" : "#78716c" }}>
                        <CmdIcon style={{ width: 15, height: 15 }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: "#1c1917", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                      </span>
                      {active && (
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: ACCENT.acc, border: `1px solid ${ACCENT.bd}`, borderRadius: 5, padding: "2px 6px", flexShrink: 0 }}>↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 14px", borderTop: "1px solid #f0eee9", background: "#fcfbfa", borderRadius: "0 0 14px 14px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#a8a29e" }}>
              <kbd style={KBD}>↑</kbd><kbd style={KBD}>↓</kbd> {t("quickDialog.navigate")}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#a8a29e" }}>
              <kbd style={KBD}>↵</kbd> {t("quickDialog.run")}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: "#cfc8bd", letterSpacing: 0.5 }}>{t("quickDialog.footer")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// In-app (browser) launcher. Tab-focused ⌘⇧M only — a browser tab can't capture
// an OS-global shortcut. In the Tauri desktop shell the global overlay window
// takes over, so this stays inert there.
// ═══════════════════════════════════════════════════════════════════════════
export function MerchivaQuickDialog() {
  const native = useIsNativeShell();
  const router = useRouter();
  const { t } = useI18n();
  const pageLabel = useCurrentPageLabel();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; origin: string }>({ x: 0, y: 0, origin: "top left" });
  const [summonNonce, setSummonNonce] = useState(0);
  const cursor = useRef({ x: 0, y: 0 });
  const [dotPos, setDotPos] = useState({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(false);

  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent || "");
  const shortcutLabel = isMac ? "⌘⇧M" : "Ctrl+Shift+M";

  useEffect(() => {
    cursor.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const onMove = (e: MouseEvent) => { cursor.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // First-run hint (desktop browser only, once). Suppressed in the native shell.
  useEffect(() => {
    if (typeof window === "undefined" || native) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    try { if (localStorage.getItem(HINT_STORAGE_KEY)) return; } catch { /* ignore */ }
    setShowHint(true);
    const tmo = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(tmo);
  }, [native]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try { localStorage.setItem(HINT_STORAGE_KEY, "1"); } catch { /* ignore */ }
  }, []);

  const launch = useCallback(() => {
    const c = cursor.current;
    setPos(placeAt(c.x, c.y));
    setDotPos({ x: c.x, y: c.y });
    setSummonNonce((n) => n + 1);
    setClosing(false);
    setOpen(true);
    dismissHint();
  }, [dismissHint]);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, 180);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === SHORTCUT_KEY) {
        if (native) return; // OS-global overlay handles it in the desktop app
        e.preventDefault();
        if (open) close(); else launch();
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    const onOpenEvent = () => { if (!native && !open) launch(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("merchiva:quick-dialog", onOpenEvent as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("merchiva:quick-dialog", onOpenEvent as EventListener);
    };
  }, [open, native, launch, close]);

  const goToAssistant = useCallback(() => { close(); router.push("/~/chat"); }, [close, router]);

  return (
    <>
      <style>{KEYFRAMES}</style>

      {!open && showHint && (
        <div
          onClick={dismissHint}
          style={{ position: "fixed", bottom: 88, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(28,25,23,0.92)", color: "#fff", borderRadius: 99, zIndex: 9990, cursor: "pointer", boxShadow: "0 8px 30px -6px rgba(0,0,0,0.5)", fontSize: 13.5, fontFamily: FONT_SANS, animation: "mqd-hint 2.6s ease-in-out infinite" }}
        >
          <NotchM size={16} />
          {t("quickDialog.hintPrefix")}
          <kbd style={{ fontFamily: FONT_MONO, fontSize: 12, background: "rgba(255,255,255,0.16)", borderRadius: 5, padding: "2px 7px" }}>{shortcutLabel}</kbd>
          {t("quickDialog.hintSuffix")}
        </div>
      )}

      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" }} />
          <div style={{ position: "fixed", left: dotPos.x, top: dotPos.y, zIndex: 9999, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: 99, background: ACCENT.acc, boxShadow: `0 0 0 5px ${ACCENT.glow}`, pointerEvents: "none", animation: closing ? "mqd-dot-out 0.18s ease forwards" : "mqd-dot-in 0.3s ease forwards" }} />
          <div
            style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 10000, transformOrigin: pos.origin, animation: closing ? "mqd-panel-out 0.18s cubic-bezier(0.4,0,1,1) forwards" : "mqd-panel-in 0.42s cubic-bezier(0.16,1,0.3,1) forwards" }}
          >
            <QuickDialogPanel key={summonNonce} pageLabel={pageLabel} onOpenAssistant={goToAssistant} />
          </div>
        </>
      )}
    </>
  );
}

export default MerchivaQuickDialog;
