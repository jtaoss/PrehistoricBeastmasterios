// Execute production startup/consent methods with SDK/UI doubles, never a phone,
// network request, real user preferences or analytics backend. Layout is checked
// statically here and compiled against UIKit in the separate device build.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const analytics = read('PrehistoricBeastmaster/Analytics/Analytics.swift');
const splash = read('PrehistoricBeastmaster/SplashViewController.swift');
const delegate = read('PrehistoricBeastmaster/AppDelegate.swift');
const sdk = analytics.slice(analytics.indexOf('enum AnalyticsSDK'), analytics.indexOf('enum AnalyticsNames'))
  .replace('if #available(iOS 17.0, *) { return }', 'if Spy.usesSystemMetaTracking { return }');
const logEvent = analytics.slice(analytics.indexOf('    func logEvent('), analytics.indexOf('    private func logFacebook('));
const activation = delegate.slice(delegate.indexOf('    func applicationDidBecomeActive('), delegate.indexOf('    func application(_ application: UIApplication, supported'));
const startup = splash.slice(splash.indexOf('    override func viewDidAppear('), splash.lastIndexOf('\n}'));
const game = read('PrehistoricBeastmaster/GameViewController.swift');
const presentation = game.slice(game.indexOf('    var canPresentTrackingAuthorization:'), game.indexOf('    override func viewDidLoad('));
assert.ok(sdk.includes('static func configure('));
assert.ok(startup.includes('window.rootViewController = GameViewController()'));
assert.doesNotMatch(splash, /exit\(0\)|UIApplication\.shared\.open|UIAlertController|SFSafariViewController|UIButton|UIScrollView/);
assert.doesNotMatch(splash, /installConsentPage|acceptPrivacy|declinePrivacy|setPrivacyAccepted|preferences\.isPrivacyAccepted/);
assert.doesNotMatch(splash, /使用者協議與隱私政策|同意並繼續|暫不同意/);
const menu = read('PrehistoricBeastmaster/Resources/game/index.html');
for (const page of ['terms-of-service', 'privacy-policy']) {
  assert.ok(menu.includes(`data-legal-url="https://d1udhm4c9vjzph.cloudfront.net/ios-legal/${page}.html"`));
}
assert.match(delegate, /analyticsLaunchOptions = launchOptions\s+refreshAnalyticsAuthorization\(application\)/);
assert.match(delegate, /ATTrackingManager\.requestTrackingAuthorization/);
assert.match(delegate, /application\.applicationState == \.active/);
assert.match(delegate, /!trackingRequestInFlight, !trackingPromptAttempted/);
assert.doesNotMatch(activation, /setPrivacyAccepted|\.purchase\(|onPay|rootViewController\s*=/);
assert.doesNotMatch(sdk, /ShellPreferences\(\)|isPrivacyAccepted/);
assert.match(sdk, /ATTrackingManager\.trackingAuthorizationStatus == \.authorized/);
assert.match(analytics, /if #available\(iOS 17\.0, \*\) \{ return \}/);
assert.match(game.slice(game.indexOf('    override func viewDidAppear('), game.indexOf('    deinit')), /requestTrackingAuthorizationIfNeeded/);
const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(root, 'PrehistoricBeastmaster/Info.plist')], {encoding:'utf8'}));
assert.equal(info.FIREBASE_ANALYTICS_COLLECTION_ENABLED, false);
assert.equal(info.FacebookAutoLogAppEventsEnabled, false);
assert.equal(info.FacebookAdvertiserIDCollectionEnabled, false);
assert.ok(info.NSUserTrackingUsageDescription.includes('Firebase') && info.NSUserTrackingUsageDescription.includes('Meta'));
const manifest = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert','json','-o','-',path.join(root,'PrehistoricBeastmaster/PrivacyInfo.xcprivacy')], {encoding:'utf8'}));
assert.equal(manifest.NSPrivacyTracking, true);
assert.ok(manifest.NSPrivacyTrackingDomains.includes('ep1.facebook.com'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pbm-privacy-tests-'));
try {
  const fixture = read('scripts/privacy-tests/Harness.swift')
    .replace('/* SDK */', sdk).replace('/* LOG_EVENT */', logEvent)
    .replace('/* ACTIVATION */', activation).replace('/* STARTUP */', startup)
    .replace('/* PRESENTATION */', presentation);
  const source = path.join(scratch, 'main.swift');
  const binary = path.join(scratch, 'privacy-tests');
  fs.writeFileSync(source, fixture);
  execFileSync('xcrun', ['swiftc', '-swift-version', '5', source, '-o', binary], {stdio:'inherit'});
  for (const scenario of ['no-consent','allow','deny','restricted','previously-denied','returning-authorized',
    'legacy-agreement','repeat-lifecycle','not-active','not-game','modal','payment','apple-finishing','no-window',
    'undetermined-callback','no-callback','stale-callback','background-callback','revocation','reenable',
    'early-events','missing-firebase','wrong-firebase','launch-options','ios17-meta']) {
    execFileSync(binary, [scenario], {stdio:'inherit', timeout:5000});
  }
  console.log('Native ATT: 25 behavior scenarios + system prompt, unchanged game legal links, SDK authorization and manifest guards passed');
} finally {
  fs.rmSync(scratch, {recursive:true, force:true});
}
