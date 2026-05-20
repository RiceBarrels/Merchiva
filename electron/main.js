const { app, BrowserWindow, dialog, shell, nativeTheme, ipcMain } = require("electron");
const path = require("path");

// Auto-updater (electron-updater). Configured via the `publish` block in
// package.json → fetches releases from GitHub. We attach handlers here so
// the renderer can prompt the user; everything else runs in the background.
let autoUpdater = null;
try {
  // Defer the require so dev mode (where electron-updater may not be
  // installed in the resolved app path) doesn't crash on launch.
  autoUpdater = require("electron-updater").autoUpdater;
} catch (err) {
  console.warn("[updater] electron-updater unavailable:", err?.message ?? err);
}

const DEV_URL = "http://localhost:3000";
const PROD_URL = process.env.MERCHIVA_URL || "https://merchiva.vercel.app";
const isDev = process.env.NODE_ENV === "development";
// Custom protocol scheme used for 3rd-party OAuth callbacks. The system
// browser hits /api/auth/callback, which redirects to merchiva://auth-callback?…
// The OS routes that URL to this app via `open-url` (macOS) or argv on a
// second instance (Windows/Linux). See `handleAuthUrl` below.
const SCHEME = "merchiva";

let mainWindow;
// If a merchiva:// URL fires before the renderer is ready (cold start from
// the system browser), we stash it here and deliver once webContents loads.
let pendingAuthCallback = null;

// Register this app as the default handler for merchiva:// URLs. Without this,
// the OS won't route the callback URL back to us.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(SCHEME);
}

// Single-instance lock — when the system browser fires the merchiva:// URL,
// the OS launches the app again. We catch that here, forward the URL to the
// existing window, and let the second process quit.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows/Linux: protocol URL arrives as a command-line arg.
    const url = argv.find((a) => typeof a === "string" && a.startsWith(`${SCHEME}://`));
    if (url) handleAuthUrl(url);
  });

  // macOS: protocol URL arrives via the `open-url` event.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleAuthUrl(url);
  });

  app.whenReady().then(() => {
    createWindow();
    // Cold-start case (Windows/Linux): if the app was launched BY the
    // protocol URL, it's in process.argv.
    const url = process.argv.find((a) => typeof a === "string" && a.startsWith(`${SCHEME}://`));
    if (url) handleAuthUrl(url);
    // Kick off the auto-updater after the window mounts so its UI is up to
    // show progress / restart prompts. Skipped in dev — there's no signed
    // build to update against, and dev-app-update.yml isn't shipped.
    if (!isDev) setupAutoUpdater();
  });
}

// ── Auto-updater ───────────────────────────────────────────────────────────
// Pulls releases from GitHub (`publish.provider: github` in package.json).
// Behavior: checks ~10s after launch and then every 6 hours while the app is
// open. Downloads in the background; once ready, prompts the user to restart.
let updateCheckTimer = null;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;        // download silently in background
  autoUpdater.autoInstallOnAppQuit = true; // belt-and-suspenders for skipped prompts
  autoUpdater.logger = {
    info: (...a) => console.log("[updater]", ...a),
    warn: (...a) => console.warn("[updater]", ...a),
    error: (...a) => console.error("[updater]", ...a),
    debug: () => {},
  };

  autoUpdater.on("checking-for-update", () => console.log("[updater] checking"));
  autoUpdater.on("update-not-available", (info) => console.log("[updater] up to date", info?.version));
  autoUpdater.on("update-available", (info) => console.log("[updater] available", info?.version));
  autoUpdater.on("error", (err) => console.error("[updater] error:", err?.message ?? err));

  autoUpdater.on("download-progress", (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:progress", {
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    }
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["立即重启", "稍后"],
      defaultId: 0,
      cancelId: 1,
      title: "Merchiva 有新版本",
      message: `已下载 v${info?.version ?? "(unknown)"}`,
      detail: "重启后即可使用最新版本。",
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[updater] check failed:", err?.message ?? err);
    });
  };

  // Initial check ~10s after launch (lets the main window settle first).
  setTimeout(check, 10_000);
  // Recurring check every 6 hours.
  updateCheckTimer = setInterval(check, SIX_HOURS_MS);

  // Manual trigger from the renderer (used by a "Check for updates" menu/UI).
  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version ?? null };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  ipcMain.handle("updater:quitAndInstall", () => {
    autoUpdater.quitAndInstall();
  });
}

function handleAuthUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${SCHEME}:`) return;
    if (parsed.hostname !== "auth-callback") return;
    const params = {};
    parsed.searchParams.forEach((v, k) => { params[k] = v; });
    if (mainWindow && !mainWindow.webContents.isLoading()) {
      mainWindow.focus();
      mainWindow.webContents.send("auth:callback", params);
    } else {
      pendingAuthCallback = params;
    }
  } catch (err) {
    console.error("[electron] failed to parse auth URL:", err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 600,
    title: "Merchiva",
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 16, y: 14 } }
      : {
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
            symbolColor: nativeTheme.shouldUseDarkColors ? "#ffffff" : "#0a0a0a",
            height: 40,
          },
        }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In the Electron shell we skip the marketing landing — the login page
  // auto-redirects to /~/dashboard when a session is already stored.
  const baseUrl = isDev ? DEV_URL : PROD_URL;
  mainWindow.loadURL(`${baseUrl}/login`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Deliver any auth-callback that arrived before the renderer was ready.
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingAuthCallback) {
      mainWindow.webContents.send("auth:callback", pendingAuthCallback);
      pendingAuthCallback = null;
    }
  });

  // Navigation IPC handlers
  ipcMain.handle("nav:back", () => {
    if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack();
  });
  ipcMain.handle("nav:forward", () => {
    if (mainWindow?.webContents.canGoForward()) mainWindow.webContents.goForward();
  });
  ipcMain.on("nav:canGoBack", (event) => {
    event.returnValue = mainWindow?.webContents.canGoBack() ?? false;
  });
  ipcMain.on("nav:canGoForward", (event) => {
    event.returnValue = mainWindow?.webContents.canGoForward() ?? false;
  });
  ipcMain.on("window:isFullScreen", (event) => {
    event.returnValue = mainWindow?.isFullScreen() ?? false;
  });

  // 3rd-party OAuth — renderer hands us the WorkOS authorization URL; we open
  // it in the system browser so Google/Apple don't reject the embedded webview.
  ipcMain.handle("auth:openExternal", (_event, url) => {
    if (typeof url !== "string") return;
    if (!/^https?:\/\//.test(url)) return;
    shell.openExternal(url);
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("window-all-closed", () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
