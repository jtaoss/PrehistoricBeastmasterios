// Compile the production entry adapters with deterministic account, network and
// WebKit surfaces. No Apple purchase, user keychain or server is accessed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-adapter-tests-'));
try {
  const sources = ['Config/JSONObject.swift', 'Payment/PayRequest.swift', 'Payment/Config.swift',
    'Payment/LocalAssetSyncManager.swift', 'Payment/WebActionSyncHandler.swift']
    .map(file => fs.readFileSync(path.join(root, 'PrehistoricBeastmaster', file), 'utf8').replace(/^import WebKit\n/gm, ''));
  const source = path.join(scratch, 'Adapters.swift');
  const binary = path.join(scratch, 'adapters');
  fs.writeFileSync(source, fs.readFileSync(path.join(__dirname, 'payment-tests/AdapterHarness.swift'), 'utf8') + '\n' + sources.join('\n'));
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library', source, '-o', binary], { stdio: 'inherit' });
  execFileSync(binary, [], { stdio: 'inherit', timeout: 20000 });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
