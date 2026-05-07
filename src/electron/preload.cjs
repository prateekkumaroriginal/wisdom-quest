const { contextBridge, ipcRenderer } = require("electron");

const isDev = Boolean(process.env.ELECTRON_START_URL);

contextBridge.exposeInMainWorld("edgecase", {
  platform: process.platform,
  isDev,
  getWindowMode: () => {
    console.log("[edgecase:preload] getWindowMode");
    return ipcRenderer.invoke("edgecase:get-window-mode");
  },
  setBorderless: (enabled) => {
    console.log("[edgecase:preload] setBorderless", Boolean(enabled));
    return ipcRenderer.invoke("edgecase:set-borderless", Boolean(enabled));
  },
  quitGame: () => {
    console.debug("[edgecase:quit] preload sending ipc");
    ipcRenderer.send("edgecase:quit-game");
  },
  loadLevels: isDev ? () => ipcRenderer.invoke("edgecase:load-levels") : undefined,
  saveLevel: isDev ? (level) => ipcRenderer.invoke("edgecase:save-level", level) : undefined,
  deleteLevel: isDev ? (id) => ipcRenderer.invoke("edgecase:delete-level", id) : undefined
});
