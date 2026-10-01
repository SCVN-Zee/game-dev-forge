/**
 * config/paths.ts — Resolves filesystem paths for gdf config files.
 *
 * Accepts optional overrides for dependency injection in tests.
 */

import { homedir } from "node:os";
import path from "node:path";

/** Default gdf state directory: ~/.scvn */
export function getScvnDir(override?: string): string {
  return override ?? path.join(homedir(), ".scvn");
}

/** Writable template-override directory: ~/.scvn/templates */
export function getTemplatesOverrideDir(gdfDirOverride?: string): string {
  return path.join(getScvnDir(gdfDirOverride), "templates");
}

/** Default config file path: ~/.scvn/config */
export function getConfigPath(override?: string): string {
  return override ?? path.join(getScvnDir(), "config");
}


/** Previous gdf state directory: ~/.config/scvn (used for one-shot self-migration). */
export function getPreviousScvnDir(override?: string): string {
  return override ?? path.join(homedir(), ".config", "scvn");
}

/** Legacy sync-unity config path: ~/.config/sync-unity/config */
export function getLegacyConfigPath(override?: string): string {
  return override ?? path.join(homedir(), ".config", "sync-unity", "config");
}
