/**
 * desktop/main/index.ts — Electron main process: window + IPC broker.
 *
 * Owns the BrowserWindow and a single long-lived utility-process command host.
 * It relays the typed IPC protocol both ways (renderer ⇆ host) and watches the
 * host for exit so a hung/killed host is detected instead of freezing the UI.
 * Native dialogs (folder pickers) are owned here too (wired in Phase 3).
 */

import { app, BrowserWindow, dialog, ipcMain, screen, utilityProcess, type OpenDialogOptions, type SaveDialogOptions, type UtilityProcess } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { FromHost, PromptRequestMessage, ToHost } from "../shared/ipc.js";
import { loadConfig } from "../../src/config/load.js";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampWindowState,
  defaultWindowState,
  parseWindowState,
  windowStateFromBounds,
  type WindowState,
} from "./window-state.js";

const CHANNEL_TO_HOST = "scvn:to-host";
const CHANNEL_FROM_HOST = "scvn:from-host";
const CHANNEL_HOST_STATUS = "scvn:host-status";
const CHANNEL_SELFTEST = "scvn:selftest";
const CHANNEL_PICK_DIR = "scvn:pick-dir";
const CHANNEL_PICK_SAVE = "scvn:pick-save";

// Bundled to CJS by tsup, so __dirname resolves to dist-desktop/.
const HOST_ENTRY = path.join(__dirname, "host.cjs");
const PRELOAD_ENTRY = path.join(__dirname, "preload.cjs");
const RENDERER_HTML = path.join(__dirname, "renderer", "index.html");
const DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const SELFTEST = Boolean(process.env["SCVN_DESKTOP_SELFTEST"]);

// Packaged builds historically used scvn; dev launches keep Electron's existing profile.
app.setPath("userData", app.isPackaged ? path.join(app.getPath("appData"), "scvn") : app.getPath("userData"));
app.setName("Game Dev Forge");

const MAX_HOST_RESPAWNS = 5;

let mainWindow: BrowserWindow | null = null;
let host: UtilityProcess | null = null;
let hostRespawns = 0;

/** Fork the command host and relay its messages to the renderer. */
function spawnHost(): void {
  host = utilityProcess.fork(HOST_ENTRY, [], {
    serviceName: "scvn-host",
    env: { ...process.env, SCVN_HOST_EXEC_PATH: process.execPath },
  });

  host.on("message", (message: FromHost) => {
    // Directory/file text prompts are answered by a native picker in main,
    // never forwarded to the renderer (the headline folder-browse UX).
    if (message.kind === "prompt-request" && message.prompt.type === "text" &&
        (message.prompt.kind === "dir" || message.prompt.kind === "path")) {
      void answerWithNativePicker(message);
      return;
    }
    mainWindow?.webContents.send(CHANNEL_FROM_HOST, message);
  });

  host.on("spawn", () => process.stderr.write("host spawned\n"));
  host.on("exit", (code) => {
    mainWindow?.webContents.send(CHANNEL_HOST_STATUS, { kind: "host-exit", code });
    host = null;
    if (hostRespawns < MAX_HOST_RESPAWNS) {
      hostRespawns += 1;
      spawnHost();
      mainWindow?.webContents.send(CHANNEL_HOST_STATUS, { kind: "host-respawn", attempt: hostRespawns });
    }
  });
}

/** Send a message to the host, or surface an error if it is not running. */
function sendToHost(message: ToHost): void {
  if (!host) {
    if (message.kind === "invoke") {
      mainWindow?.webContents.send(CHANNEL_FROM_HOST, {
        kind: "error",
        requestId: message.requestId,
        name: "HostUnavailable",
        message: "Command host is not running",
      } satisfies FromHost);
    }
    return;
  }
  host.postMessage(message);
}

/** Home-expand a leading ~ so native dialogs open where the user expects. */
function expandDefault(raw: string | undefined): string | undefined {
  return raw?.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
}

/** Picker options relayed over CHANNEL_PICK_DIR; `multi` enables multi-selection. */
interface PickOptions { kind?: "dir" | "path"; title?: string; defaultPath?: string }

/** Open a native folder/file picker; returns the chosen path, or null when cancelled. */
async function openPathDialog(opts?: PickOptions): Promise<string | null>;
/** Multi-selection variant: every chosen path, or null when cancelled / nothing chosen. */
async function openPathDialog(opts: PickOptions & { multi: true }): Promise<string[] | null>;
async function openPathDialog(opts: PickOptions & { multi?: boolean } = {}): Promise<string | string[] | null> {
  const properties: OpenDialogOptions["properties"] =
    opts.kind === "path" ? ["openFile", "openDirectory"] : ["openDirectory"];
  if (opts.multi) properties.push("multiSelections");
  // Project pickers with no explicit start location open at the configured
  // Unity projects root (Settings → Config); loadConfig never throws, so an
  // unset/absent config just yields the OS default.
  const start = opts.defaultPath ?? (await loadConfig()).projectsRoot;
  const options: OpenDialogOptions = {
    properties,
    title: opts.title ?? "Select a folder",
    defaultPath: expandDefault(start),
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return null;
  return opts.multi
    ? (result.filePaths.length > 0 ? result.filePaths : null)
    : (result.filePaths[0] ?? null);
}

interface SaveOptions {
  title?: string;
  defaultPath?: string;
}

async function savePathDialog(opts: SaveOptions = {}): Promise<string | null> {
  const options: SaveDialogOptions = {
    title: opts.title ?? "Save layout manifest",
    defaultPath: expandDefault(opts.defaultPath),
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  return result.canceled ? null : (result.filePath ?? null);
}

/** Answer a dir/file text prompt by opening a native picker; null = cancelled. */
async function answerWithNativePicker(message: PromptRequestMessage): Promise<void> {
  const { prompt, requestId, promptId } = message;
  if (prompt.type !== "text") return;
  const picked = await openPathDialog({
    kind: prompt.kind === "path" ? "path" : "dir",
    title: prompt.message,
    defaultPath: prompt.defaultValue,
  });
  sendToHost({ kind: "prompt-response", requestId, promptId, value: picked });
}

/** Path to the last BrowserWindow geometry (main-owned, not the CLI config). */
function windowStatePath(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

/** Read saved geometry, falling back to 1224×918. Never throws. */
function loadWindowState(): WindowState {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(windowStatePath(), "utf8"));
    const state = parseWindowState(parsed);
    if (state) return state;
  } catch {
    // Missing/corrupt prefs → fall through to the first-launch default.
  }
  return defaultWindowState();
}

/**
 * Persist the window's normal bounds. Zoomed/fullscreen sessions save
 * getNormalBounds() plus isMaximized so a later launch is not a huge normal
 * window. Self-test never writes (must not pollute userData). A write failure
 * is logged, never fatal.
 */
function saveWindowState(win: BrowserWindow): void {
  if (SELFTEST || win.isDestroyed()) return;
  const isMaximized = win.isMaximized();
  const bounds = isMaximized || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
  const state = windowStateFromBounds(bounds, isMaximized);
  try {
    fs.writeFileSync(windowStatePath(), `${JSON.stringify(state, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`window-state write failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

function createWindow(): void {
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const state = clampWindowState(loadWindowState(), workAreas);

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Game Dev Forge",
    backgroundColor: "#121218",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: PRELOAD_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.isMaximized) mainWindow.maximize();

  // The self-test env value doubles as the command to run ("1" → ping).
  const selftestEnv = process.env["SCVN_DESKTOP_SELFTEST"];
  const search = SELFTEST
    ? `selftest=${encodeURIComponent(selftestEnv && selftestEnv !== "1" ? selftestEnv : "ping")}`
    : "";
  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(search ? `${DEV_SERVER_URL}?${search}` : DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(RENDERER_HTML, search ? { search } : undefined);
  }

  const wc = mainWindow.webContents;
  wc.on("did-fail-load", (_e, code, desc, url) => {
    process.stderr.write(`renderer did-fail-load ${code} ${desc} ${url}\n`);
  });
  wc.on("preload-error", (_e, preloadPath, error) => {
    process.stderr.write(`preload-error ${preloadPath}: ${error.message}\n`);
  });
  wc.on("render-process-gone", (_e, details) => {
    process.stderr.write(`render-process-gone: ${details.reason}\n`);
  });
  wc.on("console-message", (event) => {
    process.stderr.write(`renderer console [${event.level}]: ${event.message}\n`);
  });

  // Hardening: this window only ever loads the bundled renderer (or the dev
  // server). Deny renderer-initiated navigation and new windows outright.
  wc.on("will-navigate", (event) => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));

  const win = mainWindow;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win), 200);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);
  win.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveWindowState(win);
  });
  win.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Renderer → host relay.
  ipcMain.on(CHANNEL_TO_HOST, (_event, message: ToHost) => sendToHost(message));

  // Headless self-test report: only wired in self-test mode, so a normal
  // renderer can never trigger app.exit() through this channel.
  if (SELFTEST) {
    ipcMain.on(CHANNEL_SELFTEST, (_event, ok: boolean) => {
      app.exit(ok ? 0 : 1);
    });
  }

  // Session-less native folder/file picker for launch forms.
  ipcMain.handle(
    CHANNEL_PICK_DIR,
    // Branch on multi so each side picks the matching overload (scalar vs
    // array) instead of one broad union crossing the IPC boundary.
    (_event, options: PickOptions & { multi?: boolean }) =>
      options?.multi
        ? openPathDialog({ ...options, multi: true })
        : openPathDialog(options),
  );

  ipcMain.handle(
    CHANNEL_PICK_SAVE,
    (_event, options: SaveOptions | undefined) => savePathDialog(options),
  );

  spawnHost();
  createWindow();

  // Safety net: if the self-test never reports, fail rather than hang forever.
  if (SELFTEST) {
    setTimeout(() => {
      process.stderr.write("gdf selftest: timed out with no report\n");
      app.exit(1);
    }, 20_000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
