const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('PrehistoricBeastmaster/Resources/legal/privacy-policy.html');
const reader = read('PrehistoricBeastmaster/PrivacyPolicyViewController.swift');
const game = read('PrehistoricBeastmaster/GameViewController.swift');
const web = read('PrehistoricBeastmaster/Web/TrustedWebView.swift');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
check('single bundled HTML has no script, form, external resource or consent control', () => {
  assert.doesNotMatch(html, /<(script|iframe|form|input|button|link|img|audio|video)\b|\son\w+\s*=|\ssrc\s*=|url\s*\(/i);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /lang="zh-Hant"/);
});
check('policy covers actual SDKs, event fields, ATT choices and necessary payment processing', () => {
  for (const text of ['Firebase Analytics', 'Meta App Events', '廣告成效衡量', '角色名稱', '交易識別碼',
    '幣別', 'IDFA', '尚未選擇', '拒絕', '撤回', '不會排隊', '正在傳輸', 'App Store',
    '設定 → 隱私權與安全性 → 追蹤', '2026-09-14', 'fushengridi@gmail.com']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /設置 - 帳號註銷|7 個工作日|資料完全匿名|Crashlytics/);
});
check('policy reader is isolated from game cookies, SDKs, scripts and payment bridges', () => {
  assert.match(reader, /websiteDataStore = \.nonPersistent\(\)/);
  assert.match(reader, /allowsContentJavaScript = false/);
  assert.match(reader, /allowingReadAccessTo: documentURL/);
  assert.match(reader, /forResource: "privacy-policy", withExtension: "html", subdirectory: "legal"/);
  assert.doesNotMatch(reader, /addUserScript|messageHandlers|load\(URLRequest|AnalyticsSDK|StoreKitManager|privacy_accepted|requestTrackingAuthorization|UserDefaults/);
  assert.match(reader, /url\.standardizedFileURL\.path == documentURL\.standardizedFileURL\.path/);
  assert.match(reader, /decisionHandler\(\.cancel\)/);
  assert.match(reader, /UIApplication\.openSettingsURLString/);
});
check('privacy presentation does not reset payments or accept consent', () => {
  const show = game.slice(game.indexOf('    private func showPrivacyPolicy()'), game.indexOf('    func openMainGame()'));
  assert.match(show, /presentedViewController == nil/);
  assert.match(show, /!billing\.isProcessingPayment/);
  assert.doesNotMatch(show, /finish|cancel|resumePurchases|onSuccess|onPayCancel|UserDefaults|requestTrackingAuthorization/);
  assert.match(web, /if IOSWebNavigationPolicy\.isPrivacyPolicyURL\(url\) \{\s*onPrivacyPolicyRequested\?\(\)\s*return/);
});
check('game entry keeps legal buttons and no startup agreement is restored', () => {
  const entry = read('PrehistoricBeastmaster/Resources/game/index.html');
  assert.match(entry, /data-legal-url="https:\/\/d1udhm4c9vjzph.cloudfront.net\/ios-legal\/privacy-policy.html"/);
  assert.doesNotMatch(entry, />官方網站<\/a>/);
  assert.doesNotMatch(read('PrehistoricBeastmaster/SplashViewController.swift'), /UIAlertController|PrivacyPolicyViewController|privacy_accepted/);
});
check('reader is part of Xcode target; policy folder is bundled', () => {
  const project = read('PrehistoricBeastmaster.xcodeproj/project.pbxproj');
  assert.match(project, /PrivacyPolicyViewController.swift in Sources/);
  assert.match(project, /game in Resources/);
  assert.match(project, /legal in Resources/);
  assert.match(project, /lastKnownFileType = folder; path = legal;/);
  execFileSync('/usr/bin/plutil', ['-lint', path.join(root, 'PrehistoricBeastmaster.xcodeproj/project.pbxproj')]);
});
check('native manifest includes marketing purpose for the existing tracked event data', () => {
  const manifest = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-',
    path.join(root, 'PrehistoricBeastmaster/PrivacyInfo.xcprivacy')], {encoding: 'utf8'}));
  assert.equal(manifest.NSPrivacyTracking, true);
  for (const row of manifest.NSPrivacyCollectedDataTypes) {
    assert.ok(row.NSPrivacyCollectedDataTypePurposes.includes('NSPrivacyCollectedDataTypePurposeDeveloperAdvertising'), row.NSPrivacyCollectedDataType);
  }
});
console.log(`PASS ${checks} privacy policy checks (resource/configuration checks; device UI still requires acceptance)`);
