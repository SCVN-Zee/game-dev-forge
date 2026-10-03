const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

test('real signing script selects one tier, passes moved builder identity and never uploads', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-sign-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  fs.copyFileSync(path.join(root, 'scripts/ci/build-sign.sh'), path.join(temp, 'build-sign.sh'));
  const executable = (name, source) => fs.writeFileSync(path.join(bin, name), source, { mode: 0o755 });
  executable('npm', '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SIGN_LOG"\nmkdir -p dist-desktop-pack\nprintf app > "dist-desktop-pack/game-dev-forge-$SIGN_VERSION-arm64.dmg"\nprintf app > "dist-desktop-pack/game-dev-forge-$SIGN_VERSION-arm64.zip"\n');
  executable('security', '#!/bin/sh\ncase "$1" in\nfind-identity) echo \'  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Fixture"\' ;;\nlist-keychains) echo \'"/tmp/fixture.keychain"\' ;;\nesac\n');
  executable('openssl', '#!/bin/sh\necho fixture-password\n');
  executable('gh', '#!/bin/sh\necho forbidden-upload >> "$SIGN_LOG"\nexit 1\n');
  for (const channel of ['stable', 'beta']) {
    const version = channel === 'stable' ? '1.2.3' : '1.2.3-beta.1';
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ version, releaseRepository: 'new-owner/moved-forge' }));
    for (const [apple, self, tier] of [[false, false, ':adhoc'], [false, true, ':selfsigned'], [true, false, ''], [true, true, '']]) {
      const log = path.join(temp, 'sign.log');
      fs.writeFileSync(log, '');
      const result = spawnSync('bash', ['build-sign.sh', channel], { cwd: temp, encoding: 'utf8', env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: temp, SIGN_LOG: log, SIGN_VERSION: version,
        GITHUB_REF_NAME: `v${version}`, CSC_LINK: apple ? 'fixture-cert' : '',
        SCVN_SELFSIGN_P12: self ? 'Y2VydA==' : '', SCVN_SELFSIGN_PASSWORD: self ? 'fixture-password' : '',
      } });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
      assert.equal(calls.length, 1);
      const script = `desktop:publish${channel === 'beta' ? ':beta' : ''}${tier}`;
      assert.equal(calls[0], `run ${script} -- -c.publish.owner=new-owner -c.publish.repo=moved-forge`);
    }
  }
});
