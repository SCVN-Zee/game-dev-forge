/**
 * commands/help-text.ts — The `gdf -h` / bare-invocation help surface.
 */

export const HELP_TEXT = `
gdf — Game Dev Forge: Unity project workflow tools

Usage:
  gdf <command> [verb] [flags]

Commands:
  packages         Unity editor packages — a staged library: add / remove / import
  init             Create a customizable Supercent directory hierarchy under Assets/
  fork             Configure Fork 2.64 for Unity merges (macOS only)
  git              Set up git artifacts — flags: --ignore / --exclude / --lfs
  ignore-dirty     Toggle ignore=dirty on the repo's git submodules
  config           Edit ~/.scvn/config
  doctor           Run environment checks

packages verbs (bare noun opens a menu):
  add              Stage packages from a source project into the library (accumulates)
  remove           Remove staged packages from the library
  import           Apply selected staged packages to a target project
                   (export is a back-compat alias for add)

git ops (gdf git — pick ≥1 flag; combine freely):
  --ignore         Install repo-root .gitignore + prune nested
  --exclude        Write the bundled template into .git/info/exclude as a fenced block
  --lfs            git lfs install --local + LFS .gitattributes block

Flags:
  -n, --dry-run    Preview changes without applying
  -y, --yes        Skip prompts (init requires --target and --name; imports require --to)
  --from <path>    Add source project (Assets dir)
  --to <path>      Import target project (Assets dir, repeatable)
  --target <path>  Bootstrap-op / git / init target Assets dir
  --name <name>    gdf init default hierarchy project name (without --layout)
  --layout <file>  gdf init full Assets-relative JSON hierarchy
  --store <path>   Snapshot-store dir override (export/import/doctor; or SCVN_STORE_DIR)
  -h, --help       Show this help
  --version        Print version
`.trim();
