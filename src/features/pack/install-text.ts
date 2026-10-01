/**
 * features/pack/install-text.ts — Build the INSTALL.txt embedded in a bundle.
 *
 * Pure function so a test can assert the key lines without producing an archive. The bundle now
 * carries a Node runtime, so the consumer flow is unzip → add bin/ to PATH → import — no Node
 * install. A cross-CPU consumer falls back to system Node / a guided install.
 */

/** Plain-text install guide written to the bundle root as INSTALL.txt. */
export function buildInstallText(version: string): string {
  return [
    `Game Dev Forge bundle — v${version}`,
    ``,
    `A self-contained Game Dev Forge CLI with the Unity editor packages staged inside`,
    `(under store/), plus a bundled Node runtime. Apply them to a Unity project:`,
    ``,
    `1. Unzip this archive somewhere stable, e.g. ~/gdf-bundle`,
    `2. Add its bin/ to PATH (Node is bundled — nothing to install):`,
    `      export PATH="$PATH:/absolute/path/to/gdf-bundle/bin"`,
    `3. Apply the staged packages to your Unity project:`,
    `      gdf packages import --to /path/to/YourGame`,
    ``,
    `Inspect what is staged:  gdf doctor`,
    `(its store line shows "(bundled)"; the Node line shows "(bundled)")`,
    ``,
    `The bundled Node is built for this Mac's CPU. On a different CPU, gdf falls`,
    `back to a system Node 20+ or guides you to install one on first run.`,
    ``,
  ].join("\n");
}
