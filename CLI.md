# gdf — command-line reference

[Game Dev Forge](README.md) (the desktop app) and the `gdf` CLI drive
the same engine. This document is the full CLI reference: every command, flag,
template override, packaging flow, and migration note.

The CLI stages shared assets once and applies them to a target project, with
linear command flows for managing a library of Unity editor packages
(add / remove / import), bootstrapping, and configuring Unity projects.

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

## The store model

`gdf` maintains a **library** of staged packages in a local snapshot store at
`~/.scvn/store/`:

1. **add** — copy a chosen folder (inside a Unity project's `Assets/`) into the
   library. Adds accumulate: adding another folder keeps what is already staged.
2. **remove** — drop staged packages from the library.
3. **import** — apply selected staged packages TO a target project.

Each staged package carries its own provenance (`hub @ main, 2d ago, 142.0 MB`),
so a library built from several source projects shows where each package came
from. Import lists the library and lets you pick a subset (defaults to all).
`gdf doctor` also reports what is currently staged. (`export` is a back-compat
alias for `add`.)

## Commands

### `gdf packages` — Unity editor packages

| Verb | Description |
|---|---|
| `add` | Copy a chosen folder inside a Unity project's `Assets/` into the library — accumulates across adds |
| `remove` | Remove selected staged packages from the library |
| `import` | Apply staged packages (subset selectable, defaults to all) to a target — single-select target |

`export` is a back-compat alias for `add`.

Bare `gdf packages` opens a verb menu.

#### How `add` picks a package

`add` opens a folder picker (a path prompt in the CLI, a native dialog in the
desktop app). Pick any folder **inside a Unity project** — under `Assets/`, an
embedded UPM package under `Packages/`, or a custom root-level folder. Its
project-root-relative path is preserved, so a plugin at
`…/ProjA/Assets/Plugins/Sirenix` is stored under that path and `import`
restores it to `Assets/Plugins/Sirenix` in the target, while
`…/ProjA/Packages/com.acme.core` restores to `Packages/com.acme.core`. The
folder's paired Unity `.meta` sidecar is copied alongside it.

Picking the `Assets/`, `Packages/`, or `ProjectSettings/` folder itself, the
project root, or a folder outside any Unity project is rejected with a reason.
Re-adding the same path updates its entry in place.

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
bundled Node, Unity editors, Fork) and reports the store status
(staged provenance per feature). Exit code is non-zero only when a check
fails; the store line is informational and never fails the run. `git-lfs` is a
**warn** (not fail) — it's needed only for `gdf git --lfs`.

**Examples:**

```sh
gdf packages add --from ~/p/Hub/Assets/Plugins/Sirenix  # copy a folder inside Assets/ into the library
gdf packages add --from ~/p/Hub/Assets/vFolders         # add more — earlier packages are kept
gdf packages remove                          # drop staged packages from the library
gdf packages import                          # apply selected staged packages to the target
gdf packages import --to ~/p/GameA/Assets -y # promptless (explicit target required)
gdf packages import -n                       # dry-run the apply
gdf git --ignore --target ~/p/GameA/Assets -y   # promptless: install root + prune nested + untrack now-ignored
gdf git --lfs --target ~/p/GameA/Assets -y      # git lfs install + LFS .gitattributes
gdf fork -n                                  # preview Fork merge config (macOS)
```

## Deliver to a teammate — `make pack`

`gdf packages add` stages assets into your machine's `~/.scvn/store/`. To hand
the packages to a teammate who has **no source project**, bundle the CLI
and the staged store into a single zip. `make pack` is a maintainer task (run
from the repo) — there is no `gdf pack` command:

```sh
# producer (you) — store already populated via gdf packages add
make pack          # build + bundle → pkg/gdf-bundle-<version>.zip
```

The zip holds the built CLI (`bin/`, `dist/`, `templates/`), an `INSTALL.txt`,
a copy of your `~/.scvn/store/` under `store/`, and — unless you pass
`make pack-no-node` — a pinned Node runtime under `node/`. Hand it over (Drive,
Slack, USB).

```sh
# consumer (teammate) — clean machine, empty ~/.scvn
unzip gdf-bundle-<version>.zip -d ~/gdf-bundle
export PATH="$PATH:$HOME/gdf-bundle/bin"    # Node is bundled — no install, no npm
gdf packages import --to /path/to/YourGame/Assets   # applies the staged packages
gdf doctor                                  # store + Node lines show "(bundled)"
```

**How the fallback works:** when `~/.scvn/store/` has nothing staged,
`gdf packages import` and `gdf doctor` automatically read the copy shipped inside the
bundle (resolved next to the CLI install). A teammate who later runs their own
`gdf packages add` shadows the bundled copy with their user store.

**Operate directly on the bundle's store.** By default `import` reads the bundle but `add`
writes your user store. To make **both** halves act on the bundle's `store/` — e.g. to add a
package and re-share the bundle — point `SCVN_STORE_DIR` (or `--store`) at it:

```sh
export SCVN_STORE_DIR="$HOME/gdf-bundle/store"
gdf packages add --from ~/p/Hub/Assets/vFolders  # stages INTO the bundle
gdf packages import --to ~/p/Game/Assets    # applies FROM the same bundle
gdf doctor                                  # store line shows the bundle (override)
```

An explicit override reads/writes only that directory — the automatic user→bundled fallback
applies only when no override is set.

**Self-contained:** the bundle ships a pinned **Node runtime** (`node/bin/node`) alongside the
dependency-bundled `dist/cli.mjs`, so the delivered CLI runs with **only the PATH entry** — no
Node install, no `node_modules`, no `npm install`. `gdf` prefers the bundled Node, falls back to
a system Node ≥ 20, and on a CPU mismatch (e.g. an arm64 bundle on an Intel Mac) guides a one-time
install. `gdf doctor` shows the active runtime (`(bundled)` vs `(system)`).

Build a smaller bundle that relies on the consumer's own Node with `make pack-no-node`. The
bundled Node is built for the **producer's** CPU; don't run two `make pack`s at once.

> **Licensing:** the bundle redistributes the staged editor packages (Odin,
> vFolders, …). Share it **internally only**, where your team's seat licenses
> cover redistribution.

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

Releases are **tag-driven** on an Apple-Silicon runner; nothing runs on branch
pushes:

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
set via `SCVN_TABS=fork,git,packages,init,settings` (baked into the renderer
catalog and host registry); build that variant locally by prefixing any desktop
script, e.g. `SCVN_TABS=fork,git,packages,init,settings npm run desktop:pack`.

Install newer builds manually from this private repository’s GitHub Releases
(repository access is required). Replace the app in Applications; existing
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
| `--yes` | `-y` | Skip prompts — add auto-resolves the source; **imports then require `--to`, bootstrap ops require `--target`** |
| `--from <path>` | | Add source project (Assets dir) |
| `--to <path>` | | Import target project (Assets dir) — a single target per import |
| `--target <path>` | | Bootstrap-op / `gdf git` target project (Assets dir) — beats `SCVN_TARGET` env |
| `--ignore` | | `gdf git`: install repo-root `.gitignore` + prune nested + untrack now-ignored |
| `--exclude` | | `gdf git`: install `.git/info/exclude` |
| `--lfs` | | `gdf git`: `git lfs install --local` + LFS `.gitattributes` block |
| `--store <path>` | | Snapshot-store dir override for add/import/doctor — or `SCVN_STORE_DIR` env (flag wins) |
| `--help` | `-h` | Show help text |
| `--version` | | Print version and exit |

`--from=/path` / `--to=/path` equals-forms are also accepted.

**Store override.** `--store <dir>` (or the `SCVN_STORE_DIR` env var — `--store` wins) points
**both** add and import — plus `gdf doctor` — at one snapshot store instead of
`~/.scvn/store`. Add writes `<dir>/packages`; import and doctor read `<dir>`
**only** (an explicit override disables the bundled-store fallback). It is read from the
flag/env per invocation, **not** persisted to `~/.scvn/config`. Handy for operating directly
on a delivered bundle's `store/` (see "Deliver to a teammate").

Safety rules: targets are never auto-picked. Import runs select one target
interactively (the staged source project is excluded) and require a single
`--to` under `-y`; bootstrap ops require `--target` (or `SCVN_TARGET`) under `-y`.
Interactive project pickers require `SCVN_PROJECTS_ROOT` — the first interactive
run without it opens `gdf config` for you to fill, then continues. Under
`-y`/non-TTY a flow that would pick a project exits 1 when `SCVN_PROJECTS_ROOT`
is not set (env/config) and no explicit path is passed. (`gdf fork` is exempt —
it picks no project and needs no root.) No command but `gdf config` writes the
config file.

## Configuration

Config file: `~/.scvn/config`

Plain `KEY=value` format, one per line. Comments with `#`.

| Key | Description | Example |
|---|---|---|
| `SCVN_PROJECTS_ROOT` | Path to your Unity projects directory (required for interactive project picking) | `/Users/you/Projects` |

All keys are also readable as environment variables — env vars take precedence
over the config file.

**Projects root is required for project pickers.** Commands that pick a project
interactively (`packages` import, bootstrap ops) need
`SCVN_PROJECTS_ROOT`. (`gdf fork` configures Fork.app only — no project, no root.) On first use without it,
gdf opens `gdf config` for you to fill, then continues the command — only
`gdf config` ever writes `~/.scvn/config`. A configured root that points to a
non-existent directory is treated as unset (same redirect). Under `-y` (or any
non-TTY), such a command exits 1 unless `SCVN_PROJECTS_ROOT` is valid (env or
config) or you pass an explicit `--from`/`--to`/`--target`.

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
| `gdf sync packages` | `gdf packages add` then `gdf packages import` |
| `gdf sync mcp` | removed (MCP feature deleted) |
| `gdf sync all` / `gdf all` | `gdf packages import` |
| `gdf sync all -y` (auto target) | `gdf packages import -y --to <path>` — targets are now explicit |
| `SCVN_SRC` / `SCVN_TARGET` env (export/import flows) | `--from` / `--to` flags — note: `SCVN_TARGET` still presets bootstrap-op targets (`--target` flag wins) |

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

Doctor no longer checks the MCP cache. New offline bundles contain the CLI,
staged package store, and optional Node runtime, without an MCP cache.
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

**``Nothing staged — run `gdf packages add` first``**
The import side reads from the store — stage content first with
`gdf packages add`. `gdf doctor` shows what is
currently staged.

**Store taking too much disk**
The store holds one copy of each staged package under `~/.scvn/store/`
(potentially a few hundred MB with large packages). Safe to reset:
`rm -rf ~/.scvn/store` — re-add to stage again.

**`rsync <3.1 detected; progress bars use file-level fallback`**
Install a modern rsync: `brew install rsync`

**`gdf fork` errors on Linux/Windows**
`fork` is macOS only. It requires Fork.app and the `defaults` command.

**`SCVN_PROJECTS_ROOT not set`**
An interactive command needs your Unity projects root. On first use gdf opens
`gdf config` for you to fill, then continues. To set it yourself: run
`gdf config`, export `SCVN_PROJECTS_ROOT` in the environment, or pass an
explicit `--from`/`--to`/`--target`. A configured path that no longer exists
triggers the same redirect. Under `-y`/non-TTY the value is mandatory — the
command exits 1 without it.

**Config not picked up**
Check that `~/.scvn/config` exists and has correct `KEY=value` syntax
(`cat ~/.scvn/config`). Remember env vars override file values.

**Migration didn't run / old config not found**
Migration is a one-shot guard: it skips if `~/.scvn/config` already exists.
To re-trigger: `rm ~/.scvn/config` and run `gdf` once.
