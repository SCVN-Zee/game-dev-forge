/**
 * test/doctor/checks.test.ts — Unit tests for each individual check in doctor/checks.ts
 *
 * All external I/O is mocked so tests are deterministic and fast:
 *   - services/rsync.ts  → rsyncSupportsProgress2
 *   - util/command-exists.ts → commandExists
 *   - detectors/detect-unity-versions.ts
 *   - detectors/detect-fork-running.ts
 *   - execa (for node/git version checks)
 *
 * Each check is extracted from CHECKS by id and its run() function invoked
 * directly — no subprocess spawning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdir, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpDir } from "../helpers/tmp-dir.js";

// ---------------------------------------------------------------------------
// Hoist all mocks before imports
// ---------------------------------------------------------------------------

const rsyncSupportsMock    = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const commandExistsMock    = vi.hoisted(() => vi.fn<(bin: string) => Promise<boolean>>());
const detectUnityMock      = vi.hoisted(() => vi.fn());
const detectForkRunningMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const execaMock            = vi.hoisted(() => vi.fn());
const installRootMock      = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/rsync.js", () => ({
  rsyncSupportsProgress2: rsyncSupportsMock,
}));
vi.mock("../../src/util/command-exists.js", () => ({
  commandExists: commandExistsMock,
}));
vi.mock("../../src/detectors/detect-unity-versions.js", () => ({
  detectUnityVersions: detectUnityMock,
}));
vi.mock("../../src/detectors/detect-fork-running.js", () => ({
  detectForkRunning: detectForkRunningMock,
}));
vi.mock("execa", () => ({ execa: execaMock }));
vi.mock("../../src/util/install-root.js", () => ({
  findInstallRoot: installRootMock,
  _resetInstallRoot: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks registered)
// ---------------------------------------------------------------------------

import { CHECKS } from "../../src/doctor/checks.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCheck(id: string) {
  const check = CHECKS.find((c) => c.id === id);
  if (!check) throw new Error(`check '${id}' not found in registry`);
  return check;
}

const isDarwin = process.platform === "darwin";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// rsync check
// ---------------------------------------------------------------------------

describe("check: rsync", () => {
  beforeEach(() => rsyncSupportsMock.mockReset());

  it("returns pass when rsync >= 3.1", async () => {
    rsyncSupportsMock.mockResolvedValue(true);
    const result = await getCheck("rsync").run();
    expect(result.severity).toBe("pass");
  });

  it("returns warn when rsync < 3.1", async () => {
    rsyncSupportsMock.mockResolvedValue(false);
    const result = await getCheck("rsync").run();
    expect(result.severity).toBe("warn");
    expect(result.detail).toMatch(/rsync/);
  });
});

// ---------------------------------------------------------------------------
// git check
// ---------------------------------------------------------------------------

describe("check: git", () => {
  beforeEach(() => commandExistsMock.mockReset());

  it("returns pass when git is found", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "git");
    const result = await getCheck("git").run();
    expect(result.severity).toBe("pass");
  });

  it("returns fail when git is missing", async () => {
    commandExistsMock.mockResolvedValue(false);
    const result = await getCheck("git").run();
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/git/);
  });
});

// ---------------------------------------------------------------------------
// git-lfs check — warn (not fail) when missing: only `gdf git --lfs` needs it
// ---------------------------------------------------------------------------

describe("check: git-lfs", () => {
  beforeEach(() => commandExistsMock.mockReset());

  it("returns pass when git-lfs is found (not macOnly)", async () => {
    commandExistsMock.mockImplementation(async (bin: string) => bin === "git-lfs");
    const result = await getCheck("git-lfs").run();
    expect(result.severity).toBe("pass");
    expect(getCheck("git-lfs").macOnly).toBeFalsy();
  });

  it("returns warn (never fail) when git-lfs is missing, with the brew hint", async () => {
    commandExistsMock.mockResolvedValue(false);
    const result = await getCheck("git-lfs").run();
    expect(result.severity).toBe("warn");
    expect(result.detail).toMatch(/brew install git-lfs/);
  });
});

// ---------------------------------------------------------------------------
// node check
// ---------------------------------------------------------------------------

describe("check: node", () => {
  const origVersion = process.version;
  beforeEach(() => installRootMock.mockReset());
  afterEach(() => Object.defineProperty(process, "version", { value: origVersion, configurable: true }));

  const setVersion = (v: string) =>
    Object.defineProperty(process, "version", { value: v, configurable: true });

  it("pass for Node >= 20, labeled (system) when not the bundled binary", async () => {
    setVersion("v24.16.0");
    const root = await tmpDir("gdf-ir-"); // no node/ → running node is not the bundled one
    installRootMock.mockResolvedValue(root);
    const result = await getCheck("node").run();
    expect(result.severity).toBe("pass");
    expect(result.detail).toContain("v24.16.0");
    expect(result.detail).toContain("(system)");
  });

  it("warn for Node < 20", async () => {
    setVersion("v18.19.0");
    installRootMock.mockResolvedValue(null);
    const result = await getCheck("node").run();
    expect(result.severity).toBe("warn");
  });

  it("labeled (bundled) when the running execPath IS the bundled node", async () => {
    setVersion("v24.16.0");
    const root = await tmpDir("gdf-ir-");
    await mkdir(path.join(root, "node", "bin"), { recursive: true });
    await symlink(process.execPath, path.join(root, "node", "bin", "node")); // realpath === execPath
    installRootMock.mockResolvedValue(root);
    const result = await getCheck("node").run();
    expect(result.detail).toContain("(bundled)");
  });
});

// ---------------------------------------------------------------------------
// store check — informational, never fails
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// macOS-only checks — on non-darwin they all return skipped
// ---------------------------------------------------------------------------

describe("macOnly checks on non-darwin", () => {
  if (isDarwin) {
    it.skip("skipping non-darwin tests on macOS", () => {});
    return;
  }

  for (const id of ["bundled-node", "beyond-compare", "unity", "fork", "mergespec"]) {
    it(`check '${id}' returns skipped on linux`, async () => {
      const result = await getCheck(id).run();
      expect(result.severity).toBe("skipped");
      expect(result.detail).toMatch(/macOS only/);
    });
  }
});

// ---------------------------------------------------------------------------
// macOS-only checks — on darwin with mocked detectors
// ---------------------------------------------------------------------------

describe("macOnly checks on darwin", () => {
  if (!isDarwin) {
    it.skip("skipping darwin tests on non-macOS", () => {});
    return;
  }

  // unity check
  describe("check: unity", () => {
    beforeEach(() => detectUnityMock.mockReset());

    it("returns pass when Unity editors are found", async () => {
      detectUnityMock.mockResolvedValue([
        { version: "2022.3.15f1", editorPath: "/p", yamlMergePath: "/p/m", mergeSpecPath: "/p/s" },
      ]);
      const result = await getCheck("unity").run();
      expect(result.severity).toBe("pass");
      expect(result.detail).toContain("2022.3.15f1");
    });

    it("returns warn when no Unity editors found", async () => {
      detectUnityMock.mockResolvedValue([]);
      const result = await getCheck("unity").run();
      expect(result.severity).toBe("warn");
    });
  });

  // fork check
  describe("check: fork", () => {
    beforeEach(() => detectForkRunningMock.mockReset());

    it("returns pass when Fork is not running", async () => {
      detectForkRunningMock.mockResolvedValue(false);
      const result = await getCheck("fork").run();
      expect(result.severity).toBe("pass");
    });

    it("returns warn when Fork is running", async () => {
      detectForkRunningMock.mockResolvedValue(true);
      const result = await getCheck("fork").run();
      expect(result.severity).toBe("warn");
      expect(result.detail).toMatch(/Fork is running/);
    });
  });

  // bundled-node check (RT#11 diagnostic)
  describe("check: bundled-node", () => {
    beforeEach(() => {
      installRootMock.mockReset();
      execaMock.mockReset();
    });

    async function bundleRootWithNode(): Promise<string> {
      const root = await tmpDir("gdf-ir-");
      await mkdir(path.join(root, "node", "bin"), { recursive: true });
      await writeFile(path.join(root, "node", "bin", "node"), "x");
      await chmod(path.join(root, "node", "bin", "node"), 0o755);
      return root;
    }

    it("absent bundled node → skipped (a dev checkout)", async () => {
      installRootMock.mockResolvedValue(await tmpDir("gdf-ir-")); // no node/ dir
      const result = await getCheck("bundled-node").run();
      expect(result.severity).toBe("skipped");
    });

    it("present but unrunnable → warn with the xattr hint", async () => {
      installRootMock.mockResolvedValue(await bundleRootWithNode());
      execaMock.mockRejectedValue(new Error("Bad CPU type in executable"));
      const result = await getCheck("bundled-node").run();
      expect(result.severity).toBe("warn");
      expect(result.detail).toMatch(/xattr/);
    });

    it("present + runnable (system node in use) → pass", async () => {
      installRootMock.mockResolvedValue(await bundleRootWithNode());
      execaMock.mockResolvedValue({ stdout: "v24.16.0" });
      const result = await getCheck("bundled-node").run();
      expect(result.severity).toBe("pass");
    });
  });
});
