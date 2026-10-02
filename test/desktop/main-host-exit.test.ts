import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { FromHost } from "../../desktop/shared/ipc.js";

const state = vi.hoisted(() => ({
  hosts: [] as Array<EventEmitter & { postMessage: Mock }>,
  send: vi.fn(),
  ipc: new Map<string, (...args: unknown[]) => void>(),
  isBusy: undefined as undefined | (() => boolean),
  webContents: undefined as unknown,
}));
vi.mock("electron", async () => {
  // Vitest hoists mock factories before static imports initialize.
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { send: state.send, setWindowOpenHandler() {} });
    constructor() { super(); state.webContents = this.webContents; }
    loadFile() {}
  }
  return {
    app: Object.assign(new EventEmitter(), {
      isPackaged: true, getVersion: () => "0.9.1", getAppPath: () => "/tmp/Test.app/Contents/Resources/app.asar", getPath: () => "/tmp", setPath() {}, setName() {},
      whenReady: () => Promise.resolve(), quit: vi.fn(),
    }),
    BrowserWindow: Window,
    dialog: {},
    ipcMain: { on: (channel: string, handler: (...args: unknown[]) => void) => state.ipc.set(channel, handler), handle() {} },
    Menu: { setApplicationMenu() {}, buildFromTemplate: (value: unknown) => value },
    screen: { getAllDisplays: () => [] },
    utilityProcess: { fork: () => {
      const host = Object.assign(new EventEmitter(), { postMessage: vi.fn() });
      state.hosts.push(host);
      return host;
    } },
  };
});
vi.mock("../../desktop/main/updates.js", () => ({
  Updates: { create: async (options: { isBusy: () => boolean }) => {
    state.isBusy = options.isBusy;
    return { check: async () => ({ phase: "idle" }) };
  } },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("settles interrupted requests and releases busy state before host respawn", async () => {
  // Module startup must run after the mocked Electron setup.
  await import("../../desktop/main/index.js");
  await vi.waitFor(() => expect(state.hosts).toHaveLength(1));
  const invoke = state.ipc.get("scvn:to-host")!;
  const messages: FromHost[] = [];
  state.send.mockImplementation((channel: string, message: FromHost) => {
    if (channel === "scvn:from-host") messages.push(message);
  });
  invoke({ sender: state.webContents }, { kind: "invoke", requestId: "interrupted", command: "ping" });
  expect(state.isBusy!()).toBe(true);
  state.hosts[0]!.emit("exit", 1);
  expect(messages).toContainEqual(expect.objectContaining({ kind: "error", requestId: "interrupted", name: "HostExited" }));
  expect(state.isBusy!()).toBe(false);
  expect(state.hosts).toHaveLength(2);
  invoke({ sender: state.webContents }, { kind: "invoke", requestId: "after-respawn", command: "ping" });
  expect(state.isBusy!()).toBe(true);
  state.hosts[1]!.emit("message", { kind: "result", requestId: "after-respawn", value: "pong" });
  expect(state.isBusy!()).toBe(false);
  expect(messages).toContainEqual({ kind: "result", requestId: "after-respawn", value: "pong" });
});
