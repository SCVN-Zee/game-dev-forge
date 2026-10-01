/**
 * commands/sync-migration-hint.ts — v0.1 → v0.2 grammar break message.
 *
 * Legacy sync commands report that they were removed, with no replacement instructions.
 */

export const SYNC_MIGRATION_HINT = "gdf sync and gdf all were removed in v0.2.";

/** Print the removal notice to stderr. Caller is responsible for exit code. */
export function printSyncMigrationHint(): void {
  console.error(SYNC_MIGRATION_HINT);
}
