# Game Dev Forge

A native macOS app for Unity project setup and maintenance — Fork merge
configuration, Git setup, and project scaffolding — through a GUI with folder
pickers, streaming output, and no terminal required.

The same engine also ships as the `gdf` command-line tool; see
[CLI.md](CLI.md) for the full CLI reference.

The project/package name is `game-dev-forge`; the executable is `gdf`.

> **Requirements:** an Apple Silicon Mac. Most tabs need at least one Unity
> project; the [Fork](#fork--merge-tool-for-unity-yaml) tab needs
> [Fork](https://git-fork.com) installed.

---

## Install

1. **Download** the latest release from
   [GitHub Releases](https://github.com/SCVN-Zee/game-dev-forge/releases/latest)
   — grab the `Game Dev Forge-<version>-arm64.dmg` file.
2. Open the `.dmg` and drag **Game Dev Forge** into your
   **Applications** folder.
3. **Remove the quarantine flag (one-time).** The app is distributed without
   an Apple Developer certificate, so macOS Gatekeeper may refuse to open it
   with *"Game Dev Forge is damaged and can't be opened"* or an
   *"unidentified developer"* warning. Open **Terminal** and run:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Game Dev Forge.app"
   ```

   After this the app opens normally. You only need to do this once per
   install (and again after replacing the app with a manually downloaded
   update).

4. Launch **Game Dev Forge** from Applications.

---

## First run

The first launch walks you through a short onboarding (also replayable anytime
via the **?** button in the sidebar):

1. **Unity projects root** — pick the folder that contains your Unity projects
   (for example `~/p`). This is where every project picker starts. Save it.
2. **Doctor checklist** — a quick report of your environment (git, rsync,
   Unity editors, Fork, …). Advisory only — you can finish
   regardless and fix warnings later under Settings → Doctor.

Choose **Skip for now** to enter the app without finishing; a banner reminds
you and onboarding reappears on the next launch until the projects root is
saved.

The desktop UI uses React Bits SpotlightCard and StarBorder, with Tailwind Zinc
surfaces and Amber tokens. It follows the system's light/dark appearance and
reduced-motion preference. All tabs use a centered workspace capped at 896px,
with a 176px sidebar and consistent headings, panels, spacing, and local task
controls. Fork’s Apply button sits beneath its settings inside the panel. Trees,
editors, and logs scroll independently; setup and editor footers stay visible.
The app icon and name sit beside the window controls in a 48px titlebar. Sidebar
navigation has an 8px top inset and inset keyboard focus rings to avoid overlap.
At compact sizes, Git’s panel can scroll as a whole so submodule switches remain
reachable even when repository actions fill the available height.
Standard controls are 36px tall with 16–20px page insets; app zoom is unchanged.
Use the sidebar chevron or **Cmd+B** to toggle the 56px icon rail; your choice
is remembered between sessions.

---

## The tabs

The sidebar shows what your build ships — in released builds:
**Fork · Git setup · Initialize · Settings**.

### Fork — merge tool for Unity YAML

Teaches the [Fork](https://git-fork.com) git client to merge Unity's YAML
assets (`.meta`, scenes, prefabs) with Unity's own `UnityYAMLMerge` instead of
plain text merge.

- **Unity editor** — pick which installed editor version performs merges.
- **Also write Unity merge .gitattributes to a project** — optional second
  half: writes the smart-merge block into a chosen project's `.gitattributes`
  (pick the project when enabled; the ✎ icon lets you edit the template
  first).
- If Fork is running, **Apply** asks to quit it, applies the settings, then
  reopens it.

This writes Fork's preferences only — it never touches git config; per-project
git files are [Git setup](#git-setup--gitignore--exclude--lfs)'s job.

### Git setup — .gitignore / exclude / LFS

Pick a project at the top, then run any of the three ops — each has its own
button and a ✎ icon to review or edit the template before running:

| Op | What it does |
|---|---|
| **Install .gitignore** | Writes the repo-root `.gitignore`, prunes nested `.gitignore` files, and untracks already-committed files the new rules ignore |
| **Install .git/info/exclude** | Writes local-only excludes that are never committed |
| **Install Git LFS** | `git lfs install` for the repo + binary-asset tracking rules in `.gitattributes` (needs `git-lfs`; see Troubleshooting) |

Below the ops: a live **ignore=dirty** toggle per git submodule. Flipping a
toggle applies immediately to the repo's local `.git/config` only — never to
the tracked `.gitmodules`.

Each template editor supports multiple named presets. **Default** is always the
bundled content: read-only and non-removable. Choose **Add new preset…** at the
bottom of the preset dropdown, enter a name, and **Create** to copy the current
editor content into a selected custom preset. **Cancel** leaves the current
preset and draft untouched. Edit and **Save** your template. Select a preset to use
it globally in both the desktop app and CLI. Choose **Default** to use bundled
content without changing saved custom presets. **Discard changes** restores
the current preset’s last saved content. Deleting the selected custom preset
returns to Default. Old Default overrides are imported once as a custom
**Previous Default** preset. Presets live under `~/.scvn/templates/`.

### Packages — removed

The Packages feature has been removed from the desktop app and CLI without a
migration. Existing `~/.scvn/store/` data is left untouched and is no longer
managed by Game Dev Forge. Desktop production builds clear generated output
before rebuilding, so removed feature assets cannot linger in packaged apps.

### Initialize — folder scaffolding

Creates the standard Supercent directory hierarchy inside a project:

1. Pick the **target project**.
2. Review the **directory hierarchy** tree — fully editable: rename, remove,
   or add folders; **Load**/**Save** a layout as a JSON manifest to reuse it.
   The default is `Assets/Supercent/<ProjectName>/` with Animation, Audio,
   Configs, Models, Fonts, Materials, Prefabs, Scenes, Scripts, Shaders,
   Sprites, and Textures.
3. **Dry run** to preview, then **Create**.

Existing directories are preserved; existing files are never touched.

### Settings

- **Config** — view/change the Unity projects root.
- **Doctor** — run environment checks and watch the results stream in.

---

## Updating

Download the newer `.dmg` from [GitHub Releases](https://github.com/SCVN-Zee/game-dev-forge/releases/latest),
replace the app in Applications, and re-run
the `xattr` command from the [install steps](#install) if macOS blocks it.
Your settings in `~/.scvn/` survive replacement. The app does not check for,
download, or install updates.

---

## Troubleshooting

**"Game Dev Forge is damaged and can't be opened"**
The quarantine flag is set. Run the `xattr` command from the
[install steps](#install).

**Onboarding keeps appearing on every launch**
The Unity projects root isn't saved (or points at a missing folder). Set it
during onboarding or in Settings → Config.

**Fork tab shows a blocker**
Fork.app isn't installed (or wasn't found). Install Fork and re-open the tab.
Fork setup configures only the Unity merge tool and leaves your diff tool unchanged.

**Doctor warns about git-lfs**
Git LFS is only needed for the Git setup **Install Git LFS** op. Install it
with `brew install git-lfs` when you want that op.

---

## Where things live

| Path | Purpose |
|---|---|
| `~/.scvn/config` | App configuration (the Unity projects root) |
| `~/.scvn/templates/` | Custom presets, selections, and legacy override backups |

The rebrand keeps `~/.scvn/`, `SCVN_*` environment variables, and existing project
markers unchanged so saved configuration and template presets still work.
The packaged desktop keeps its `scvn` application-data profile for window and UI
settings; development launches keep their separate Electron profile.
The CLI command is now `gdf`; update scripts that invoked `scvn`.

## The command line

Every capability above has a CLI equivalent, plus more (one-line bootstrap,
offline bundles for teammates). See
[CLI.md](CLI.md).

## Icon assets

`desktop/build/icon.svg` is the editable anvil/gamepad artwork. Its exports are
`desktop/build/icon.png` (1024px), `desktop/build/icon.icns` (macOS), and
`desktop/renderer/assets/logo.png` (512px sidebar image). Keep these in sync when
revising the artwork; the rounded tile and transparent margin belong to the asset.
