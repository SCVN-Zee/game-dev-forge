import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import semver from "semver";
import yauzl from "yauzl";
import type { UpdateChannel } from "../shared/ipc.js";

const run = promisify(execFile);
export const UPDATE_REPO = "SCVN-Zee/game-dev-forge";
export const UPDATE_BUNDLE = "Game Dev Forge.app";
export interface ReleaseArtifact { version: string; url: string; digest: string; size: number }
interface ReleaseMetadata {
  tag_name?: string; draft?: boolean; prerelease?: boolean;
  assets?: { name?: string; state?: string; digest?: string; size?: number; browser_download_url?: string }[];
}

export function selectRelease(releases: ReleaseMetadata[], currentVersion: string, channel: UpdateChannel): ReleaseArtifact | null {
  const candidates = releases.filter((release) => {
    const version = release.tag_name?.slice(1);
    return !release.draft && release.tag_name?.startsWith("v") && version && semver.valid(version) === version &&
      Boolean(semver.prerelease(version)) === Boolean(release.prerelease) &&
      (channel === "beta" || !release.prerelease) && semver.gt(version, currentVersion);
  }).sort((a, b) => semver.rcompare(a.tag_name!.slice(1), b.tag_name!.slice(1)));
  const release = candidates[0];
  if (!release) return null;
  const version = release.tag_name!.slice(1);
  const name = `game-dev-forge-${version}-arm64.zip`;
  const asset = release.assets?.find((entry) => entry.name === name && entry.state === "uploaded");
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "")) {
    throw new Error("The release has no verified arm64 ZIP. Wait for a complete release or install its DMG manually.");
  }
  const url = `https://github.com/${UPDATE_REPO}/releases/download/${release.tag_name}/${name}`;
  if (asset.browser_download_url !== url || !Number.isSafeInteger(asset.size) || asset.size! <= 0) {
    throw new Error("Invalid update asset metadata.");
  }
  return { version, url, size: asset.size!, digest: asset.digest!.slice(7) };
}

export async function fetchReleases(signal: AbortSignal): Promise<ReleaseMetadata[]> {
  const releases: ReleaseMetadata[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, signal,
    });
    if (!response.ok) throw new Error(`GitHub update check failed (HTTP ${response.status}). Releases must be publicly accessible; retry later.`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid GitHub release response.");
    releases.push(...data as ReleaseMetadata[]);
    if (data.length < 100) return releases;
  }
}

export async function downloadVerified(release: ReleaseArtifact, destination: string, signal: AbortSignal, onProgress: (percent: number) => void): Promise<void> {
  const response = await fetch(release.url, { signal });
  if (!response.ok || !response.body) throw new Error(`Update download failed (HTTP ${response.status}).`);
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > release.size) return callback(new Error("Download exceeds the release size."));
    hash.update(chunk);
    onProgress(Math.floor(bytes / release.size * 100));
    callback(null, chunk);
  } });
  try {
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter,
      fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }), { signal });
    if (bytes !== release.size || hash.digest("hex") !== release.digest) throw new Error("Update checksum mismatch. Download discarded.");
  } catch (error) {
    await fsp.rm(destination, { force: true });
    throw error;
  }
}

// Extract files and materialize every link parent before creating any links.
export async function extractBundle(zipPath: string, workspace: string, signal: AbortSignal): Promise<string> {
  const root = path.join(workspace, UPDATE_BUNDLE);
  const links: { file: string; target: string }[] = [];
  const names = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("Cannot open update ZIP."));
      const fail = (cause: unknown): void => { zip.close(); reject(cause); };
      zip.on("error", fail);
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          signal.throwIfAborted();
          const name = entry.fileName;
          if (name.startsWith("__MACOSX/")) { zip.readEntry(); return; }
          const parts = name.replace(/\/$/, "").split("/");
          if (parts[0] !== UPDATE_BUNDLE || parts.some((part) => !part || part === "." || part === "..") || /[\\\x00-\x1f]/.test(name)) {
            throw new Error("Unsafe path in update ZIP.");
          }
          const key = name.replace(/\/$/, "").normalize("NFD").toLowerCase();
          if (names.has(key)) throw new Error("Duplicate path in update ZIP.");
          names.add(key);
          const file = path.join(workspace, ...parts);
          const mode = entry.externalFileAttributes >>> 16;
          const kind = mode & 0o170000;
          if (name.endsWith("/")) {
            if (kind && kind !== 0o040000) throw new Error("Invalid ZIP directory.");
            await fsp.mkdir(file, { recursive: true, mode: 0o755 });
          } else {
            if (kind && kind !== 0o100000 && kind !== 0o120000) throw new Error("Unsupported ZIP entry type.");
            const stream = await new Promise<Readable>((ok, no) => zip.openReadStream(entry, (e, s) => e || !s ? no(e) : ok(s)));
            if (kind === 0o120000) {
              if (entry.uncompressedSize > 4096) throw new Error("Invalid ZIP symlink.");
              const chunks: Buffer[] = [];
              for await (const chunk of stream) chunks.push(chunk as Buffer);
              const target = Buffer.concat(chunks).toString("utf8");
              const resolved = path.resolve(path.dirname(file), target);
              if (!target || /[\x00-\x1f]/.test(target) || path.isAbsolute(target) || !resolved.startsWith(root + path.sep)) {
                throw new Error("External symlink in update ZIP.");
              }
              links.push({ file, target });
            } else {
              await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o755 });
              await pipeline(stream, fs.createWriteStream(file, { flags: "wx", mode: (mode & 0o777) || 0o644 }), { signal });
            }
          }
          zip.readEntry();
        })().catch(fail);
      });
      zip.on("end", resolve);
      zip.readEntry();
    });
  });
  for (const link of links) {
    signal.throwIfAborted();
    await fsp.mkdir(path.dirname(link.file), { recursive: true, mode: 0o755 });
  }
  // A link used as another link's parent now conflicts with a real directory.
  for (const link of links) {
    signal.throwIfAborted();
    await fsp.symlink(link.target, link.file);
  }
  for (const link of links) {
    if (!(await fsp.realpath(link.file)).startsWith(root + path.sep)) throw new Error("External symlink chain in update ZIP.");
  }
  if (await fsp.realpath(root) !== root) throw new Error("Invalid update bundle root.");
  return root;
}

export async function stageUpdate(release: ReleaseArtifact, target: string, signal: AbortSignal, onProgress: (percent: number) => void): Promise<string> {
  if (target.includes("/AppTranslocation/") || !target.endsWith(".app")) throw new Error("Move Game Dev Forge to Applications before updating.");
  if ((await fsp.lstat(target)).isSymbolicLink() || await fsp.realpath(target) !== target) throw new Error("Cannot update a symlinked application path.");
  await fsp.access(target, fs.constants.W_OK);
  await fsp.access(path.dirname(target), fs.constants.W_OK);
  const workspace = await fsp.mkdtemp(path.join(path.dirname(target), ".gdf-update-"));
  await fsp.chmod(workspace, 0o700);
  try {
    const zip = path.join(workspace, "update.zip");
    await downloadVerified(release, zip, signal, onProgress);
    const bundle = await extractBundle(zip, workspace, signal);
    const plist = path.join(bundle, "Contents", "Info.plist");
    for (const [key, expected] of [["CFBundleIdentifier", "com.supercent.scvn"], ["CFBundleShortVersionString", release.version]]) {
      const { stdout } = await run("/usr/bin/plutil", ["-extract", key!, "raw", "-o", "-", plist], { signal });
      if (stdout.trim() !== expected) throw new Error(`Update ${key} does not match the release.`);
    }
    const { stdout: executable } = await run("/usr/bin/plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", plist], { signal });
    if (path.basename(executable.trim()) !== executable.trim()) throw new Error("Invalid app executable.");
    await run("/usr/bin/lipo", [path.join(bundle, "Contents", "MacOS", executable.trim()), "-verify_arch", "arm64"], { signal });
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], { signal });
    await fsp.rm(zip);
    return workspace;
  } catch (error) {
    await fsp.rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

export async function launchInstaller(target: string, workspace: string, userData: string, helperSource: string, pid = process.pid): Promise<void> {
  const directory = path.join(userData, "updates");
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const helper = path.join(workspace, "install-update.sh");
  await fsp.copyFile(helperSource, helper);
  const log = path.join(directory, "install.log");
  await fsp.writeFile(log, "Installing update\n", { mode: 0o600 });
  const child = spawn("/bin/sh", [helper, String(pid), target, workspace, log], { detached: true, stdio: "ignore" });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
}
