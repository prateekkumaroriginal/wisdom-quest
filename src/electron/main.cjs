const { app, BrowserWindow, Menu, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const isDev = Boolean(process.env.ELECTRON_START_URL);
let mainWindow = null;
let windowedBounds = null;
let isBorderless = false;
let windowModeHandlersInstalled = false;
let devLevelHandlersInstalled = false;

function logWindowMode(message, details = {}) {
  console.log("[edgecase:window-mode]", message, details);
}

function logLevelStore(message, details = {}) {
  console.log("[edgecase:levels]", message, details);
}

function readLevelsSource() {
  const levelsPath = path.join(__dirname, "..", "game", "data", "levels.js");
  const source = fs.readFileSync(levelsPath, "utf8");
  const defaultMatch = source.match(/export const DEFAULT_LEVEL_ID = (["'])(.*?)\1;/);
  const levelsMatch = source.match(/export const LEVELS = ([\s\S]*?);\s*$/);
  if (!levelsMatch) {
    throw new Error("Could not find LEVELS export.");
  }

  // Dev-only local source parsing for the level authoring tool.
  const levels = Function(`"use strict"; return (${levelsMatch[1]});`)();
  const defaultLevelId = defaultMatch?.[2] || levels[0]?.id || "level-1";
  return { defaultLevelId, levelsPath, levels };
}

function createLevelId(levels) {
  let id = crypto.randomUUID();
  while (levels.some((level) => level.id === id)) {
    id = crypto.randomUUID();
  }
  return id;
}

function formatLevelValue(value, indent = 0) {
  const pad = " ".repeat(indent);
  const next = " ".repeat(indent + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${next}${formatLevelValue(item, indent + 2)}`);
    return `[\n${items.join(",\n")}\n${pad}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const fields = entries.map(([key, item]) => `${next}${key}: ${formatLevelValue(item, indent + 2)}`);
    return `{\n${fields.join(",\n")}\n${pad}}`;
  }

  return JSON.stringify(value);
}

function formatLevelsFile(defaultLevelId, levels) {
  return `export const DEFAULT_LEVEL_ID = ${JSON.stringify(defaultLevelId)};\n\nexport const LEVELS = ${formatLevelValue(levels)};\n`;
}

function installDevLevelHandlers() {
  if (devLevelHandlersInstalled) {
    return;
  }
  devLevelHandlersInstalled = true;

  ipcMain.handle("edgecase:load-levels", async () => {
    const { levels } = readLevelsSource();
    logLevelStore("load-levels", { count: levels.length, isDev });
    return levels;
  });

  ipcMain.handle("edgecase:save-level", async (_event, level) => {
    if (!level || typeof level !== "object") {
      throw new Error("Invalid level payload.");
    }

    const name = String(level.name || "").trim();
    if (!name) {
      throw new Error("Level name is required.");
    }

    const { defaultLevelId, levelsPath, levels } = readLevelsSource();
    const incomingId = String(level.id || "").trim();
    const existingIndexByIncomingId = incomingId && incomingId !== "new-level"
      ? levels.findIndex((item) => item.id === incomingId)
      : -1;
    const isExistingLevel = existingIndexByIncomingId >= 0;
    const id = isExistingLevel ? incomingId : createLevelId(levels);

    const savedLevel = { ...level, id, name };
    const existingIndex = isExistingLevel ? existingIndexByIncomingId : -1;
    if (existingIndex >= 0) {
      levels[existingIndex] = savedLevel;
    } else {
      levels.push(savedLevel);
    }

    const nextDefaultLevelId = levels.some((item) => item.id === defaultLevelId) ? defaultLevelId : levels[0]?.id || id;
    fs.writeFileSync(levelsPath, formatLevelsFile(nextDefaultLevelId, levels), "utf8");
    logLevelStore("save-level completed", { id, name, count: levels.length });
    return { id, name };
  });

  ipcMain.handle("edgecase:delete-level", async (_event, id) => {
    const levelId = String(id || "").trim();
    if (!levelId) {
      throw new Error("Level id is required.");
    }

    const { defaultLevelId, levelsPath, levels } = readLevelsSource();
    if (levels.length <= 1) {
      throw new Error("At least one level is required.");
    }

    const existingIndex = levels.findIndex((item) => item.id === levelId);
    if (existingIndex < 0) {
      throw new Error("Level was not found.");
    }

    const [deleted] = levels.splice(existingIndex, 1);
    const nextDefaultLevelId = defaultLevelId === deleted.id ? levels[0].id : defaultLevelId;
    fs.writeFileSync(levelsPath, formatLevelsFile(nextDefaultLevelId, levels), "utf8");
    logLevelStore("delete-level completed", { id: deleted.id, name: deleted.name, count: levels.length, defaultLevelId: nextDefaultLevelId });
    return { id: deleted.id, name: deleted.name, defaultLevelId: nextDefaultLevelId };
  });
}

function installWindowModeHandlers() {
  if (windowModeHandlersInstalled) {
    return;
  }
  windowModeHandlersInstalled = true;

  ipcMain.handle("edgecase:get-window-mode", async () => {
    logWindowMode("get-window-mode", {
      borderless: isBorderless,
      hasWindow: Boolean(mainWindow),
      bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
    });
    return { borderless: isBorderless };
  });

  ipcMain.handle("edgecase:set-borderless", async (_event, enabled) => {
    const shouldEnable = Boolean(enabled);
    logWindowMode("set-borderless requested", {
      requested: shouldEnable,
      current: isBorderless,
      hasWindow: Boolean(mainWindow),
      bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
    });

    if (shouldEnable === isBorderless && mainWindow) {
      if (!mainWindow.isDestroyed() && mainWindow.isFullScreen() !== shouldEnable) {
        mainWindow.setFullScreen(shouldEnable);
      }
      logWindowMode("set-borderless skipped; already in requested mode", {
        borderless: isBorderless,
        fullscreen: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : null
      });
      return { borderless: isBorderless };
    }

    try {
      recreateWindow(shouldEnable);
    } catch (error) {
      logWindowMode("set-borderless failed", {
        message: error?.message,
        stack: error?.stack
      });
      throw error;
    }

    logWindowMode("set-borderless completed", {
      borderless: isBorderless,
      bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
    });
    return { borderless: isBorderless };
  });

  ipcMain.handle("edgecase:quit-game", async () => {
    app.quit();
  });
}

installWindowModeHandlers();

function createWindow(options = {}) {
  const borderless = Boolean(options.borderless);
  const bounds = options.bounds || {
    width: 1280,
    height: 720
  };
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#07100f",
    title: "Wisdom Quest",
    autoHideMenuBar: true,
    frame: !borderless,
    fullscreen: borderless,
    hasShadow: !borderless,
    roundedCorners: false,
    thickFrame: !borderless,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;
  isBorderless = borderless;
  logWindowMode("window created", {
    borderless,
    bounds: win.getBounds(),
    fullscreen: win.isFullScreen(),
    isDev
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
    win.webContents.openDevTools({ mode: "detach" });
    return win;
  }

  win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  return win;
}

function recreateWindow(borderless) {
  const previous = mainWindow;
  const previousBounds = previous && !previous.isDestroyed() ? previous.getBounds() : null;
  const wasMaximized = previous && !previous.isDestroyed() ? previous.isMaximized() : false;
  const wasBorderless = isBorderless;
  logWindowMode("recreate-window start", {
    nextBorderless: borderless,
    wasBorderless,
    previousBounds,
    windowedBounds,
    wasMaximized
  });

  if (borderless && previousBounds && !wasBorderless) {
    windowedBounds = previousBounds;
  }

  const bounds = borderless
    ? screen.getDisplayMatching(previousBounds || { x: 0, y: 0, width: 1280, height: 720 }).bounds
    : windowedBounds || previousBounds || { width: 1280, height: 720 };

  const next = createWindow({ borderless, bounds });
  if (!borderless && wasMaximized && next) {
    next.maximize();
  }

  if (previous && !previous.isDestroyed()) {
    logWindowMode("destroying previous window");
    previous.destroy();
  }

  if (isDev && next) {
    next.webContents.once("did-finish-load", () => {
      if (!next.isDestroyed()) {
        next.webContents.openDevTools({ mode: "detach" });
      }
    });
  }

  logWindowMode("recreate-window done", {
    borderless: isBorderless,
    bounds: next && !next.isDestroyed() ? next.getBounds() : null
  });
}

app.whenReady().then(() => {
  installDevLevelHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
