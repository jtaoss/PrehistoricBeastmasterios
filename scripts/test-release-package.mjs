// Synthetic fixtures only; no live backend, account, signing or player data.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkReleaseMetadata, checkDistributionProfile, checkPackageInventory} from './audit-release-package.mjs';

function fixture() {
  const info = {CFBundleIdentifier: 'com.stone.primitive.saga', CFBundleShortVersionString: '1.0.12', CFBundleVersion: '49',
    CFBundleExecutable: 'PrehistoricBeastmaster', CFBundleSupportedPlatforms: ['iPhoneOS'],
    CFBundleIcons: {CFBundlePrimaryIcon: {CFBundleIconName: 'AppIcon'}},
    NSAppTransportSecurity: {NSAllowsArbitraryLoads: false}, NSUserTrackingUsageDescription: 'Fixture ATT description',
    ShellSdkApiEndpoint: 'https://safthwysdk.antieh.com/', ShellContentConfigEndpoint: 'https://safthwysdk.antieh.com/api/v1/content-config',
    ShellMiniGameOrderEndpoint: 'https://safthwysdk.antieh.com/v1/minigame/orders',
    ShellMiniGameAuthBaseURL: 'https://safthwysdk.antieh.com/v1/emberwild/auth/',
    ShellGameOrderEndpoint: 'https://safthwy09.antieh.com/fx/createOrder.php',
    ShellPayType: 'apple', ShellStoreKitEnabled: 'YES',
    ShellAllowSideloadOrderHandshake: 'NO', FIREBASE_ANALYTICS_COLLECTION_ENABLED: false,
    FacebookAutoLogAppEventsEnabled: false, FacebookAdvertiserIDCollectionEnabled: false};
  const privacy = {NSPrivacyTracking: true, NSPrivacyTrackingDomains: ['ep1.facebook.com'],
    NSPrivacyAccessedAPITypes: [{NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1']}]};
  const firebase = {BUNDLE_ID: info.CFBundleIdentifier, GOOGLE_APP_ID: 'fixture'};
  return {info, privacy, firebase};
}
function validate({info, privacy, firebase}) { checkReleaseMetadata(info, privacy, firebase, '1.0.12', '49'); }
test('valid production metadata passes without suppressing the remote game endpoint', () => validate(fixture()));
for (const [name, mutate] of [
  ['wrong version', f => f.info.CFBundleVersion = '48'],
  ['simulator', f => f.info.CFBundleSupportedPlatforms = ['iPhoneSimulator']],
  ['unresolved build setting', f => f.info.ShellPaymentApiToken = '$(PAYMENT_API_TOKEN)'],
  ['HTTP', f => f.info.ShellContentConfigEndpoint = 'http://safthwysdk.antieh.com/api'],
  ['local endpoint', f => f.info.ShellMiniGameAuthBaseURL = 'https://127.0.0.1/auth'],
  ['staging endpoint', f => f.info.ShellSdkApiEndpoint = 'https://staging.example.com/'],
  ['embedded game URL', f => f.info.ShellOnlineGameURL = 'https://example.com/game'],
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
  const f = fixture(); f.info.ShellPaymentApiToken = 'secret-fixture-$(UNRESOLVED)';
  assert.throws(() => validate(f), error => !error.message.includes('secret-fixture') && error.message.includes('ShellPaymentApiToken'));
});
const baseFiles = ['PrivacyInfo.xcprivacy', 'Assets.car', 'game/index.html', 'game/app.bundle.js'];
test('normal resource inventory passes', () => checkPackageInventory(baseFiles));
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
