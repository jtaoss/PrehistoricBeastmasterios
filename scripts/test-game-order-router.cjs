// Compile the actual production router, not a JS copy. Never contact a server.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const proxy = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Web/GameAPIProxy.swift'), 'utf8');
assert.ok(proxy.includes('GameOrderEndpointRouter.rewrite(source, orderPlatform: ShellConfig.gameOrderPlatform)'));
assert.ok(!proxy.includes('private func rewrite('), 'proxy must use the production router under test');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-game-order-router-'));
try {
  const binary = path.join(scratch, 'router-tests');
  execFileSync('xcrun', ['swiftc', '-swift-version', '5',
    path.join(root, 'PrehistoricBeastmaster/Web/GameOrderEndpointRouter.swift'),
    path.join(root, 'scripts/game-order-router-tests/main.swift'), '-o', binary], {stdio: 'inherit'});
  execFileSync(binary, [], {stdio: 'inherit', timeout: 15000});
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}
