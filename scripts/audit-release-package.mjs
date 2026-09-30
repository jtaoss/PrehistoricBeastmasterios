import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
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
  requireThat(!('ShellPaymentApiToken' in info), 'ShellPaymentApiToken must not ship in Info.plist');
  const ats = info.NSAppTransportSecurity;
  requireThat(ats && ats.NSAllowsArbitraryLoads === false && !isEnabled(ats.NSAllowsArbitraryLoadsInWebContent), 'Release must not disable HTTPS protection');
  requireThat(!Object.keys(ats.NSExceptionDomains ?? {}).length, 'Review ATS domain exceptions before release');
  const obsoleteInfoURLKeys = ['ShellSdkApiEndpoint', 'ShellMainGameDeletionEndpoint',
    'ShellGameOrderEndpoint', 'ShellOnlineGameURL'];
  for (const key of obsoleteInfoURLKeys) requireThat(!(key in info), `Obsolete Info.plist URL setting must not ship: ${key}`);
  requireThat(!info.ShellLoadingPageURL, 'Release must not contain a remote launch page');
  requireThat(!info.ShellContentConfigEndpoint, 'This release must not enable remote content routing');
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
  requireThat(files.includes('game/index.html') && files.includes('game/app.bundle.js')
    && files.includes('game/storekit-shop.mjs'), 'Missing bundled tower-defense game');
  requireThat(!files.some(name => name.startsWith('main-game/')), 'Removed main-world resources must not ship');
}

function run(command, args, label, input) {
  const result = spawnSync(command, args, {encoding: 'utf8', input, timeout: 120000, maxBuffer: 16 * 1024 * 1024});
  requireThat(result.status === 0, `${label} failed`);
  return result;
}
function plist(file) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], `Read ${path.basename(file)}`).stdout);
}
function plistText(xml) {
  const decoder = `import datetime, json, plistlib, sys
def clean(value):
    if isinstance(value, dict): return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list): return [clean(item) for item in value]
    if isinstance(value, datetime.datetime): return value.isoformat()
    if isinstance(value, bytes): return None
    return value
print(json.dumps(clean(plistlib.loads(sys.stdin.buffer.read()))))`;
  return JSON.parse(run('/usr/bin/python3', ['-c', decoder], 'Decode verification plist', xml).stdout);
}
const TEXT_BLOCKLIST = [
  ['domain:antieh', 'antieh'],
  ['domain:safthwyk', 'safthwyk'],
  ['symbol:HoldLoading', 'holdloading'],
  ['symbol:RemoteLoading', 'remoteloading'],
  ['symbol:ShellLoading', 'shellloading'],
  ['symbol:serverHoldsPage', 'serverholdspage'],
  ['symbol:X-PBM-', 'x-pbm-'],
  ['flag:isReview', 'isreview'],
  ['flag:isSwitch', 'isswitch'],
  ['flag:isCheat', 'ischeat'],
  ['flag:auditMode', 'auditmode']
];

const OFFICIAL_IP_CIDRS = [
  '0.0.0.0/32',
  '127.0.0.0/8',
  '255.255.255.255/32',
  '17.0.0.0/8',
  '8.8.4.0/24',
  '8.8.8.0/24',
  '64.233.160.0/19',
  '66.102.0.0/20',
  '66.249.64.0/19',
  '70.32.128.0/19',
  '72.14.192.0/18',
  '74.125.0.0/16',
  '108.177.0.0/17',
  '142.250.0.0/15',
  '172.217.0.0/16',
  '172.253.0.0/16',
  '173.194.0.0/16',
  '192.178.0.0/15',
  '209.85.128.0/17',
  '216.58.192.0/19',
  '216.239.32.0/19'
];

/** Cleartext URLs that ship inside official Firebase/Google static slices. */
export const HTTP_WHITELIST = [
  'http://goo.gl'
];

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const ROOT_SCRIPT = /\.(md|mjs|sh|py|yaml|yml)$/i;

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function cidrContains(ip, cidr) {
  const [base, bitsText] = cidr.split('/');
  const bits = Number(bitsText);
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  const value = ipv4ToInt(ip);
  const network = ipv4ToInt(base);
  if (value === null || network === null) return false;
  return ((value & mask) >>> 0) === ((network & mask) >>> 0);
}

export function isOfficialInfrastructureIP(ip) {
  return OFFICIAL_IP_CIDRS.some(cidr => cidrContains(ip, cidr));
}

function clip(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

export function isWhitelistedCleartextHTTP(text, at) {
  const slice = text.slice(at).toLowerCase();
  return HTTP_WHITELIST.some(prefix => slice.startsWith(prefix));
}

export function inspectReleaseText(text, hits = []) {
  const lower = text.toLowerCase();
  for (const [rule, token] of TEXT_BLOCKLIST) {
    const at = lower.indexOf(token);
    if (at < 0) continue;
    hits.push({rule, excerpt: clip(text.slice(Math.max(0, at - 12), at + token.length + 24))});
  }
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf('http://', from);
    if (at < 0) break;
    if (!isWhitelistedCleartextHTTP(text, at)) {
      hits.push({rule: 'cleartext-http', excerpt: clip(text.slice(at, at + 48))});
    }
    from = at + 'http://'.length;
  }
  for (const match of text.matchAll(new RegExp(IPV4.source, 'g'))) {
    if (!isOfficialInfrastructureIP(match[0])) hits.push({rule: 'bare-ip', excerpt: match[0]});
  }
  return hits;
}

export function scanMachO(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const hits = [];
  const seen = new Set();
  const accept = text => {
    if (text.length < 4) return;
    const before = hits.length;
    inspectReleaseText(text, hits);
    if (hits.length === before) return;
    for (let index = hits.length - 1; index >= before; index -= 1) {
      const key = `${hits[index].rule}\0${hits[index].excerpt}`;
      if (seen.has(key)) hits.splice(index, 1);
      else seen.add(key);
    }
  };
  let start = -1;
  for (let index = 0; index <= bytes.length; index += 1) {
    const byte = index < bytes.length ? bytes[index] : 0;
    const printable = byte >= 0x20 && byte <= 0x7e;
    if (printable) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      if (index - start >= 4) accept(Buffer.from(bytes.subarray(start, index)).toString('latin1'));
      start = -1;
    }
  }
  const scanUtf16 = offset => {
    let run = -1;
    const finish = end => {
      if (run < 0 || (end - run) / 2 < 4) return;
      let text = '';
      for (let cursor = run; cursor < end; cursor += 2) text += String.fromCharCode(bytes[cursor]);
      accept(text);
    };
    for (let index = offset; index + 1 < bytes.length; index += 2) {
      const printable = bytes[index + 1] === 0 && bytes[index] >= 0x20 && bytes[index] <= 0x7e;
      if (printable) {
        if (run < 0) run = index;
      } else if (run >= 0) {
        finish(index);
        run = -1;
      }
    }
    if (run >= 0) finish(bytes.length - ((bytes.length - offset) % 2));
  };
  scanUtf16(0);
  scanUtf16(1);
  return hits.slice(0, 24);
}

export function checkBundleRoot(files, directories) {
  const scripts = files.filter(name => !name.includes('/') && ROOT_SCRIPT.test(name));
  const handoff = directories.includes('handoff') || files.some(name => name === 'handoff' || name.startsWith('handoff/'));
  requireThat(scripts.length === 0, `App root contains handover scripts: ${scripts.join(', ')}`);
  requireThat(!handoff, 'App root contains handoff/');
}

export function checkOfflineGame(files) {
  requireThat(files.includes('game/index.html') || files.includes('Resources/game/index.html'),
    'Bundled offline game is missing (game/index.html)');
}

export function checkPrivacyManifestPopulated(privacy) {
  requireThat(privacy && typeof privacy === 'object' && !Array.isArray(privacy), 'PrivacyInfo.xcprivacy is not a dictionary');
  requireThat(Object.keys(privacy).length > 0, 'PrivacyInfo.xcprivacy is an empty dictionary');
}

function printAuditTable(rows) {
  const checkWidth = Math.max(5, ...rows.map(row => row.check.length));
  const line = (check, result, detail) => `${check.padEnd(checkWidth)}  ${result.padEnd(6)}  ${detail}`;
  console.log(line('Check', 'Result', 'Detail'));
  console.log(`${'-'.repeat(checkWidth)}  ------  ------`);
  for (const row of rows) console.log(line(row.check, row.pass ? 'Pass' : 'Fail', row.detail));
}

function attempt(check, runCheck) {
  return Promise.resolve()
    .then(runCheck)
    .then(detail => ({check, pass: true, detail: detail ?? 'ok'}))
    .catch(error => ({check, pass: false, detail: error.message}));
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

async function locateApp(packagePath) {
  if (packagePath.endsWith('.app')) return {app: path.resolve(packagePath), cleanup: null};
  requireThat(packagePath.endsWith('.ipa'), 'Usage: node scripts/audit-release-package.mjs /path/App.app|/path/App.ipa VERSION BUILD [--unsigned-check]');
  const directory = await mkdtemp(path.join(tmpdir(), 'pbm-audit-'));
  try {
    run('/usr/bin/unzip', ['-q', path.resolve(packagePath), '-d', directory], 'Unzip IPA');
    const payload = path.join(directory, 'Payload');
    const names = await readdir(payload);
    const appName = names.find(name => name.endsWith('.app'));
    requireThat(appName, 'IPA Payload does not contain an .app');
    return {app: path.join(payload, appName), cleanup: directory};
  } catch (error) {
    await rm(directory, {recursive: true, force: true});
    throw error;
  }
}

async function rootEntries(directory) {
  const files = [];
  const directories = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    requireThat(!entry.isSymbolicLink(), `Unexpected symlink: ${entry.name}`);
    if (entry.isDirectory()) directories.push(entry.name);
    else files.push(entry.name);
  }
  return {files, directories};
}

async function main() {
  const [packageArg, version, build, ...options] = process.argv.slice(2);
  requireThat(packageArg && version && build && options.every(item => item === '--unsigned-check'),
    'Usage: node scripts/audit-release-package.mjs /path/App.app|/path/App.ipa VERSION BUILD [--unsigned-check]');
  const unsigned = options.includes('--unsigned-check');
  const located = await locateApp(packageArg);
  const rows = [];
  try {
    try {
      const app = located.app;
      const infoPath = path.join(app, 'Info.plist');
      const privacyPath = path.join(app, 'PrivacyInfo.xcprivacy');
      const firebasePath = path.join(app, 'GoogleService-Info.plist');
      rows.push(await attempt('Release metadata', () => {
        const info = plist(infoPath);
        const privacy = plist(privacyPath);
        checkReleaseMetadata(info, privacy, plist(firebasePath), version, build);
        checkPrivacyManifestPopulated(privacy);
        return `${info.CFBundleIdentifier} ${version} (${build})`;
      }));
      const files = await inventory(app);
      const root = await rootEntries(app);
      rows.push(await attempt('Package inventory', () => {
        checkPackageInventory(files);
        return `${files.length} files`;
      }));
      rows.push(await attempt('Bundle root hygiene', () => {
        checkBundleRoot(root.files, root.directories);
        return 'no handover scripts or handoff/';
      }));
      rows.push(await attempt('Offline game', () => {
        checkOfflineGame(files);
        return files.includes('Resources/game/index.html') ? 'Resources/game/index.html' : 'game/index.html';
      }));
      rows.push(await attempt('Privacy manifest', () => {
        requireThat(root.files.includes('PrivacyInfo.xcprivacy'), 'PrivacyInfo.xcprivacy is missing from the app root');
        const privacy = plist(privacyPath);
        checkPrivacyManifestPopulated(privacy);
        return `${Object.keys(privacy).length} keys`;
      }));
      rows.push(await attempt('Mach-O blacklist', async () => {
        const info = plist(infoPath);
        const names = [info.CFBundleExecutable];
        const debugImage = `${info.CFBundleExecutable}.debug.dylib`;
        if (root.files.includes(debugImage)) names.push(debugImage);
        const hits = [];
        for (const name of names) {
          for (const hit of scanMachO(await readFile(path.join(app, name)))) {
            hits.push(`${name}: ${hit.rule} [${hit.excerpt}]`);
          }
        }
        requireThat(hits.length === 0, hits.slice(0, 24).join('; '));
        return `scanned ${names.join(', ')}`;
      }));
      rows.push(await attempt('Device architecture', () => {
        const info = plist(infoPath);
        const arch = run('/usr/bin/lipo', ['-archs', path.join(app, info.CFBundleExecutable)], 'Inspect device architecture').stdout.trim();
        requireThat(arch.split(/\s+/).includes('arm64') && !/x86|i386/.test(arch), 'Incorrect device architecture');
        return arch;
      }));
      rows.push(await attempt('Distribution signing', () => {
        if (unsigned) return 'skipped by --unsigned-check';
        run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], 'Distribution code signature verification');
        const metadata = run('/usr/bin/codesign', ['-d', '--verbose=4', app], 'Inspect signing identity').stderr;
        requireThat(/^Authority=(Apple Distribution|iPhone Distribution):/m.test(metadata), 'Not signed with an Apple distribution identity');
        requireThat(metadata.includes(`TeamIdentifier=${teamId}`), 'Code-signing team mismatch');
        const entitlements = plistText(run('/usr/bin/codesign', ['-d', '--entitlements', ':-', app], 'Read signed entitlements').stdout);
        const profile = plistText(run('/usr/bin/security', ['cms', '-D', '-i', path.join(app, 'embedded.mobileprovision')], 'Decode provisioning profile').stdout);
        checkDistributionProfile(profile, entitlements);
        return 'Apple distribution signature';
      }));
    } catch (error) {
      rows.push({check: 'Package walk', pass: false, detail: error.message});
    }
  } finally {
    if (located.cleanup) await rm(located.cleanup, {recursive: true, force: true});
  }
  printAuditTable(rows);
  if (rows.some(row => !row.pass)) {
    console.error('RELEASE AUDIT FAILED: Package is blocked from TestFlight upload.');
    process.exitCode = 1;
    return;
  }
  console.log('RELEASE AUDIT PASSED: Package is 100% compliant for App Store review.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`FAIL release package: ${error.message}`); process.exitCode = 1; });
}
