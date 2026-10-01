# gdf — command-line reference

[Game Dev Forge](README.md) (the desktop app) and the `gdf` CLI drive
the same engine. This document is the full CLI reference: every command, flag,
template override, packaging flow, and migration note.

The CLI provides project setup, Git tooling, and environment checks through the
same command layer used by the desktop app.

## Installation (one-time)

Build the CLI once, then add `<repo>/bin` to your `PATH` in `~/.zshrc` or `~/.bashrc`:

```sh
# from the repo root
npm install
make build

export PATH="$PATH:/path/to/game-dev-forge/bin"
```

Then verify with:

```sh
gdf doctor
```

> **Building from source needs Node 20+.** A delivered bundle (`make pack`) carries its own Node
> runtime, so the consumer's Mac needs no Node install (see "Deliver to a teammate").

## Usage

```
gdf <command> [verb] [flags]
```

Running `gdf` with no arguments prints help and exits.

## Removed feature: Packages

The Packages feature has been removed from the desktop app and CLI without a data
migration. Existing `~/.scvn/store/` data is left untouched and is no longer
read or managed by Game Dev Forge.

## Commands


### `gdf git` — git artifacts (.gitignore, exclude, LFS)

Flag-driven group. Pick at least one op; combine freely in one run. Bare
`gdf git` prints the flag hint and exits (no menu, no run-all).

| Flag | Description |
|---|---|
| `--ignore` | Install repo-root `.gitignore` template, remove every other (nested) `.gitignore`, then untrack any already-tracked files the new rules now ignore |
| `--exclude` | Write the bundled template into `.git/info/exclude` as a fenced block |
| `--lfs` | `git lfs install --local` + write the Unity binary-asset LFS-track block into repo-root `.gitattributes` |

Multiple flags run in the order `--ignore` → `--exclude` → `--lfs` under one
target resolution. `--lfs` needs the `git-lfs` binary (`brew install git-lfs`) —
if it's missing the LFS step fails with that hint (exit 1) while any other
selected ops still apply; `gdf doctor` reports git-lfs presence. The LFS block
is sourced from the bundled `templates/gitattributes-lfs` template (editable —
see below) and uses its own marker (`# BEGIN/END scvn-lfs`) so it coexists with
the fork smart-merge block in one `.gitattributes` (LFS = binary assets;
smart-merge = text YAML — disjoint types).

### Project bootstrap commands

Each bootstrap op is a top-level command:

| Command | Description |
|---|---|
| `gdf ignore-dirty` | Toggle `ignore=dirty` on the repo's git submodules (multi-select) |
| `gdf fork` | Configure Fork 2.64 for Unity merges (macOS only) |

### `gdf init` — Supercent directory hierarchy

Creates directories below an existing Unity `Assets/` folder. The default is
`Assets/Supercent/<ProjectName>/` with Animation, Audio, Configs, Models, Fonts,
Materials, Prefabs, Scenes, Scripts, Shaders, Sprites, and Textures folders.

```sh
gdf init --target ~/Projects/Game/Assets --name Combat -y
gdf init --target ~/Projects/Game/Assets --layout layout.json -n
```

`--layout` accepts full Assets-relative paths, for example
`{ "directories": ["Custom", "Custom/Demo", "Custom/Demo/Scenes"] }`.
`--name` generates the default hierarchy and cannot be combined with `--layout`.
Existing directories are preserved; existing files, duplicate paths, and unsafe
paths fail before creation. `-n` prints the plan without writing.

Target resolution: `--target <Assets dir>` flag → `SCVN_TARGET` env →
interactive picker. Under `-y` an explicit target is required — ops never
auto-pick a project. `gdf fork` is the exception: it configures **Fork.app
only** (the `defaults write` prefs — UnityYAMLMerge; diff preferences unchanged). It
does not touch git config or any project's `.gitattributes`, so it needs no
target, no `SCVN_PROJECTS_ROOT`, and no project selection (`--target` is ignored
with a warning). Per-project git artifacts are `gdf git`'s job.

Bootstrap a fresh project in one line:

```sh
T=~/p/Game/Assets; gdf git --ignore --exclude --lfs --target $T -y && gdf ignore-dirty --target $T -y
```

> **`gdf git --exclude` preserves what it did not write.** The template goes into
> `.git/info/exclude` between `# >>> scvn >>>` / `# <<< scvn <<<` markers; hand-written
> lines and any other tool's fenced block survive untouched, and re-running refreshes
> only the scvn block. A file still holding a pre-marker copy of the template is
> migrated to the fenced form in place. The path comes from `git rev-parse --git-path`,
> so submodules and linked worktrees resolve correctly.

> **`gdf git --ignore` also prunes.** Beyond installing the root template it deletes
> every *other* (nested) `.gitignore` in the repo — silently, no confirm. Under `-y`
> (as in the one-liner above) it prunes without prompting; `-n` previews the removals.
> Files inside submodules and git-ignored dirs (`Library/`, `Temp/`, …) are never
> touched; a non-git target skips the prune. Removed files show as deletions in
> `git status` — commit them.

> **`gdf git --ignore` also untracks.** After installing the root template and
> pruning, it scans for files that are *already tracked* in the index but now match
> the fresh `.gitignore`, and `git rm --cached` them so they become untracked while
> staying on disk (surfaced as staged deletions to commit). `-n` previews the
> would-untrack list without touching the index; a non-git target skips cleanly.
> When the enclosing repo sits *above* the Unity project (nested / monorepo / an
> accidental `$HOME` repo) the wider blast radius is guarded exactly like prune:
> refused under `-y`, confirmed interactively before anything is untracked.

### Template presets — bundled Default and user-created templates

Each of the four git template types has its own presets and global selection.
Both desktop and CLI resolve the selected preset on every run (never cached),
so switching presets takes effect without a restart. **Default** always contains
the bundled template and cannot be edited or removed. Create a custom
preset to change template content.

Existing overrides from older app versions are imported once as **Previous
Default** custom presets (with a numeric suffix if the name is taken). If the
old Default override was active, its imported preset stays selected; otherwise
the existing custom selection stays unchanged. Original files remain as inert
backups, not live Default overrides:

| Artifact | Legacy override backup |
|---|---|
| `.gitignore` (`--ignore`) | `~/.scvn/templates/.gitignore` |
| `.git/info/exclude` (`--exclude`) | `~/.scvn/templates/git-exclude` |
| Git-LFS block (`--lfs`) | `~/.scvn/templates/gitattributes-lfs` |
| Unity smart-merge block (`fork`) | `~/.scvn/templates/gitattributes-merge` |

Open an editor with the pencil icon in **Git setup** or **Fork**. Choose
**Add new preset…** at the bottom of the preset dropdown to reveal the
**Name / Create / Cancel** form. **Create** copies the current editor content
(including unsaved edits) into a newly selected custom preset. With Default
selected, it copies bundled content. **Cancel** or Escape closes the form
without changing the selected preset or draft. Edit and **Save** your custom
template. Names must be non-blank and unique within that type
(case-insensitive). Choose **Default** to use bundled content without
overwriting any custom preset; switch back to resume using the saved custom
content. **Discard changes** restores the current preset’s last saved content.
Deleting the selected custom preset switches back to bundled Default; other
custom presets are preserved.

Custom content and the selection catalog live under
`~/.scvn/templates/presets/<template-key>/`. After import, changes to the old
backup files above have no effect. Deleting an imported preset does not import
it again. Manage presets in the desktop editor; CLI commands automatically
honor the selected preset.

### `gdf config` — edit configuration

Interactively prompts for each setting and writes `~/.scvn/config`.

```sh
gdf config    # prompts for the Unity projects root, then saves
```

The prompt prefills the current value, expands `~`, and re-prompts until the
path is an existing directory. Under `-y`/non-TTY it can't prompt — it prints the
config path and exits so you can edit the file by hand.

### `gdf doctor` — run environment checks

Verifies runtime dependencies (`rsync`, `git`, `git-lfs`, `node`, plus on macOS:
bundled Node, Unity editors, Fork). Exit code is non-zero only
when a check fails; `git-lfs` is a **warn** (not fail) — needed only for
`gdf git --lfs`.

**Examples:**

```sh
gdf git --ignore --target ~/p/GameA/Assets -y   # promptless: install root + prune nested + untrack now-ignored
gdf git --lfs --target ~/p/GameA/Assets -y      # git lfs install + LFS .gitattributes
gdf fork -n                                  # preview Fork merge config (macOS)
```

## Deliver a portable CLI — `make pack`

`make pack` is a maintainer task that builds the portable CLI bundle; there is
no `gdf pack` command.

```sh
make pack
```

The zip contains `bin/`, `dist/`, `templates/`, an `INSTALL.txt`, and (unless
`make pack-no-node` is used) the pinned Node runtime under `node/`. It does not
copy `~/.scvn/store/` or other user data.

```sh
unzip gdf-bundle-<version>.zip -d ~/gdf-bundle
export PATH="$PATH:$HOME/gdf-bundle/bin"
gdf --help
gdf doctor
```

The bundled runtime targets the producer's CPU. On a CPU mismatch, `gdf` falls
back to system Node ≥20 or guides a one-time install. Downloaded Node runtimes
are cached under `~/.scvn/cache/node/`. Use `make pack-no-node` to omit Node;
that bundle requires a system Node ≥20.

## Desktop app (GUI)

The same tooling ships as a native macOS desktop app that drives every
capability through a GUI — folder pickers instead of typed paths, single-screen
forms instead of sequential prompts, and a live progress pane instead of
scrolling stdout. It reuses the exact same `src/` command layer as the CLI, so
on-disk results are identical (see `test/desktop/parity.md`).

```sh
npm run desktop:dev      # Vite dev server + Electron, hot-reload renderer
npm run desktop:build    # bundle main/preload/host (tsup) + renderer (Vite)
npm run desktop:pack     # unsigned local .app + .dmg → dist-desktop-pack/
```

`desktop:pack` produces `dist-desktop-pack/mac-arm64/Game Dev Forge.app` (and a `.dmg`).
The build is **unsigned** — Gatekeeper will warn on first open; right-click →
Open, or `xattr -dr com.apple.quarantine "Game Dev Forge.app"`. Signing and notarization are
a separate release step (below).

### Signed & notarized release

`desktop:pack` is intentionally unsigned (`CSC_IDENTITY_AUTO_DISCOVERY=false`)
so anyone can build locally. For a distributable build that opens past
Gatekeeper on other Macs, use `desktop:release` on a machine with an Apple
Developer ID. The hardened runtime, entitlements
(`desktop/build/entitlements.mac*.plist`), and notarization are already wired in
`electron-builder.yml`; they activate only when signing credentials are present.

Prerequisites: an **Apple Developer Program** membership and a **Developer ID
Application** certificate in the login keychain (or provided via `CSC_LINK` +
`CSC_KEY_PASSWORD`). Provide notarization credentials via environment:

```sh
# Option A — Apple ID + app-specific password
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"

# Option B — App Store Connect API key
export APPLE_API_KEY="/path/to/AuthKey_XXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

npm run desktop:release   # signs (hardened runtime) + notarizes + staples
```

Verify the result: `spctl -a -vv "dist-desktop-pack/mac-arm64/Game Dev Forge.app"` (accepted)
and `xcrun stapler validate "dist-desktop-pack/Game Dev Forge-"*.dmg`.

### Automated releases & manual updates

Releases are **tag-driven** on an Apple-Silicon runner using Node 24 and publish
to [SCVN-Zee/game-dev-forge](https://github.com/SCVN-Zee/game-dev-forge/releases).
Branch pushes and pull requests do not trigger workflows. Release workflows run
typechecks, build the CLI for smoke tests, and run tests before packaging and publishing:

- `v<version>` with no prerelease id (e.g. `v0.6.0`) → `.github/workflows/release-stable.yml`
  (stable).
- `v<version>` with a prerelease id (e.g. `v0.6.0-beta.1`) → `.github/workflows/release-beta.yml`
  (beta pre-release; same tab set as stable).

The tag must equal `package.json` `version` (the workflow fails otherwise), so
bump first:

```sh
npm version 0.6.0          # bumps package.json + creates the v0.6.0 tag
git push origin main --tags
```

Both workflows share `.github/scripts/build-sign-publish.sh`, which selects the
**best available signing tier** and publishes a `.dmg` for manual installation.
Update manifests, differential-download blockmaps, and updater ZIPs are not shipped.

| Tier | Enabled by | First run |
| --- | --- | --- |
| Apple Developer ID + notarization | `CSC_LINK` (+ Apple trio) | opens normally |
| Self-signed cert | `SCVN_SELFSIGN_P12` | right-click → Open |
| Ad-hoc fallback | no secrets | right-click → Open |

**Tier 1 secrets** (Settings → Secrets → Actions): `CSC_LINK` (base64 of the
Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

**Tier 2 secrets** (self-signed, free): generate a certificate and set the
two printed secrets:

```sh
./.github/scripts/gen-selfsign-cert.sh   # prints SCVN_SELFSIGN_P12 + SCVN_SELFSIGN_PASSWORD
```

`GITHUB_TOKEN` (built-in) publishes the release. The published build pins its tab
set via `SCVN_TABS=fork,git,init,settings` (baked into the renderer catalog and
host registry); build that variant locally by prefixing any desktop script, e.g.
`SCVN_TABS=fork,git,init,settings npm run desktop:pack`.

Install newer builds manually from this repository’s GitHub Releases.
Replace the app in Applications; existing
settings are preserved. The app has no update checks, download/install controls,
or update-channel preferences. Settings contains only Config and Doctor.

Architecture: a sandboxed renderer (no Node access) draws the UI; the Electron
main process owns the window, native dialogs, and an IPC broker; a long-lived
Node **utility process** hosts the command layer. `fork`, `config`, and `setup`
use native forms (a `prepare` round-trip populates the form, submit runs the
capability); the rest use a guided-dialog flow over the prompt channel. The CLI
(`bin/gdf`) ships independently via `package.json` `bin`.

## Flags

| Flag | Short | Description |
|---|---|---|
| `--dry-run` | `-n` | Preview changes without applying them |
| `--yes` | `-y` | Skip prompts; project-changing flows require an explicit target where needed |
| `--target <path>` | | Project target (Assets dir) for `gdf init` and `gdf git`; beats `SCVN_TARGET` env |
| `--ignore` | | `gdf git`: install repo-root `.gitignore` + prune nested + untrack now-ignored |
| `--exclude` | | `gdf git`: install `.git/info/exclude` |
| `--lfs` | | `gdf git`: `git lfs install --local` + LFS `.gitattributes` block |
| `--help` | `-h` | Show help text |
| `--version` | | Print version and exit |

`--target=/path` equals forms are also accepted.

Safety rules: project targets are never auto-picked. Under `-y`, project-changing
commands require an explicit `--target` (or `SCVN_TARGET` where supported).
Interactive project pickers require `SCVN_PROJECTS_ROOT`; the first interactive
run without it opens `gdf config` for you to fill, then continues. Under
`-y`/non-TTY a project-picker command exits 1 when `SCVN_PROJECTS_ROOT` is not
set (env/config) and no explicit target is passed. (`gdf fork` is exempt — it
picks no project and needs no root.) No command but `gdf config` writes the config file.

## Configuration

Config file: `~/.scvn/config`

Plain `KEY=value` format, one per line. Comments with `#`.

| Key | Description | Example |
|---|---|---|
| `SCVN_PROJECTS_ROOT` | Path to your Unity projects directory (required for interactive project picking) | `/Users/you/Projects` |

All keys are also readable as environment variables — env vars take precedence
over the config file.

**Projects root is required for project pickers.** Interactive commands that pick
their target Unity project need `SCVN_PROJECTS_ROOT`. (`gdf fork` configures
Fork.app only — no project, no root.) On first use without it, gdf opens
`gdf config` for you to fill, then continues; only `gdf config` writes
`~/.scvn/config`. A configured root that points to a non-existent directory is
treated as unset. Under `-y`/non-TTY, a project-picker command exits 1 unless
`SCVN_PROJECTS_ROOT` is valid (env/config) or an explicit `--target` is provided.

**Example config:**

```
SCVN_PROJECTS_ROOT=/Users/you/Unity/Projects
```

## Migration

### v0.1 → v0.2: sync namespace replaced

The `sync` namespace was replaced by the noun-first export/import grammar.
Old commands print this table and exit 1:

| Old (v0.1) | New (v0.2) |
|---|---|
| `gdf sync toolkit` | removed (toolkit feature deleted) |
| `gdf sync packages` | removed with the Packages feature; no migration |
| `gdf sync mcp` | removed (MCP feature deleted) |
| `gdf sync all` / `gdf all` | removed; no current replacement |
| `gdf sync all -y` | removed; no automatic project-target flow |
| `SCVN_SRC` / `SCVN_TARGET` env (old sync flows) | `SCVN_SRC` has no current use; `SCVN_TARGET` still presets bootstrap-op targets (`--target` flag wins) |

Also removed in v0.2: the MCP sync feature (`gdf sync mcp`, the
`SCVN_MCP_PACKAGE_DIR` config key, and the `claude` CLI doctor check).

### v0.2 → v0.3: setup namespace replaced

Bootstrap ops are top-level commands. `gdf setup …` (bare or with any
subcommand) prints this table and exits 1:

| Old (v0.2) | New (v0.3) |
|---|---|
| `gdf setup luna-submodule` | `gdf ignore-dirty` |
| `gdf setup gitignore` | `gdf git --ignore` |
| `gdf setup editorconfig` | `gdf editorconfig` |
| `gdf setup gitexclude` | `gdf git --exclude` |
| `gdf setup fork` | `gdf fork` |
| `gdf setup all` / operation menu | removed — run ops individually (chain with `&&`) |

Also in v0.3: bootstrap ops under `-y` require an explicit `--target` /
`SCVN_TARGET` — the first discovered project is no longer auto-picked.

### v0.3 → v0.4: `luna-submodule` → `ignore-dirty`

`gdf luna-submodule` was removed and replaced by `gdf ignore-dirty`. There is
**no shim** — the old command now errors as unknown.

| Old (v0.3) | New (v0.4) |
|---|---|
| `gdf luna-submodule` | `gdf ignore-dirty` |

What changed:

- **Scope:** the command now detects **every** submodule in the repo (not just
  `Supercent/Luna`) and offers each in a multi-select.
- **Behavior:** it is now a single **two-way `ignore=dirty` toggle** — the picker
  selection is the desired final state (selected → `ignore=dirty` set, deselected
  → unset; submit with nothing selected → unset all). The old Setup / Init /
  Update / Patch-`CollectionExtensions.cs` actions were dropped.
- Under `-y` it sets `ignore=dirty` on every submodule; `-n` previews; a repo with
  no submodules is a no-op (exit 0).
- **Removed config:** the `SCVN_SSH_HOST` key (only the old SSH-URL rewrite used
  it). An existing `SCVN_SSH_HOST` line is ignored and dropped on the next rewrite.

### v0.4 → v0.5: `gitignore` / `gitexclude` grouped into `gdf git`

`gdf gitignore` and `gdf gitexclude` were merged into one flag-driven
`gdf git` command (which also adds git-LFS setup). The old top-level commands
print this table and exit 1:

| Old (v0.4) | New (v0.5) |
|---|---|
| `gdf gitignore` | `gdf git --ignore` |
| `gdf gitexclude` | `gdf git --exclude` |
| — (new) | `gdf git --lfs` — `git lfs install --local` + LFS `.gitattributes` block |

`gdf ignore-dirty` is unchanged (still a top-level op).
Combine flags to bootstrap in one run: `gdf git --ignore --exclude --lfs`.

### v0.5 → v0.6: `gdf editorconfig` removed

`gdf editorconfig` and its bundled `.editorconfig` template were removed. The
command now errors as unknown — there is **no shim**. Manage `.editorconfig`
directly in your project; `gdf git` and `gdf ignore-dirty` are unaffected.

### MCP feature removed

All MCP commands and desktop actions have been removed: install, uninstall,
update, status, reconfigure, finish setup, and skill generation. `gdf mcp`
now fails as an unknown command; there is no compatibility shim.

Doctor no longer checks the MCP cache. New portable bundles contain the CLI and
optional Node runtime, without an MCP cache.
Existing project plugins, agent configuration files, and `~/.scvn/mcp/`
are left untouched; gdf no longer manages them.

### From sync-unity / fork-unity-setup

**Existing configs auto-migrate.** On first run, gdf:

1. Copies `~/.config/scvn/{config,history.jsonl}` (previous scvn home) into
   `~/.scvn/` if the new home is empty. Originals are left untouched.
2. Otherwise reads `~/.config/sync-unity/config` and writes `~/.scvn/config`.

The migration is one-shot — no-op if `~/.scvn/config` already exists.

Old env-var mapping:

| Old variable | New variable |
|---|---|
| `SYNC_UNITY_PROJECTS_ROOT` | `SCVN_PROJECTS_ROOT` |

## Troubleshooting

**`command not found: gdf`**
`<repo>/bin` is not on your PATH. Add it (run from the repo root):
```sh
make build
export PATH="$PATH:$(pwd)/bin"
```
Then run `gdf doctor` to confirm everything resolves.

**`rsync <3.1 detected; progress bars use file-level fallback`**
Install a modern rsync: `brew install rsync`

**`gdf fork` errors on Linux/Windows**
`fork` is macOS only. It requires Fork.app and the `defaults` command.

**`SCVN_PROJECTS_ROOT not set`**
An interactive command needs your Unity projects root. On first use gdf opens
`gdf config` for you to fill, then continues. To set it yourself: run
`gdf config`, export `SCVN_PROJECTS_ROOT` in the environment, or pass an
explicit `--target`. A configured path that no longer exists triggers the
same redirect. Under `-y`/non-TTY the value is mandatory — the command exits 1
without it.

**Config not picked up**
Check that `~/.scvn/config` exists and has correct `KEY=value` syntax
(`cat ~/.scvn/config`). Remember env vars override file values.

**Migration didn't run / old config not found**
Migration is a one-shot guard: it skips if `~/.scvn/config` already exists.
To re-trigger: `rm ~/.scvn/config` and run `gdf` once.
