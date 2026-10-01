/**
 * features/pack/bundle-paths.ts — Resolve the producer's source + output paths.
 *
 * `make pack` copies the install root's `bin/`, `dist/`, and `templates/` into
 * staging, adds the optional Node runtime, and zips the result. This module
 * resolves the CLI and Node-cache paths and computes the archive name.
 */

import path from "node:path";
import { findInstallRoot } from "../../util/install-root.js";
import { getScvnDir } from "../../config/paths.js";

/** CLI trees copied verbatim from the install root into a bundle. */
export const BUNDLE_CLI_TREES = ["bin", "dist", "templates"] as const;

export interface BundleSourcePaths {
  /** Install root (holds bin/, dist/, templates/). */
  installRoot: string;
  /** Built CLI entry — its absence means `npm run build` was not run. */
  cliEntry: string;
  /** Cache root for downloaded Node runtimes (~/.scvn/cache/node), shared across packs. */
  nodeCacheDir: string;
  /** Directory the archive is written to (gitignored `pkg/`). */
  outDir: string;
}

export interface ResolveBundlePathsOpts {
  /** Override the install root (tests). */
  installRootOverride?: string;
  /** Override the scvn home dir (~/.scvn) (tests). */
  scvnDirOverride?: string;
}

/**
 * Resolve every source/output path `pack` needs, or null when the install root
 * cannot be located (templates/ missing — should not happen for a real install).
 */
export async function resolveBundleSourcePaths(
  opts: ResolveBundlePathsOpts = {},
): Promise<BundleSourcePaths | null> {
  const installRoot = opts.installRootOverride ?? (await findInstallRoot());
  if (installRoot === null) return null;

  const scvnDir = getScvnDir(opts.scvnDirOverride);
  return {
    installRoot,
    cliEntry: path.join(installRoot, "dist", "cli.mjs"),
    nodeCacheDir: path.join(scvnDir, "cache", "node"),
    outDir: path.join(installRoot, "pkg"),
  };
}

/** Version-stamped archive path: `<outDir>/gdf-bundle-<version>.zip`. */
export function bundleArchivePath(outDir: string, version: string): string {
  return path.join(outDir, `gdf-bundle-${version}.zip`);
}
