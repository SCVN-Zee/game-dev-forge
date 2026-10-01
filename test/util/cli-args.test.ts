/**
 * test/util/cli-args.test.ts — Unit tests for the gdf argv parser.
 *
 * Covers namespace extraction, subcommand parsing, flags, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { parseArgv } from "../../src/util/cli-args.js";

describe("parseArgv — flags", () => {
  it("parses -n as dryRun", () => {
    expect(parseArgv(["-n"]).dryRun).toBe(true);
  });

  it("parses --dry-run as dryRun", () => {
    expect(parseArgv(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses -y as autoYes", () => {
    expect(parseArgv(["-y"]).autoYes).toBe(true);
  });

  it("parses --yes as autoYes", () => {
    expect(parseArgv(["--yes"]).autoYes).toBe(true);
  });

  it("parses -h as help", () => {
    expect(parseArgv(["-h"]).help).toBe(true);
  });

  it("parses --help as help", () => {
    expect(parseArgv(["--help"]).help).toBe(true);
  });

  it("parses --version as version", () => {
    expect(parseArgv(["--version"]).version).toBe(true);
  });

  it("silently ignores unknown flags", () => {
    const r = parseArgv(["--unknown-flag", "sync"]);
    expect(r.namespace).toBe("sync");
    expect(r.dryRun).toBe(false);
  });
});

describe("parseArgv — git op flags", () => {
  it("defaults ignore/exclude/lfs to false", () => {
    const r = parseArgv(["git"]);
    expect(r.ignore).toBe(false);
    expect(r.exclude).toBe(false);
    expect(r.lfs).toBe(false);
    expect(r.subcommands).toEqual(["git"]); // git is not a namespace
  });

  it("parses --ignore / --exclude / --lfs", () => {
    const r = parseArgv(["git", "--ignore", "--exclude", "--lfs"]);
    expect(r.ignore).toBe(true);
    expect(r.exclude).toBe(true);
    expect(r.lfs).toBe(true);
  });

  it("combines op flags with --target and -y", () => {
    const r = parseArgv(["git", "--lfs", "--target", "/p/Assets", "-y"]);
    expect(r.lfs).toBe(true);
    expect(r.target).toBe("/p/Assets");
    expect(r.autoYes).toBe(true);
  });
});

describe("parseArgv — namespace extraction", () => {
  it("extracts 'sync' as namespace", () => {
    const r = parseArgv(["sync"]);
    expect(r.namespace).toBe("sync");
    expect(r.subcommands).toEqual([]);
  });

  it("extracts 'sync' and rest as subcommands", () => {
    const r = parseArgv(["sync", "toolkit", "asset"]);
    expect(r.namespace).toBe("sync");
    expect(r.subcommands).toEqual(["toolkit", "asset"]);
  });

  it("'fork-setup' is no longer a known namespace — falls to subcommands", () => {
    const r = parseArgv(["fork-setup"]);
    expect(r.namespace).toBeNull();
    expect(r.subcommands).toEqual(["fork-setup"]);
  });

  it("extracts 'config' as namespace", () => {
    const r = parseArgv(["config"]);
    expect(r.namespace).toBe("config");
  });

  it("extracts 'doctor' as namespace", () => {
    const r = parseArgv(["doctor"]);
    expect(r.namespace).toBe("doctor");
  });

  it("unknown first positional sets namespace=null and goes to subcommands", () => {
    const r = parseArgv(["unknown-cmd", "foo"]);
    expect(r.namespace).toBeNull();
    expect(r.subcommands).toEqual(["unknown-cmd", "foo"]);
  });

  it("flags before namespace still parse correctly", () => {
    const r = parseArgv(["-n", "sync", "toolkit", "-y"]);
    expect(r.dryRun).toBe(true);
    expect(r.autoYes).toBe(true);
    expect(r.namespace).toBe("sync");
    expect(r.subcommands).toEqual(["toolkit"]);
  });

  it("sync with multiple subcommands preserves order", () => {
    const r = parseArgv(["sync", "gitignore", "lfs", "gitexclude"]);
    expect(r.namespace).toBe("sync");
    expect(r.subcommands).toEqual(["gitignore", "lfs", "gitexclude"]);
  });
});

describe("parseArgv — setup namespace", () => {
  it("extracts 'setup' as namespace", () => {
    const r = parseArgv(["setup"]);
    expect(r.namespace).toBe("setup");
    expect(r.subcommands).toEqual([]);
  });

  it("extracts 'setup' with subcommand", () => {
    const r = parseArgv(["setup", "luna-submodule"]);
    expect(r.namespace).toBe("setup");
    expect(r.subcommands).toEqual(["luna-submodule"]);
  });

  it("extracts 'setup fork' (macOS subcommand)", () => {
    const r = parseArgv(["setup", "fork"]);
    expect(r.namespace).toBe("setup");
    expect(r.subcommands).toEqual(["fork"]);
  });

  it("extracts 'setup all' as setup batch", () => {
    const r = parseArgv(["setup", "all"]);
    expect(r.namespace).toBe("setup");
    expect(r.subcommands).toEqual(["all"]);
  });

  it("preserves order of multiple setup subcommands", () => {
    const r = parseArgv(["setup", "gitignore", "lfs"]);
    expect(r.namespace).toBe("setup");
    expect(r.subcommands).toEqual(["gitignore", "lfs"]);
  });
});

describe("parseArgv — direct command positionals", () => {
  it("keeps bare all as an un-namespaced command", () => {
    const r = parseArgv(["all"]);
    expect(r.namespace).toBeNull();
    expect(r.subcommands).toEqual(["all"]);
  });
});

describe("parseArgv — value flag --target", () => {
  it("parses --target with its value", () => {
    const r = parseArgv(["gitignore", "--target", "/p/Game/Assets"]);
    expect(r.target).toBe("/p/Game/Assets");
    expect(r.subcommands).toEqual(["gitignore"]);
    expect(r.warnings).toEqual([]);
  });

  it("supports the equals form: --target=/path", () => {
    const r = parseArgv(["gitignore", "--target=/p/Game/Assets"]);
    expect(r.target).toBe("/p/Game/Assets");
    expect(r.warnings).toEqual([]);
  });

  it("--target at end of argv warns and is ignored", () => {
    const r = parseArgv(["gitignore", "--target"]);
    expect(r.target).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("--target");
  });

  it("--target followed by a flag does not swallow the flag", () => {
    const r = parseArgv(["gitignore", "--target", "--yes"]);
    expect(r.target).toBeUndefined();
    expect(r.autoYes).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });

  it("repeated --target keeps the last value", () => {
    const r = parseArgv(["gitexclude", "--target", "/a", "--target", "/b"]);
    expect(r.target).toBe("/b");
  });
});

describe("init flags", () => {
  it("captures --name and --layout without consuming the init command", () => {
    const result = parseArgv(["init", "--name=Combat", "--layout", "layout.json", "--target", "/p/Assets"]);
    expect(result.subcommands).toEqual(["init"]);
    expect(result.name).toBe("Combat");
    expect(result.layout).toBe("layout.json");
    expect(result.target).toBe("/p/Assets");
  });
});
