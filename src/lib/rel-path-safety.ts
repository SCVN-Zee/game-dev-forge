/**
 * lib/rel-path-safety.ts — Reject relative paths that could escape their root.
 *
 * Last guard before user-supplied relative paths are joined to a project root.
 * Used by init layout validation before combining relative directories with
 * the Assets root.
 *
 * Deliberately conservative — segments are inspected, never resolved. `a/../b`
 * would resolve inside its root but is still rejected: cheap to satisfy, and it
 * keeps the predicate independent of the caller's cwd and of symlinks along the
 * path. Only a WHOLE ".." segment rejects, so a name like "..hidden" passes.
 */

import path from "node:path";

export function isSafeRelPath(relPath: string): boolean {
  if (!relPath || path.isAbsolute(relPath)) return false;
  return !relPath.split(/[\\/]+/).includes("..");
}
