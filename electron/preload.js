const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
  navigateBack: () => ipcRenderer.invoke("nav:back"),
  navigateForward: () => ipcRenderer.invoke("nav:forward"),
  canGoBack: () => ipcRenderer.sendSync("nav:canGoBack"),
  canGoForward: () => ipcRenderer.sendSync("nav:canGoForward"),
  isFullScreen: () => ipcRenderer.sendSync("window:isFullScreen"),
});
