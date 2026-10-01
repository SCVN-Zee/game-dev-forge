/**
 * lib/exclude-block.ts — Fenced read/modify/write of a `.git/info/exclude` file.
 *
 * `info/exclude` is shared ground: gdf’s template block, other tools’ blocks,
 * and hand-written lines live in one file. Every write goes through a marker
 * fence so each owner refreshes only its own block.
 *
 * Writes are atomic (tmp + rename) and skipped when the content is unchanged.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { replaceMarkerBlock } from "./markers.js";
import type { MarkerPair } from "./markers.js";

/** gdf's own template block (`gdf git --exclude`). */
export const SCVN_FENCE: MarkerPair = {
  begin: "# >>> scvn >>>",
  end: "# <<< scvn <<<",
};

export interface ExcludeBlockResult {
  path: string;
  /** False when the file already held the desired bytes — nothing was touched. */
  written: boolean;
}

export interface ApplyExcludeBlockOpts {
  /**
   * Text to fence into, replacing the file's current content. Pass `""` to
   * discard a file proven to be entirely gdf-owned (the byte-equal migration
   * from the pre-fence template). Omit it to preserve foreign content.
   */
  baseText?: string;
}

async function readIfExists(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tempPath = `${file}.scvn.tmp-${process.pid}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, file);
}

/**
 * Insert or refresh `fence` around `inner` in the exclude file at `file`.
 * Foreign lines and foreign fences survive byte-identical. Throws when the
 * file holds an unbalanced copy of `fence` (crash residue) rather than
 * guessing which bytes to delete.
 */
export async function applyExcludeBlock(
  file: string,
  inner: string,
  fence: MarkerPair,
  opts: ApplyExcludeBlockOpts = {},
): Promise<ExcludeBlockResult> {
  const current = await readIfExists(file);
  const next = replaceMarkerBlock(opts.baseText ?? current, inner, fence);
  const written = next !== current;
  if (written) {
    await atomicWrite(file, next);
  }
  return { path: file, written };
}
