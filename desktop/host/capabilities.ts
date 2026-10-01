/**
 * desktop/host/capabilities.ts — Registry entries for desktop commands.
 *
 * Each entry builds a GUI PromptAdapter + OutputAdapter from the invocation's
 * session, parses the renderer's launch values into the handler's arg shape, and
 * calls the EXISTING handler verbatim (Approach A — no logic duplication). The
 * handlers drive any further prompts (project pickers, confirmations) through
 * the injected GUI adapter, so the GUI reuses the CLI flows exactly.
 *
 * GUI invocations never set `autoYes` — they always take the interactive branch
 * and supply explicit values, so the `--yes requires a target` guards never fire.
 */

import { runConfigExecute } from "../../src/commands/config.js";
import { runDoctor } from "../../src/commands/doctor.js";
import { forkPreflight, forkExecute, type ForkPreflight } from "../../src/commands/fork.js";
import { runGitCommand } from "../../src/commands/git.js";
import { ignoreDirtyList, ignoreDirtySet } from "./ignore-dirty.js";
import { discoverSetupTargetsRich } from "../../src/commands/shared/select-setup-target.js";
import { templatesRead, templatesWrite, templatesCreate, templatesSelect, templatesDelete } from "./templates.js";
import { setupMergeAttributes } from "../../src/features/setup/setup-merge-attributes.js";
import { loadConfig } from "../../src/config/load.js";
import { resolveProjectsRoot } from "../../src/commands/shared/project-discovery.js";
import { isDir } from "../../src/util/fs-predicates.js";
import { run as runDoctorChecks } from "../../src/doctor/runner.js";
import type { HostSession } from "./session.js";
import type { CommandRegistry } from "./dispatcher.js";
import { createGuiPrompt } from "./gui-prompt.js";
import { createGuiOutput } from "./gui-output.js";
import type {
  FormModel,
  LaunchField,
  ConfigStatus,
  DoctorReport,
} from "../shared/commands.js";
import path from "node:path";
import { initializeProject, parseInitLayout } from "../../src/features/init/index.js";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// ---------------------------------------------------------------------------
// Launch-arg parsing (renderer sends a Record over IPC, typed `unknown` here)
// ---------------------------------------------------------------------------

function asRecord(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
}

/** Read a non-empty string field, else undefined. */
function str(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Read a boolean field, defaulting to false. */
function bool(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Command handlers for the capabilities, with GUI adapters injected. */
export const capabilities: CommandRegistry = {
  // --- fork: native form (Phase 4) ---------------------------------------
  // prepare: run the environment preflight and return the Unity picker + a
  // blocker when a prerequisite is unmet; execute: apply the chosen editor.
  async "fork:prepare"(): Promise<unknown> {
    let pre: ForkPreflight;
    try {
      pre = await forkPreflight();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        fields: [],
        blocker: `Environment check error: ${message}`,
      } satisfies FormModel;
    }

    if (!pre.ok) {
      return {
        fields: [],
        blocker: pre.blocker ?? "Prerequisites not met",
      } satisfies FormModel;
    }

    const editorField: LaunchField = {
      name: "editorPath",
      label: "Unity editor",
      type: "select",
      default: pre.unityVersions[0]!.editorPath,
      options: pre.unityVersions.map((v) => ({ value: v.editorPath, label: v.version })),
    };
    // Optional git-side half: write the Unity smart-merge `.gitattributes`
    // block to a chosen project. Off by default (Fork prefs are machine-level;
    // this one touches a repo). The pen edits the `gitattributes-merge`
    // template inline, same as the Git-setup ops.
    const applyMergeField: LaunchField = {
      name: "applyMergeAttributes",
      label: "Also write Unity merge .gitattributes to a project",
      type: "boolean",
      default: false,
      templateKey: "gitattributesMerge",
    };
    const mergeTargetField: LaunchField = {
      name: "mergeTarget",
      label: "Merge-attributes target project",
      type: "project",
      visibleWhen: { field: "applyMergeAttributes", equals: "true" },
    };
    const baseNote = "Configures Unity merge tool · leaves diff tool unchanged";
    return {
      // Warned, not blocked: Apply asks before quitting, then reopens Fork.
      note: pre.forkRunning ? `${baseNote} · Fork is running — Apply asks to quit it, then reopens it` : baseNote,
      fields: [editorField, applyMergeField, mergeTargetField],
    } satisfies FormModel;
  },

  async fork(session: HostSession, args: unknown): Promise<unknown> {
    const record = asRecord(args);
    const output = createGuiOutput(session);
    const prompt = createGuiPrompt(session);

    const pre = await forkPreflight();
    if (!pre.ok) {
      output.log.error(pre.blocker ?? "Prerequisites not met");
      return { ok: false };
    }
    const editorPath = str(record, "editorPath") ?? pre.unityVersions[0]!.editorPath;
    const picked = pre.unityVersions.find((v) => v.editorPath === editorPath) ?? pre.unityVersions[0]!;
    const result = await forkExecute({ yamlMergePath: picked.yamlMergePath, dryRun: false }, prompt, output);

    // Fork half failed (quit timeout / write error) → the git-side half must
    // not run: the user's approval was for a completed Fork setup, and a
    // quit-timeout abort means nothing was written at all.
    if (!result.ok) return result;

    // Optional git-side half: apply the Unity smart-merge `.gitattributes`
    // block to the chosen project. Failures here are surfaced but do not
    // undo the Fork prefs write above.
    if (bool(record, "applyMergeAttributes")) {
      const target = str(record, "mergeTarget");
      if (!target) {
        output.log.warn("Merge attributes: no target project selected — skipped");
      } else {
        try {
          const merge = await setupMergeAttributes(target);
          if (merge.status === "skipped") {
            output.log.warn(`Merge attributes skipped: ${merge.detail}`);
          } else {
            output.log.success(`Merge attributes: ${merge.detail}`);
          }
        } catch (err: unknown) {
          output.log.error(`Merge attributes failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return result;
  },

  async git(session: HostSession, args: unknown): Promise<unknown> {
    const record = asRecord(args);
    await runGitCommand(
      {
        ignore: bool(record, "ignore"),
        exclude: bool(record, "exclude"),
        lfs: bool(record, "lfs"),
        target: str(record, "target"),
        dryRun: false,
        autoYes: false,
      },
      createGuiPrompt(session),
      createGuiOutput(session),
    );
    return null;
  },

  // --- templates: per-feature inline editor (request/response, no prompts) --
  "templates:read": templatesRead,
  "templates:write": templatesWrite,
  "templates:create": templatesCreate,
  "templates:select": templatesSelect,
  "templates:delete": templatesDelete,

  // --- config: native form (Phase 4) -------------------------------------
  async "config:prepare"(): Promise<unknown> {
    const current = await loadConfig();
    return {
      fields: [{
        name: "projectsRoot",
        label: "Unity projects root",
        type: "text",
        kind: "dir",
        placeholder: "/path/to/your/Unity/Projects",
        default: current.projectsRoot,
      }],
    } satisfies FormModel;
  },

  async config(session: HostSession, args: unknown): Promise<unknown> {
    const record = asRecord(args);
    return runConfigExecute(
      { projectsRoot: str(record, "projectsRoot") ?? "" },
      { output: createGuiOutput(session) },
    );
  },

  async doctor(session: HostSession): Promise<unknown> {
    await runDoctor(undefined, createGuiOutput(session));
    return null;
  },

  // --- onboarding: request/response status routes (no prompts, no output) --
  // config:status reports the effective root with CLI-guard "usable" semantics
  // (set + isDir) plus its winning source, so the renderer's first-run gate and
  // the CLI guard can never disagree — and an env override that hides a file
  // save is explainable instead of a silent retry-loop.
  async "config:status"(): Promise<ConfigStatus> {
    const { root, source } = await resolveProjectsRoot();
    return { projectsRoot: root, ready: root !== null && (await isDir(root)), source };
  },

  // The onboarding checklist source; Settings keeps the streaming `doctor` run.
  async "doctor:report"(): Promise<DoctorReport> {
    return runDoctorChecks();
  },

  // --- ignore-dirty: live per-submodule toggle page ---------------------
  // Two request/response commands: list enumerates submodules + their local
  // and .gitmodules ignore state; set writes one submodule's local override.
  "ignore-dirty:list": ignoreDirtyList,
  "ignore-dirty:set": ignoreDirtySet,

  // --- projects:discover: the project picker's option source -------------
  // Structured rows (name / branch / age) so the renderer can lay the parts
  // out as distinct columns instead of one glued string.
  async "projects:discover"(): Promise<unknown> {
    return discoverSetupTargetsRich();
  },
  // --- init: manifest editor request/response operations -----------------
  async "init:load-layout"(_session: HostSession, args: unknown): Promise<unknown> {
    const filePath = str(asRecord(args), "path");
    if (!filePath) throw new Error("Layout path is required");
    return parseInitLayout(JSON.parse(await readFile(filePath, "utf8")));
  },

  async "init:save-layout"(_session: HostSession, args: unknown): Promise<unknown> {
    const record = asRecord(args);
    const filePath = str(record, "path");
    if (!filePath) throw new Error("Layout path is required");
    const layout = parseInitLayout(record.layout);
    const tempPath = `${filePath}.scvn-init-${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
      await rename(tempPath, filePath);
    } finally {
      await rm(tempPath, { force: true });
    }
    return layout;
  },

  async "init:run"(_session: HostSession, args: unknown): Promise<unknown> {
    const record = asRecord(args);
    const targetAssets = str(record, "targetAssets");
    if (!targetAssets) throw new Error("Assets directory is required");
    const result = await initializeProject(
      { targetAssets, layout: parseInitLayout(record.layout) },
      { dryRun: bool(record, "dryRun") },
    );
    return result;
  },
};
