/**
 * features/pack/install-text.ts — Build the INSTALL.txt embedded in a bundle.
 *
 * Pure function that builds a concise guide for the portable CLI bundle.
 * Cross-CPU consumers fall back to system Node / a guided install.
 */

/** Plain-text install guide written to the bundle root as INSTALL.txt. */
export function buildInstallText(version: string): string {
  return [
    `Game Dev Forge bundle — v${version}`,
    ``,
    `A portable Game Dev Forge CLI; standard bundles include pinned Node.`,
    ``,
    `1. Unzip this archive somewhere stable, e.g. ~/gdf-bundle`,
    `2. Add its bin/ to PATH:`,
    `      export PATH="$PATH:/absolute/path/to/gdf-bundle/bin"`,
    `3. List the available commands:`,
    `      gdf --help`,
    ``,
    `If built with make pack-no-node, install Node 20+ before use.`,
    `Check host prerequisites with gdf doctor.`,
    ``,
    `The bundled Node is built for this Mac's CPU. On a different CPU, gdf falls`,
    `back to a system Node 20+ or guides you to install one on first run.`,
    ``,
  ].join("\n");
}
