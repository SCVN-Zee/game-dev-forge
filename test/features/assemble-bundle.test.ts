/**
 * test/features/assemble-bundle.test.ts — Real portable bundle assembly and zip contents.
 */

import { execa } from "execa";
import { describe, it, expect } from "vitest";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleBundle } from "../../src/features/pack/assemble-bundle.js";
import { resolveBundleSourcePaths } from "../../src/features/pack/bundle-paths.js";
import { createZip } from "../../src/services/zip.js";
import { tmpDir } from "../helpers/tmp-dir.js";

async function writeTreeFile(
  root: string,
  relativePath: string,
  contents: string,
): Promise<string> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  return target;
}

describe("portable bundle", () => {
  it("resolves only install, output, and shared Node-cache paths", async () => {
    const root = await tmpDir("gdf-bundle-paths-");
    try {
      const installRoot = path.join(root, "install");
      const scvnDir = path.join(root, ".scvn");
      const paths = await resolveBundleSourcePaths({
        installRootOverride: installRoot,
        scvnDirOverride: scvnDir,
      });
      expect(paths).toEqual({
        installRoot,
        cliEntry: path.join(installRoot, "dist", "cli.mjs"),
        nodeCacheDir: path.join(scvnDir, "cache", "node"),
        outDir: path.join(installRoot, "pkg"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("assembles and zips the CLI trees plus Node, without copying or deleting user store data", async () => {
    const root = await tmpDir("gdf-bundle-build-");
    try {
      const installRoot = path.join(root, "install");
      const scvnDir = path.join(root, ".scvn");
      const stagingDir = path.join(root, "staging");
      const storeFile = path.join(scvnDir, "store", "existing-data.json");
      const storeContents = "existing user data";
      await mkdir(path.dirname(storeFile), { recursive: true });
      await writeFile(storeFile, storeContents, "utf8");

      const cliWrapper = await writeTreeFile(installRoot, "bin/gdf", "#!/bin/sh\necho gdf\n");
      await chmod(cliWrapper, 0o755);
      await writeTreeFile(installRoot, "dist/cli.mjs", "console.log(\"gdf\");\n");
      await writeTreeFile(installRoot, "templates/gitignore", "Library/\nTemp/\n");
      const nodeSource = path.join(root, "pinned-node");
      await writeFile(nodeSource, "node-runtime", "utf8");

      await assembleBundle({ installRoot, stagingDir, version: "1.2.3", nodeBinPath: nodeSource });

      expect(await readFile(path.join(stagingDir, "bin", "gdf"), "utf8")).toContain("echo gdf");
      expect(await readFile(path.join(stagingDir, "dist", "cli.mjs"), "utf8")).toContain("gdf");
      expect(await readFile(path.join(stagingDir, "templates", "gitignore"), "utf8")).toContain("Library/");
      const stagedNode = path.join(stagingDir, "node", "bin", "node");
      expect(await readFile(stagedNode, "utf8")).toBe("node-runtime");
      expect((await stat(stagedNode)).mode & 0o111).not.toBe(0);
      await expect(stat(path.join(stagingDir, "store"))).rejects.toThrow();

      const installText = await readFile(path.join(stagingDir, "INSTALL.txt"), "utf8");
      expect(installText).toContain("v1.2.3");
      expect(installText).toContain("gdf --help");
      expect(installText).toContain("PATH");
      expect(installText).not.toMatch(/packages|store/i);

      const archiveDir = path.join(root, "pkg");
      const archive = path.join(archiveDir, "gdf-bundle-1.2.3.zip");
      await mkdir(archiveDir, { recursive: true });
      await createZip(stagingDir, archive);
      const { stdout } = await execa("unzip", ["-Z1", archive]);
      const entries = stdout.split(/\r?\n/).map((entry) => entry.replace(/^\.\//, "").replace(/\/$/, "")).filter(Boolean);
      expect(entries).toEqual(expect.arrayContaining(["bin/gdf", "dist/cli.mjs", "templates/gitignore", "node/bin/node", "INSTALL.txt"]));
      expect(entries.some((entry) => entry === "store" || entry.startsWith("store/") || entry.includes("existing-data.json"))).toBe(false);
      expect(await readFile(storeFile, "utf8")).toBe(storeContents);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
