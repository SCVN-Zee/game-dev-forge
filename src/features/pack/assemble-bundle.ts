/**
 * features/pack/assemble-bundle.ts — Stage the portable CLI contents into a dir.
 *
 * Pure filesystem work (no zip, no process.exit) so it is unit-testable against
 * tmp dirs: copies only the CLI trees (bin/dist/templates) into staging,
 * stages an optional Node runtime, and writes INSTALL.txt.
 * Reuses syncSingleFolder so CLI-tree copies share the common rsync and
 * progress-reporting path.
 */

import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { syncSingleFolder } from "../transfer/sync-single-folder.js";
import type { SyncReporter } from "../transfer/reporter.js";
import { noopReporter } from "../transfer/reporter.js";
import { BUNDLE_CLI_TREES } from "./bundle-paths.js";
import { buildInstallText } from "./install-text.js";
import { stageNodeRuntime } from "./node-runtime-staging.js";

export interface AssembleBundleOpts {
  /** Install root holding bin/, dist/, templates/. */
  installRoot: string;
  /** Destination staging dir (created if missing). */
  stagingDir: string;
  /** Version for the INSTALL.txt header. */
  version: string;
  /** When set, stage this verified `bin/node` into `<staging>/node/bin/node`. */
  nodeBinPath?: string;
  reporter?: SyncReporter;
}

/** Copy CLI trees into staging and write INSTALL.txt. */
export async function assembleBundle(opts: AssembleBundleOpts): Promise<void> {
  const reporter = opts.reporter ?? noopReporter;
  await mkdir(opts.stagingDir, { recursive: true });
  for (const tree of BUNDLE_CLI_TREES) {
    reporter.onStatus({ status: "running", detail: `staging ${tree}/…` });
    await syncSingleFolder(opts.installRoot, opts.stagingDir, tree, {
      onProgress: (progress) => reporter.onProgress(progress),
    });
  }

  if (opts.nodeBinPath) {
    reporter.onStatus({ status: "running", detail: "staging node/…" });
    await stageNodeRuntime({ nodeBinPath: opts.nodeBinPath, stagingDir: opts.stagingDir });
  }
  await writeFile(path.join(opts.stagingDir, "INSTALL.txt"), buildInstallText(opts.version), "utf8");
}
