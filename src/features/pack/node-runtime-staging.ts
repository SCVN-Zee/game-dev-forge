/**
 * features/pack/node-runtime-staging.ts — Stage a Node binary into a bundle.
 *
 * Copies the verified runtime to `<staging>/node/bin/node`, the layout read by
 * `bin/gdf`. Kept separate from the CLI tree copy sequence.
 */
import path from "node:path";
import { mkdir, copyFile, chmod } from "node:fs/promises";
import { BUNDLED_NODE_SUBPATH } from "./bundled-node-paths.js";

export interface StageNodeRuntimeOpts {
  /** Absolute path to a verified `bin/node` (from fetchNodeBinary). */
  nodeBinPath: string;
  /** Bundle staging dir (the dir that becomes the zip root). */
  stagingDir: string;
}
export async function stageNodeRuntime(opts: StageNodeRuntimeOpts): Promise<void> {
  const dest = path.join(opts.stagingDir, BUNDLED_NODE_SUBPATH);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(opts.nodeBinPath, dest);
  await chmod(dest, 0o755);
}
