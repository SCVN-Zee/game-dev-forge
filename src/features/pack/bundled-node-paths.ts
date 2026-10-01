/**
 * features/pack/bundled-node-paths.ts — Layout contract for a CLI-bundled Node runtime.
 *
 * `make pack` ships Node at `<install-root>/node/bin/node`; the `bin/gdf` wrapper
 * reads that same relative path. A bundle carries one producer architecture.
 * Cross-architecture consumers fall back to system Node or guided install.
 */
import path from "node:path";
export const BUNDLED_NODE_DIRNAME = "node";
export const BUNDLED_NODE_SUBPATH = "node/bin/node";
export function bundledNodeBinPath(root: string): string {
  return path.join(root, BUNDLED_NODE_SUBPATH);
}
