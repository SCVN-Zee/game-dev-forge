const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'desktop/main/update-artifacts.ts');
const nativeRequire = createRequire(file);
async function bundle(repository) {
  const result = await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs',
    target: 'node20', write: false, external: ['semver', 'yauzl'], plugins: [{ name: 'build-metadata-fixture',
      setup(plugin) {
        plugin.onLoad({ filter: /package\.json$/ }, args => args.path === path.join(root, 'package.json')
          ? { contents: JSON.stringify({ releaseRepository: repository }), loader: 'json' } : undefined);
      } }] });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: nativeRequire,
    process: { ...process, env: { ...process.env, GITHUB_REPOSITORY: 'attacker/runtime' } },
    Buffer, console, AbortSignal }, { filename: 'packaged-updater.cjs' });
  return module.exports;
}

test('real bundled updater bakes moved identity and rejects runtime or old-owner redirection', async () => {
  const updates = await bundle('new-owner/moved-forge');
  const name = 'game-dev-forge-1.2.3-arm64.zip';
  const release = { tag_name: 'v1.2.3', draft: false, prerelease: false, assets: [{ name, state: 'uploaded',
    digest: `sha256:${'a'.repeat(64)}`, size: 123,
    browser_download_url: `https://github.com/new-owner/moved-forge/releases/download/v1.2.3/${name}` }] };
  assert.equal(updates.UPDATE_REPO, 'new-owner/moved-forge');
  assert.equal(updates.selectRelease([release], '1.2.2', 'stable').url, release.assets[0].browser_download_url);
  for (const repository of ['attacker/runtime', 'SCVN-Zee/game-dev-forge']) {
    const redirected = { ...release, assets: [{ ...release.assets[0],
      browser_download_url: `https://github.com/${repository}/releases/download/v1.2.3/${name}` }] };
    assert.throws(() => updates.selectRelease([redirected], '1.2.2', 'stable'), /Invalid update/);
  }
  await assert.rejects(bundle('owner/..'), /Invalid packaged/);
});
