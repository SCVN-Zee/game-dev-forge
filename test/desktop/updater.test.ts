import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadVerified,
  extractBundle,
  selectRelease,
  UPDATE_BUNDLE,
  UPDATE_REPO,
} from "../../desktop/main/update-artifacts.js";
import { Updates } from "../../desktop/main/updates.js";
import type { ReleaseArtifact } from "../../desktop/main/update-artifacts.js";
const dirs: string[] = [];
async function temp() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "gdf-updater-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});
function release(
  v: string,
  o: {
    prerelease?: boolean;
    digest?: string;
    name?: string;
    url?: string;
    size?: number;
    draft?: boolean;
  } = {},
) {
  const n = o.name ?? `game-dev-forge-${v}-arm64.zip`;
  return {
    tag_name: `v${v}`,
    draft: o.draft ?? false,
    prerelease: o.prerelease ?? false,
    assets: [
      {
        name: n,
        state: "uploaded",
        digest: o.digest ?? `sha256:${"a".repeat(64)}`,
        size: o.size ?? 25,
        browser_download_url:
          o.url ??
          `https://github.com/${UPDATE_REPO}/releases/download/v${v}/${n}`,
      },
    ],
  };
}
describe("release selection", () => {
  it("selects channel-eligible versions semantically and never downgrades", () => {
    const rs = [
      release("2.0.0", { draft: true }),
      release("1.9.0-beta.3", { prerelease: true }),
      release("1.10.0-beta.1", { prerelease: true }),
      release("1.9.0"),
      release("1.10.0"),
    ];
    expect(selectRelease(rs, "1.9.1", "stable")?.version).toBe("1.10.0");
    expect(selectRelease(rs, "1.9.1", "beta")?.version).toBe("1.10.0");
    expect(selectRelease(rs, "1.10.0", "beta")).toBeNull();
    expect(
      selectRelease(
        [release("1.10.0-beta.1", { prerelease: true }), release("1.9.9")],
        "1.9.0",
        "beta",
      )?.version,
    ).toBe("1.10.0-beta.1");
    expect(
      selectRelease(
        [release("1.10.0-beta.1", { prerelease: true })],
        "1.9.0",
        "stable",
      ),
    ).toBeNull();
  });
  it("rejects missing digest and incorrect asset identity", () => {
    expect(() =>
      selectRelease([release("2.0.0", { digest: "" })], "1.0.0", "stable"),
    ).toThrow(/verified arm64 ZIP/);
    expect(() =>
      selectRelease(
        [release("2.0.0", { url: "https://evil.example/app.zip" })],
        "1.0.0",
        "stable",
      ),
    ).toThrow(/Invalid update asset metadata/);
    expect(() =>
      selectRelease(
        [release("2.0.0", { name: "wrong.zip" })],
        "1.0.0",
        "stable",
      ),
    ).toThrow(/verified arm64 ZIP/);
  });
});
describe("verified download", () => {
  let server: Server | undefined;
  async function serve(b: Buffer) {
    server = createServer((_q, r) => {
      r.writeHead(200, { "Content-Length": String(b.length) });
      r.write(b.subarray(0, b.length >> 1));
      r.end(b.subarray(b.length >> 1));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const a = server.address();
    if (!a || typeof a === "string") throw Error("no addr");
    return `http://127.0.0.1:${a.port}/zip`;
  }
  afterEach(async () => {
    if (server?.listening)
      await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });
  it("validates real HTTP bytes and cleans corrupt, truncated, oversized files", async () => {
    const d = await temp(),
      b = Buffer.from("artifact bytes"),
      url = await serve(b),
      digest = createHash("sha256").update(b).digest("hex"),
      a: ReleaseArtifact = { version: "2.0.0", url, digest, size: b.length };
    const exact = path.join(d, "exact");
    await downloadVerified(a, exact, new AbortController().signal, () => {});
    expect(await fs.readFile(exact)).toEqual(b);
    for (const [n, x, re] of [
      ["hash", { ...a, digest: "0".repeat(64) }, /checksum mismatch/],
      ["short", { ...a, size: b.length + 1 }, /checksum mismatch/],
      ["large", { ...a, size: b.length - 1 }, /exceeds the release size/],
    ] as const) {
      const out = path.join(d, n);
      await expect(
        downloadVerified(x, out, new AbortController().signal, () => {}),
      ).rejects.toThrow(re);
      await expect(fs.access(out)).rejects.toThrow();
    }
  });
});
function makeZip(es: Array<{ name: string; body: string; mode?: number }>) {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  const crc = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) c = t[(c ^ x) & 255]! ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    },
    ls: Buffer[] = [],
    cs: Buffer[] = [];
  let off = 0;
  for (const e of es) {
    const n = Buffer.from(e.name),
      b = Buffer.from(e.body),
      c = crc(b),
      l = Buffer.alloc(30 + n.length);
    l.writeUInt32LE(0x04034b50);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x800, 6);
    l.writeUInt32LE(c, 14);
    l.writeUInt32LE(b.length, 18);
    l.writeUInt32LE(b.length, 22);
    l.writeUInt16LE(n.length, 26);
    n.copy(l, 30);
    ls.push(l, b);
    const x = Buffer.alloc(46 + n.length);
    x.writeUInt32LE(0x02014b50);
    x.writeUInt16LE(0x0314, 4);
    x.writeUInt16LE(20, 6);
    x.writeUInt16LE(0x800, 8);
    x.writeUInt32LE(c, 16);
    x.writeUInt32LE(b.length, 20);
    x.writeUInt32LE(b.length, 24);
    x.writeUInt16LE(n.length, 28);
    x.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38);
    x.writeUInt32LE(off, 42);
    n.copy(x, 46);
    cs.push(x);
    off += l.length + b.length;
  }
  const cb = Buffer.concat(cs),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(es.length, 8);
  end.writeUInt16LE(es.length, 10);
  end.writeUInt32LE(cb.length, 12);
  end.writeUInt32LE(off, 16);
  return Buffer.concat([...ls, cb, end]);
}
describe("ZIP extraction", () => {
  it("rejects traversal entries and escaping symlinks", async () => {
    const d = await temp();
    for (const [n, b, m] of [
      ["../escape", "bad", 0o100644],
      [
        `${UPDATE_BUNDLE}/Contents/Resources/outside`,
        `../../../../escape`,
        0o120777,
      ],
    ] as const) {
      const z = path.join(d, `in-${m}.zip`);
      await fs.writeFile(z, makeZip([{ name: n, body: b, mode: m }]));
      await expect(
        extractBundle(
          z,
          path.join(d, `out-${m}`),
          new AbortController().signal,
        ),
      ).rejects.toThrow(/invalid relative path|Unsafe path|External symlink/);
    }
    await expect(fs.access(path.join(d, "escape"))).rejects.toThrow();
  });
  it("rejects chained link parents without touching an external directory", async () => {
    const directory = await temp();
    const workspace = path.join(directory, "staging");
    const victim = path.join(directory, "victim");
    await fs.mkdir(victim);
    await fs.writeFile(path.join(victim, "sentinel"), "preserve me");
    const zip = path.join(directory, "chain.zip");
    await fs.writeFile(zip, makeZip([
      { name: `${UPDATE_BUNDLE}/flat/`, body: "", mode: 0o040755 },
      { name: `${UPDATE_BUNDLE}/a/b/link`, body: "../../flat", mode: 0o120777 },
      { name: `${UPDATE_BUNDLE}/a/b/c/jump`, body: "../link/../../../victim", mode: 0o120777 },
      { name: `${UPDATE_BUNDLE}/a/b/c/jump/payload`, body: ".", mode: 0o120777 },
    ]));
    await expect(extractBundle(zip, workspace, new AbortController().signal)).rejects.toThrow();
    expect(await fs.readdir(victim)).toEqual(["sentinel"]);
    expect(await fs.readFile(path.join(victim, "sentinel"), "utf8")).toBe("preserve me");
  });
});
describe("Updates channel race", () => {
  it("aborts release lookup before saving selected channel", async () => {
    const d = await temp();
    let aborted = false;
    const { promise: called, resolve } = Promise.withResolvers<void>();
    const mock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_i, init) =>
        new Promise<Response>((_ok, reject) => {
          resolve();
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("abort", "AbortError"));
            },
            { once: true },
          );
        }),
    );
    const u = await Updates.create({
      currentVersion: "1.0.0",
      supported: true,
      target: "/Applications/Game Dev Forge.app",
      userData: d,
      helperSource: "unused",
      changed: () => {},
      confirm: async () => true,
      isBusy: () => false,
      requestRestart: () => {},
    });
    const check = u.check();
    await called;
    const state = await u.setChannel("beta");
    await check;
    expect(aborted).toBe(true);
    expect(state.channel).toBe("beta");
    expect(
      JSON.parse(
        await fs.readFile(path.join(d, "update-channel.json"), "utf8"),
      ),
    ).toBe("beta");
    expect(u.getState().phase).toBe("idle");
    await u.discard();
    mock.mockRestore();
  });
});
