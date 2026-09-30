import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkReleaseMetadata, checkDistributionProfile, checkPackageInventory, checkBundleRoot, checkOfflineGame, checkPrivacyManifestPopulated, isOfficialInfrastructureIP, scanMachO} from './audit-release-package.mjs';

function fixture() {
  const info = {CFBundleIdentifier: 'com.stone.primitive.saga', CFBundleShortVersionString: '1.0.12', CFBundleVersion: '52',
    CFBundleExecutable: 'PrehistoricBeastmaster', CFBundleSupportedPlatforms: ['iPhoneOS'],
    CFBundleIcons: {CFBundlePrimaryIcon: {CFBundleIconName: 'AppIcon'}},
    NSAppTransportSecurity: {NSAllowsArbitraryLoads: false}, NSUserTrackingUsageDescription: 'Fixture ATT description',
    ShellPayType: 'apple', ShellStoreKitEnabled: 'YES',
    ShellAllowSideloadOrderHandshake: 'NO', FIREBASE_ANALYTICS_COLLECTION_ENABLED: false,
    FacebookAutoLogAppEventsEnabled: false, FacebookAdvertiserIDCollectionEnabled: false};
  const privacy = {NSPrivacyTracking: true, NSPrivacyTrackingDomains: ['ep1.facebook.com'],
    NSPrivacyAccessedAPITypes: [{NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1']}]};
  const firebase = {BUNDLE_ID: info.CFBundleIdentifier, GOOGLE_APP_ID: 'fixture'};
  return {info, privacy, firebase};
}
function validate({info, privacy, firebase}) { checkReleaseMetadata(info, privacy, firebase, '1.0.12', '52'); }
test('valid production metadata passes with fixed service configuration', () => validate(fixture()));
for (const [name, mutate] of [
  ['wrong version', f => f.info.CFBundleVersion = '48'],
  ['simulator', f => f.info.CFBundleSupportedPlatforms = ['iPhoneSimulator']],
  ['static payment bearer', f => f.info.ShellPaymentApiToken = 'fixture-token'],
  ['plain SDK endpoint', f => f.info.ShellSdkApiEndpoint = 'https://example.invalid/api'],
  ['plain deletion endpoint', f => f.info.ShellMainGameDeletionEndpoint = 'https://example.invalid/delete'],
  ['plain game URL', f => f.info.ShellOnlineGameURL = 'https://example.invalid/game'],
  ['remote routing enabled', f => f.info.ShellContentConfigEndpoint = 'https://content.primitive-saga.invalid/api/v1/content-config'],
  ['arbitrary web loads', f => f.info.NSAppTransportSecurity.NSAllowsArbitraryLoadsInWebContent = true],
  ['sideload checkout', f => f.info.ShellAllowSideloadOrderHandshake = 'YES'],
  ['disabled StoreKit', f => f.info.ShellStoreKitEnabled = 'NO'],
  ['automatic analytics', f => f.info.FIREBASE_ANALYTICS_COLLECTION_ENABLED = true],
  ['missing ATT text', f => delete f.info.NSUserTrackingUsageDescription],
  ['wrong Firebase bundle', f => f.firebase.BUNDLE_ID = 'fixture.wrong'],
  ['missing privacy reason', f => f.privacy.NSPrivacyAccessedAPITypes = []],
  ['missing icon', f => delete f.info.CFBundleIcons]
]) test(`reject ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => validate(f)); });
test('failure messages do not dump credential values', () => {
  const f = fixture(); f.info.ShellPaymentApiToken = 'secret-fixture';
  assert.throws(() => validate(f), error => !error.message.includes('secret-fixture') && error.message.includes('ShellPaymentApiToken'));
});
const baseFiles = ['PrivacyInfo.xcprivacy', 'Assets.car', 'game/index.html', 'game/app.bundle.js', 'game/storekit-shop.mjs'];
test('normal resource inventory passes', () => checkPackageInventory(baseFiles));
test('reject removed main-world resources', () => assert.throws(() => checkPackageInventory([...baseFiles, 'main-game/index.html'])));
for (const extra of ['Secrets.xcconfig', 'signing.p12', 'AuthKey.p8', 'fixture.storekit', 'App.debug.dylib', '__preview.dylib', '.git/config']) {
  test(`reject bundled ${extra}`, () => assert.throws(() => checkPackageInventory([...baseFiles, extra])));
}
function signingFixture() {
  const entitlements = {'application-identifier': 'ADR4GMT9V3.com.stone.primitive.saga',
    'com.apple.developer.team-identifier': 'ADR4GMT9V3', 'get-task-allow': false};
  return {profile: {TeamIdentifier: ['ADR4GMT9V3'], Entitlements: {...entitlements}, ExpirationDate: '2099-01-01T00:00:00Z'}, entitlements};
}
const now = new Date('2026-09-21T00:00:00Z');
test('distribution entitlement/profile fixture passes', () => { const f = signingFixture(); checkDistributionProfile(f.profile, f.entitlements, now); });
for (const [name, mutate] of [
  ['development', f => f.profile.Entitlements['get-task-allow'] = true],
  ['ad hoc', f => f.profile.ProvisionedDevices = ['fixture-device']],
  ['enterprise', f => f.profile.ProvisionsAllDevices = true],
  ['expired', f => f.profile.ExpirationDate = '2020-01-01T00:00:00Z'],
  ['wrong team', f => f.profile.TeamIdentifier = ['WRONG']],
  ['debug entitlement', f => f.entitlements['get-task-allow'] = true],
  ['wrong signed app', f => f.entitlements['application-identifier'] = 'fixture.wrong']
]) test(`reject ${name} signing`, () => { const f = signingFixture(); mutate(f); assert.throws(() => checkDistributionProfile(f.profile, f.entitlements, now)); });

test('bundle root allows nested game modules', () => checkBundleRoot(['Info.plist', 'game/storekit-shop.mjs'], ['game']));
test('bundle root rejects handover scripts and handoff/', () => {
  assert.throws(() => checkBundleRoot(['NOTES.md'], []));
  assert.throws(() => checkBundleRoot(['Info.plist'], ['handoff']));
});
test('offline game accepts the iOS bundle path', () => checkOfflineGame(['game/index.html']));
test('empty privacy manifest is rejected', () => assert.throws(() => checkPrivacyManifestPopulated({})));
test('Mach-O scan blocks review-switch strings and cleartext HTTP', () => {
  const hits = scanMachO(Buffer.from('prefix safthwyk.antieh.com X-PBM-Fallback http://10.1.2.3/game isReview\0', 'latin1'));
  const rules = new Set(hits.map(hit => hit.rule));
  assert.equal(rules.has('domain:safthwyk'), true);
  assert.equal(rules.has('domain:antieh'), true);
  assert.equal(rules.has('symbol:X-PBM-'), true);
  assert.equal(rules.has('cleartext-http'), true);
  assert.equal(rules.has('bare-ip'), true);
  assert.equal(rules.has('flag:isReview'), true);
});
test('Firebase short links are exempt and other cleartext HTTP is blocked', () => {
  const allowed = scanMachO(Buffer.from('learn more at http://goo.gl/9vSsPb\0', 'latin1'));
  assert.equal(allowed.some(hit => hit.rule === 'cleartext-http'), false);
  const mixed = scanMachO(Buffer.from('see http://goo.gl/RfcP7r and http://evil.example/a\0', 'latin1'));
  assert.equal(mixed.some(hit => hit.rule === 'cleartext-http'), true);
});
test('HTTPS and Apple or Firebase addresses are not bare-IP failures', () => {
  const hits = scanMachO(Buffer.from('https://firebase.google.com 17.253.0.1 142.250.1.1 127.0.0.1\0', 'latin1'));
  assert.equal(hits.some(hit => hit.rule === 'cleartext-http' || hit.rule === 'bare-ip'), false);
  assert.equal(isOfficialInfrastructureIP('1.2.3.4'), false);
});
test('UTF-16LE symbols are caught on both alignments', () => {
  const text = 'HoldLoading';
  const even = Buffer.alloc(text.length * 2);
  for (let index = 0; index < text.length; index += 1) even[index * 2] = text.charCodeAt(index);
  const odd = Buffer.concat([Buffer.from([0xff]), even]);
  assert.equal(scanMachO(even).some(hit => hit.rule === 'symbol:HoldLoading'), true);
  assert.equal(scanMachO(odd).some(hit => hit.rule === 'symbol:HoldLoading'), true);
});
