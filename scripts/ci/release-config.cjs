/** Project adapter: signing/build stay outside the portable publication helpers. */
module.exports = {
  repository: 'SCVN-Zee/game-dev-forge',
  appMetadata: true,
  assets: ({ version }) => [
    `dist-desktop-pack/game-dev-forge-${version}-arm64.dmg`,
    `dist-desktop-pack/game-dev-forge-${version}-arm64.zip`,
  ],
  notes: 'Game Dev Forge for macOS arm64. Install manually; first run may need right-click > Open. Updates are SHA-256 verified and require a confirmed restart.',
};
