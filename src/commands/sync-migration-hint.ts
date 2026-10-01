/**
 * commands/sync-migration-hint.ts — v0.1 → v0.2 grammar break message.
 *
 * `gdf sync …` and bare `gdf all` were replaced by the noun-first
 * export/import grammar. The stub prints the exact replacement for every old
 * command and the caller exits 1 — scripts fail loudly with the fix in hand.
 */

export const SYNC_MIGRATION_HINT = `gdf sync was replaced in v0.2:
  gdf sync toolkit   → removed
  gdf sync packages  → gdf packages export +  gdf packages import
  gdf sync all       → gdf packages import`;

/** Print the migration table to stderr. Caller is responsible for exit code. */
export function printSyncMigrationHint(): void {
  console.error(SYNC_MIGRATION_HINT);
}
