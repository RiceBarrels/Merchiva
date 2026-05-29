"use client";

// ═══════════════════════════════════════════════════════════════════════════
// Mr. Merchiva — global Quick Dialog OVERLAY (Tauri desktop only)
//
// Loaded into a dedicated frameless, transparent, always-on-top, compact Tauri
// window (label "quick") that is sized to fit the dialog and placed beside the
// cursor by Rust (see src-tauri/src/lib.rs → show_quick_overlay). It is marked
// visible-on-all-workspaces so it shows over fullscreen apps. The window's
// inner padding leaves room for the panel's shadow; `flipX`/`flipY` from Rust
// pin the panel to the corner nearest the cursor.
//
// The desktop behind is never blurred or dimmed — only the panel "blurs in".
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { QuickDialogPanel, KEYFRAMES } from "@/components/merchiva-quick-dialog";

// MUST match WIN_W/WIN_H/PAD in src-tauri/src/lib.rs (logical px).
const PAD = 48;

export default function QuickOverlayPage() {
  const [flip, setFlip] = useState({ x: false, y: false });
  const [nonce, setNonce] = useState(0);

  // Mark the document so globals.css strips the app chrome and goes transparent.
  useEffect(() => {
    document.documentElement.classList.add("quick-overlay");
    return () => document.documentElement.classList.remove("quick-overlay");
  }, []);

  const hide = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_quick");
    } catch {
      /* not running in Tauri */
    }
  }, []);

  const openAssistant = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_chat");
    } catch {
      /* not running in Tauri */
    }
  }, []);

  // Re-anchor + replay the entrance each time Rust fires "quick-open".
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const dispose = await listen<{ flipX?: boolean; flipY?: boolean }>("quick-open", (e) => {
          setFlip({ x: !!e.payload?.flipX, y: !!e.payload?.flipY });
          setNonce((n) => n + 1);
        });
        if (disposed) dispose();
        else unlisten = dispose;
      } catch {
        /* not running in Tauri */
      }
    })();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Esc dismisses the overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide]);

  const origin = `${flip.y ? "bottom" : "top"} ${flip.x ? "right" : "left"}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", overflow: "hidden", userSelect: "none" }}>
      <style>{KEYFRAMES}</style>

      {/* Click-away catcher — transparent. */}
      <div onClick={() => hide()} style={{ position: "fixed", inset: 0, background: "transparent" }} />

      {/* Corner-anchored panel. The flex layer ignores pointer events so clicks
          on the transparent margin fall through to the catcher above. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          padding: PAD,
          display: "flex",
          justifyContent: flip.x ? "flex-end" : "flex-start",
          alignItems: flip.y ? "flex-end" : "flex-start",
          pointerEvents: "none",
        }}
      >
        <div
          key={nonce}
          style={{
            pointerEvents: "auto",
            transformOrigin: origin,
            animation: "mqd-panel-in 0.42s cubic-bezier(0.16,1,0.3,1) forwards",
          }}
        >
          <QuickDialogPanel pageLabel={null} onOpenAssistant={openAssistant} />
        </div>
      </div>
    </div>
  );
}
