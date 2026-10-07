// Read-only checks for an exported .app (unpack the IPA first).
// Default mode requires App Store distribution signing. --unsigned-check is
// explicitly preflight-only and must never be reported as upload readiness.
import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const bundleId = 'com.stone.primitive.saga';
const teamId = 'ADR4GMT9V3';
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const isEnabled = value => value === true || /^(yes|true|1)$/i.test(String(value));

export function checkReleaseMetadata(info, privacy, firebase, version, build) {
  requireThat(info.CFBundleIdentifier === bundleId, 'Unexpected bundle identifier');
  requireThat(info.CFBundleShortVersionString === version && info.CFBundleVersion === build, 'Unexpected version/build');
  requireThat(info.CFBundleSupportedPlatforms?.includes('iPhoneOS'), 'Not an iPhoneOS device package');
  requireThat(info.CFBundleExecutable && path.basename(info.CFBundleExecutable) === info.CFBundleExecutable, 'Invalid executable name');
  requireThat(info.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName === 'AppIcon', 'Compiled app icon is missing');
  function resolved(value, key = 'Info') {
    if (typeof value === 'string') requireThat(!/\$\([^)]+\)|\$\{[^}]+\}/.test(value), `Unresolved build setting at ${key}`);
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) resolved(item, `${key}.${name}`);
  }
  resolved(info);
  const ats = info.NSAppTransportSecurity;
  requireThat(ats && ats.NSAllowsArbitraryLoads === false && !isEnabled(ats.NSAllowsArbitraryLoadsInWebContent), 'Release must not disable HTTPS protection');
  requireThat(!Object.keys(ats.NSExceptionDomains ?? {}).length, 'Review ATS domain exceptions before release');
  const hosts = {
    ShellSdkApiEndpoint: 'safthwysdk.antieh.com',
    ShellContentConfigEndpoint: 'safthwysdk.antieh.com',
    ShellMiniGameOrderEndpoint: 'safthwysdk.antieh.com',
    ShellMiniGameAuthBaseURL: 'safthwysdk.antieh.com',
    ShellGameOrderEndpoint: 'safthwy09.antieh.com'
  };
  for (const [key, host] of Object.entries(hosts)) {
    let url;
    try { url = new URL(info[key]); } catch { throw new Error(`Missing/invalid production endpoint: ${key}`); }
    requireThat(url.protocol === 'https:' && url.hostname === host && !url.port && !url.username && !url.password,
      `Unexpected production endpoint: ${key}`);
  }
  requireThat(!info.ShellOnlineGameURL, 'The online-game entry URL must be supplied by the backend');
  requireThat(info.ShellPayType === 'apple' && isEnabled(info.ShellStoreKitEnabled), 'App Store payment configuration is disabled');
  requireThat(!isEnabled(info.ShellAllowSideloadOrderHandshake), 'Sideload payment handshake is enabled');
  for (const key of ['FIREBASE_ANALYTICS_COLLECTION_ENABLED', 'FacebookAutoLogAppEventsEnabled', 'FacebookAdvertiserIDCollectionEnabled']) {
    requireThat(info[key] === false, `SDK collection must default off: ${key}`);
  }
  requireThat(typeof info.NSUserTrackingUsageDescription === 'string' && info.NSUserTrackingUsageDescription.trim(), 'Missing ATT purpose text');
  requireThat(firebase.BUNDLE_ID === bundleId && firebase.GOOGLE_APP_ID, 'Firebase bundle configuration mismatch');
  requireThat(privacy.NSPrivacyTracking === true && privacy.NSPrivacyTrackingDomains?.includes('ep1.facebook.com'), 'Missing existing tracking declaration');
  requireThat(privacy.NSPrivacyAccessedAPITypes?.some(row => row.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults'
    && row.NSPrivacyAccessedAPITypeReasons?.includes('CA92.1')), 'Missing UserDefaults required-reason declaration');
}

export function checkDistributionProfile(profile, entitlements, now = new Date()) {
  const appId = `${teamId}.${bundleId}`;
  requireThat(profile.TeamIdentifier?.includes(teamId), 'Provisioning profile team mismatch');
  requireThat(profile.Entitlements?.['application-identifier'] === appId, 'Provisioning profile application mismatch');
  requireThat(profile.Entitlements?.['get-task-allow'] === false, 'Development provisioning profile is not accepted');
  requireThat(!('ProvisionedDevices' in profile) && !profile.ProvisionsAllDevices, 'Ad Hoc/enterprise profile is not accepted');
  requireThat(new Date(profile.ExpirationDate) > now, 'Provisioning profile is expired or invalid');
  requireThat(entitlements['application-identifier'] === appId && entitlements['com.apple.developer.team-identifier'] === teamId,
    'Signed application/team entitlements mismatch');
  requireThat(entitlements['get-task-allow'] === false, 'Debug entitlement is enabled or missing');
}

export function checkPackageInventory(files) {
  requireThat(!files.some(name => /(^|\/)\.git(\/|$)|\.(p12|p8|pem|key|xcconfig|storekit)$|\.debug\.dylib$|(^|\/)__preview\.dylib$/i.test(name)),
    'Package contains development configuration, signing material or debug injection files');
  requireThat(files.includes('PrivacyInfo.xcprivacy') && files.includes('Assets.car'), 'Missing privacy manifest or compiled assets');
}

function run(command, args, label, input) {
  const result = spawnSync(command, args, {encoding: 'utf8', input, timeout: 120000, maxBuffer: 16 * 1024 * 1024});
  // Do not print raw plists or command output: those can contain tokens.
  requireThat(result.status === 0, `${label} failed`);
  return result;
}
function plist(file) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], `Read ${path.basename(file)}`).stdout);
}
function plistText(xml) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], 'Decode verification plist', xml).stdout);
}
async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const relative = path.posix.join(prefix, entry.name);
    requireThat(!entry.isSymbolicLink(), `Unexpected symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...await inventory(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

async function main() {
  const [appArg, version, build, ...options] = process.argv.slice(2);
  requireThat(appArg?.endsWith('.app') && version && build && options.every(item => item === '--unsigned-check'),
    'Usage: node scripts/audit-release-package.mjs /path/App.app VERSION BUILD [--unsigned-check]');
  const app = path.resolve(appArg);
  const unsigned = options.includes('--unsigned-check');
  const info = plist(path.join(app, 'Info.plist'));
  checkReleaseMetadata(info, plist(path.join(app, 'PrivacyInfo.xcprivacy')), plist(path.join(app, 'GoogleService-Info.plist')), version, build);
  const files = await inventory(app);
  checkPackageInventory(files);
  const arch = run('/usr/bin/lipo', ['-archs', path.join(app, info.CFBundleExecutable)], 'Inspect device architecture').stdout.trim();
  requireThat(arch.split(/\s+/).includes('arm64') && !/x86|i386/.test(arch), 'Incorrect device architecture');
  // Syntax-check every bundled SDK privacy manifest as well as the app's.
  const manifests = files.filter(name => name.endsWith('PrivacyInfo.xcprivacy'));
  for (const name of manifests) plist(path.join(app, name));
  const script = fileURLToPath(new URL('./audit-emberwild-app.mjs', import.meta.url));
  const resources = JSON.parse(run(process.execPath, [script, app, version, build], 'Compiled resource identity audit').stdout);
  let signing = 'NOT_CHECKED_UNSIGNED_PREFLIGHT';
  if (!unsigned) {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], 'Distribution code signature verification');
    const metadata = run('/usr/bin/codesign', ['-d', '--verbose=4', app], 'Inspect signing identity').stderr;
    requireThat(/^Authority=(Apple Distribution|iPhone Distribution):/m.test(metadata), 'Not signed with an Apple distribution identity');
    requireThat(metadata.includes(`TeamIdentifier=${teamId}`), 'Code-signing team mismatch');
    const entitlements = plistText(run('/usr/bin/codesign', ['-d', '--entitlements', ':-', app], 'Read signed entitlements').stdout);
    const profile = plistText(run('/usr/bin/security', ['cms', '-D', '-i', path.join(app, 'embedded.mobileprovision')], 'Decode provisioning profile').stdout);
    checkDistributionProfile(profile, entitlements);
    signing = 'DISTRIBUTION_CHECKS_PASS';
  }
  console.log(JSON.stringify({result: unsigned ? 'UNSIGNED_PREFLIGHT_PASS' : 'PACKAGE_CHECKS_PASS', app, version, build,
    architecture: arch, gameFiles: resources.checkedGameFiles, privacyManifests: manifests.length, signing,
    appReviewApproval: 'NOT_DETERMINED',
    scope: 'Local package checks only; no device, backend, purchase, certificate-revocation, App Store Connect validation or review acceptance verified.'}, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`FAIL release package: ${error.message}`); process.exitCode = 1; });
}
