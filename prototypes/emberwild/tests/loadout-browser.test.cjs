const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require('playwright');

const url=process.env.EMBERWILD_URL||'http://127.0.0.1:4174';
const out=path.resolve(__dirname,'../../../output/playwright');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PBM_CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const errors=[];
  try{
    const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await require('./camp-helpers.cjs').openVeteran(page,`${url}/?qa=1`);await page.locator('#begin').tap();await page.evaluate(async()=>{await emberwildQA.store.mutate(s=>{s.camp.buildings.push({type:'forge',slot:0,level:3});});emberwildQA.campUI.render();});await page.locator('#camp-loadout').tap();
    assert.match(await page.locator('#modal-title').textContent(),/卡組與出征配置/);
    assert.equal(await page.locator('[data-loadout-card][aria-pressed="true"]').count(),4);
    await page.locator('[data-loadout-card="wall"]').tap();await page.locator('[data-loadout-card="spring"]').tap();
    await page.locator('[data-loadout-card="guard"]').tap();await page.locator('[data-loadout-weapon="hammer"]').tap();await page.locator('[data-loadout-skill="shock"]').tap();
    await page.screenshot({path:path.join(out,'weapon-forge-mobile.png'),fullPage:true});
    assert.equal(await page.locator('[data-action="loadout-save"]').isEnabled(),true);await page.locator('[data-action="loadout-save"]').tap();await page.locator('#modal').waitFor({state:'hidden'});
    const saved=await page.evaluate(()=>emberwildQA.store.state.camp.loadout);
    assert.deepEqual(saved,{cards:['watchtower','catapult','spring','guard'],weapons:['hammer'],skills:['shock']});
    await page.evaluate(async()=>{await emberwildQA.start();});await page.waitForSelector('#game:not([hidden])');
    if(await page.locator('#tutorial-skip').isVisible())await page.locator('#tutorial-skip').tap();await page.waitForFunction(()=>emberwildQA.store.state.profile.tutorialDone);
    const active=await page.evaluate(()=>({loadout:emberwildQA.game.loadout,weapon:emberwildQA.game.hero.weapon,inventory:emberwildQA.game.inventory,hand:emberwildQA.game.hand}));
    assert.deepEqual(active.loadout,saved);assert.equal(active.weapon,'hammer');assert.equal(active.inventory.wall,0);assert.equal(active.inventory.guard,1);assert.deepEqual(active.hand,['watchtower','catapult','spring',null]);
    await page.screenshot({path:path.join(out,'weapon-hammer-game-mobile.png'),fullPage:true});
    assert.equal(await page.locator('#skill-volley').evaluate(el=>el.disabled),true);assert.equal(await page.locator('#volley-label').textContent(),'未攜帶');assert.equal(await page.locator('#skill-shock').evaluate(el=>el.disabled),false);assert.equal(await page.locator('#weapon').evaluate(el=>el.disabled),true);
    await page.locator('#deck-hire').tap();assert.equal(await page.locator('#hand [data-kind="guard"]').count(),1);assert.equal(await page.locator('#hand [data-kind="hunter"]').count(),0);
    await page.locator('#merchant').tap();assert.equal(await page.locator('[data-buy="wall"]').count(),0);assert.equal(await page.locator('[data-buy="spring"]').count(),1);
    await page.locator('[data-market-tab="forge"]').tap();assert.equal(await page.locator('[data-buy="skill-hammer"]').count(),1);assert.equal(await page.locator('[data-buy="skill-spear"]').count(),0);assert.match(await page.locator('.forge-path').textContent(),/震骨重錘/);await page.screenshot({path:path.join(out,'weapon-forge-shop-mobile.png'),fullPage:true});
    await page.locator('[data-market-tab="training"]').tap();assert.equal(await page.locator('[data-buy="skill-volley-fan"]').count(),0);assert.equal(await page.locator('[data-buy="skill-shock-field"]').count(),1);assert.equal(await page.locator('[data-buy="skill-hammer"]').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS mobile camp loadout saves, starts, locks combat controls and filters merchant stock');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
