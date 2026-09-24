const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const executablePath=process.env.PBM_CHROME_EXECUTABLE||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:/Program Files/Google/Chrome/Application/chrome.exe');
const url=process.env.EMBERWILD_URL||'http://127.0.0.1:8765';

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url+'/?qa=1');await page.waitForFunction(()=>window.emberwildQA);
    await page.evaluate(()=>emberwildQA.store.mutate(state=>{state.profile.tutorialDone=true;state.profile.offerPrompts={starterShown:false,weeklyShownWeek:''};}));
    await page.evaluate(()=>emberwildQA.start());await page.waitForFunction(()=>emberwildQA.game?.phase==='prep');
    const before=await page.evaluate(()=>({inventory:{...emberwildQA.game.inventory},transactions:[...emberwildQA.store.state.profile.purchaseTransactions]}));
    await page.evaluate(()=>emberwildQA.showCamp({afterTutorial:true}));
    await page.waitForFunction(()=>document.querySelector('#modal-title')?.textContent.includes('營地補給'));
    assert.equal(await page.locator('#modal.promotion-modal [data-shop-offer="pack-fortify"]').count(),1);
    assert.equal(await page.locator('#modal.promotion-modal [data-shop-offer="pack-relic"]').count(),1);
    for(const size of [{width:393,height:852},{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(size);
      for(const selector of ['#promotion-dismiss','#modal-actions [data-action="promotion-close"]']){
        const box=await page.locator(selector).boundingBox();
        assert.ok(box.height>=44&&box.y>=0&&box.y+box.height<=size.height,`${selector} must fit ${size.width}x${size.height}`);
        assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
      }
    }
    await page.setViewportSize({width:393,height:852});
    assert.deepEqual(await page.evaluate(()=>emberwildQA.store.state.profile.offerPrompts),{starterShown:true,weeklyShownWeek:(()=>{const d=new Date(),u=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));u.setUTCDate(u.getUTCDate()+4-(u.getUTCDay()||7));const y=u.getUTCFullYear(),s=new Date(Date.UTC(y,0,1));return `${y}-W${String(Math.ceil((((u-s)/86400000)+1)/7)).padStart(2,'0')}`;})()});
    await page.screenshot({path:require('node:path').resolve(__dirname,'../../../output/playwright/first-session-gifts.png')});
    await page.locator('#promotion-dismiss').tap();await page.waitForTimeout(250);
    assert.equal(await page.locator('#modal').isVisible(),false,'dismiss must not chain another offer');
    await page.evaluate(()=>emberwildQA.showCamp());await page.waitForTimeout(250);
    assert.equal(await page.locator('#modal').isVisible(),false,'same camp visit/week must not repeat offers');
    await page.locator('#camp-gifts').tap();
    await page.locator('[data-shop-offer="pack-relic"]').tap();await page.locator('[data-action="shop-confirm"]').tap();
    await page.waitForSelector('[data-action="shop-done"]');assert.match(await page.locator('#shop-checkout-title').textContent(),/未完成付款/);
    const after=await page.evaluate(()=>({inventory:{...emberwildQA.store.state.run.inventory},transactions:[...emberwildQA.store.state.profile.purchaseTransactions]}));
    assert.deepEqual(after,before);assert.deepEqual(errors,[]);
    await page.locator('[data-action="shop-done"]').tap();await page.locator('#promotion-dismiss').tap();
    await page.evaluate(async()=>{
      await emberwildQA.store.mutate(s=>s.profile.offerPrompts={starterShown:false,weeklyShownWeek:''});
      const store=emberwildQA.store,original=store.markOfferPrompts.bind(store);
      store.markOfferPrompts=(...args)=>new Promise(resolve=>{window.finishPromptWrite=()=>original(...args).then(resolve);});
      emberwildQA.showCamp();
    });
    await page.waitForFunction(()=>window.finishPromptWrite);
    await page.locator('#camp-loadout').tap();
    const title=await page.locator('#modal-title').textContent();
    await page.evaluate(()=>window.finishPromptWrite());await page.waitForTimeout(250);
    assert.equal(await page.locator('#modal-title').textContent(),title,'late save cannot replace player-opened loadout');
    assert.deepEqual(errors,[]);
    console.log('PASS combined gifts: accessible dismiss, no chains/repeats, manual reopen, no fake delivery, async navigation race');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
