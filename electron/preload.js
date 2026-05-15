const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
  navigateBack: () => ipcRenderer.invoke("nav:back"),
  navigateForward: () => ipcRenderer.invoke("nav:forward"),
  canGoBack: () => ipcRenderer.sendSync("nav:canGoBack"),
  canGoForward: () => ipcRenderer.sendSync("nav:canGoForward"),
  isFullScreen: () => ipcRenderer.sendSync("window:isFullScreen"),
  // 3rd-party OAuth — hand the WorkOS authorization URL to the main process so
  // it opens in the user's system browser (Google/Apple block embedded auth).
  openExternalAuth: (url) => ipcRenderer.invoke("auth:openExternal", url),
  // The OAuth callback arrives back via the merchiva:// custom protocol. The
  // main process forwards it here as an "auth:callback" event. Renderer code
  // can subscribe to extract the tokens and complete the sign-in.
  onAuthCallback: (handler) => {
    const listener = (_event, params) => handler(params);
    ipcRenderer.on("auth:callback", listener);
    return () => ipcRenderer.removeListener("auth:callback", listener);
  },
});
