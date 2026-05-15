const { app, BrowserWindow, shell, nativeTheme, ipcMain } = require("electron");
const path = require("path");

const DEV_URL = "http://localhost:3000";
const PROD_URL = process.env.MERCHIVA_URL || "https://merchiva.vercel.app";
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

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

  const url = isDev ? DEV_URL : PROD_URL;
  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
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

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
