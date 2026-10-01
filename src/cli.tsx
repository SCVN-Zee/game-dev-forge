#!/usr/bin/env node
/**
 * cli.tsx — Entry point for gdf.
 *
 * Fast-path: -h / --version exit immediately.
 * Otherwise: run one-shot config migration, parse argv, then dispatch —
 * all commands run as linear clack flows.
 *
 * Bootstrap ops are direct top-level commands (fork, ignore-dirty, gitignore,
 * gitexclude). `gdf sync …`, bare `gdf all`, and `gdf setup …`
 * print migration tables and exit 1 (clean breaks). Unknown commands and unknown
 * verbs fail loudly (exit 1) — only bare `gdf` helps.
 */

import { migrate } from "./config/index.js";
import { parseArgv } from "./util/cli-args.js";
import { getVersion } from "./util/app-info.js";
import { HELP_TEXT } from "./commands/help-text.js";
import { runDoctor } from "./commands/doctor.js";
import { printSyncMigrationHint } from "./commands/sync-migration-hint.js";
import { printSetupMigrationHint } from "./commands/setup-migration-hint.js";
import { printGitGroupingHint } from "./commands/git-migration-hint.js";
import { runSetupOp } from "./commands/setup.js";
import type { SetupOp } from "./commands/setup.js";
import { runFork } from "./commands/fork.js";
import { runGitCommand } from "./commands/git.js";
import { runConfig } from "./commands/config.js";
import { runInit } from "./commands/init.js";
import { ensureProjectsRootConfigured, SETUP_OPS } from "./commands/first-run-guard.js";
import { installFatalHandlers } from "./util/fatal-error.js";
import { PromptCancelled, ProjectsRootError, ConfigRequiredError } from "./ui/errors.js";

// ---------------------------------------------------------------------------
// Fatal-error net — must precede every await below. This module is a top-level-
// await script, so an escaped throw would otherwise print a raw Node stack trace.
// ---------------------------------------------------------------------------

installFatalHandlers();

// ---------------------------------------------------------------------------
// Fast-path exits
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("-h") || argv.includes("--help")) {
  console.log(HELP_TEXT);
  process.exit(0);
}

if (argv.includes("--version")) {
  console.log(getVersion());
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Config migration (best-effort, non-blocking)
// ---------------------------------------------------------------------------

await migrate();

// ---------------------------------------------------------------------------
// Parse argv
// ---------------------------------------------------------------------------

const args = parseArgv(argv);
for (const warning of args.warnings) {
  console.error(`gdf: ${warning}`);
}


const firstSub = args.subcommands[0] ?? "";

// Bare `gdf all` was the old sync batch — route it to the migration hint.
const effectiveNamespace =
  args.namespace ??
  (firstSub === "all" ? "sync" : null);

// ---------------------------------------------------------------------------
// First-run config guard
//
// Root-needing commands require a valid SCVN_PROJECTS_ROOT. When it is missing,
// unset, or points to a non-existent dir: interactive runs launch `gdf config`
// then continue; -y / non-TTY runs exit 1. Flag-driven (--target)
// and exempt commands (config/doctor/help/--version/hints) skip the guard.
// ---------------------------------------------------------------------------


// Control-flow errors from the shared command layer are mapped to CLI exit
// behavior here (the layer throws instead of calling process.exit so the same
// flows can run inside the desktop host). Top-level-await rejections bypass the
// fatal-error nets (see util/fatal-error.ts), so this catch is required.
try {
  await ensureProjectsRootConfigured({
    namespace:   effectiveNamespace,
    subcommands: args.subcommands,
    hasTarget:   Boolean(args.target || process.env["SCVN_TARGET"]),
    hasGitOp:    args.ignore || args.exclude || args.lfs,
    autoYes:     args.autoYes,
  });

  if (effectiveNamespace === "sync") {
    // Clean break: print the v0.2 migration table and fail loudly.
    printSyncMigrationHint();
    process.exit(1);

  } else if (effectiveNamespace === "setup") {
    // Clean break: ops are top-level commands now — print the table, fail loudly.
    printSetupMigrationHint();
    process.exit(1);

  } else if (effectiveNamespace === "config") {
    await runConfig();

  } else if (effectiveNamespace === "doctor") {
    await runDoctor();

  } else if (firstSub === "init") {
    if (args.subcommands.length > 1) {
      console.error(`Unexpected argument: ${args.subcommands[1]}\nUsage: gdf init [--target <Assets dir>] [--name <ProjectName>] [--layout <file>] [-n] [-y]`);
      process.exit(1);
    }
    await runInit({
      target: args.target,
      name: args.name,
      layout: args.layout,
      dryRun: args.dryRun,
      autoYes: args.autoYes,
    });

  } else if (firstSub === "fork") {
    // Trailing tokens fail loudly — a chained-op typo must not look like success.
    if (args.subcommands.length > 1) {
      console.error(`Unexpected argument: ${args.subcommands[1]}\nUsage: gdf fork [-n] [-y]`);
      process.exit(1);
    }
    // Fork configures Fork.app only (no project) — a stray --target must not look applied.
    if (args.target) {
      console.error("gdf fork: --target is ignored — fork configures Fork.app, not a project");
    }
    await runFork({
      dryRun:  args.dryRun,
      autoYes: args.autoYes,
    });

  } else if (SETUP_OPS[firstSub] === true) {
    // Trailing tokens fail loudly — `gdf gitignore gitexclude` must not
    // silently run only the first op (ops chain with &&, not positionals).
    if (args.subcommands.length > 1) {
      console.error(`Unexpected argument: ${args.subcommands[1]}\nUsage: gdf ${firstSub} [--target <path>] [-n] [-y]`);
      process.exit(1);
    }
    await runSetupOp(firstSub as SetupOp, {
      target:  args.target,
      dryRun:  args.dryRun,
      autoYes: args.autoYes,
    });

  } else if (firstSub === "git") {
    // Trailing positional fails loudly — ops are flags, not positionals
    // (`gdf git ignore` is a mistake for `gdf git --ignore`).
    if (args.subcommands.length > 1) {
      console.error(`Unexpected argument: ${args.subcommands[1]}\nUsage: gdf git [--ignore] [--exclude] [--lfs] [--target <path>] [-n] [-y]`);
      process.exit(1);
    }
    await runGitCommand({
      ignore:  args.ignore,
      exclude: args.exclude,
      lfs:     args.lfs,
      target:  args.target,
      dryRun:  args.dryRun,
      autoYes: args.autoYes,
    });

  } else if (firstSub === "gitignore" || firstSub === "gitexclude") {
    // Clean break (v0.5): grouped under `gdf git` — print the hint, fail loudly
    // so a script using the old command surfaces the fix instead of silently
    // hitting the unknown-command arm.
    printGitGroupingHint();
    process.exit(1);

  } else if (firstSub) {
    // Unrecognized command — fail loudly (a typo'd `gdf sycn` must not look
    // like success to a script).
    console.error(`Unknown command: ${firstSub}\nRun \`gdf -h\` for usage.`);
    process.exit(1);

  } else {
    // No arguments at all — print help and exit cleanly.
    console.log(HELP_TEXT);
    process.exit(0);
  }
} catch (err) {
  if (err instanceof PromptCancelled) {
    // User cancelled a prompt (Ctrl-C / Esc) — clean exit, matching the old
    // process.exit(0) that guardCancel used to perform.
    process.exitCode = 0;
  } else if (err instanceof ProjectsRootError || err instanceof ConfigRequiredError) {
    // Config/root problem with no interactive recovery — stderr + exit 1.
    process.stderr.write(`gdf: ${err.message}\n`);
    process.exitCode = 1;
  } else {
    // Unexpected — re-throw so the raw stack surfaces (unchanged behavior).
    throw err;
  }
}
