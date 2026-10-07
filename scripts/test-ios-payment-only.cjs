// Production JavaScript + Swift navigation methods, isolated from the phone,
// network, SDK accounts, order backend, and payment providers.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return text.slice(a, b);
}
const injected = read('PrehistoricBeastmaster/Web/InjectedScripts.swift');
const script = between(injected, '    static let paymentBridge = """', '    static let networkRestored')
  .split('"""')[1];
function setup({android = true, webkit = true} = {}) {
  const requests = [], log = [], timers = [], intervals = [];
  const page = {
    console: {info(){},warn(){},error(){}},
    setTimeout(fn) { timers.push(fn); return timers.length; },
    setInterval(fn) { intervals.push(fn); return intervals.length; },
    loginJson: {uid:'uid-fixture',user_name:'username-fixture'},
    GameData: {getInstance:()=>({open7DaysRecord:{days:3,totalMoney:9.99}})},
    webCalls: 0
  };
  page.window = page;
  if(android) page.android = {pay:s=>requests.push(JSON.parse(s)),sendToNative:s=>log.push(s)};
  if(webkit) page.webkit = {messageHandlers:{pay:{postMessage:s=>requests.push(s)}}};
  const context = vm.createContext(page);
  vm.runInContext(script, context);
  return {page,requests,intervals,run:s=>vm.runInContext(s,context),reinstall:()=>vm.runInContext(script,context)};
}
const pay = 'xmwsdk.dopay("0.99","cp-fixture","channel", "1","server", "1","goods","role","name","11","pbm_tier_099")';
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS '+name); }
test('vendor assignment cannot open web recharge even before the first polling tick',()=>{
  const s = setup();
  s.run('var xmwsdk = {}; xmwsdk.dopay = function(){webCalls++}; '+pay);
  assert.equal(s.page.webCalls,0); assert.equal(s.requests.length,1);
  const r = s.requests[0];
  assert.equal(r.productId,'pbm_tier_099'); assert.equal(r.cpOrder,'cp-fixture');
  assert.equal(r.sercerId,'1'); assert.equal(r.serverId,'1'); assert.equal(r.username,'username-fixture');
  assert.equal(r.roleDay,3); assert.equal(r.roleTotalAmount,9.99);
});
test('immediate reassignment, SDK replacement, and reinjection remain native-only',()=>{
  const s = setup();
  s.run('window.xmwsdk = {dopay:function(){webCalls++}}; '+pay);
  s.run('xmwsdk.dopay = function(){webCalls++}; '+pay);
  s.run('window.xmwsdk = {dopay:function(){webCalls++}}; '+pay);
  s.reinstall(); s.run(pay);
  assert.equal(s.page.webCalls,0); assert.equal(s.requests.length,4); assert.equal(s.intervals.length,1);
});
test('legacy Google marker cannot make a web function trusted',()=>{
  const s = setup();
  s.run('var f=function(){webCalls++};f.__shellGooglePlayBridge=true;window.xmwsdk={dopay:f}; '+pay);
  assert.equal(s.page.webCalls,0); assert.equal(s.requests.length,1);
});
test('descriptor replacement cannot reopen vendor checkout',()=>{
  const s = setup(); s.run('window.xmwsdk = {}');
  assert.throws(()=>s.run('Object.defineProperty(xmwsdk,"dopay",{value:function(){webCalls++}})'));
  s.run(pay); assert.equal(s.requests.length,1); assert.equal(s.page.webCalls,0);
});
test('login and payment-result callbacks survive SDK protection',()=>{
  const s = setup();
  s.run('var xmwsdk={};xmwsdk.init=function(){return "login-init"};xmwsdk.logincallback=function(){return "login-result"};xmwsdk.paycallback=function(){return "pay-result"};xmwsdk.dopay=function(){webCalls++}');
  assert.equal(s.run('xmwsdk.init()'),'login-init');
  assert.equal(s.run('xmwsdk.logincallback()'),'login-result');
  assert.equal(s.run('xmwsdk.paycallback()'),'pay-result');
});
test('WK pay handler alone still dispatches StoreKit requests',()=>{
  const s = setup({android:false});s.run('window.xmwsdk={dopay:function(){webCalls++}}; '+pay);
  assert.equal(s.requests.length,1);assert.equal(s.page.webCalls,0);
});
test('missing native handler never falls back to web payment',()=>{
  const s = setup({android:false,webkit:false});s.run('window.xmwsdk={dopay:function(){webCalls++}}; '+pay);
  assert.equal(s.requests.length,0);assert.equal(s.page.webCalls,0);
});
const web = read('PrehistoricBeastmaster/Web/TrustedWebView.swift');
const game = read('PrehistoricBeastmaster/GameViewController.swift');
const config = read('PrehistoricBeastmaster/Config/ShellConfig.swift');
assert.match(config,/static let payType = "apple"/);
for(const old of ['allowOfficialPayformSession','openWebPayform','payformBackButton','rememberPayformRole',
  'installPayformContext','restoreGameAfterPayform','payformContext','currentPayformRole']) {
  assert.ok(![web,game,config,injected,read('PrehistoricBeastmaster/Analytics/Analytics.swift')].some(s=>s.includes(old)),old);
}
assert.ok(!fs.existsSync(path.join(root,'PrehistoricBeastmaster/Resources/js/payform_bridge.js')));
assert.doesNotMatch(game,/UIApplication\.shared\.open/);
assert.match(game,/webView\.openApprovedExternalURL\(parsed\)/);
assert.match(web,/injectionTime: \.atDocumentStart, forMainFrameOnly: true/);
assert.doesNotMatch(between(game,'webView.onNavigationBlocked =','webView.translatesAutoresizingMaskIntoConstraints'),
  /billing\.|paymentGate\.|callH5|onPayFail|onPayCancel|onSuccess/);
const policy = config.slice(config.indexOf('enum IOSWebNavigationPolicy'));
const navigation = between(web,'    func webView(_ webView: WKWebView, decidePolicyFor navigationAction:',
  '    func webView(_ webView: WKWebView, didFinish');
const popup = between(web,'    func webView(_ webView: WKWebView, createWebViewWith', '    func isTrustedTopLevel');
const helpers = between(web,'    func isTrustedTopLevel', '    private static let consoleBridgeScript');
const load = between(web,'    func loadTrustedURL(', '    func evaluate(');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pbm-iap-only-tests-'));
try {
  const source=path.join(scratch,'main.swift'), binary=path.join(scratch,'tests');
  const harness=read('scripts/payment-tests/NavigationPolicyHarness.swift')
    .replace('/* POLICY */',policy).replace('/* NAVIGATION */',navigation)
    .replace('/* POPUP */',popup).replace('/* HELPERS */',helpers).replace('/* LOAD */',load);
  fs.writeFileSync(source,harness);
  execFileSync('xcrun',['swiftc','-swift-version','5',source,'-o',binary],{stdio:'inherit'});
  execFileSync(binary,[],{stdio:'inherit',timeout:15000});
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
console.log(`${passed} iOS payment bridge scenarios and native-entry source guards passed`);
