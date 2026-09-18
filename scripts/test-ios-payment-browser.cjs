// Browser/Window semantics regression, with only an in-memory fixture page.
// Native messages are recorded, never sent to iOS; all other URLs are aborted.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const injected = fs.readFileSync(path.join(root,'PrehistoricBeastmaster/Web/InjectedScripts.swift'),'utf8');
const pay = injected.slice(injected.indexOf('    static let paymentBridge = """'),injected.indexOf('    static let networkRestored')).split('"""')[1];
const bridge = fs.readFileSync(path.join(root,'PrehistoricBeastmaster/Resources/js/android_bridge.js'),'utf8');
(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const context = await browser.newContext({serviceWorkers:'block'});
    const external = [];
    await context.route('**/*',route=>{
      if(route.request().url() === 'https://iap-only-tests.invalid/') return route.fulfill({contentType:'text/html',body:`<!doctype html><title>Native payment fixture</title><script>
        var xmwsdk = {};
        xmwsdk.dologin = function(){return 'login-ok'};
        xmwsdk.dopay = function(){document.body.insertAdjacentHTML('beforeend','<div id="vendor-checkout">Web checkout</div>');};
        xmwsdk.dopay('0.99','fixture-1','channel','1','server','1','goods','role','name','11','pbm_tier_099');
      </script>`});
      external.push(route.request().url());return route.abort();
    });
    await context.addInitScript({content:`window.nativeMessages=[];window.webkit={messageHandlers:{android:{postMessage:function(m){window.nativeMessages.push(m)}}}};\n${bridge}\n${pay}`});
    const page = await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://iap-only-tests.invalid/');
    const initial=await page.evaluate(()=>({requests:nativeMessages.filter(m=>m.method==='pay'),vendor:!!document.querySelector('#vendor-checkout'),login:xmwsdk.dologin()}));
    assert.equal(initial.requests.length,1);assert.equal(initial.vendor,false);assert.equal(initial.login,'login-ok');
    assert.equal(JSON.parse(initial.requests[0].payload).cpOrder,'fixture-1');
    await page.addScriptTag({content:`window.xmwsdk={dopay:function(){document.body.dataset.webCheckout='opened'}};xmwsdk.dopay('4.99','fixture-2','channel','7','server','2','goods','role','name','11','pbm_tier_499');`});
    await page.addScriptTag({content:pay});
    const final = await page.evaluate(()=>({orders:nativeMessages.filter(m=>m.method==='pay').map(m=>JSON.parse(m.payload).cpOrder),vendor:document.body.dataset.webCheckout||null}));
    assert.deepEqual(final.orders,['fixture-1','fixture-2']);assert.equal(final.vendor,null);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS 8 browser bridge assertions: vendor assignment/reload cannot open web checkout; no external requests');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
