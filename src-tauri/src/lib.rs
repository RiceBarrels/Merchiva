use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(debug_assertions)]
const APP_URL: &str = "http://localhost:3000/login";
#[cfg(not(debug_assertions))]
const APP_URL: &str = "https://merchiva.com/login";

// The Mr. Merchiva quick-dialog overlay loads this lightweight, public route.
// It renders only the dialog with a transparent body (see app/quick-overlay).
#[cfg(debug_assertions)]
const QUICK_URL: &str = "http://localhost:3000/quick-overlay";
#[cfg(not(debug_assertions))]
const QUICK_URL: &str = "https://merchiva.com/quick-overlay";

// Renderer → main: open an http(s) URL in the user's default browser. Used by
// the WorkOS OAuth flow so Google/Apple don't reject our embedded webview.
#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must be http(s)".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

// Renderer → main: navigate the main webview back/forward through its history.
// We don't ship native history APIs to the renderer because Tauri doesn't
// expose `webview.go_back()` directly; `history.back()` inside the page is
// equivalent and works in any webview.
#[tauri::command]
async fn nav_back(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn nav_forward(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .eval("window.history.forward()")
        .map_err(|e| e.to_string())
}

// Renderer (overlay) → main: hide the quick-dialog overlay window.
#[tauri::command]
async fn hide_quick(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("quick") {
        let _ = w.hide();
    }
    Ok(())
}

// Renderer (overlay) → main: jump the main window to the full Mr. Merchiva
// assistant and dismiss the overlay.
#[tauri::command]
async fn open_chat(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.eval("window.location.assign('/~/chat')");
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(quick) = app.get_webview_window("quick") {
        let _ = quick.hide();
    }
    Ok(())
}

// Place the overlay over the monitor under the cursor, reveal it, and tell the
// renderer where the pointer is (in that monitor's logical pixels) so it can
// drop the dialog beside the cursor with the same edge-aware logic as the web.
#[cfg(desktop)]
fn show_quick_overlay(app: &tauri::AppHandle) {
    let Some(overlay) = app.get_webview_window("quick") else {
        return;
    };
    let cursor = overlay
        .cursor_position()
        .unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
    let (cx, cy) = (cursor.x as i32, cursor.y as i32);

    let monitor = overlay
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        })
        .or_else(|| overlay.primary_monitor().ok().flatten());

    // Compact, dialog-sized window placed beside the cursor (NOT the whole
    // monitor). PAD/WIN_* are logical and MUST match app/quick-overlay/page.tsx.
    const WIN_W: f64 = 480.0;
    const WIN_H: f64 = 580.0;
    const PAD: f64 = 48.0; // transparent room so the panel's shadow isn't clipped
    const GAP: f64 = 14.0; // pointer ↔ panel
    const PANEL_W: f64 = 380.0;
    const PANEL_H: f64 = 470.0;

    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let win_w = WIN_W * scale;
    let win_h = WIN_H * scale;
    let pad = PAD * scale;
    let gap = GAP * scale;

    let (mon_x, mon_y, mon_right, mon_bottom) = match monitor.as_ref() {
        Some(m) => {
            let p = m.position();
            let s = m.size();
            (
                p.x as f64,
                p.y as f64,
                p.x as f64 + s.width as f64,
                p.y as f64 + s.height as f64,
            )
        }
        None => (0.0, 0.0, cursor.x + win_w, cursor.y + win_h),
    };

    let flip_x = cursor.x + gap + PANEL_W * scale > mon_right;
    let flip_y = cursor.y + gap + PANEL_H * scale > mon_bottom;

    let mut win_x = if flip_x { cursor.x - gap - win_w + pad } else { cursor.x + gap - pad };
    let mut win_y = if flip_y { cursor.y - gap - win_h + pad } else { cursor.y + gap - pad };
    // Keep the window fully on the target monitor.
    win_x = win_x.max(mon_x).min((mon_right - win_w).max(mon_x));
    win_y = win_y.max(mon_y).min((mon_bottom - win_h).max(mon_y));

    let _ = overlay.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
        win_w as u32,
        win_h as u32,
    )));
    let _ = overlay.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
        win_x as i32,
        win_y as i32,
    )));
    let _ = overlay.emit("quick-open", serde_json::json!({ "flipX": flip_x, "flipY": flip_y }));

    let _ = overlay.set_always_on_top(true);
    // Show over fullscreen apps / other Spaces (macOS) and every workspace.
    let _ = overlay.set_visible_on_all_workspaces(true);
    let _ = overlay.show();
    let _ = overlay.set_focus();
}

#[cfg(desktop)]
fn toggle_quick_overlay(app: &tauri::AppHandle) {
    if let Some(overlay) = app.get_webview_window("quick") {
        if overlay.is_visible().unwrap_or(false) {
            let _ = overlay.hide();
            return;
        }
    }
    show_quick_overlay(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // single-instance MUST be registered before deep-link on Linux/Windows so
    // a cold-start protocol URL is forwarded to the existing instance as argv
    // and surfaced via deep-link's event stream.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Bring the existing window to focus when the user re-launches.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));

        // OS-global shortcut so Mr. Merchiva can be summoned from ANY app, not
        // just when Merchiva is focused. The handler toggles the cursor-anchored
        // overlay window. Registered (the actual key combo) in setup() below.
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if matches!(
                        event.state(),
                        tauri_plugin_global_shortcut::ShortcutState::Pressed
                    ) {
                        toggle_quick_overlay(app);
                    }
                })
                .build(),
        );
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Build the main window from Rust so we can pick the URL based on
            // debug/release. Defined here instead of in tauri.conf.json's
            // `windows[]` because that JSON form can't switch URLs by build
            // profile, and we need localhost in dev but merchiva.com in prod.
            let url = APP_URL.parse().expect("APP_URL must be a valid URL");
            #[allow(unused_mut)]
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Merchiva")
                .inner_size(1280.0, 820.0)
                .min_inner_size(1024.0, 600.0)
                .background_color(tauri::webview::Color(255, 255, 255, 255));

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .traffic_light_position(LogicalPosition::new(16.0, 21.0));
            }

            // Linux/Windows: drop decorations entirely so the React-rendered
            // title bar can take over the full chrome area without overlapping
            // OS controls.
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.decorations(false);
            }

            builder.build()?;

            // ── Mr. Merchiva quick-dialog overlay window ──────────────────────
            // Frameless, transparent, always-on-top. Hidden until the global
            // shortcut summons it (see toggle_quick_overlay). It loads a public,
            // chrome-less route that renders only the dialog over the desktop.
            #[cfg(desktop)]
            {
                let quick_url = QUICK_URL.parse().expect("QUICK_URL must be a valid URL");
                let overlay =
                    WebviewWindowBuilder::new(app, "quick", WebviewUrl::External(quick_url))
                        .title("Mr. Merchiva")
                        .inner_size(480.0, 580.0)
                        .resizable(false)
                        .decorations(false)
                        .transparent(true)
                        .always_on_top(true)
                        .visible_on_all_workspaces(true)
                        .skip_taskbar(true)
                        .shadow(false)
                        .visible(false)
                        .focused(false)
                        .build()?;

                // Dismiss the overlay when it loses focus (Spotlight behaviour).
                let overlay_for_event = overlay.clone();
                overlay.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Focused(false)) {
                        let _ = overlay_for_event.hide();
                    }
                });

                // Summon with ⌘⇧M (macOS) / Ctrl+Shift+M (Windows/Linux), system-wide.
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                app.global_shortcut().register("CommandOrControl+Shift+M")?;
            }

            // Auto-updater — desktop only. The check runs on a background task
            // and the dialog/restart flow lives in the renderer.
            #[cfg(desktop)]
            {
                let _ = app
                    .handle()
                    .plugin(tauri_plugin_updater::Builder::new().build());
            }

            // Wire deep-link events through to the renderer. The renderer
            // subscribes via @tauri-apps/plugin-deep-link's onOpenUrl helper,
            // and we additionally emit a "deep-link" event so the auth bridge
            // can fan out to its listeners with a stable contract.
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let _ = app_handle.emit("deep-link", url.to_string());
                }
            });

            // Cold-start case is handled on the renderer side by calling
            // @tauri-apps/plugin-deep-link's `getCurrent()` on mount. We don't
            // try to emit a delayed event from Rust because there's no good
            // signal for "renderer has subscribed yet" without adding a tokio
            // dep just for sleep().

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_external,
            nav_back,
            nav_forward,
            hide_quick,
            open_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running merchiva");
}
