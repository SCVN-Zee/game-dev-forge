import fs from "node:fs/promises";
import path from "node:path";
import type { UpdateChannel, UpdateState } from "../shared/ipc.js";
import { fetchReleases, selectRelease, stageUpdate, launchInstaller, type ReleaseArtifact } from "./update-artifacts.js";

interface UpdateOptions {
  currentVersion: string;
  supported: boolean;
  target: string;
  userData: string;
  helperSource: string;
  changed(state: UpdateState): void;
  confirm(message: string, detail: string, action: string): Promise<boolean>;
  isBusy(): boolean;
  requestRestart(): void;
}

export class Updates {
  private state: UpdateState;
  private release: ReleaseArtifact | null = null;
  private workspace: string | null = null;
  private controller: AbortController | null = null;
  private operation: Promise<UpdateState> | null = null;
  private channelChange: Promise<UpdateState> | null = null;
  private closing = false;
  private readonly preference: string;

  private constructor(private readonly options: UpdateOptions, channel: UpdateChannel) {
    this.preference = path.join(options.userData, "update-channel.json");
    this.state = { phase: "idle", channel, currentVersion: options.currentVersion, supported: options.supported };
  }

  static async create(options: UpdateOptions): Promise<Updates> {
    let channel: UpdateChannel = "stable";
    try {
      const data: unknown = JSON.parse(await fs.readFile(path.join(options.userData, "update-channel.json"), "utf8"));
      if (data === "beta") channel = "beta";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Cannot read update channel:", error);
    }
    return new Updates(options, channel);
  }

  getState(): UpdateState { return { ...this.state }; }
  private publish(phase: UpdateState["phase"], extra: Partial<UpdateState> = {}): void {
    this.state = { channel: this.state.channel, currentVersion: this.options.currentVersion, supported: this.options.supported, phase, ...extra };
    this.options.changed(this.getState());
  }
  private async clearPrepared(): Promise<void> {
    const workspace = this.workspace;
    this.workspace = null;
    this.release = null;
    if (workspace) await fs.rm(workspace, { recursive: true, force: true });
  }
  private run(action: (signal: AbortSignal) => Promise<void>, timeout: number): Promise<UpdateState> {
    if (this.operation || this.channelChange || this.closing || this.state.phase === "installing") return Promise.resolve(this.getState());
    this.controller = new AbortController();
    const cancellation = this.controller;
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(timeout)]);
    const operation = (async () => {
      try { await action(signal); }
      catch (error) {
        if (!cancellation.signal.aborted && !this.closing) {
          this.publish("error", { message: error instanceof Error ? error.message : String(error) });
          console.error("Update failed:", error);
        }
      }
      return this.getState();
    })();
    this.operation = operation;
    void operation.finally(() => { if (this.operation === operation) { this.operation = null; this.controller = null; } });
    return operation;
  }

  async setChannel(channel: UpdateChannel): Promise<UpdateState> {
    if (channel !== "stable" && channel !== "beta") throw new Error("Invalid update channel.");
    if (this.closing || this.state.phase === "installing") return this.getState();
    if (this.channelChange) await this.channelChange;
    if (this.state.channel === channel) return this.getState();
    const change = (async () => {
      this.controller?.abort();
      await this.operation;
      await fs.mkdir(this.options.userData, { recursive: true });
      const temporary = this.preference + ".tmp";
      await fs.writeFile(temporary, JSON.stringify(channel) + "\n", { mode: 0o600 });
      await fs.rename(temporary, this.preference);
      await this.clearPrepared();
      this.state.channel = channel;
      this.publish("idle", { message: channel === "stable" ? "Stable selected. Updates never downgrade your installed version." : "Beta selected. Newer beta and stable releases are eligible." });
      return this.getState();
    })();
    this.channelChange = change;
    try { return await change; } finally { if (this.channelChange === change) this.channelChange = null; }
  }

  check(manual = true): Promise<UpdateState> {
    return this.run(async (signal) => {
      if (!this.options.supported) { this.publish("idle", { message: "Updates are available in installed macOS Apple Silicon builds." }); return; }
      if (this.workspace) return;
      this.publish("checking");
      const releases = await fetchReleases(signal);
      signal.throwIfAborted();
      this.release = selectRelease(releases, this.options.currentVersion, this.state.channel);
      if (!this.release) { this.publish("idle", { message: `No newer ${this.state.channel} release is available. Updates never downgrade your installed version.` }); return; }
      this.publish("available", { version: this.release.version });
      if (!manual) {
        const accepted = await this.options.confirm(`Game Dev Forge ${this.release.version} is available.`, "Download the verified update from GitHub Releases? Installation requires a separate confirmed restart.", "Download Update");
        signal.throwIfAborted();
        if (accepted) await this.prepare(signal);
      }
    }, manual ? 30_000 : 10 * 60_000);
  }

  private async prepare(signal: AbortSignal): Promise<void> {
    const release = this.release;
    if (!release) return;
    this.publish("downloading", { version: release.version, percent: 0 });
    const workspace = await stageUpdate(release, this.options.target, signal, (percent) => {
      if (!signal.aborted && percent !== this.state.percent) this.publish("downloading", { version: release.version, percent });
    });
    if (signal.aborted || this.closing) { await fs.rm(workspace, { recursive: true, force: true }); return; }
    this.workspace = workspace;
    this.publish("ready", { version: release.version, message: "Verified update ready. Restart and install when project operations have finished." });
  }

  download(): Promise<UpdateState> {
    return this.run(async (signal) => {
      if (!this.release || this.workspace) return;
      const accepted = await this.options.confirm(`Download Game Dev Forge ${this.release.version}?`, "The complete ZIP will be downloaded from GitHub and verified before installation.", "Download Update");
      signal.throwIfAborted();
      if (accepted) await this.prepare(signal);
    }, 10 * 60_000);
  }

  install(): Promise<UpdateState> {
    return this.run(async (signal) => {
      if (!this.workspace) return;
      if (this.options.isBusy()) { this.publish("ready", { version: this.release!.version, message: "Finish active project operations before restarting to update." }); return; }
      const accepted = await this.options.confirm(`Install Game Dev Forge ${this.release!.version}?`, "Restart to replace the application. Preferences and projects stay in place. The previous app is retained for recovery.", "Restart and Install");
      signal.throwIfAborted();
      if (!accepted) return;
      if (this.options.isBusy()) { this.publish("ready", { version: this.release!.version, message: "Finish active project operations before restarting to update." }); return; }
      this.publish("installing", { version: this.release!.version });
      this.options.requestRestart();
    }, 10 * 60_000);
  }

  async launch(): Promise<void> {
    await this.channelChange;
    if (!this.workspace || this.state.phase !== "installing") throw new Error("No verified update is ready to install.");
    await launchInstaller(this.options.target, this.workspace, this.options.userData, this.options.helperSource);
  }
  installationFailed(error: unknown): void {
    this.publish("ready", { version: this.release?.version, message: error instanceof Error ? error.message : String(error) });
  }
  async discard(): Promise<void> {
    this.closing = true;
    this.controller?.abort();
    await this.channelChange;
    await this.operation;
    await this.clearPrepared();
  }
}
