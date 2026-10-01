import { describe, it, expect } from "vitest";
import { execa } from "execa";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "../bin/gdf");

describe("gdf smoke", () => {
  it("prints version", async () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
    ) as { version: string };
    const { stdout, exitCode } = await execa(BIN, ["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("prints help with -h", async () => {
    const { stdout, exitCode } = await execa(BIN, ["-h"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("gdf");
    expect(stdout).toContain("Usage:");
  });


  it("gdf setup <anything> exits 1 with the v0.3 migration table", async () => {
    const { stderr, exitCode } = await execa(BIN, ["setup", "fork"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("gdf setup was replaced in v0.3");
    expect(stderr).toContain("gdf setup fork");
  });

  it("direct op with trailing arguments exits 1 (no silent partial bootstrap)", async () => {
    const { stderr, exitCode } = await execa(
      BIN,
      ["ignore-dirty", "extra", "--target", "/tmp/x", "-y"],
      { reject: false },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unexpected argument: extra");
  });

  it("gdf git (bare, no flag) exits 1 with the op-flag hint", async () => {
    const { stderr, exitCode } = await execa(BIN, ["git"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("needs at least one op flag");
  });

  it("gdf git with a positional exits 1 (ops are flags, not positionals)", async () => {
    const { stderr, exitCode } = await execa(BIN, ["git", "ignore"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unexpected argument: ignore");
  });

  it("removed gdf gitignore / gitexclude exit 1 with the v0.5 grouping hint", async () => {
    for (const cmd of ["gitignore", "gitexclude"]) {
      const { stderr, exitCode } = await execa(BIN, [cmd], { reject: false });
      expect(exitCode).toBe(1);
      expect(stderr).toContain("grouped into gdf git");
    }
  });

  it("fork with trailing arguments exits 1", async () => {
    const { stderr, exitCode } = await execa(BIN, ["fork", "extra"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unexpected argument: extra");
  });

  it("pack is no longer a command — `gdf pack` exits 1 (bundling moved to `make pack`)", async () => {
    const { stderr, exitCode } = await execa(BIN, ["pack"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command: pack");
  });

  it("bare gdf all exits 1 with the migration table", async () => {
    const { stderr, exitCode } = await execa(BIN, ["all"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("gdf sync and gdf all were removed in v0.2.");
  });


  it("unknown command exits 1 (typo'd noun must not look like success)", async () => {
    const { stderr, exitCode } = await execa(BIN, ["sycn", "all"], { reject: false });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command: sycn");
  });


});
