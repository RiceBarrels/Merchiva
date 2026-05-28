use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

#[cfg(debug_assertions)]
const APP_URL: &str = "http://localhost:3000/login";
#[cfg(not(debug_assertions))]
const APP_URL: &str = "https://merchiva.com/login";

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
                    .traffic_light_position(LogicalPosition::new(16.0, 14.0));
            }

            // Linux/Windows: drop decorations entirely so the React-rendered
            // title bar can take over the full chrome area without overlapping
            // OS controls.
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.decorations(false);
            }

            builder.build()?;

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
            nav_forward
        ])
        .run(tauri::generate_context!())
        .expect("error while running merchiva");
}
