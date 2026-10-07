// Compile the real production configuration and navigation policy for each
// build variant. This test never contacts a server or uses player preferences.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const release = fs.readFileSync(path.join(root, 'Config/Release.xcconfig'), 'utf8');
const shellConfig = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Config/ShellConfig.swift'), 'utf8');
const gameViewController = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/GameViewController.swift'), 'utf8');
const trustedWebView = fs.readFileSync(path.join(root, 'PrehistoricBeastmaster/Web/TrustedWebView.swift'), 'utf8');
assert.doesNotMatch(release, /^SWIFT_ACTIVE_COMPILATION_CONDITIONS\s*=.*\bPBM_MINI_ONLY_RELEASE\b/m,
  'The shipping Release configuration must not select the removed mini-only capability');
assert.doesNotMatch(release, /^ONLINE_GAME_URL\s*=/m,
  'The full online-game URL must not be embedded in the app build settings');
assert.doesNotMatch(shellConfig, /publicContentMode/,
  'The app must not hardcode the visibility of both game entries');
assert.match(gameViewController, /contentConfigManager\.cachedOrDefault\(\)/,
  'Startup must restore the last backend decision');
assert.match(gameViewController, /contentConfigManager\.refresh\(force: true\)/,
  'Startup must request a fresh backend decision');
assert.match(gameViewController, /contentConfigManager\.refresh\(force: false\)/,
  'Returning to the app must refresh the backend decision');
assert.match(gameViewController, /#selector\(refreshContentConfigOnForeground\).*UIApplication\.didBecomeActiveNotification/,
  'The foreground notification must trigger the refresh');
assert.match(gameViewController, /private func onContentConfigResolved\(_ next: ContentConfig\)/,
  'Backend responses must update the active content route');
assert.match(trustedWebView, /onlineGameURL: onlineGameURL/,
  'Top-level navigation must trust only the active validated backend URL');
assert.doesNotMatch(trustedWebView, /miniOnlyTestGate/,
  'The temporary mini-only bridge restriction must be removed');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-release-content-'));
try {
  const sources = [
    'PrehistoricBeastmaster/Config/JSONObject.swift',
    'PrehistoricBeastmaster/Config/ShellConfig.swift',
    'PrehistoricBeastmaster/Content/ContentConfig.swift',
    'scripts/release-content-tests/main.swift'
  ].map(name => path.join(root, name));
  for (const variant of [
    {name: 'release', flags: []},
    {name: 'debug', flags: ['-D', 'DEBUG']}
  ]) {
    const binary = path.join(scratch, variant.name);
    execFileSync('xcrun', ['swiftc', '-swift-version', '5', ...variant.flags, ...sources, '-o', binary],
      {stdio: 'inherit', timeout: 120000});
    process.stdout.write(`${variant.name}: `);
    execFileSync(binary, [], {stdio: 'inherit', timeout: 15000});
  }
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}
