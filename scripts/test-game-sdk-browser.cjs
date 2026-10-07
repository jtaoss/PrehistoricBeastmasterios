// Run the packaged mini-game with the REAL common SDK. WK messages and payment
// callbacks are fixtures only: no backend, Apple or analytics provider is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {openVeteran,depart}=require('../prototypes/emberwild/tests/camp-helpers.cjs');
const root=path.resolve(__dirname,'..'),resources=process.env.EMBERWILD_PACKAGE_DIR||path.join(root,'PrehistoricBeastmaster/Resources/game');
const js=name=>fs.readFileSync(path.join(root,'PrehistoricBeastmaster/Resources/js',name),'utf8');
const origin='http://127.0.0.1:8765';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const common=[js('android_bridge.js'),js('game_sdk.js'),js('analytics_bridge.js')].join('\n');
const fixture=`window.nativeMessages=[];window.webkit={messageHandlers:{android:{postMessage:function(m){
  nativeMessages.push(m);
  if(m.method==='miniAuth'){
    var p=JSON.parse(m.payload),now=Math.floor(Date.now()/1000);
    queueMicrotask(function(){window.javaCallBack({func:'onMiniAuthResult',code:'OK',action:p.action,requestId:p.requestId,
      data:{authenticated:true,playerId:'fixture-player',displayName:'測試獵人',authenticatedAt:now,accessExpiresAt:now+86400}})});
  }
}}}};
${common}
window.__shellSdkStatus=JSON.stringify({miniGameBaseURL:${JSON.stringify(origin+'/')},appId:'1000151',bundleId:'com.stone.primitive.saga',channel:'fixture-channel',webSdkChannel:'10000',payChannel:24,contentMode:'BOTH',storeKitEnabled:true});`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const errors=[],external=[];
  async function context(){
    const ctx=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
    await ctx.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin){external.push(url.href);return route.abort();}
      const target=path.resolve(resources,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!target.startsWith(resources+path.sep)||!fs.existsSync(target))return route.fulfill({status:404,body:'fixture resource missing'});
      return route.fulfill({contentType:mime[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});
    });
    await ctx.addInitScript({content:fixture});
    ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    return ctx;
  }
  const snapshot=page=>page.evaluate(()=>({inventory:{...emberwildQA.game.inventory},transactions:emberwildQA.store.state.profile.purchaseTransactions,phase:emberwildQA.shopCheckout.phase}));
  const callback=(page,fields)=>page.evaluate(fields=>window.javaCallBack(fields),fields);
  try{
    const ctx=await context(),page=await ctx.newPage();
    await openVeteran(page,origin+'/index.html?qa=1');await page.locator('#begin').click();await depart(page);
    await page.locator('#merchant').click();await page.locator('[data-market-tab="shop"].pay-tab:visible').click();
    await page.locator('[data-shop-offer="pack-fortify"]').click();const before=await snapshot(page);
    await page.locator('[data-action="shop-confirm"]').click();
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.method==='miniPurchase').length===1);
    const first=await page.evaluate(()=>JSON.parse(nativeMessages.find(m=>m.method==='miniPurchase').payload));
    assert.deepEqual(Object.keys(first).sort(),['clientRequestId','offerId']);assert.equal(first.offerId,'pack-fortify');
    assert.equal((await snapshot(page)).phase,'pending');assert.deepEqual((await snapshot(page)).inventory,before.inventory);
    await callback(page,{func:'onPayResult',code:'0',clientRequestId:'unrelated',transactionId:'900000001',orderId:'FIXTURE-1'});
    assert.equal((await snapshot(page)).phase,'pending');
    await callback(page,{func:'onPayCancel',code:'USER_CANCELED',clientRequestId:first.clientRequestId,message:'fixture cancellation'});
    await page.waitForFunction(()=>emberwildQA.shopCheckout.phase==='error');
    assert.deepEqual((await snapshot(page)).inventory,before.inventory);assert.deepEqual((await snapshot(page)).transactions,before.transactions);
    await page.locator('[data-action="shop-done"]').click();await page.locator('[data-market-tab="shop"].pay-tab:visible').click();
    await page.locator('[data-shop-offer="pack-fortify"]').click();await page.locator('[data-action="shop-confirm"]').click();
    await page.waitForFunction(()=>nativeMessages.filter(m=>m.method==='miniPurchase').length===2);
    const second=await page.evaluate(()=>JSON.parse(nativeMessages.filter(m=>m.method==='miniPurchase')[1].payload));
    assert.notEqual(first.clientRequestId,second.clientRequestId);
    await callback(page,{func:'onPayResult',code:'0',clientRequestId:first.clientRequestId,transactionId:'900000001',orderId:'OLD-FIXTURE'});
    assert.equal((await snapshot(page)).phase,'pending');
    const expected=await page.evaluate(()=>{const inventory={...emberwildQA.game.inventory};for(const [id,count]of Object.entries({watchtower:2,catapult:2,wall:2}))inventory[id]=Math.min(99,inventory[id]+count);return inventory;});
    const verified={func:'onPayResult',code:'0',clientRequestId:second.clientRequestId,transactionId:'900000002',orderId:'MINI-FIXTURE-2'};
    await callback(page,verified);await page.waitForFunction(()=>emberwildQA.shopCheckout.phase==='done');
    const delivered=await snapshot(page);assert.deepEqual(delivered.inventory,expected);assert.equal(delivered.transactions.length,1);
    await callback(page,verified);assert.deepEqual(await snapshot(page),delivered);
    assert.deepEqual(await page.evaluate(()=>nativeMessages.filter(m=>m.method==='sdkEvent')),[],'QA must not report gameplay or purchase revenue');
    assert.equal(await page.evaluate(()=>pbmGameSDK.getConfig().gameId),'emberwild');await ctx.close();

    const live=await context(),normal=await live.newPage();
    await normal.addInitScript(()=>{const now=Date.now();localStorage.setItem('emberwild_account_session_v1',JSON.stringify({version:2,playerId:'fixture-player',label:'測試獵人',authenticatedAt:now,accessExpiresAt:now+86400000}));});
    await normal.goto(origin+'/index.html');await normal.locator('#begin').click();
    await normal.waitForFunction(()=>nativeMessages.some(m=>m.method==='sdkEvent'&&JSON.parse(m.payload).name==='NewRole_Tutorial'));
    const events=await normal.evaluate(()=>nativeMessages.filter(m=>m.method==='sdkEvent').map(m=>{const e=JSON.parse(m.payload);return{name:e.name,fields:JSON.parse(e.json)};}));
    assert.deepEqual(events.map(e=>e.name),['mini_game_open','Loading_completed','mini_game_start','view_content','NewRole_Tutorial']);
    assert.ok(events.every(e=>e.fields.game_id==='emberwild'));assert.equal(events[2].fields.role_id,'emberwild:fixture-player');
    assert.ok(events.every(e=>!('revenue' in e.fields)));await live.close();
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log('PASS packaged game: common SDK checkout, cancel/stale/duplicate callbacks, single delivery, production tutorial analytics and QA exclusion');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
