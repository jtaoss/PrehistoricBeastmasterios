// Compile the production gate with isolated transport doubles; no HTTP or payment.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Web/GameAPIProxy.swift'), 'utf8');
const begin = source.indexOf('@MainActor final class GameOrderRequestGate');
const end = source.indexOf('private final class GameAPIProxySessionDelegate', begin);
assert.ok(begin > 0 && end > begin);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-order-gate-tests-'));
try {
  const swift = path.join(dir, 'Tests.swift'), binary = path.join(dir, 'tests');
  fs.writeFileSync(swift, fs.readFileSync(path.join(__dirname, 'payment-tests/GameOrderGateHarness.swift'), 'utf8') + '\n' + source.slice(begin, end));
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', swift, '-o', binary], {stdio:'inherit'});
  execFileSync(binary, [], {stdio:'inherit', timeout:15000});
} finally { fs.rmSync(dir, {recursive:true, force:true}); }
