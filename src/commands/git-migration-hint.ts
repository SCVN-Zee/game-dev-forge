/**
 * commands/git-migration-hint.ts — v0.4 → v0.5 grammar break message.
 *
 * `gdf gitignore` and `gdf gitexclude` were grouped into the flag-driven
 * `gdf git` command. The old top-level tokens print this table and the caller
 * exits 1 — scripts fail loudly with the fix in hand.
 */

export const GIT_GROUPING_HINT = `gdf gitignore / gdf gitexclude were grouped into gdf git in v0.5:
  gdf gitignore   → gdf git --ignore
  gdf gitexclude  → gdf git --exclude
New: gdf git --lfs sets up Git LFS (install + .gitattributes).
  Combine them:    gdf git --ignore --exclude --lfs`;

/** Print the grouping hint to stderr. Caller is responsible for exit code. */
export function printGitGroupingHint(): void {
  console.error(GIT_GROUPING_HINT);
}
